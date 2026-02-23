import { NextConfig } from 'next';
import cron from 'node-cron';

const config: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true, // This will ignore ESLint errors during build
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.googleusercontent.com',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
    ],
  },
};

// Push scheduled newsletters to SqualoMail ~2h before sendDate (runs every hour at :00)
if (process.env.TEMPLAITO_BACKEND_URL && process.env.TEMPLAITO_SERVICE_TOKEN) {
  cron.schedule('0 * * * *', async () => {
    try {
      const response = await fetch(
        `${process.env.TEMPLAITO_BACKEND_URL}/integrations/squalomail/push-scheduled`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.TEMPLAITO_SERVICE_TOKEN}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        console.error(`[CRON] Push scheduled newsletters failed with status ${response.status}`);
      } else {
        const data = await response.json();
        console.log('[CRON] Push scheduled newsletters result:', data.message);
      }
    } catch (error) {
      console.error('[CRON] Failed to push scheduled newsletters:', error);
    }
  });
}

export default config;
