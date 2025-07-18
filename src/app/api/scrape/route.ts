import { NextResponse } from "next/server";
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

export async function POST(request: Request) {
  try {
    const { url, templateType } = await request.json();

    if (!url) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    if (!templateType) {
      return NextResponse.json(
        { error: "Template type is required" },
        { status: 400 }
      );
    }

    // Handle multiple URLs for Multi-Product Landing
    const isMultiProduct = Array.isArray(url);

    if (isMultiProduct) {
      // Process multiple URLs
      const productInfos = await processMultipleUrls(url, templateType);
      const template = await generateMultiProductTemplate(
        productInfos,
        url,
        templateType,
        openai,
        anthropic
      );

      return NextResponse.json({
        productInfo: productInfos,
        emailTemplate: template,
      });
    } else {
      // Process single URL (existing logic)
      const productInfo = await processSingleUrl(url, templateType);
      const template = await generateEmailTemplate(
        productInfo,
        url,
        templateType
      );

      return NextResponse.json({
        productInfo,
        emailTemplate: template,
      });
    }
  } catch (error) {
    console.error("Error processing URL:", error);
    return NextResponse.json(
      { error: "Failed to process URL" },
      { status: 500 }
    );
  }
}

async function processSingleUrl(
  url: string,
  templateType: TemplateType
): Promise<ProductInfo> {
  // Fetch the HTML content to extract information with Cheerio
  const { data } = await axios.get(url);
  const $ = cheerio.load(data);

  // Extract body content first
  const bodyHtml = $("body").html() || "";
  const $body = cheerio.load(bodyHtml);

  // Extract images from body (keep this with Cheerio as requested)
  const images: string[] = [];
  $body("img").each((_, element) => {
    const src = $body(element).attr("src");
    if (src && !src.includes("logo") && !src.includes("icon")) {
      // Convert relative URLs to absolute
      const imageUrl = src.startsWith("http") ? src : new URL(src, url).href;
      images.push(imageUrl);
    }
  });

  // Get full HTML content for AI processing
  const fullContent = $body.html() || "";

  // Run both OpenAI calls in parallel for better performance
  const [extractionResponse, bestImageResponse] = await Promise.all([
    // Extract product information using GPT-4o-mini for JSON support
    openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are an expert in e-commerce product information extraction. Analyze the provided webpage content and extract product information. Be precise and only extract actual product information, not navigation or footer content. Pay special attention to finding the correct prices - look for original prices, sale prices, and discounts.",
        },
        {
          role: "user",
          content: `Analyze this webpage content and extract the following information. Pay special attention to prices and look for both original and discounted prices:

Content: "${fullContent}"

Please return a JSON object with:
{
    "language": "ISO language code (e.g., 'en', 'es', 'fr', 'de', 'sr', 'hr', etc.)",
    "title": "Product title/name",
    "description": "Product description (max 200 characters)",
    "regularPrice": "Regular/original price (if found)",
    "salePrice": "Sale/discounted price (if found)",
    "discount": "Discount percentage or amount (if found)"
}

Instructions:
- For language: detect the primary language of the content
- For title: find the main product name/title
- For description: find the product description
- For prices: carefully analyze the content to find:
  * Original/regular price (often crossed out or labeled as 'regular price')
  * Sale/current price (usually more prominent)
  * Any discount percentage or amount
- If any information is not found, return empty string for that field
- Be precise and extract only actual product information`,
        },
      ],
      response_format: { type: "json_object" },
    }),

    // Find best image in parallel (only if images exist)
    images.length > 0
      ? openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content:
                "You are an expert in e-commerce and product photography. Your task is to select the best product image for an email advertisement.",
            },
            {
              role: "user",
              content: `From these image URLs, select the index of the best one for an email advertisement. The images are: ${JSON.stringify(
                images
              )}. Respond with just the index number.`,
            },
          ],
        })
      : Promise.resolve(null),
  ]);

  const extractedData = JSON.parse(
    extractionResponse.choices[0].message.content || "{}"
  );

  // Process best image result
  let bestImageUrl = "";
  if (images.length > 0 && bestImageResponse) {
    const indexString = bestImageResponse.choices[0].message.content?.trim();
    const index = parseInt(indexString || "0");
    bestImageUrl = images[index < images.length ? index : 0] || images[0];
  }

  // Create product info object with extracted data
  const productInfo: ProductInfo = {
    title: extractedData.title || "Product Title",
    description: extractedData.description || "Product Description",
    images: images,
    language: extractedData.language || "en",
    bestImageUrl: bestImageUrl,
    regularPrice: extractedData.regularPrice || "",
    salePrice: extractedData.salePrice || "",
    discount: extractedData.discount || "",
  };

  return productInfo;
}

async function processMultipleUrls(
  urls: string[],
  templateType: any
): Promise<MultiProductInfo> {
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
  templateType: TemplateType
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
    // Handle single product template (existing logic)
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
            .replace(/\{\{discount\}\}/g, singleProductInfo.discount)}
                    
                    Product details:
                    Product Name: ${singleProductInfo.title}
                    Description: ${singleProductInfo.description}
                    Product URL: ${urls[0]}
                    Image URL: ${singleProductInfo.bestImageUrl}
                    Regular Price: ${singleProductInfo.regularPrice}
                    Sale Price: ${singleProductInfo.salePrice}
                    Discount: ${singleProductInfo.discount}
                    
                    Generate email content in ${
                      singleProductInfo.language
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

    // Step 2: Claude generates the HTML design using the content from OpenAI
    const designResponse = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4000,
      messages: [
        {
          role: "user",
          content: `You are an expert HTML email developer. Create a single product email template.

CRITICAL INSTRUCTION: You must return ONLY pure HTML code. Do NOT wrap it in JSON. Do NOT use markdown code blocks. Do NOT include explanations.

Your response should start with: <!DOCTYPE html>
Your response should end with: </html>

MANDATORY EMAIL REQUIREMENTS (MUST FOLLOW ALL 11):
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
Template Type: ${templateType.name} - ${templateType.description}

SPECIFIC DESIGN INSTRUCTIONS FROM TEMPLATE TYPE:
${templateType.user}

Template Requirements:
- Single product email template
- Template style: ${templateType.name} - ${templateType.description}
- Mobile responsive design using inline CSS media queries
- Include product image, title, description, pricing, CTA button

Email Content to Use:
- Subject: ${emailContent.subject}
- Headline: ${emailContent.headline}
- Body: ${emailContent.bodyText}
- CTA Text: ${emailContent.ctaText}

Product Details:
- Name: ${singleProductInfo.title}
- Description: ${singleProductInfo.description}
- Image: ${singleProductInfo.bestImageUrl}
- Regular Price: ${singleProductInfo.regularPrice}
- Sale Price: ${singleProductInfo.salePrice}
- Discount: ${singleProductInfo.discount}
- Link: ${urls[0]}

REMEMBER: Return ONLY the HTML code. Start with <!DOCTYPE html> immediately. Follow ALL 11 email requirements above AND the specific template design instructions.`,
        },
      ],
    });

    const rawContent =
      designResponse.content[0].type === "text"
        ? designResponse.content[0].text
        : "";

    // Since we explicitly asked for HTML only, expect pure HTML
    let htmlContent = rawContent.trim();

    // Check if Claude still returned JSON despite instructions
    if (htmlContent.startsWith("```json") || htmlContent.startsWith("{")) {
      // Extract HTML from JSON as fallback
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
    };
  }
}
