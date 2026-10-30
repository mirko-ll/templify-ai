import axios from "axios";
import type { ProductReview } from "@/app/types/types";

/**
 * Templates opt in to shop reviews / a second photo by using these
 * placeholders. Other templates never receive the data, so prompts that
 * already mention reviews keep behaving as before.
 */
export const SHOP_REVIEW_PLACEHOLDERS = ["{{shop_rating}}", "{{shop_reviews}}"];
export const SECOND_IMAGE_PLACEHOLDER = "{{second_image_url}}";

export function templateWantsReviews(templateText: string | undefined): boolean {
  return SHOP_REVIEW_PLACEHOLDERS.some((token) => templateText?.includes(token));
}

export function templateWantsSecondImage(templateText: string | undefined): boolean {
  return Boolean(templateText?.includes(SECOND_IMAGE_PLACEHOLDER));
}

/**
 * Vigoshop/Superzebra product pages load their rating and reviews client-side
 * from a per-product, per-country JSON whose URL sits in an inline script
 * (`"testimonialsJSON":"https:\/\/images.hs-plus.com\/assets\/reviews-v2\/…_HR.json"`).
 * Returns the average rating, total count and a few short 5-star reviews, or
 * {} when the page has no feed or it can't be read.
 */
export async function fetchShopReviews(
  pageHtml: string
): Promise<{ rating?: string; reviewCount?: string; reviews?: ProductReview[] }> {
  const match = pageHtml.match(/"testimonialsJSON":"(https?:[^"]+\.json)"/);
  if (!match) return {};
  try {
    const { data } = await axios.get(match[1].replace(/\\\//g, "/"), { timeout: 8000 });
    const average = Number(data?.averageRating);
    const count = Number(data?.allReviewsCount);
    if (!Number.isFinite(average) || average <= 0 || !Number.isFinite(count) || count <= 0) {
      return {};
    }
    const seen = new Set<string>();
    const reviews: ProductReview[] = [];
    for (const raw of Array.isArray(data.reviews) ? data.reviews : []) {
      const text = typeof raw?.text === "string" ? raw.text.replace(/\s+/g, " ").trim() : "";
      const name = typeof raw?.name === "string" ? raw.name.trim() : "";
      const key = text.slice(0, 30).toLowerCase();
      if (raw?.rating !== 5 || !name || text.length < 40 || text.length > 170 || seen.has(key)) {
        continue;
      }
      seen.add(key);
      reviews.push({ name, text, rating: 5 });
      if (reviews.length === 3) break;
    }
    return { rating: String(average), reviewCount: String(Math.round(count)), reviews };
  } catch {
    return {};
  }
}
