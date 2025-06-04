# Templify AI

Templify AI is a powerful tool that transforms product URLs into stunning email templates in seconds. Perfect for advertisers and marketers who want to create beautiful, conversion-focused emails quickly.

## Features

- **URL Scraping**: Simply paste a product URL and let Templify AI extract all relevant information
- **AI-Powered Image Selection**: Automatically identifies the best product image for your email
- **Multiple Template Options**: Generate several professional email templates with different styles and approaches
- **One-Click Copy**: Easily copy the HTML of any template to use in your email marketing platform
- **Responsive Design**: All templates look great on all devices

## Getting Started

### Prerequisites

- Node.js 18+ and npm/yarn
- OpenAI API key

### Installation

1. Clone the repository:

```bash
git clone https://github.com/your-username/templify-ai.git
cd templify-ai
```

2. Install dependencies:

```bash
npm install
```

3. Create a `.env.local` file in the root directory and add your OpenAI API key:

```
OPENAI_API_KEY=your_openai_api_key_here
```

4. Start the development server:

```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000) in your browser.

## How It Works

1. Enter a product URL in the input field
2. The app scrapes the URL for product information and images
3. AI selects the best product image and generates email templates
4. Browse different templates and copy the HTML of your favorite one

## Technologies Used

- Next.js 15
- React 19
- Tailwind CSS 4
- OpenAI API
- Cheerio for web scraping

## License

MIT

## Acknowledgments

- OpenAI for providing the AI capabilities
- Next.js team for the excellent framework
