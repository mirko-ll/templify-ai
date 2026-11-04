export type Bucket = "BEST_SELLER" | "NEW_PRODUCT" | "FB_WINNER" | "SEASONAL" | "DISCOVERY";

export const BUCKETS: Bucket[] = ["BEST_SELLER", "NEW_PRODUCT", "FB_WINNER", "SEASONAL", "DISCOVERY"];

/** One colour per bucket, shared by the planner panel, calendar chips and settings grid. */
export const BUCKET_META: Record<Bucket, { label: string; chip: string; dot: string; cell: string }> = {
  BEST_SELLER: { label: "Best seller", chip: "bg-amber-50 text-amber-800 border-amber-200", dot: "bg-amber-500", cell: "bg-amber-100 text-amber-900" },
  NEW_PRODUCT: { label: "New", chip: "bg-sky-50 text-sky-800 border-sky-200", dot: "bg-sky-500", cell: "bg-sky-100 text-sky-900" },
  FB_WINNER: { label: "FB winner", chip: "bg-indigo-50 text-indigo-800 border-indigo-200", dot: "bg-indigo-500", cell: "bg-indigo-100 text-indigo-900" },
  SEASONAL: { label: "Seasonal", chip: "bg-rose-50 text-rose-800 border-rose-200", dot: "bg-rose-500", cell: "bg-rose-100 text-rose-900" },
  DISCOVERY: { label: "Discovery", chip: "bg-teal-50 text-teal-800 border-teal-200", dot: "bg-teal-500", cell: "bg-teal-100 text-teal-900" },
};

/** What each bucket is, for the boss: a short line and the full explanation (tooltips). */
export const BUCKET_HELP: Record<Bucket, { short: string; help: string }> = {
  BEST_SELLER: {
    short: "Top email profit",
    help: "Products that earned the most email profit in your last 3 monthly sales reports (the latest month counts most). Resent on purpose — at most 2× a month and never within 10 days.",
  },
  NEW_PRODUCT: {
    short: "New in shop & at competitors",
    help: "Products new in your shop (last 21 days), products a competitor just launched that you also sell, and relaunches (your first ad in the last 30 days). Each gets up to 2 test emails; the ones that sell well move to best sellers.",
  },
  FB_WINNER: {
    short: "Strongest live FB ads",
    help: "Products with the strongest Facebook ads right now — yours and your competitors' (active ads, reach in the last 7 days) — that you sell and have in stock.",
  },
  SEASONAL: {
    short: "In-season products",
    help: "Products in the categories of a running season (e.g. Christmas, 1 Nov – 23 Dec). Never sent outside their season; while it runs they also rank higher in the other buckets.",
  },
  DISCOVERY: {
    short: "Never emailed, new set weekly",
    help: "Good products from your catalog that were never emailed — widely in stock, from categories the emails have skipped lately. A different set comes up every week.",
  },
};
