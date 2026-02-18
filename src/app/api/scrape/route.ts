import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import axios from "axios";
import * as cheerio from "cheerio";
import { ProductInfo, MultiProductInfo, TemplateType } from "../../types/types";
import { generateMultiProductTemplate } from "../../utils/multiProductTemplate";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const anthropic = new Anthropic({
  apiKey: process.env.CLOUD_API_KEY,
});

async function translateTextToEnglish(text: string | null | undefined) {
  const trimmed = text?.trim();
  if (!trimmed) {
    return text ?? "";
  }

  try {
    const response = await openai.responses.create({
      model: "gpt-5.2",
            input: `Translate the provided text to English. Return only the translated text with no additional commentary.

Text to translate:
${trimmed}`,
    });

    const output = response.output_text?.trim();
    return output && output.length > 0 ? output : text ?? "";
  } catch (error) {
    console.error("Text translation failed", error);
    return text ?? "";
  }
}

async function translateHtmlToEnglish(html: string) {
  const trimmed = html?.trim();
  if (!trimmed) {
    return html;
  }

  try {
    const response = await openai.responses.create({
      model: "gpt-5.2",
            input: `You are a professional email translator. Translate the provided HTML email into English.
Important rules:
1. Preserve every HTML tag and attribute exactly as in the original markup.
2. Do NOT translate or modify template variables (e.g. {{variable}}, {unsubscribe}, {subtag:name}).
3. Keep all URLs untouched.
4. Translate only visible copy/content.
5. Maintain the original tone and style.
6. Return ONLY the translated HTML markup with no additional commentary.

HTML to translate:
${trimmed}`,
    });

    const output = response.output_text?.trim();
    return output && output.length > 0 ? output : html;
  } catch (error) {
    console.error("HTML translation failed", error);
    return html;
  }
}

async function buildPreviewTemplate(template: { html: string; subject?: string | null; engine?: string | null }) {
  if (!template) {
    return null;
  }

  const subject = await translateTextToEnglish(template.subject ?? "");
  const html = await translateHtmlToEnglish(template.html ?? "");

  return {
    ...template,
    subject,
    html,
  };
}

export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    const body = await request.json();

    const { url, templateType, isTest, countryUrls, singleUrlMode } = body ?? {};

    const hasCountryPayload =
      countryUrls &&
      typeof countryUrls === "object" &&
      !Array.isArray(countryUrls);

    if (!hasCountryPayload && !url) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    if (!templateType) {
      return NextResponse.json(
        { error: "Template type is required" },
        { status: 400 }
      );
    }

    // Handle single URL mode for non-admins
    if (singleUrlMode && url) {
      let effectiveTemplate;
      let dbPrompt = null;

      if (isTest) {
        effectiveTemplate = templateType;
      } else {
        dbPrompt = await prisma.prompt.findFirst({
          where: {
            name: templateType.name,
            status: "ACTIVE",
          },
        });

        effectiveTemplate = dbPrompt
          ? {
            name: dbPrompt.name,
            description: dbPrompt.description || templateType.description,
            system: dbPrompt.systemPrompt,
            user: dbPrompt.userPrompt,
            designEngine: dbPrompt.designEngine,
          }
          : templateType;
      }

      const startTime = Date.now();
      const productInfo = await processSingleUrl(url, effectiveTemplate);

      // Generate template in detected language (no translation)
      const emailTemplate = await generateEmailTemplate(productInfo, url, effectiveTemplate);
      const generationTime = Date.now() - startTime;

      // Track usage
      const userId = ((session as any)?.user as any)?.id as string | undefined;
      if (userId && dbPrompt) {
        try {
          await prisma.templateGeneration.create({
            data: {
              promptId: dbPrompt.id,
              userId: userId,
              inputUrl: url,
              productInfo: productInfo as any,
              generatedHtml: emailTemplate?.html ?? "",
              subject: emailTemplate?.subject ?? null,
              generationTime,
              wasSuccessful: true,
            },
          });
        } catch (error) {
          console.error("Failed to track template generation:", error);
        }
      }

      return NextResponse.json({
        emailTemplate,
        productInfo,
      });
    }

    let effectiveTemplate;
    let dbPrompt = null;

    if (isTest) {
      // For test requests from create/edit pages, use the provided templateType directly
      // This ensures we test exactly what's in the form, not database values
      effectiveTemplate = templateType;
    } else {
      // For regular requests from main app, look up database prompt
      dbPrompt = await prisma.prompt.findFirst({
        where: {
          name: templateType.name,
          status: "ACTIVE",
        },
      });

      // If no database prompt found, fall back to the provided templateType
      effectiveTemplate = dbPrompt
        ? {
          name: dbPrompt.name,
          description: dbPrompt.description || templateType.description,
          system: dbPrompt.systemPrompt,
          user: dbPrompt.userPrompt,
          designEngine: dbPrompt.designEngine,
        }
        : templateType;
    }

    let startTime = Date.now();
    let wasSuccessful = false;
    const userId = ((session as any)?.user as any)?.id as string | undefined;

    if (hasCountryPayload) {
      const entries = Object.entries(countryUrls as Record<string, unknown>)
        .map(([code, raw]) => {
          const arr = Array.isArray(raw) ? raw : [raw];
          const cleaned = arr
            .map((value) => (typeof value === "string" ? value.trim() : ""))
            .filter((value) => value.length > 0);
          return { countryCode: code, urls: cleaned };
        })
        .filter((entry) => entry.urls.length > 0);

      if (entries.length === 0) {
        return NextResponse.json(
          { error: "At least one product URL is required" },
          { status: 400 }
        );
      }

      const hasMultiProductCountry = entries.some(
        (entry) => entry.urls.length > 1
      );
      const primaryEntry =
        entries.find((entry) => entry.urls.length > 1) ?? entries[0];

      const countryResults: Record<
        string,
        {
          urls: string[];
          productInfo?: ProductInfo;
          multiProductInfo?: MultiProductInfo;
          type: "SINGLE" | "MULTI";
        }
      > = {};

      // Process URLs in parallel
      await Promise.all(
        entries.map(async (entry) => {
          if (entry.urls.length > 1) {
            const multiProductInfo = await processMultipleUrls(
              entry.urls,
              effectiveTemplate
            );
            countryResults[entry.countryCode] = {
              urls: entry.urls,
              multiProductInfo,
              type: "MULTI",
            };
          } else {
            const productInfo = await processSingleUrl(
              entry.urls[0],
              effectiveTemplate
            );
            countryResults[entry.countryCode] = {
              urls: entry.urls,
              productInfo,
              type: "SINGLE",
            };
          }
        })
      );

      const primaryResult = countryResults[primaryEntry.countryCode];

      if (!primaryResult) {
        throw new Error("Unable to resolve primary country data.");
      }
      const urlsForRequest = hasMultiProductCountry
        ? primaryEntry.urls
        : [primaryEntry.urls[0]];

      try {
        let emailTemplate;
        let productInfoForResponse: any;

        if (hasMultiProductCountry) {
          const multiProductInfo = primaryResult?.multiProductInfo;
          if (!multiProductInfo) {
            throw new Error("Missing multi-product data for primary country");
          }
          emailTemplate = await generateMultiProductTemplate(
            multiProductInfo,
            primaryEntry.urls,
            effectiveTemplate,
            openai,
            anthropic
          );
          productInfoForResponse = multiProductInfo;
        } else {
          const productInfo = primaryResult?.productInfo as ProductInfo;
          if (!productInfo) {
            throw new Error("Missing product data for primary country");
          }
          emailTemplate = await generateEmailTemplate(
            productInfo,
            primaryEntry.urls[0],
            effectiveTemplate
          );
          productInfoForResponse = productInfo;
        }

        wasSuccessful = true;
        const generationTime = Date.now() - startTime;

        if (dbPrompt && userId) {
          await prisma.templateGeneration.create({
            data: {
              promptId: dbPrompt.id,
              userId,
              inputUrl: urlsForRequest[0],
              productInfo: productInfoForResponse as any,
              generatedHtml: emailTemplate.html,
              subject: emailTemplate.subject,
              generationTime,
              wasSuccessful,
            },
          });

          await prisma.prompt.update({
            where: { id: dbPrompt.id },
            data: {
              usageCount: {
                increment: 1,
              },
            },
          });
        }

        const previewTemplate = await buildPreviewTemplate(emailTemplate);

        return NextResponse.json({
          productInfo: productInfoForResponse,
          emailTemplate,
          previewTemplate: previewTemplate ?? emailTemplate,
          baseCountry: primaryEntry.countryCode,
          countryResults: entries.reduce<Record<string, unknown>>(
            (acc, entry) => {
              const result = countryResults[entry.countryCode];
              acc[entry.countryCode] = {
                urls: entry.urls,
                type: result.type,
                ...(result.type === "MULTI"
                  ? { multiProductInfo: result.multiProductInfo }
                  : { productInfo: result.productInfo }),
              };
              return acc;
            },
            {}
          ),
        });
      } catch (error) {
        const generationTime = Date.now() - startTime;

        if (dbPrompt && userId) {
          await prisma.templateGeneration.create({
            data: {
              promptId: dbPrompt.id,
              userId,
              inputUrl: urlsForRequest[0],
              productInfo: Prisma.JsonNull,
              generatedHtml: "",
              errorMessage:
                error instanceof Error ? error.message : "Unknown error",
              generationTime,
              wasSuccessful: false,
            },
          });
        }

        throw error;
      }
    }

    startTime = Date.now();
    wasSuccessful = false;

    const isMultiProduct = Array.isArray(url);

    try {
      if (isMultiProduct) {
        // Process multiple URLs
        const productInfos = await processMultipleUrls(url, effectiveTemplate);
        const template = await generateMultiProductTemplate(
          productInfos,
          url,
          effectiveTemplate,
          openai,
          anthropic
        );

        wasSuccessful = true;

        const generationTime = Date.now() - startTime;

        // Log analytics if we used a database prompt
        if (dbPrompt && ((session as any)?.user as any)?.id) {
          await prisma.templateGeneration.create({
            data: {
              promptId: dbPrompt.id,
              userId: ((session as any).user as any).id,
              inputUrl: url[0],
              productInfo: productInfos as any,
              generatedHtml: template.html,
              subject: template.subject,
              generationTime,
              wasSuccessful,
            },
          });

          // Update prompt usage count
          await prisma.prompt.update({
            where: { id: dbPrompt.id },
            data: {
              usageCount: {
                increment: 1,
              },
            },
          });
        }

        const previewTemplate = await buildPreviewTemplate(template);

        return NextResponse.json({
          productInfo: productInfos,
          emailTemplate: template,
          previewTemplate: previewTemplate ?? template,
        });
      } else {
        // Process single URL using effective template (database or fallback)
        const productInfo = await processSingleUrl(url, effectiveTemplate);
        const template = await generateEmailTemplate(
          productInfo,
          url,
          effectiveTemplate
        );

        wasSuccessful = true;
        const generationTime = Date.now() - startTime;

        // Log analytics if we used a database prompt
        if (dbPrompt && ((session as any)?.user as any)?.id) {
          await prisma.templateGeneration.create({
            data: {
              promptId: dbPrompt.id,
              userId: ((session as any).user as any).id,
              inputUrl: url,
              productInfo: productInfo as any,
              generatedHtml: template.html,
              subject: template.subject,
              generationTime,
              wasSuccessful,
            },
          });

          await prisma.prompt.update({
            where: { id: dbPrompt.id },
            data: {
              usageCount: {
                increment: 1,
              },
            },
          });
        }

        const previewTemplate = await buildPreviewTemplate(template);

        return NextResponse.json({
          productInfo,
          emailTemplate: template,
          previewTemplate: previewTemplate ?? template,
        });
      }
    } catch (error) {
      console.error(error);

      const generationTime = Date.now() - startTime;

      if (dbPrompt && ((session as any)?.user as any)?.id) {
        await prisma.templateGeneration.create({
          data: {
            promptId: dbPrompt.id,
            userId: ((session as any).user as any).id,
            inputUrl: Array.isArray(url) ? url[0] : url,
            productInfo: Prisma.JsonNull,
            generatedHtml: "",
            errorMessage: error instanceof Error ? error.message : "Unknown error",
            generationTime,
            wasSuccessful,
          },
        });
      }

      return NextResponse.json(
        { error: "Failed to process URL(s). Please try different product URLs." },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Scrape failed:", error);
    return NextResponse.json(
      { error: "Failed to process product" },
      { status: 500 }
    );
  }
}


async function processSingleUrl(
  url: string,
  templateType: TemplateType
): Promise<ProductInfo> {
  // Validate template type
  if (!templateType?.name || !templateType?.description) {
    throw new Error("Invalid template type provided");
  }

  // Add timeout and headers for faster scraping
  const { data } = await axios.get(url, {
    timeout: 15000, // 15 second timeout
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; TemplAIto/1.0)',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Accept-Encoding': 'gzip, deflate',
      'Connection': 'keep-alive',
    }
  });

  const $ = cheerio.load(data);

  // OPTIMIZATION: More aggressive content filtering for faster AI processing

  // Remove unnecessary elements that might bloat the content
  $("script, style, nav, footer, header, .nav, .footer, .header, .sidebar, .advertisement, .ads, .cookie, .popup, .modal, .overlay").remove();

  // Extract structured data first (faster than parsing full HTML)
  const structuredData = {
    title: $('title').text() || $('h1').first().text() || '',
    description: $('meta[name="description"]').attr('content') || $('meta[property="og:description"]').attr('content') || '',
    ogImage: $('meta[property="og:image"]').attr('content') || '',
    price: $('[class*="price"], [data-price], .cost, .amount').first().text() || '',
    images: [] as string[]
  };

  // NEW: Extract price information more thoroughly, including hidden elements
  const priceElements: any = [];

  // Look for common price patterns including hidden ones
  $('[class*="price"], [data-price], .cost, .amount, del, ins').each((i, el) => {
    const $el = $(el);
    const priceText = $el.text().trim();
    const priceHtml = $el.html();
    const isHidden = $el.css('display') === 'none' || $el.attr('style')?.includes('display: none');

    if (priceText && /\d/.test(priceText)) {
      priceElements.push({
        text: priceText,
        html: priceHtml,
        isHidden: isHidden,
        element: el.tagName.toLowerCase(),
        classes: $el.attr('class') || ''
      });
    }
  });

  // Collect images more efficiently
  $('img[src*="product"], img[src*="item"], .product img, .gallery img, [class*="product"] img').each((i, el) => {
    const src = $(el).attr('src');
    if (src && !src.includes('icon') && !src.includes('logo') && structuredData.images.length < 10) {
      structuredData.images.push(src.startsWith('http') ? src : new URL(src, url).href);
    }
  });

  // Try to extract only relevant sections with more specific selectors
  let fullContent = "";
  const productSelectors = [
    'main, .main, .content, .product, .product-details, .product-info, .item-info, .product-page',
    '[class*="product"], [id*="product"], [class*="item"], [id*="item"]',
    '.description, .details, .info, .summary'
  ];

  for (const selector of productSelectors) {
    const content = $(selector).first().text();
    if (content && content.length > fullContent.length) {
      fullContent = content;
    }
  }

  // Fallback to body content if nothing specific found
  if (!fullContent) {
    fullContent = $("body").text() || "";
  }

  // OPTIMIZATION: More aggressive truncation for faster AI processing (50k vs 100k)
  const maxLength = 50000; // Reduced from 100k for faster processing
  if (fullContent.length > maxLength) {
    fullContent = fullContent.substring(0, maxLength) + "... [content truncated]";
  }

  // NEW: Include price elements HTML in the prompt for better extraction
  const priceElementsHtml = priceElements.map((el: any) =>
    `<${el.element} class="${el.classes}" ${el.isHidden ? 'style="display:none"' : ''}>${el.html}</${el.element}>`
  ).join('\n');

  // Use structured data when available, shorter AI prompt
  let extractionOutput: string;
  try {
    const extractionResponse = await openai.responses.create({
      model: "gpt-5-mini",
            input: `Extract e-commerce product info from webpage content. Return ONLY valid JSON with required fields.

Structured: title="${structuredData.title}", description="${structuredData.description}", ogImage="${structuredData.ogImage}", price="${structuredData.price}", images=[${structuredData.images.slice(0, 5).join(', ')}]

Price Elements HTML:
 ${priceElementsHtml}

Content: "${fullContent}"

Return JSON:
{
  "language": "ISO code (en/es/fr/de/hr/etc)",
  "title": "CLEAN product name only (remove store name, website name, and any suffixes after dash/pipe/hyphen)",
  "description": "Brief description (max 200 chars)",
  "regularPrice": "Original price. If on sale: the higher/original price.",
  "salePrice": "If on sale: the lower/current price with currency. Empty if no discount.",
  "discount": "Discount percentage (e.g. '33%'). Empty if no discount.",
  "bestImageUrl": "Best product image URL",
  "allImages": ["product image URLs (max 10)"]
}

TITLE CLEANING RULES:
- Remove store/website names (e.g., "QuickPlan - Shopdbest CZ" → "QuickPlan")
- Remove suffixes after dash, pipe, or hyphen if they look like store names
- Keep only the actual product name
- Examples: "iPhone 15 Pro - Apple Store" → "iPhone 15 Pro", "Magnetický plánovač - Shop.cz" → "Magnetický plánovač"

PRICE EXTRACTION:
1. Look for the main sale product price display (usually largest, most prominent)
2. Look for the original price display (usually smaller, less prominent)
3. DO NOT extract prices from quantity/amount selectors (1x, 2x, 3x options)
4. Ignore: bulk pricing tables, shipping costs, related products

Use structured data above when available. Return full URLs only. Return ONLY the JSON object, no other text.`,
    });
    extractionOutput = extractionResponse.output_text || "{}";
  } catch (error: any) {
    // If token limit exceeded, try with much shorter content
    if (error.code === 'context_length_exceeded') {
      const shorterContent = fullContent.substring(0, 10000) + "... [truncated]";

      const fallbackResponse = await openai.responses.create({
        model: "gpt-5-mini",
                input: `Extract product info from content. Return ONLY valid JSON.

Content: "${shorterContent}"

TITLE: Extract CLEAN product name only. Remove store/site names after dash/pipe/hyphen. Example: "Product - StoreName" → "Product"

PRICES: Must have currency (€,$,Kč,Ft). Find main/largest price. DO NOT use prices from quantity selectors (1x,2x,3x). Ignore bulk/shipping. Two prices: regularPrice=higher, salePrice=lower. One price: salePrice=empty.

Return ONLY: {"language": "en", "title": "", "description": "", "regularPrice": "", "salePrice": "", "discount": "", "bestImageUrl": "", "allImages": []}`,
      });
      extractionOutput = fallbackResponse.output_text || "{}";
    } else {
      throw error;
    }
  }

  // Parse JSON from response, handling potential markdown code blocks
  let jsonStr = extractionOutput.trim();
  if (jsonStr.startsWith("```json")) {
    jsonStr = jsonStr.replace(/^```json\s*/, "").replace(/\s*```$/, "");
  } else if (jsonStr.startsWith("```")) {
    jsonStr = jsonStr.replace(/^```\s*/, "").replace(/\s*```$/, "");
  }
  const extractedData = JSON.parse(jsonStr || "{}");

  // Use structured data as fallback when AI extraction fails
  const productInfo: ProductInfo = {
    title: extractedData.title || structuredData.title || "Product Title",
    description: extractedData.description || structuredData.description || "Product Description",
    images: extractedData.allImages || structuredData.images || [], // All available images
    language: extractedData.language || "en",
    bestImageUrl: extractedData.bestImageUrl || structuredData.ogImage || "",
    regularPrice: extractedData.regularPrice || structuredData.price || "",
    salePrice: extractedData.salePrice || "",
    discount: extractedData.discount || "",
  };

  return productInfo;
}

async function processMultipleUrls(
  urls: string[],
  templateType: TemplateType
): Promise<MultiProductInfo> {
  // Validate template type
  if (!templateType?.name || !templateType?.description) {
    throw new Error("Invalid template type provided");
  }

  // Process all URLs in parallel
  const productPromises = urls.map((url) =>
    processSingleUrl(url, templateType)
  );
  const products = await Promise.all(productPromises);

  // Determine the most common language
  const languages = products.map((p) => p.language).filter((lang) => lang);
  const languageCounts: { [key: string]: number } = {};
  languages.forEach((lang) => {
    languageCounts[lang] = (languageCounts[lang] || 0) + 1;
  });

  const mostCommonLanguage = Object.keys(languageCounts).reduce(
    (a, b) => (languageCounts[a] > languageCounts[b] ? a : b),
    "en"
  );

  return {
    products,
    language: mostCommonLanguage,
  };
}

async function generateEmailTemplate(
  productInfo: ProductInfo | MultiProductInfo,
  productUrls: string | string[],
  templateType: any
) {
  // Check if it's multi-product or single product
  const isMultiProduct = "products" in productInfo;
  const urls = Array.isArray(productUrls) ? productUrls : [productUrls];

  if (isMultiProduct) {
    return generateMultiProductTemplate(
      productInfo as MultiProductInfo,
      urls,
      templateType,
      openai,
      anthropic
    );
  } else {
    // Handle single product template with dynamic AI engine selection
    const singleProductInfo = productInfo as ProductInfo;

    // Step 1: OpenAI generates the email content/copy
    const contentResponse = await openai.responses.create({
      model: "gpt-5-mini",
            input: `Email copywriter. Write in ${singleProductInfo.language}. Return ONLY valid JSON with subject, headline, bodyText, ctaText, preheader.

Product: ${singleProductInfo.title}
Price: ${singleProductInfo.salePrice || singleProductInfo.regularPrice}
${singleProductInfo.discount ? `Discount: ${singleProductInfo.discount}` : ''}

Template: ${templateType.name}

Return ONLY this JSON format:
{
  "subject": "Email subject line",
  "headline": "Main headline",
  "bodyText": "Body text",
  "ctaText": "CTA text",
  "preheader": "Preheader text"
}`,
    });

    let contentJson = (contentResponse.output_text || "{}").trim();
    if (contentJson.startsWith("```json")) {
      contentJson = contentJson.replace(/^```json\s*/, "").replace(/\s*```$/, "");
    } else if (contentJson.startsWith("```")) {
      contentJson = contentJson.replace(/^```\s*/, "").replace(/\s*```$/, "");
    }
    const emailContent = JSON.parse(contentJson);

    // Step 2: Generate HTML design using the specified AI engine
    let result;
    if (templateType.designEngine === 'GPT4O') {
      result = await generateWithGPT4O(emailContent, singleProductInfo, urls[0], templateType);
    } else {
      result = await generateWithClaude(emailContent, singleProductInfo, urls[0], templateType);
    }

    return result;
  }
}

async function generateWithGPT4O(
  emailContent: any,
  productInfo: ProductInfo,
  productUrl: string,
  templateType: any
) {
  const designResponse = await openai.responses.create({
    model: "gpt-5.2",
        input: `${templateType.system}

You are an expert HTML email developer. Create a single product email template.

CRITICAL INSTRUCTION: You must return ONLY pure HTML code. Do NOT wrap it in JSON. Do NOT use markdown code blocks. Do NOT include explanations.

Your response should start with: <!DOCTYPE html>
Your response should end with: </html>

MANDATORY EMAIL REQUIREMENTS (MUST FOLLOW ALL 12):
1. Include full HTML document structure (DOCTYPE, html, head, body)
2. Add necessary meta tags in head for email client compatibility
3. Use a table-based layout for maximum email client compatibility
4. Center all content in the email
5. Use inline CSS for all styling (no external CSS or style tags)
6. Set a max-width of 600px for the main content
7. Use web-safe fonts
8. Create beautiful, modern, and professional design
9. Ensure all images have proper alt text
10. Use padding instead of margins where possible
11. Links should always open in a new tab

SPECIFIC DESIGN INSTRUCTIONS FROM TEMPLATE:
${templateType.user}

Email Content to Use:
- Subject: ${emailContent.subject}
- Headline: ${emailContent.headline}
- Body: ${emailContent.bodyText}
- CTA Text: ${emailContent.ctaText}

Product Details (USE THESE TO SWITCH VARIABLES IN THE TEMPLATE DO NOT USE IF WE DO NOT HAVE VARIABLES FOR IT):
Example: {{product_image}} not appearing in the template means we do not have a product image so do not use it in the template.

- Name: ${productInfo.title}
- Description: ${productInfo.description}
- Image: ${productInfo.bestImageUrl}
- Regular Price: ${productInfo.regularPrice}
- Sale Price: ${productInfo.salePrice}
- Discount: ${productInfo.discount}
- Link: ${productUrl}

CRITICAL: For unsubscribe link, use EXACTLY this format: {unsubscribe}UNSUBSCRIBE{/unsubscribe} - do NOT use href attribute.

REMEMBER: Return ONLY the HTML code. Start with <!DOCTYPE html> immediately.`,
  });

  let htmlContent = (designResponse.output_text || "").trim();
  // Remove markdown code blocks if present
  if (htmlContent.startsWith("```html")) {
    htmlContent = htmlContent.replace(/^```html\s*/, "").replace(/\s*```$/, "");
  } else if (htmlContent.startsWith("```")) {
    htmlContent = htmlContent.replace(/^```\s*/, "").replace(/\s*```$/, "");
  }

  return {
    html: htmlContent,
    subject: emailContent.subject || "Email Template",
    engine: 'GPT4O'
  };
}

async function generateWithClaude(
  emailContent: any,
  productInfo: ProductInfo,
  productUrl: string,
  templateType: any
) {
  const designResponse = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 4000,
    messages: [
      {
        role: "user",
        content: `${templateType.system}

CRITICAL INSTRUCTION: You must return ONLY pure HTML code. Do NOT wrap it in JSON. Do NOT use markdown code blocks. Do NOT include explanations.

Your response should start with: <!DOCTYPE html>
Your response should end with: </html>

MANDATORY EMAIL REQUIREMENTS (MUST FOLLOW ALL 12):
1. Include full HTML document structure (DOCTYPE, html, head, body)
2. Add necessary meta tags in head for email client compatibility
3. Use a table-based layout for maximum email client compatibility
4. Center all content in the email
5. Use inline CSS for all styling (no external CSS or style tags)
6. Set a max-width of 600px for the main content
7. Use web-safe fonts
8. Create beautiful, modern, and professional design
9. Ensure all images have proper alt text
10. Use padding instead of margins where possible
11. Links should always open in a new tab

TEMPLATE-SPECIFIC REQUIREMENTS:
Template: ${templateType.name} - ${templateType.description}

SPECIFIC DESIGN INSTRUCTIONS FROM TEMPLATE:
${templateType.user}

Email Content to Use:
- Subject: ${emailContent.subject}
- Headline: ${emailContent.headline}
- Body: ${emailContent.bodyText}
- CTA Text: ${emailContent.ctaText}

Product Details (USE THESE TO SWITCH VARIABLES IN THE TEMPLATE DO NOT USE IF WE DO NOT HAVE VARIABLES FOR IT):
Example: {{product_image}} not appearing in the template means we do not have a product image so do not use it in the template.
- Name: ${productInfo.title}
- Description: ${productInfo.description}
- Image: ${productInfo.bestImageUrl}
- Regular Price: ${productInfo.regularPrice}
- Sale Price: ${productInfo.salePrice}
- Discount: ${productInfo.discount}
- Link: ${productUrl}

CRITICAL: For unsubscribe link, use EXACTLY this format: {unsubscribe}UNSUBSCRIBE{/unsubscribe} - do NOT use href attribute.

REMEMBER: Return ONLY the HTML code. Start with <!DOCTYPE html> immediately.`,
      },
    ],
  });

  const rawContent = designResponse.content[0].type === "text"
    ? designResponse.content[0].text
    : "";

  let htmlContent = rawContent.trim();

  // Check if Claude still returned JSON despite instructions
  if (htmlContent.startsWith("```json") || htmlContent.startsWith("{")) {
    try {
      let jsonString = htmlContent;
      if (htmlContent.includes("```json")) {
        const match = htmlContent.match(/```json\s*([\s\S]*?)\s*```/);
        jsonString = match ? match[1] : htmlContent;
      }

      const parsed = JSON.parse(jsonString);
      htmlContent = parsed.html || htmlContent;
    } catch {
      // If parsing fails, use raw content
    }
  }

  return {
    html: htmlContent,
    subject: emailContent.subject || "Email Template",
    engine: 'CLAUDE'
  };
}
