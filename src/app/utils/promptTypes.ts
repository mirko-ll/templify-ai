import { TemplateType } from "../types/types";

export const promptTypes: TemplateType[] = [
   {
      name: "Professional",
    description:
      "Clean, professional email template with clear CTAs and minimal design",
    system:
      "You are a strategic email marketing expert specializing in professional, trust-building campaigns that position brands as industry authorities and drive business growth through credible, value-driven messaging.",
      user: `Create me an HTML email with professional colors and minimal emojis related to this product: {{product_name}}
1. Longer bold product title with professional authority trigger (50 characters max)
2. Short description of the product with key business benefits and trust triggers (maximum 100 characters)
3. Pricing section with regular price {{regular_price}}, sale price {{sale_price}}, and discount {{discount}} (if available)
4. Three bullet points with the main professional features with a business-appropriate emoji representing the feature + a short description (2 words for each feature separately, 40 characters for the description focusing on competitive advantage)
5. Large rounded CTA button with bold text and upper case with {{product_link}} (button size must be 500px; 30px with text size 20px, use navy blue or professional colors related to the product)
6. Image banner using {{image_url}} that links to the {{product_link}}

- Image must be under the CTA button!
`,
   },
   {
      name: "Promotional",
    description:
      "Eye-catching promotional email with emphasis on value and limited offers",
    system:
      "You are a strategic email marketing expert specializing in high-converting promotional campaigns that create urgency and drive immediate action through persuasive copywriting and psychological triggers.",
      user: `Create me an HTML email with vibrant promotional colors and action-driving emojis related to this product: {{product_name}}
1. Longer bold product title with urgency and value trigger (50 characters max)
2. Short description of the product with key transformation benefits and scarcity triggers (maximum 100 characters)
3. Prominent pricing section with regular price {{regular_price}}, sale price {{sale_price}}, and discount {{discount}} - make it eye-catching with savings highlighted
4. Three bullet points with the main compelling features with an action-oriented emoji representing the feature + a short description (2 words for each feature separately, 40 characters for the description focusing on outcomes and results)  
5. Large rounded CTA button with bold text and upper case with {{product_link}} (button size must be 500px; 30px with text size 20px, use bright, high-contrast colors related to the product)
6. Image banner using {{image_url}} that links to the {{product_link}}
`,
   },
   {
      name: "Landing Page",
    description:
      "High-converting landing page style with urgency triggers and structured persuasion elements",
    system:
      "You are a professional HTML/CSS developer and email specialist. Create fully mobile-responsive email templates with modern aesthetics and high-converting elements that work across all email clients including Squalomail, Gmail, Outlook, and Apple Mail.",
    user: `Create a fully mobile-responsive landing page in a single HTML file for this product: {{product_name}}

**Design Requirements:**
- Use clean, modern aesthetic (Poppins font, soft off-white background)
- High-contrast palette that matches the product's branding
- All content must be center-aligned
- Bold best benefit feature words in description

**Structure Requirements:**

:one: **Top Header with Urgency:**
- Background matching the product color palette
- Product price (regular: {{regular_price}}, sale: {{sale_price}})
- Discount information: {{discount}}
- Limited time offer trigger
- Use table-based layout for email compatibility

:two: **Main Content:**
- Selling title of the product + call to action text
- Product cover image using {{image_url}}
- Real regular and sale prices with prominent display
- Primary CTA button

:three: **Benefits Section:**
- Shipping and benefits badges (like on website)
- Bullet point ultra selling description (max 100 characters each)
- Based on product features and benefits

:four: **Footer:**
- Secondary CTA button before footer
- Professional footer with essential information


**Technical Requirements:**
- Single HTML file with inline CSS
- Mobile-responsive design using media queries
- Table-based layout for maximum email client compatibility
- All images properly optimized with alt text
- CTA buttons link to {{product_link}}
- Use web-safe fonts (Arial, Helvetica, sans-serif)
- Max-width 600px for main content

**Pricing Information:**
- Regular Price: {{regular_price}}
- Sale Price: {{sale_price}}
- Discount: {{discount}}
`,
   },
   {
      name: "Minimal",
    description:
      "Clean, minimal design with focus on product image and simplicity",
    system:
      "You are a strategic email marketing expert specializing in minimalist, premium designs that communicate product quality and brand sophistication through elegant simplicity and strategic whitespace.",
      user: `Create me an HTML email with clean minimal colors and subtle emojis related to this product: {{product_name}}
1. Longer bold product title with sophisticated quality trigger (50 characters max)
2. Short description of the product with key premium features and elegance triggers (maximum 100 characters)
3. Clean pricing display with regular price {{regular_price}}, sale price {{sale_price}}, and discount {{discount}} (minimal, elegant styling)
4. Three bullet points with the main refined features with a subtle emoji representing the feature + a short description (2 words for each feature separately, 40 characters for the description focusing on quality and simplicity)
5. Large rounded CTA button with bold text and upper case with {{product_link}} (button size must be 500px; 30px with text size 20px, use muted, sophisticated colors related to the product)
6. Image banner using {{image_url}} that links to the {{product_link}}
`,
   },
   {
      name: "Elegant & Sophisticated",
    description:
      "Refined, premium design with sophisticated aesthetic for high-end products",
    system:
      "You are a strategic email marketing expert specializing in luxury brand communications that convey exclusivity, heritage, and premium positioning through sophisticated design and carefully crafted messaging.",
      user: `Create me an HTML email with luxury colors and premium emojis related to this product: {{product_name}}
1. Longer bold product title with exclusivity and heritage trigger (50 characters max)
2. Short description of the product with key luxury features and prestige triggers (maximum 100 characters)
3. Premium pricing presentation with regular price {{regular_price}}, sale price {{sale_price}}, and discount {{discount}} (luxury styling with gold accents)
4. Three bullet points with the main sophisticated features with an elegant emoji representing the feature + a short description (2 words for each feature separately, 40 characters for the description focusing on craftsmanship and exclusivity)
5. Large rounded CTA button with bold text and upper case with {{product_link}} (button size must be 500px; 30px with text size 20px, use gold, black, or luxury colors related to the product)
6. Image banner using {{image_url}} that links to the {{product_link}}

- Image must be under the CTA button!
`,
   },
   {
      name: "Modern & Sleek",
      description: "Contemporary design with clean lines and modern aesthetic",
    system:
      "You are a strategic email marketing expert specializing in cutting-edge, tech-forward designs that appeal to innovation-focused audiences and position brands as industry leaders in the digital age.",
      user: `Create me an HTML email with modern tech colors and innovative emojis related to this product: {{product_name}}
1. Longer bold product title with innovation and future-forward trigger (50 characters max)
2. Short description of the product with key cutting-edge features and progress triggers (maximum 100 characters)
3. Modern pricing display with regular price {{regular_price}}, sale price {{sale_price}}, and discount {{discount}} (sleek, tech-style presentation)
4. Three bullet points with the main advanced features with a tech-forward emoji representing the feature + a short description (2 words for each feature separately, 40 characters for the description focusing on innovation and early adoption benefits)
5. Large rounded CTA button with bold text and upper case with {{product_link}} (button size must be 500px; 30px with text size 20px, use modern gradients or tech colors related to the product)
6. Image banner using {{image_url}} that links to the {{product_link}}

`,
   },
   {
      name: "Text-Only",
    description:
      "Clean, text-focused design without images for faster loading and better accessibility",
    system:
      "You are a strategic email marketing expert specializing in warm, friendly, and persuasive text-only campaigns that create personal connections and drive engagement through compelling copywriting and seasonal awareness.",
      user: `Write a marketing email that is warm, friendly, and persuasive, aimed at promoting a {{product_name}}. Based on the product's characteristics, you must infer which season it is best suited for, but do not mention the season explicitly. Follow these numbered instructions and respect the character limits for each section:

1. Introduction (max. 200 characters): Encourage the reader to get ready for the time of year that’s coming. Keep the tone upbeat and seasonal, and include emojis that reflect the appropriate atmosphere.

2. Product Description (max. 250 characters): Describe the product as stylish, functional, and practical. Highlight its key benefits based on the conditions you associate with the season you've inferred.

3. Pricing Information (max. 100 characters): Include pricing details if available - regular price {{regular_price}}, sale price {{sale_price}}, discount {{discount}}

4. Call to Action (CTA) (max. 150 characters)

Use this line: “🛍️ Get yours now!” or something similar
The CTA must be plain text with an embedded link — no buttons or graphic elements
Text must be in bigger size than all other text
Make sure the {{product_link}} is integrated naturally into the sentence

4. Closing (max. 100 characters): End with a warm line like “Take care!” and use emojis that match the inferred season.

5. Do not include images in the email.
`,
  },
  {
    name: "Blog",
    description:
      "Story blog template for info pages, services, and educational content",
    system:
      "You are a professional content creator specialized for email marketing. Create engaging newsletter templates for blog posts and informational content with clear structure, compelling headlines, and optimized readability.",
    user: `Create an HTML email newsletter for this blog post or page: {{product_name}}

**Structure Requirements:**

**Top Header:**
- Background matching the product/website colors
- Post title with high contrast text colors
- Professional, clean design

**Body Content:**
1. **Main Title:** Start with the main benefit of the product/service, make it bold and highlighted
2. **Featured Image:** Insert main image from website, center-aligned and clickable (links to {{product_link}})
3. **Body Text:** Optimize content to maximum 300 words
4. **Additional Image:** If multiple images exist on website, add one more image in the middle of text
5. **Benefits Highlighting:** Bold all benefit words for better visibility
6. **Conclusion:** Personal conclusion at the end of text
7. **CTA Button:** Clear call-to-action button

**Design Requirements:**
- Professional newsletter layout
- Mobile-responsive design
- High contrast for readability
- Clean typography
- Proper image optimization

**Content Guidelines:**
- Focus on educational and informational value
- Highlight key benefits and features
- Make content engaging and personal
- Include clear call-to-action
- Optimize for email client compatibility

**Technical:**
- Single HTML file with inline CSS
- Table-based layout for email compatibility
- Web-safe fonts (Arial, Helvetica, sans-serif)
- Max-width 600px for main content
- All images properly optimized with alt text
- CTA button links to {{product_link}}

**Product Details:**
- Title: {{product_name}}
- Description: {{product_description}}
- Image: {{image_url}}
- Link: {{product_link}}
`,
  },
  {
    name: "Multi-Product Landing",
    description:
      "E-commerce category page with multiple products, and conversion optimization",
    system:
      "You are a professional HTML/CSS developer and email specialist. Create fully mobile-responsive multi-product email templates with modern aesthetics and high-converting elements that work across all email clients including Squalomail, Gmail, Outlook, and Apple Mail.",
    user: `Create a fully mobile-responsive multi-product landing page in a single HTML file for these products: {{product_names}}

**Design Requirements:**
- Clean, modern aesthetic (Poppins font, soft off-white background)
- High-contrast palette matching product branding
- All content center-aligned
- Bold key benefit words in descriptions

**Structure:**
1. **Header:** Product color palette background with urgency messaging
2. **Products Section:** Each product with cover image, selling title, call-to-action text
3. **Pricing:** Real regular/sale prices with CTA buttons
4. **Benefits:** Shipping and benefit badges under each CTA button

**Technical:**
- Single HTML file with inline CSS (no JavaScript)
- Mobile-responsive design using media queries
- Table-based layout for maximum email client compatibility
- Product links: {{product_links}}
- Images: {{product_images}}
- Prices: {{product_prices}}
- Use web-safe fonts (Arial, Helvetica, sans-serif)
- Max-width 600px for main content
`,
  },
];
