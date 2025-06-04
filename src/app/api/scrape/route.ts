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
    price: string;
    images: string[];
    bestImageUrl: string;
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

        // Use OpenAI to extract product information
        const extractionResponse = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                {
                    role: "system",
                    content: "You are an expert in extracting product information from URLs. Extract the title, description, price from the provided URL."
                },
                {
                    role: "user",
                    content: `Extract the product information from this URL: ${url}
          
          Please return a JSON object with the following structure:
          {
            "title": "Product title",
            "description": "Product description",
            "price": "Product price"
          }`
                }
            ],
            response_format: { type: "json_object" },
        });

        const productInfo = JSON.parse(extractionResponse.choices[0].message.content || '{}');

        // Add images from Cheerio to the product info
        productInfo.images = images;

        // Use OpenAI to identify the best product image
        let bestImageUrl = '';
        if (images.length > 0) {
            const response = await openai.chat.completions.create({
                model: "gpt-4o",
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
    // Use imported prompt types instead of hardcoded ones
    const templates = [];

    for (const promptType of promptTypes) {
        const emailTemplate = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                {
                    role: "system",
                    content: promptType.system
                },
                {
                    role: "user",
                    content: `${promptType.user}
          
          Product details:
          Product Name: ${productInfo.title}
          Description: ${productInfo.description}
          Price: ${productInfo.price}
          Product URL: ${productUrl}
          Image URL: ${productInfo.bestImageUrl}`
                }
            ],
            response_format: { type: "json_object" },
        });

        try {
            const template = JSON.parse(emailTemplate.choices[0].message.content || '{}');
            templates.push(template);
        } catch (error) {
            console.error("Error parsing template:", error);
        }
    }

    return templates;
} 