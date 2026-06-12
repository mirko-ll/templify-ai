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

// Push scheduled newsletters to SqualoMail ~2h before sendDate (runs every hour at :00).
// Production server only: skipped in development (local testing must never push
// real campaigns) and during `next build` (which also loads this config).
if (
  process.env.NODE_ENV === 'production' &&
  process.env.TEMPLAITO_BACKEND_URL &&
  process.env.TEMPLAITO_SERVICE_TOKEN
) {
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

  // Nightly product catalog sync for every client at 03:00 (server time).
  // Incremental: only pages whose sitemap lastmod changed are re-scraped; it
  // also refreshes categories and archives/restores dead/revived product pages.
  // Full re-verification happens on the sync's rolling 7-day window, so no
  // separate force run is needed.
  cron.schedule('0 3 * * *', async () => {
    try {
      const response = await fetch(
        `${process.env.TEMPLAITO_BACKEND_URL}/product-sources/sync-all-clients`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.TEMPLAITO_SERVICE_TOKEN}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        console.error(`[CRON] Nightly product sync failed with status ${response.status}`);
      } else {
        const data = await response.json();
        console.log(
          `[CRON] Nightly product sync started: ${data.message} (${data.clientCount} clients)`
        );
      }
    } catch (error) {
      console.error('[CRON] Failed to start nightly product sync:', error);
    }
  });
}

export default config;
