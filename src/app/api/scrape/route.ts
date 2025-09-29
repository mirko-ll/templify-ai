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
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-2024-11-20",
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "Translate the provided text to English. Return only the translated text with no additional commentary."
        },
        {
          role: "user",
          content: trimmed,
        },
      ],
    });

    const output = completion.choices[0]?.message?.content?.trim();
    return output && output.length > 0 ? output : text ?? "";
  } catch (error) {
    console.error("Failed to translate text to English", error);
    return text ?? "";
  }
}

async function translateHtmlToEnglish(html: string) {
  const trimmed = html?.trim();
  if (!trimmed) {
    return html;
  }

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-2024-11-20",
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: `You are a professional email translator. Translate the provided HTML email into English.
Important rules:
1. Preserve every HTML tag and attribute exactly as in the original markup.
2. Do NOT translate or modify template variables (e.g. {{variable}}, {unsubscribe}, {subtag:name}).
3. Keep all URLs untouched.
4. Translate only visible copy/content.
5. Maintain the original tone and style.
6. Return ONLY the translated HTML markup with no additional commentary.`
        },
        {
          role: "user",
          content: trimmed,
        },
      ],
    });

    const output = completion.choices[0]?.message?.content?.trim();
    return output && output.length > 0 ? output : html;
  } catch (error) {
    console.error("Failed to translate HTML to English", error);
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

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    const body = await request.json();

    const { url, templateType, isTest, countryUrls } = body ?? {};

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

        console.log(productInfo, template);

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

  // Fetch the HTML content to extract information with Cheerio
  const { data } = await axios.get(url);
  const $ = cheerio.load(data);

  // Extract body content first
  const bodyHtml = $("body").html() || "";
  const $body = cheerio.load(bodyHtml);

  // Try to extract only relevant sections first
  let fullContent = "";

  // Remove unnecessary elements that might bloat the content
  $body("script, style, nav, footer, .nav, .footer, .sidebar, .advertisement, .ads").remove();

  // Look for main content areas
  const mainContent = $body("main, .main, .content, .product, .product-details, .product-info").html();
  if (mainContent) {
    fullContent = mainContent;
  } else {
    // Fallback to body content
    fullContent = $body.html() || "";
  }

  // Truncate content if it's too long (limit to ~100k tokens)
  const maxLength = 100000; // Conservative limit
  if (fullContent.length > maxLength) {
    fullContent = fullContent.substring(0, maxLength) + "... [content truncated]";
  }

  // Extract all information including best image in one OpenAI call
  let extractionResponse;
  try {
    extractionResponse = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are an expert in e-commerce product information extraction. Analyze the provided webpage content and extract product information including the best product image and all available product images. Be precise and only extract actual product information, not navigation or footer content. Pay special attention to finding the correct prices and the best product image.",
        },
        {
          role: "user",
          content: `Analyze this webpage content and extract the following information. Pay special attention to prices and look for both original and discounted prices. Also find the best product image URL and all available product images.

Content: "${fullContent}"

Please return a JSON object with:
{
    "language": "ISO language code (e.g., 'en', 'es', 'fr', 'de', 'sr', 'hr', etc.)",
    "title": "Product title/name",
    "description": "Product description (max 200 characters)",
    "regularPrice": "Regular/original price (if found)",
    "salePrice": "Sale/discounted price (if found)",
    "discount": "Discount percentage or amount (if found)",
    "bestImageUrl": "URL of the best product image (prefer OG images, then gallery images, avoid logos/icons)",
    "allImages": ["array of all product image URLs found (gallery images, product photos, etc.)"]
}

Instructions:
- For language: detect the primary language of the content
- For title: find the main product name/title
- For description: find the product description
- For prices: carefully analyze the content to find:
  * Original/regular price (often crossed out or labeled as 'regular price')
  * Sale/current price (usually more prominent)
  * Any discount percentage or amount
- For bestImageUrl: look for:
  * First priority: Open Graph images (og:image meta tags)
  * Second priority: Product gallery images (main product photos)
  * Avoid: logos, icons, navigation images
  * Return full URL (convert relative URLs to absolute)
- For allImages: find all product-related images including:
  * Gallery images
  * Product photos
  * Thumbnail images
  * Avoid: logos, icons, navigation images, social media icons
  * Return full URLs (convert relative URLs to absolute)
  * Remove duplicates
- If any information is not found, return empty string for that field
- Be precise and extract only actual product information`,
        },
      ],
      response_format: { type: "json_object" },
    });
  } catch (error: any) {
    // If token limit exceeded, try with gpt-4o-mini and shorter content
    if (error.code === 'context_length_exceeded') {
      // Further truncate content
      const shorterContent = fullContent.substring(0, 50000) + "... [content further truncated]";

      extractionResponse = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You are an expert in e-commerce product information extraction. Extract key product information from the provided content.",
          },
          {
            role: "user",
            content: `Extract product information from this content:

Content: "${shorterContent}"

Return JSON:
{
    "language": "ISO language code",
    "title": "Product title",
    "description": "Product description (max 200 chars)",
    "regularPrice": "Regular price",
    "salePrice": "Sale price", 
    "discount": "Discount",
    "bestImageUrl": "Best product image URL",
    "allImages": ["array of product image URLs"]
}`,
          },
        ],
        response_format: { type: "json_object" },
      });
    } else {
      throw error;
    }
  }

  const extractedData = JSON.parse(
    extractionResponse.choices[0].message.content || "{}"
  );

  // Create product info object with extracted data
  const productInfo: ProductInfo = {
    title: extractedData.title || "Product Title",
    description: extractedData.description || "Product Description",
    images: extractedData.allImages || [], // All available images
    language: extractedData.language || "en",
    bestImageUrl: extractedData.bestImageUrl || "",
    regularPrice: extractedData.regularPrice || "",
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
    const contentResponse = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are an expert email marketing copywriter. Write the email in ${singleProductInfo.language} language. Create compelling email content based on the template type and product information. Focus ONLY on the copywriting - subject line, headlines, body text, and call-to-action text. Do not include any HTML or styling.`,
        },
        {
          role: "user",
          content: `${templateType.user
            .replace(/\{\{product_name\}\}/g, singleProductInfo.title)
            .replace(/\{\{product_link\}\}/g, urls[0])
            .replace(/\{\{image_url\}\}/g, singleProductInfo.bestImageUrl)
            .replace(/\{\{regular_price\}\}/g, singleProductInfo.regularPrice)
            .replace(/\{\{sale_price\}\}/g, singleProductInfo.salePrice)
            .replace(/\{\{discount\}\}/g, singleProductInfo.discount)
            .replace(/\{\{email_address\}\}/g, "{{email_address}}")}
                    
                    Product details:
                    Product Name: ${singleProductInfo.title}
                    Description: ${singleProductInfo.description}
                    Product URL: ${urls[0]}
                    Image URL: ${singleProductInfo.bestImageUrl}
                    Regular Price: ${singleProductInfo.regularPrice}
                    Sale Price: ${singleProductInfo.salePrice}
                    Discount: ${singleProductInfo.discount}
                    
                    Generate email content in ${singleProductInfo.language
            } language.
                    
                    Please return a JSON object with:
                    {
                        "subject": "Email subject line",
                        "headline": "Main headline",
                        "bodyText": "Main body text/description",
                        "ctaText": "Call to action button text",
                        "preheader": "Email preheader text"
                    }`,
        },
      ],
      response_format: { type: "json_object" },
    });

    const emailContent = JSON.parse(
      contentResponse.choices[0].message.content || "{}"
    );

    // Step 2: Generate HTML design using the specified AI engine
    if (templateType.designEngine === 'GPT4O') {
      return await generateWithGPT4O(emailContent, singleProductInfo, urls[0], templateType);
    } else {
      return await generateWithClaude(emailContent, singleProductInfo, urls[0], templateType);
    }
  }
}

async function generateWithGPT4O(
  emailContent: any,
  productInfo: ProductInfo,
  productUrl: string,
  templateType: any
) {
  console.log(emailContent);

  const designResponse = await openai.chat.completions.create({
    model: "gpt-4o-2024-11-20",         // <- pin snapshot
    temperature: 0.2,                   // a touch of creativity for design
    top_p: 1,
    presence_penalty: 0,
    frequency_penalty: 0,
    seed: 42,
    messages: [
      {
        role: "system",
        content: templateType.system
      },
      {
        role: "user",
        content: `You are an expert HTML email developer. Create a single product email template.

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
12. Include unsubscribe footer with 8px font size: "This message was sent to {{email_address}}. If you no longer wish to receive such messages, unsubscribe here {{unsubscribe}}UNSUBSCRIBE{{/unsubscribe}}" - DO NOT use href attribute, use the exact format shown

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

CRITICAL: For unsubscribe link, use EXACTLY this format: {{unsubscribe}}UNSUBSCRIBE{{/unsubscribe}} - do NOT use href attribute.

REMEMBER: Return ONLY the HTML code. Start with <!DOCTYPE html> immediately.`
      }
    ],
    max_tokens: 4000,
  });

  const htmlContent = designResponse.choices[0].message.content?.trim() || "";

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
    model: "claude-sonnet-4-20250514",
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
12. Include unsubscribe footer with 8px font size: "This message was sent to {{email_address}}. If you no longer wish to receive such messages, unsubscribe here {{unsubscribe}}UNSUBSCRIBE{{/unsubscribe}}" - DO NOT use href attribute, use the exact format shown

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

CRITICAL: For unsubscribe link, use EXACTLY this format: {{unsubscribe}}UNSUBSCRIBE{{/unsubscribe}} - do NOT use href attribute.

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
