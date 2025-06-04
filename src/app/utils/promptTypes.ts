export interface PromptType {
    name: string;
    description: string;
    system: string;
    user: string;
}

export const promptTypes: PromptType[] = [
    {
        name: "Professional",
        description: "Clean, professional email template with clear CTAs and minimal design",
        system: "You are an expert email marketing designer specializing in professional, clean designs.",
        user: `Create an HTML email for this product with a professional, clean design.

Follow these exact specifications:
1. Bold product title (max 50 chars) above the image with professional tone
2. Concise product description highlighting value (max 80 chars)
3. Three bullet points with:
   - Business-appropriate emoji for each point
   - Bold feature name (2-3 words max)
   - Brief description (max 40 chars)
4. Clean CTA button (width: 300px, height: 50px, font-size: 16px) with navy blue background
5. Product image below the description, above bullet points
6. Professional footer with unsubscribe text (8px font):
   "This message was sent to {{email_address}}. If you no longer wish to receive such messages, unsubscribe here {unsubscribe}UNSUBSCRIBE{/unsubscribe} Onet Digital d.o.o., Gmajna 10, Trzin"

Design requirements:
- Remove excess padding
- Increase font size of benefits by 2px and make bold
- Use professional color scheme (blues, grays)
- Responsive design with clean margins

Format response as a JSON object with 'subject' and 'html' properties.`
    },
    {
        name: "Promotional",
        description: "Eye-catching promotional email with emphasis on discounts and limited offers",
        system: "You are an expert email marketing designer specializing in promotional emails that drive immediate action.",
        user: `Create an HTML email with promotional design for this product.

Follow these exact specifications:
1. Attention-grabbing title with urgency trigger (max 50 chars) at top
2. Short description focusing on savings/value (max 80 chars)
3. Three bullet points with:
   - Action-oriented emoji for each point
   - Bold benefit name (2-3 words)
   - Brief impact description (max 40 chars)
4. Large red CTA button (width: 350px, height: 50px, font-size: 18px, ALL CAPS text)
5. Product image positioned prominently below title
6. Standard footer with unsubscribe text (8px font):
   "This message was sent to {{email_address}}. If you no longer wish to receive such messages, unsubscribe here {unsubscribe}UNSUBSCRIBE{/unsubscribe} Onet Digital d.o.o., Gmajna 10, Trzin"

Design requirements:
- Bold pricing information with strikethrough for original price
- Highlight discount percentage in contrasting color
- Minimal padding between elements
- Make benefit text bold and 2px larger than standard text
- Use attention-grabbing colors

Format response as a JSON object with 'subject' and 'html' properties.`
    },
    {
        name: "Minimal",
        description: "Clean, minimal design with focus on product image and simplicity",
        system: "You are an expert email marketing designer specializing in minimal, elegant designs.",
        user: `Create an HTML email with minimal, elegant design for this product.

Follow these exact specifications:
1. Simple, elegant product title (max 40 chars) with ample whitespace
2. Very brief product description (max 60 chars)
3. Three clean bullet points with:
   - Minimal or no emoji
   - Concise feature name (1-2 words)
   - Brief explanation (max 30 chars)
4. Subtle CTA button (width: 250px, height: 40px, font-size: 14px) with light gray or pastel background
5. Large, high-quality product image as focal point
6. Minimal footer with unsubscribe text (8px font):
   "This message was sent to {{email_address}}. If you no longer wish to receive such messages, unsubscribe here {unsubscribe}UNSUBSCRIBE{/unsubscribe} Onet Digital d.o.o., Gmajna 10, Trzin"

Design requirements:
- Maximum whitespace
- Minimal color palette (black, white, one accent color)
- Elegant typography with consistent spacing
- No unnecessary elements or decorations
- Benefits text slightly larger (+2px) and bold

Format response as a JSON object with 'subject' and 'html' properties.`
    },
    {
        name: "Bold & Colorful",
        description: "Vibrant, eye-catching email with bold colors and strong visuals",
        system: "You are an expert email marketing designer specializing in vibrant, attention-grabbing designs.",
        user: `Create an HTML email with bold, colorful design for this product.

Follow these exact specifications:
1. Attention-grabbing title with color highlight (max 50 chars)
2. Energetic product description (max 80 chars)
3. Three bold bullet points with:
   - Colorful emoji for each point
   - Bold, catchy feature name (2-3 words)
   - Impactful description (max 40 chars)
4. Large, vibrant CTA button (width: 400px, height: 60px, font-size: 20px, bold text)
5. Product image with colorful border or background effect
6. Standard footer with unsubscribe text (8px font):
   "This message was sent to {{email_address}}. If you no longer wish to receive such messages, unsubscribe here {unsubscribe}UNSUBSCRIBE{/unsubscribe} Onet Digital d.o.o., Gmajna 10, Trzin"

Design requirements:
- Vibrant color scheme with complementary colors
- Bold typography with size variation
- Reduced padding between elements
- Make benefit text bold and 2px larger
- Use background color blocks to create visual interest

Format response as a JSON object with 'subject' and 'html' properties.`
    },
    {
        name: "Modern & Sleek",
        description: "Contemporary design with clean lines and modern aesthetic",
        system: "You are an expert email marketing designer specializing in modern, sleek designs with contemporary aesthetics.",
        user: `Create an HTML email with modern, sleek design for this product.

Follow these exact specifications:
1. Contemporary product title with modern font (max 50 chars)
2. Concise, benefit-focused description (max 70 chars)
3. Three modern bullet points with:
   - Minimal icon or subtle emoji for each
   - Short feature name (1-2 words)
   - Clear benefit statement (max 40 chars)
4. Sleek CTA button (width: 300px, height: 45px, font-size: 16px) with gradient background
5. Clean product image display with subtle shadow effect
6. Modern footer with unsubscribe text (8px font):
   "This message was sent to {{email_address}}. If you no longer wish to receive such messages, unsubscribe here {unsubscribe}UNSUBSCRIBE{/unsubscribe} Onet Digital d.o.o., Gmajna 10, Trzin"

Design requirements:
- Modern color palette (gradients acceptable)
- Clean spacing with intentional whitespace
- Sans-serif typography throughout
- Benefits text bold and 2px larger
- Minimal but effective design elements

Format response as a JSON object with 'subject' and 'html' properties.`
    }
]; 