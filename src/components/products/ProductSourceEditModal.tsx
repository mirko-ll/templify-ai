"use client";

import { useEffect, useState } from "react";
import { ChevronDownIcon } from "@heroicons/react/24/outline";
import { Modal } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import {
  arrayToLines,
  linesToArray,
  parseTemplateOverrides,
  recordToLines,
  type ProductSource,
} from "./product-catalog-types";

export interface SourceUpdatePayload {
  // Sent as strings (empty = clear) so the PATCH route persists clears too.
  name: string;
  url: string;
  countryCode: string;
  crawlDepth: number;
  config: Record<string, unknown>;
}

interface ProductSourceEditModalProps {
  open: boolean;
  source: ProductSource | null;
  saving: boolean;
  onClose: () => void;
  onSave: (sourceId: string, payload: SourceUpdatePayload) => void;
}

interface EditState {
  name: string;
  url: string;
  countryCode: string;
  crawlDepth: string;
  campaignUrlTemplate: string;
  defaultPrice: string;
  countryTemplates: string;
  domainTemplates: string;
  renderMode: "static" | "browser";
  useSitemap: boolean;
  maxPages: string;
  maxCrawlPages: string;
  maxSitemapPages: string;
  sitemapUrls: string;
  productUrlPatterns: string;
  crawlUrlPatterns: string;
  excludeUrlPatterns: string;
  scrollRounds: string;
  scrollDelayMs: string;
  loadMoreSelector: string;
  loadMoreClickLimit: string;
  loadMoreDelayMs: string;
}

function seedState(source: ProductSource): EditState {
  const config = source.config ?? null;
  return {
    name: source.name ?? "",
    url: source.url,
    countryCode: source.countryCode ?? "",
    crawlDepth: String(source.crawlDepth ?? 1),
    campaignUrlTemplate: config?.campaignUrlTemplate ?? "",
    defaultPrice: config?.defaultPrice ?? "",
    countryTemplates: recordToLines(config?.countryCampaignUrlTemplates),
    domainTemplates: recordToLines(config?.domainCampaignUrlTemplates),
    renderMode: config?.renderMode === "browser" ? "browser" : "static",
    useSitemap: config?.useSitemap ?? true,
    maxPages: String(config?.maxPages ?? 10000),
    maxCrawlPages: String(config?.maxCrawlPages ?? 60),
    maxSitemapPages: String(config?.maxSitemapPages ?? 30),
    sitemapUrls: arrayToLines(config?.sitemapUrls),
    productUrlPatterns: arrayToLines(config?.productUrlPatterns),
    crawlUrlPatterns: arrayToLines(config?.crawlUrlPatterns),
    excludeUrlPatterns: arrayToLines(config?.excludeUrlPatterns),
    scrollRounds: String(config?.scrollRounds ?? 3),
    scrollDelayMs: String(config?.scrollDelayMs ?? 1200),
    loadMoreSelector: config?.loadMoreSelector ?? "",
    loadMoreClickLimit: String(config?.loadMoreClickLimit ?? 10),
    loadMoreDelayMs: String(config?.loadMoreDelayMs ?? 1500),
  };
}

function numOr(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Collapsible section wrapper used for the optional config groups. */
function Section({
  title,
  hint,
  open,
  onToggle,
  children,
}: {
  title: string;
  hint?: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-line">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-2 rounded-xl px-4 py-3 text-left transition-colors hover:bg-surface-muted"
      >
        <span className="text-sm font-semibold text-ink">{title}</span>
        <ChevronDownIcon
          className={cn("h-4 w-4 text-muted transition-transform", open && "rotate-180")}
        />
      </button>
      {open && (
        <div className="space-y-3 border-t border-line p-4">
          {hint && <p className="text-xs text-muted">{hint}</p>}
          {children}
        </div>
      )}
    </div>
  );
}

/**
 * View + edit every stored detail of a product source: URL, country, crawl
 * depth, campaign link templates and the crawling parameters. Pre-filled from
 * the source and saved through the PATCH endpoint.
 */
export function ProductSourceEditModal({
  open,
  source,
  saving,
  onClose,
  onSave,
}: ProductSourceEditModalProps) {
  const [form, setForm] = useState<EditState | null>(null);
  const [showLinks, setShowLinks] = useState(false);
  const [showCrawling, setShowCrawling] = useState(false);
  const [error, setError] = useState("");

  // Re-seed whenever the modal opens for a (different) source.
  useEffect(() => {
    if (!open || !source) return;
    const seeded = seedState(source);
    setForm(seeded);
    const config = source.config;
    setShowLinks(
      Boolean(
        config?.campaignUrlTemplate ||
          config?.defaultPrice ||
          (config?.countryCampaignUrlTemplates &&
            Object.keys(config.countryCampaignUrlTemplates).length) ||
          (config?.domainCampaignUrlTemplates &&
            Object.keys(config.domainCampaignUrlTemplates).length)
      )
    );
    setShowCrawling(false);
    setError("");
  }, [open, source]);

  const patch = (partial: Partial<EditState>) =>
    setForm((prev) => (prev ? { ...prev, ...partial } : prev));

  const handleSave = () => {
    if (!form || !source) return;
    const trimmedUrl = form.url.trim();
    try {
      const parsed = new URL(trimmedUrl);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error("bad protocol");
      }
    } catch {
      setError("Enter a valid source URL (http/https).");
      return;
    }

    const config = {
      campaignUrlTemplate: form.campaignUrlTemplate.trim(),
      defaultPrice: form.defaultPrice.trim(),
      countryCampaignUrlTemplates: parseTemplateOverrides(form.countryTemplates, (key) =>
        key.toUpperCase()
      ),
      domainCampaignUrlTemplates: parseTemplateOverrides(form.domainTemplates, (key) =>
        key.toLowerCase().replace(/^www\./, "")
      ),
      renderMode: form.renderMode,
      useSitemap: form.useSitemap,
      maxPages: numOr(form.maxPages, 10000),
      maxCrawlPages: numOr(form.maxCrawlPages, 60),
      maxSitemapPages: numOr(form.maxSitemapPages, 30),
      sitemapUrls: linesToArray(form.sitemapUrls),
      productUrlPatterns: linesToArray(form.productUrlPatterns),
      crawlUrlPatterns: linesToArray(form.crawlUrlPatterns),
      excludeUrlPatterns: linesToArray(form.excludeUrlPatterns),
      scrollRounds: numOr(form.scrollRounds, 3),
      scrollDelayMs: numOr(form.scrollDelayMs, 1200),
      loadMoreSelector: form.loadMoreSelector.trim(),
      loadMoreClickLimit: numOr(form.loadMoreClickLimit, 10),
      loadMoreDelayMs: numOr(form.loadMoreDelayMs, 1500),
    };

    onSave(source.id, {
      name: form.name.trim(),
      url: trimmedUrl,
      countryCode: form.countryCode.trim().toUpperCase(),
      crawlDepth: Math.max(1, Math.min(numOr(form.crawlDepth, 1), 3)),
      config,
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit product source"
      description="Update where products are read from and how campaign links are built."
      size="lg"
    >
      {form && (
        <div className="space-y-5">
          {/* Details */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Name" htmlFor="src-name">
              <Input
                id="src-name"
                value={form.name}
                onChange={(event) => patch({ name: event.target.value })}
                placeholder="Source name"
              />
            </Field>
            <Field label="Country code" htmlFor="src-country" hint="e.g. SI, HR">
              <Input
                id="src-country"
                value={form.countryCode}
                maxLength={8}
                onChange={(event) =>
                  patch({ countryCode: event.target.value.toUpperCase() })
                }
                placeholder="SI"
              />
            </Field>
          </div>

          <Field label="Source URL" htmlFor="src-url" required>
            <Input
              id="src-url"
              value={form.url}
              onChange={(event) => patch({ url: event.target.value })}
              placeholder="https://shop.com/wp-sitemap.xml"
            />
          </Field>

          <Field
            label="Crawl depth"
            htmlFor="src-depth"
            hint="How many link levels to follow when there's no sitemap (1–3)"
            className="max-w-[12rem]"
          >
            <Input
              id="src-depth"
              type="number"
              min={1}
              max={3}
              value={form.crawlDepth}
              onChange={(event) => patch({ crawlDepth: event.target.value })}
            />
          </Field>

          {/* Campaign links */}
          <Section
            title="Campaign links"
            hint="How tracking URLs are built. Placeholders: {url}, {rawUrl}, {slug}, {price}, {priceInt}, {utmCampaign}, {countryCode}."
            open={showLinks}
            onToggle={() => setShowLinks((value) => !value)}
          >
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
              <Field label="Campaign URL template" className="lg:col-span-3">
                <Input
                  value={form.campaignUrlTemplate}
                  onChange={(event) => patch({ campaignUrlTemplate: event.target.value })}
                  placeholder="{url}/?sp=77{priceInt}i997&utm_campaign={utmCampaign}"
                />
              </Field>
              <Field label="Default price">
                <Input
                  value={form.defaultPrice}
                  onChange={(event) => patch({ defaultPrice: event.target.value })}
                  placeholder="e.g. 39"
                />
              </Field>
            </div>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <Field label="Per-country overrides" hint="One per line: HR={url}/?spe=...">
                <Textarea
                  rows={3}
                  value={form.countryTemplates}
                  onChange={(event) => patch({ countryTemplates: event.target.value })}
                  placeholder={"HR={url}/?spe=77{priceInt}i997\nSI={url}/?sp=77{priceInt}i997"}
                />
              </Field>
              <Field label="Per-website overrides" hint="One per line: vigoshop.hr={url}/?spe=...">
                <Textarea
                  rows={3}
                  value={form.domainTemplates}
                  onChange={(event) => patch({ domainTemplates: event.target.value })}
                  placeholder={"vigoshop.hr={url}/?spe=...\nvigoshop.si={url}/?sp=..."}
                />
              </Field>
            </div>
          </Section>

          {/* Crawling */}
          <Section
            title="Crawling & discovery"
            hint="How products are found. Defaults work for most shops with a sitemap."
            open={showCrawling}
            onToggle={() => setShowCrawling((value) => !value)}
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Render mode" hint="Use the browser only for JS-rendered shops">
                <Select
                  value={form.renderMode}
                  onChange={(event) =>
                    patch({ renderMode: event.target.value as "static" | "browser" })
                  }
                >
                  <option value="static">Static (fast)</option>
                  <option value="browser">Browser (JS rendered)</option>
                </Select>
              </Field>
              <label className="flex cursor-pointer items-center gap-2 pt-7 text-sm text-body">
                <input
                  type="checkbox"
                  checked={form.useSitemap}
                  onChange={(event) => patch({ useSitemap: event.target.checked })}
                  className="h-4 w-4 cursor-pointer rounded border-line-strong accent-brand-600"
                />
                Use sitemap when available
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Field label="Max products">
                <Input
                  type="number"
                  value={form.maxPages}
                  onChange={(event) => patch({ maxPages: event.target.value })}
                />
              </Field>
              <Field label="Max crawl pages">
                <Input
                  type="number"
                  value={form.maxCrawlPages}
                  onChange={(event) => patch({ maxCrawlPages: event.target.value })}
                />
              </Field>
              <Field label="Max sitemap pages">
                <Input
                  type="number"
                  value={form.maxSitemapPages}
                  onChange={(event) => patch({ maxSitemapPages: event.target.value })}
                />
              </Field>
            </div>

            <Field label="Sitemap URLs" hint="Optional, one per line — overrides auto-discovery">
              <Textarea
                rows={2}
                value={form.sitemapUrls}
                onChange={(event) => patch({ sitemapUrls: event.target.value })}
                placeholder={"https://shop.com/product-sitemap.xml"}
              />
            </Field>

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
              <Field label="Product URL patterns" hint="One per line">
                <Textarea
                  rows={2}
                  value={form.productUrlPatterns}
                  onChange={(event) => patch({ productUrlPatterns: event.target.value })}
                  placeholder="/product/"
                />
              </Field>
              <Field label="Crawl URL patterns" hint="One per line">
                <Textarea
                  rows={2}
                  value={form.crawlUrlPatterns}
                  onChange={(event) => patch({ crawlUrlPatterns: event.target.value })}
                  placeholder="/shop/"
                />
              </Field>
              <Field label="Exclude URL patterns" hint="One per line">
                <Textarea
                  rows={2}
                  value={form.excludeUrlPatterns}
                  onChange={(event) => patch({ excludeUrlPatterns: event.target.value })}
                  placeholder="/blog/"
                />
              </Field>
            </div>

            {form.renderMode === "browser" && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Field label="Scroll rounds">
                  <Input
                    type="number"
                    value={form.scrollRounds}
                    onChange={(event) => patch({ scrollRounds: event.target.value })}
                  />
                </Field>
                <Field label="Scroll delay (ms)">
                  <Input
                    type="number"
                    value={form.scrollDelayMs}
                    onChange={(event) => patch({ scrollDelayMs: event.target.value })}
                  />
                </Field>
                <Field label='"Load more" selector'>
                  <Input
                    value={form.loadMoreSelector}
                    onChange={(event) => patch({ loadMoreSelector: event.target.value })}
                    placeholder=".load-more"
                  />
                </Field>
                <Field label="Load more clicks">
                  <Input
                    type="number"
                    value={form.loadMoreClickLimit}
                    onChange={(event) => patch({ loadMoreClickLimit: event.target.value })}
                  />
                </Field>
                <Field label="Load more delay (ms)">
                  <Input
                    type="number"
                    value={form.loadMoreDelayMs}
                    onChange={(event) => patch({ loadMoreDelayMs: event.target.value })}
                  />
                </Field>
              </div>
            )}
          </Section>

          {error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2.5 pt-1">
            <Button variant="secondary" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} isLoading={saving}>
              Save changes
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
