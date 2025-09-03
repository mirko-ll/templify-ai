import { Anthropic } from "@anthropic-ai/sdk";
import { OpenAI } from "openai";
import { MultiProductInfo, TemplateType } from "../types/types";

export async function generateMultiProductTemplate(
  multiProductInfo: MultiProductInfo,
  urls: string[],
  templateType: TemplateType,
  openai: OpenAI,
  anthropic: Anthropic
) {
    // Create placeholders for multi-product template
    const productNames = multiProductInfo.products
      .map((p) => p.title)
      .join(", ");
    const productLinks = urls.join(", ");
    const productImages = multiProductInfo.products
      .map((p) => p.bestImageUrl) // Use best image for multi-product
      .join(", ");
    const productPrices = multiProductInfo.products
      .map(
        (p) =>
          `${p.regularPrice}${p.salePrice ? ` (Sale: ${p.salePrice})` : ""}${
            p.discount ? ` (${p.discount})` : ""
          }`
      )
      .join(", ");

    // Step 1: Generate email content/copy using specified AI engine
    let emailContent;
    
    if (templateType.designEngine === 'GPT4O') {
      // Use GPT-4O for both content and design
      const contentResponse = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are an expert email marketing copywriter. Write the email in ${multiProductInfo.language} language. Create compelling email content for multiple products based on the template type and product information. Focus ONLY on the copywriting - subject line, headlines, body text, and call-to-action text. Do not include any HTML or styling.`,
        },
        {
          role: "user",
          content: `${templateType.user
            .replace(/\{\{product_names\}\}/g, productNames)
            .replace(/\{\{product_links\}\}/g, productLinks)
            .replace(/\{\{product_images\}\}/g, productImages)
            .replace(/\{\{product_prices\}\}/g, productPrices)
            .replace(/\{\{email_address\}\}/g, "{{email_address}}")}
                    
                    Products details:
                    ${multiProductInfo.products
                      .map(
                        (product, index) => `
                    Product ${index + 1}:
                    Name: ${product.title}
                    Description: ${product.description}
                    URL: ${urls[index] || urls[0]}
                    Best Image: ${product.bestImageUrl}
                    All Images: ${product.images.join(", ")}
                    Regular Price: ${product.regularPrice}
                    Sale Price: ${product.salePrice}
                    Discount: ${product.discount}
                    `
                      )
                      .join("")}
                    
                    Generate email content in ${
                      multiProductInfo.language
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

      emailContent = JSON.parse(
        contentResponse.choices[0].message.content || "{}"
      );
    } else {
      // Use Claude for content generation
      const contentResponse = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2000,
        messages: [
          {
            role: "user",
            content: `You are an expert email marketing copywriter. Write the email in ${multiProductInfo.language} language. Create compelling email content for multiple products based on the template type and product information. Focus ONLY on the copywriting - subject line, headlines, body text, and call-to-action text. Do not include any HTML or styling.
            
            ${templateType.user
              .replace(/\{\{product_names\}\}/g, productNames)
              .replace(/\{\{product_links\}\}/g, productLinks)
              .replace(/\{\{product_images\}\}/g, productImages)
              .replace(/\{\{product_prices\}\}/g, productPrices)
              .replace(/\{\{email_address\}\}/g, "{{email_address}}")}
                      
            Products details:
            ${multiProductInfo.products
              .map(
                (product, index) => `
            Product ${index + 1}:
            - Title: ${product.title}
            - Description: ${product.description}
            - Regular Price: ${product.regularPrice}
            - Sale Price: ${product.salePrice || "N/A"}
            - Discount: ${product.discount || "N/A"}
            - Images: ${product.images.join(", ")}
            - Best Image: ${product.bestImageUrl}
            `
              )
              .join("")}
                      
            Generate email content in ${multiProductInfo.language} language.
                      
            Please return a JSON object with:
            {
                "subject": "Email subject line",
                "headline": "Main headline", 
                "bodyText": "Main body text/description",
                "ctaText": "Call to action button text",
                "preheader": "Email preheader text"
            }`
          }
        ]
      });

      let rawContent = contentResponse.content[0].type === "text" ? contentResponse.content[0].text : "{}";
      
      // Handle Claude returning JSON wrapped in markdown code blocks
      if (rawContent.includes("```json")) {
        const match = rawContent.match(/```json\s*([\s\S]*?)\s*```/);
        rawContent = match ? match[1] : rawContent;
      }
      
      emailContent = JSON.parse(rawContent);
    }

    // Step 2: Generate HTML design using the specified AI engine
    if (templateType.designEngine === 'GPT4O') {
      // Use GPT-4O for HTML generation
      const designResponse = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "You are an expert HTML email developer. Create responsive, cross-client compatible email templates."
          },
          {
            role: "user",
            content: `Create a multi-product landing page email template using this content:

CRITICAL: Return ONLY pure HTML code. Start with <!DOCTYPE html> and end with </html>

Content: ${JSON.stringify(emailContent)}
Products: ${JSON.stringify(multiProductInfo.products)}
URLs: ${JSON.stringify(urls)}

${templateType.system}

Create a responsive email template that showcases all products effectively with modern design.`
          }
        ]
      });

      return {
        html: designResponse.choices[0].message.content || "",
        subject: emailContent.subject || "Multi-Product Offer",
      };
    } else {
      // Use Claude for HTML generation
    const designResponse = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4000,
      messages: [
        {
          role: "user",
          content: `You are an expert HTML email developer. Create a multi-product landing page email template.

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
Template Type: ${templateType.name} - ${templateType.description}

SPECIFIC DESIGN INSTRUCTIONS FROM TEMPLATE TYPE:
${templateType.user}

Template Requirements:
- Multi-product landing page for ${multiProductInfo.products.length} products
- Template style: ${templateType.name}
- Each product should have: image, title, description, price, CTA button
- Mobile responsive design using inline CSS media queries

Email Content to Use:
- Subject: ${emailContent.subject}
- Headline: ${emailContent.headline}
- Body: ${emailContent.bodyText}
- CTA Text: ${emailContent.ctaText}

Products:
${multiProductInfo.products
  .map(
    (product, index) => `
Product ${index + 1}:
- Name: ${product.title}
- Description: ${product.description}
- Best Image: ${product.bestImageUrl}
- All Images: ${product.images.join(", ")}
- Regular Price: ${product.regularPrice}
- Sale Price: ${product.salePrice}
- Discount: ${product.discount}
- Link: ${urls[index] || urls[0]}
`
  )
  .join("")}

CRITICAL: For unsubscribe link, use EXACTLY this format: {{unsubscribe}}UNSUBSCRIBE{{/unsubscribe}} - do NOT use href attribute or any other HTML link format.

REMEMBER: Return ONLY the HTML code. Start with <!DOCTYPE html> immediately. Follow ALL 12 email requirements above AND the specific template design instructions.`,
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

    return {
      html: htmlContent,
      subject: emailContent.subject || "Multi-Product Email Template",
    };
    }
} 