"use client";

import { ChevronDownIcon, PlusIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import type { SourceFormState } from "./product-catalog-types";

interface ProductSourceFormProps {
  form: SourceFormState;
  onFormChange: (patch: Partial<SourceFormState>) => void;
  showAdvanced: boolean;
  onToggleAdvanced: () => void;
  creating: boolean;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}

export function ProductSourceForm({
  form,
  onFormChange,
  showAdvanced,
  onToggleAdvanced,
  creating,
  onSubmit,
}: ProductSourceFormProps) {
  return (
    <form
      onSubmit={onSubmit}
      className="rounded-xl border border-line bg-surface-muted/50 p-4 sm:p-5"
    >
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-5">
        <Input
          value={form.name}
          onChange={(event) => onFormChange({ name: event.target.value })}
          placeholder="Source name"
          aria-label="Source name"
        />
        <Input
          value={form.url}
          onChange={(event) => onFormChange({ url: event.target.value })}
          placeholder="Product sitemap URL, e.g. https://shop.com/wp-sitemap.xml"
          required
          aria-label="Product sitemap URL"
          className="lg:col-span-2"
        />
        <Input
          value={form.countryCode}
          onChange={(event) =>
            onFormChange({ countryCode: event.target.value.toUpperCase() })
          }
          placeholder="Country, e.g. SI"
          maxLength={8}
          aria-label="Country code"
        />
        <Button
          type="submit"
          isLoading={creating}
          leftIcon={<PlusIcon className="h-4 w-4" />}
        >
          Add source
        </Button>
      </div>

      <div className="mt-3">
        <button
          type="button"
          onClick={onToggleAdvanced}
          className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-muted transition-colors hover:text-ink"
        >
          <ChevronDownIcon
            className={cn(
              "h-4 w-4 transition-transform",
              showAdvanced && "rotate-180"
            )}
          />
          {showAdvanced
            ? "Hide campaign link options"
            : "Campaign link options (optional)"}
        </button>
        <p className="mt-1 text-xs text-muted">
          Paste the shop&apos;s sitemap (or its product sitemap) — products are
          read straight from it, nothing else to configure. The options below
          only customize the campaign tracking links and are optional.
        </p>
      </div>

      {showAdvanced && (
        <div className="mt-4 space-y-3 border-t border-line pt-4">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
            <Input
              value={form.campaignUrlTemplate}
              onChange={(event) =>
                onFormChange({ campaignUrlTemplate: event.target.value })
              }
              placeholder="Campaign URL template, e.g. {url}/?sp=77{priceInt}i997&utm_source=Mailing&utm_campaign={utmCampaign}&utm_medium=squalomail_rok"
              aria-label="Campaign URL template"
              className="lg:col-span-3"
            />
            <Input
              value={form.defaultPrice}
              onChange={(event) =>
                onFormChange({ defaultPrice: event.target.value })
              }
              placeholder="Default price"
              aria-label="Default price"
            />
          </div>
          <p className="text-xs text-muted">
            URL placeholders: {"{url}"}, {"{rawUrl}"}, {"{slug}"}, {"{price}"},{" "}
            {"{priceInt}"}, {"{utmCampaign}"}, {"{countryCode}"}. For Vigoshop HR
            use the same template but `spe` instead of `sp`.
          </p>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <Textarea
              value={form.countryCampaignUrlTemplates}
              onChange={(event) =>
                onFormChange({
                  countryCampaignUrlTemplates: event.target.value,
                })
              }
              rows={3}
              aria-label="Country campaign URL overrides"
              placeholder={
                "Country overrides, one per line:\nHR={url}/?spe=77{priceInt}i997...\nSI={url}/?sp=77{priceInt}i997..."
              }
            />
            <Textarea
              value={form.domainCampaignUrlTemplates}
              onChange={(event) =>
                onFormChange({ domainCampaignUrlTemplates: event.target.value })
              }
              rows={3}
              aria-label="Website campaign URL overrides"
              placeholder={
                "Website overrides, one per line:\nvigoshop.hr={url}/?spe=77{priceInt}i997...\nvigoshop.si={url}/?sp=77{priceInt}i997..."
              }
            />
          </div>
        </div>
      )}
    </form>
  );
}
