import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { promptTypes } from '@/app/utils/promptTypes';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

interface ProductInfo {
    title: string;
    description: string;
    images: string[];
    bestImageUrl: string;
    language: string;
}

export async function POST(request: Request) {
    try {
        const { url } = await request.json();

        if (!url) {
            return NextResponse.json({ error: 'URL is required' }, { status: 400 });
        }

        // Fetch the HTML content to extract images with Cheerio
        const { data } = await axios.get(url);
        const $ = cheerio.load(data);

        // Extract images using Cheerio
        const images: string[] = [];
        $('img').each((_, element) => {
            const src = $(element).attr('src');
            if (src && !src.includes('logo') && !src.includes('icon')) {
                // Convert relative URLs to absolute
                const imageUrl = src.startsWith('http') ? src : new URL(src, url).href;
                images.push(imageUrl);
            }
        });

        // Detect language from the HTML content
        const htmlContent = $('body').text().substring(0, 1000); // Use the first 1000 characters
        const languageResponse = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content: "You are a language detection expert. Identify the language of the provided text and return just the ISO language code (e.g., 'en', 'es', 'fr', 'de', etc.)."
                },
                {
                    role: "user",
                    content: `Detect the language of this content and return only the ISO language code: "${htmlContent}"`
                }
            ],
        });

        const detectedLanguage = languageResponse.choices[0].message.content?.trim() || 'en';

        // Use OpenAI to extract product information
        const extractionResponse = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                {
                    role: "system",
                    content: `You are an expert in extracting product information from URLs. Extract the title, description from the provided URL. Respond in the detected language: ${detectedLanguage}.`
                },
                {
                    role: "user",
                    content: `Extract the product information from this URL: ${url}
          
          Please return a JSON object with the following structure:
          {
            "title": "Product title",
            "description": "Product description",
          }`
                }
            ],
            response_format: { type: "json_object" },
        });

        const productInfo = JSON.parse(extractionResponse.choices[0].message.content || '{}');

        // Add images from Cheerio to the product info
        productInfo.images = images;
        // Add detected language
        productInfo.language = detectedLanguage;
        console.log(productInfo);
        // Use OpenAI to identify the best product image
        let bestImageUrl = '';
        if (images.length > 0) {
            const response = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                    {
                        role: "system",
                        content: "You are an expert in e-commerce and product photography. Your task is to select the best product image for an email advertisement."
                    },
                    {
                        role: "user",
                        content: `From these image URLs for a product called "${productInfo.title}", select the index of the best one for an email advertisement. The images are: ${JSON.stringify(images)}. Respond with just the index number.`
                    }
                ],
            });

            const indexString = response.choices[0].message.content?.trim();
            const index = parseInt(indexString || '0');
            bestImageUrl = images[index < images.length ? index : 0] || images[0];
        }

        // Add the best image URL to the product info
        productInfo.bestImageUrl = bestImageUrl;

        // Generate email templates based on prompt types
        const templates = await generateEmailTemplates(productInfo, url);

        return NextResponse.json({
            productInfo,
            emailTemplates: templates
        });
    } catch (error) {
        console.error('Error processing URL:', error);
        return NextResponse.json(
            { error: 'Failed to process URL' },
            { status: 500 }
        );
    }
}

async function generateEmailTemplates(productInfo: ProductInfo, productUrl: string) {

    const templates = promptTypes.map(async (promptType) => {
        const emailTemplate = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                {
                    role: 'system',
                    content: `You are an expert email marketing copywriter. Write the email in ${productInfo.language} language. Create a complete HTML email that follows these requirements:
                     1. Include full HTML document structure (DOCTYPE, html, head, body)
                     2. Add necessary meta tags in head for email client compatibility
                     3. Use a table-based layout for maximum email client compatibility
                     4. Center all content in the email
                     5. Use inline CSS for all styling (no external CSS or style tags)
                     6. Set a max-width of 600px for the main content
                     7. Use web-safe fonts
                     8. Make CTAs stand out with contrasting colors
                     9. Ensure all images have proper alt text
                     10. Use padding instead of margins where possible
                     11. Links should always open in a new tab
                     
                     The HTML structure should look like this:
                     <!DOCTYPE html>
                     <html lang="en">
                     <head>
                         <meta charset="UTF-8">
                         <meta name="viewport" content="width=device-width, initial-scale=1.0">
                         <meta http-equiv="X-UA-Compatible" content="IE=edge">
                         <meta name="format-detection" content="telephone=no, date=no, address=no, email=no">
                         <meta name="x-apple-disable-message-reformatting">
                         <title>Email Campaign</title>
                         <!--[if mso]>
                         <xml>
                             <o:OfficeDocumentSettings>
                                 <o:PixelsPerInch>96</o:PixelsPerInch>
                             </o:OfficeDocumentSettings>
                         </xml>
                         <style>
                             table {border-collapse: collapse;}
                             .mso-line-height {mso-line-height-rule: exactly;}
                         </style>
                         <![endif]-->
                     </head>
                     <body style="margin: 0; padding: 0; width: 100%; word-break: break-word; -webkit-font-smoothing: antialiased;">
                         <div style="display: none; font-size: 0; line-height: 0;">
                             ‌ ‌ ‌ ‌ ‌ ‌ ‌ ‌ ‌ ‌ ‌ ‌ ‌ ‌ ‌ ‌ ‌ ‌ ‌ ‌ ‌ ‌ ‌ ‌ ‌ ‌ ‌ ‌ ‌ ‌ ‌ ‌ ‌ ‌ ‌ ‌ ‌ ‌ ‌ ‌ ‌ ‌ ‌ ‌ ‌ ‌ ‌ ‌ ‌ ‌ ‌ ‌ ‌ ‌ ‌ ‌ ‌ ‌ ‌ ‌ ‌ ‌ ‌ ‌ ‌ ‌ ‌ ‌ ‌ ‌
                         </div>
                         <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4;">
                             <tr>
                                 <td align="center" style="padding: 10px 0;">
                                     <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff;">
                                         [Your content here]
                                     </table>
                                 </td>
                             </tr>
                         </table>
                         <!--[if mso]>
                         </td>
                         </tr>
                         </table>
                         <![endif]-->
                     </body>
                     </html>`,
                },
                {
                    role: "user",
                    content: `${promptType.user}
          
          Product details:
          Product Name: ${productInfo.title}
          Description: ${productInfo.description}
          Product URL: ${productUrl}
          Image URL: ${productInfo.bestImageUrl}
          
          Important: Generate the email content in ${productInfo.language} language.`
                }
            ],
            response_format: { type: "json_object" },
        });

        try {
            const template = JSON.parse(emailTemplate.choices[0].message.content || '{}');
            return template;
        } catch (error) {
            console.error("Error parsing template:", error);
        }
    });

    const allTemplates = await Promise.all(templates);

    return allTemplates;
} 