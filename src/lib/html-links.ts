/**
 * Repairs email HTML whose link attributes were mangled by the backend's
 * translation model into markdown form — href="[https://x](https://x)" — an
 * invalid URL that gets campaigns stopped by SqualoMail. Kept in sync with
 * templaito-backend/src/utils/html-links.ts (shared-DB, duplicated-code
 * pattern, same as the Prisma schemas).
 */

/**
 * Rewrite markdown-wrapped link attributes back to plain URLs:
 * href="[text](url)" → href="url". The markdown target (second half) is the
 * real destination. Handles both quote styles and src/background attributes.
 */
export function repairMarkdownLinkAttributes(html: string): string {
  return html.replace(
    /\b(href|src|background)\s*=\s*(?:"\s*\[[^\]"]*\]\(([^)"]*)\)\s*"|'\s*\[[^\]']*\]\(([^)']*)\)\s*')/gi,
    (_match, attr: string, dqUrl?: string, sqUrl?: string) =>
      `${attr}="${(dqUrl ?? sqUrl ?? "").trim()}"`
  );
}

/** True when the HTML still contains a markdown-wrapped link attribute. */
export function hasMarkdownLinkAttributes(html: string): boolean {
  return /\b(href|src|background)\s*=\s*["']\s*\[/i.test(html);
}

/**
 * Prisma `contains` filters matching HTML with markdown-wrapped link
 * attributes, for finding broken CampaignCountry.preparedHtml rows.
 */
export const BROKEN_LINK_FILTERS = [
  { preparedHtml: { contains: 'href="[' } },
  { preparedHtml: { contains: "href='[" } },
  { preparedHtml: { contains: 'src="[' } },
  { preparedHtml: { contains: "src='[" } },
];
