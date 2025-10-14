"use client";

import {
  useState,
  useRef,
  useEffect,
  useMemo,
  FormEvent,
  useCallback,
} from "react";
import type { SyntheticEvent } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  DocumentDuplicateIcon,
  CheckIcon,
  SparklesIcon,
  EyeIcon,
  LinkIcon,
  PaintBrushIcon,
  BeakerIcon,
  ArrowTopRightOnSquareIcon,
} from "@heroicons/react/24/outline";
import ExternalImage from "@/components/ui/external-image";
import { templateUIConfig } from "@/lib/template-config";
import { InlineLoadingSpinner } from "@/components/ui/loading-spinner";
import type {
  Template,
  ProductInfo,
  MultiProductInfo,
  TemplateStep,
} from "@/types/template";

interface ClientCountryConfigSummary {
  id: string;
  countryCode: string;
  isActive: boolean;
  mailingListId?: string | null;
  mailingListName?: string | null;
  country?: {
    code: string;
    name: string;
    isActive: boolean;
  } | null;
}

interface CountryScrapeResultSingle {
  type: "SINGLE";
  urls: string[];
  productInfo: ProductInfo;
}

interface CountryScrapeResultMulti {
  type: "MULTI";
  urls: string[];
  multiProductInfo: MultiProductInfo;
}

type CountryScrapeResult = CountryScrapeResultSingle | CountryScrapeResultMulti;

interface DatabasePrompt {
  id: string;
  name: string;
  description: string | null;
  color: string;
  systemPrompt: string;
  userPrompt: string;
  designEngine: "CLAUDE" | "GPT4O";
  templateType: "SINGLE_PRODUCT" | "MULTI_PRODUCT";
  isDefault: boolean;
  version: string;
  usageCount: number;
}

interface PublishImageOverrides {
  singleImageIndex?: number;
  multiImageSelections?: Record<number, number>;
}

function buildCountryUrlState(
  configs: ClientCountryConfigSummary[],
  previous?: Record<string, string[]>
): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  configs.forEach((config) => {
    const existing = previous?.[config.countryCode];
    if (existing && existing.length > 0) {
      result[config.countryCode] = [...existing];
    } else {
      result[config.countryCode] = [""];
    }
  });
  return result;
}
export default function TemplaitoApp() {
  const { status } = useSession();
  const router = useRouter();
  useEffect(() => {
    router.prefetch("/campaigns");
  }, [router]);

  const [activeClientId, setActiveClientId] = useState<string | null>(null);
  const [countryConfigs, setCountryConfigs] = useState<
    ClientCountryConfigSummary[]
  >([]);
  const [countryUrls, setCountryUrls] = useState<Record<string, string[]>>({});
  const [contextLoading, setContextLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const trimmedCountryUrls = useMemo(() => {
    const map: Record<string, string[]> = {};
    Object.entries(countryUrls).forEach(([countryCode, entries]) => {
      map[countryCode] = entries
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);
    });
    return map;
  }, [countryUrls]);

  const allValidUrls = useMemo(() => {
    return Object.values(trimmedCountryUrls).flat();
  }, [trimmedCountryUrls]);

  const countryEntries = useMemo(
    () =>
      countryConfigs.map((config) => ({
        code: config.countryCode,
        entries: trimmedCountryUrls[config.countryCode] ?? [],
      })),
    [countryConfigs, trimmedCountryUrls]
  );

  const hasMultiProductCountry = useMemo(
    () => countryEntries.some((entry) => entry.entries.length > 1),
    [countryEntries]
  );

  const primaryCountryUrl = useMemo(() => {
    for (const entry of countryEntries) {
      if (entry.entries.length > 0) {
        return entry.entries[0];
      }
    }
    return "";
  }, [countryEntries]);

  const [template, setTemplate] = useState<Template | null>(null);
  const [originalTemplate, setOriginalTemplate] = useState<Template | null>(
    null
  );
  const [productInfo, setProductInfo] = useState<ProductInfo | null>(null);
  const [baseCountry, setBaseCountry] = useState<string | null>(null);
  const [countryScrapeResults, setCountryScrapeResults] = useState<
    Record<string, CountryScrapeResult>
  >({});
  const [selectedTemplateType, setSelectedTemplateType] = useState<
    number | null
  >(null);
  const [availablePrompts, setAvailablePrompts] = useState<DatabasePrompt[]>(
    []
  );
  const [copied, setCopied] = useState(false);
  const [step, setStep] = useState<TemplateStep>("input");
  const [selectedImageIndex, setSelectedImageIndex] = useState<number>(0);
  const [selectedProductIndex, setSelectedProductIndex] = useState<number>(0);
  const [multiProductImageSelections, setMultiProductImageSelections] =
    useState<{ [key: number]: number }>({});
  const [publishModalOpen, setPublishModalOpen] = useState(false);
  const [publishLoading, setPublishLoading] = useState(false);
  const [publishError, setPublishError] = useState("");
  const [globalToast, setGlobalToast] = useState<string | null>(null);
  const [publishForm, setPublishForm] = useState({
    sendDate: "",
    subject: "",
    preheader: "",
  });
  const previewRef = useRef<HTMLIFrameElement>(null);
  // Fetch available prompts on component mount
  useEffect(() => {
    fetchActivePrompts();
  }, []);

  useEffect(() => {
    if (!globalToast) {
      return;
    }
    const timer = window.setTimeout(() => {
      setGlobalToast(null);
    }, 4000);
    return () => window.clearTimeout(timer);
  }, [globalToast]);

  useEffect(() => {
    loadClientContext();
  }, []);

  const fetchActivePrompts = async () => {
    try {
      const response = await fetch("/api/prompts/active");
      if (response.ok) {
        const data = await response.json();
        setAvailablePrompts(data.prompts);
      }
    } catch (error) {
      console.error("Failed to fetch prompts:", error);
    } finally {
      // Prompts loading complete
    }
  };
  const loadClientContext = async () => {
    setContextLoading(true);
    try {
      const activeResponse = await fetch("/api/clients/active");
      if (!activeResponse.ok) {
        setActiveClientId(null);
        setCountryConfigs([]);
        setCountryUrls({});
        setError(
          "Unable to determine the active client. Please refresh or set one in Clients."
        );
        return;
      }

      const activeData = await activeResponse.json();
      const clientId = activeData?.clientId ?? null;
      setActiveClientId(clientId);

      if (!clientId) {
        setCountryConfigs([]);
        setCountryUrls({});
        setError(
          "Select an active client in the Clients area to start generating campaigns."
        );
        return;
      }

      const countriesResponse = await fetch(
        `/api/clients/${clientId}/countries`
      );
      if (!countriesResponse.ok) {
        setCountryConfigs([]);
        setCountryUrls({});
        setError("Unable to load country configuration for the active client.");
        return;
      }

      const countriesData = await countriesResponse.json();
      const configs: ClientCountryConfigSummary[] = Array.isArray(
        countriesData?.countries
      )
        ? countriesData.countries
        : [];

      const eligible = configs.filter(
        (config) => config.isActive && !!config.mailingListId
      );

      setCountryConfigs(eligible);

      if (eligible.length === 0) {
        setCountryUrls({});
        setError(
          "No active countries with mailing lists found. Connect mailing lists in the client settings first."
        );
        return;
      }

      setCountryUrls((previous) => buildCountryUrlState(eligible, previous));
      setError("");
    } catch (err) {
      console.error(err);
      setActiveClientId(null);
      setCountryConfigs([]);
      setCountryUrls({});
      setError(
        "Unexpected error loading client configuration. Please try again."
      );
    } finally {
      setContextLoading(false);
    }
  };

  const handleUrlSubmit = async (event?: SyntheticEvent) => {
    event?.preventDefault();

    if (contextLoading) {
      setError("Still loading client configuration. Please wait a moment.");
      return;
    }

    if (!activeClientId) {
      setError(
        "Select an active client in the Clients area to start generating campaigns."
      );
      return;
    }

    if (countryConfigs.length === 0) {
      setError(
        "No active countries with mailing lists are available. Configure them in the Clients section."
      );
      return;
    }

    if (
      (isMultiProduct && allValidUrls.length === 0) ||
      (!isMultiProduct && !primaryCountryUrl)
    ) {
      setError("Please enter at least one product URL.");
      return;
    }

    setError("");
    setStep("template-selection");
  };

  const updateCountryUrl = (
    countryCode: string,
    index: number,
    value: string
  ) => {
    setCountryUrls((prev) => {
      const current = prev[countryCode] ?? [""];
      const next = [...current];
      next[index] = value;
      return {
        ...prev,
        [countryCode]: next,
      };
    });
  };

  const addCountryUrl = (countryCode: string) => {
    setCountryUrls((prev) => {
      const current = prev[countryCode] ?? [""];
      return {
        ...prev,
        [countryCode]: [...current, ""],
      };
    });
  };

  const removeCountryUrl = (countryCode: string, index: number) => {
    setCountryUrls((prev) => {
      const current = prev[countryCode] ?? [""];
      if (current.length <= 1) {
        const replacement = [...current];
        replacement[0] = "";
        return {
          ...prev,
          [countryCode]: replacement,
        };
      }

      const next = current.filter((_, i) => i !== index);
      return {
        ...prev,
        [countryCode]: next.length > 0 ? next : [""],
      };
    });
  };
  const handleTemplateSelection = async (templateIndex: number) => {
    setSelectedTemplateType(templateIndex);
    setLoading(true);
    setError("");
    setTemplate(null);
    setOriginalTemplate(null);
    setProductInfo(null);
    setSelectedImageIndex(0); // Reset selected image
    setSelectedProductIndex(0); // Reset selected product
    setMultiProductImageSelections({}); // Reset multi-product selections
    setBaseCountry(null);
    setCountryScrapeResults({});
    setStep("processing");

    const urlsForRequest = isMultiProduct
      ? allValidUrls
      : primaryCountryUrl
      ? [primaryCountryUrl]
      : [];

    if (urlsForRequest.length === 0) {
      setError("Please enter at least one product URL.");
      setStep("input");
      setLoading(false);
      return;
    }

    try {
      const response = await fetch("/api/scrape", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          clientId: activeClientId,
          countryUrls: trimmedCountryUrls,
          url: urlsForRequest.length === 1 ? urlsForRequest[0] : urlsForRequest, // Send single URL or array
          templateType: availableTemplates[templateIndex],
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to process URL");
      }

      const data = await response.json();

      setBaseCountry(data.baseCountry ?? null);
      setCountryScrapeResults(data.countryResults ?? {});
      setOriginalTemplate(data.emailTemplate);
      setTemplate(data.previewTemplate ?? data.emailTemplate);
      setProductInfo(data.productInfo);
      setPublishForm((prev) => ({
        ...prev,
        subject:
          (data.previewTemplate ?? data.emailTemplate)?.subject ?? prev.subject,
        preheader: prev.preheader,
        sendDate: prev.sendDate,
      }));
      setStep("results");

      // Track successful template generation
      try {
        await fetch("/api/track", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            templateType: availableTemplates[templateIndex].name,
            templateId: availableTemplates[templateIndex].id,
            urlCount: urlsForRequest.length,
            wasSuccessful: true,
          }),
        });
      } catch (trackingError) {
        console.log("Analytics tracking failed:", trackingError);
        // Don't break user experience if tracking fails
      }
    } catch (err) {
      console.error(err);
      setError("Failed to process URL(s). Please try different product URLs.");
      setStep("template-selection");

      // Track failed template generation
      try {
        await fetch("/api/track", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            templateType: availableTemplates[templateIndex].name,
            templateId: availableTemplates[templateIndex].id,
            urlCount: urlsForRequest.length,
            wasSuccessful: false,
          }),
        });
      } catch (trackingError) {
        console.log("Analytics tracking failed:", trackingError);
        // Don't break user experience if tracking fails
      }
    } finally {
      setLoading(false);
    }
  };

  const copyHtml = () => {
    if (template && productInfo) {
      let updatedHtml = template.html;

      if (isMultiProduct && "products" in productInfo) {
        // For multi-product, replace each product's best image with selected image
        const multiProductInfo = productInfo as MultiProductInfo;
        multiProductInfo.products.forEach((product, productIndex) => {
          const selectedImageIndex =
            multiProductImageSelections[productIndex] || 0;
          const selectedImageUrl =
            product.images[selectedImageIndex] || product.bestImageUrl;

          if (selectedImageUrl !== product.bestImageUrl) {
            const originalImageUrl = product.bestImageUrl;
            updatedHtml = updatedHtml
              .split(originalImageUrl)
              .join(selectedImageUrl);
          }
        });
      } else {
        // For single product, replace the best image URL with the selected image URL
        const selectedImageUrl =
          productInfo.images[selectedImageIndex] || productInfo.bestImageUrl;
        const originalImageUrl = productInfo.bestImageUrl;
        updatedHtml = template.html
          .split(originalImageUrl)
          .join(selectedImageUrl);
      }

      navigator.clipboard.writeText(updatedHtml);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handlePreview = () => {
    if (template && productInfo) {
      let updatedHtml = template.html;

      if (isMultiProduct && "products" in productInfo) {
        // For multi-product, replace each product's best image with selected image
        const multiProductInfo = productInfo as MultiProductInfo;
        multiProductInfo.products.forEach((product, productIndex) => {
          const selectedImageIndex =
            multiProductImageSelections[productIndex] || 0;
          const selectedImageUrl =
            product.images[selectedImageIndex] || product.bestImageUrl;

          if (selectedImageUrl !== product.bestImageUrl) {
            const originalImageUrl = product.bestImageUrl;
            updatedHtml = updatedHtml
              .split(originalImageUrl)
              .join(selectedImageUrl);
          }
        });
      } else {
        // For single product, replace the best image URL with the selected image URL
        const selectedImageUrl =
          productInfo.images[selectedImageIndex] || productInfo.bestImageUrl;
        const originalImageUrl = productInfo.bestImageUrl;
        updatedHtml = template.html
          .split(originalImageUrl)
          .join(selectedImageUrl);
      }

      // Open a new window and write the HTML directly
      const previewWindow = window.open("", "_blank");
      if (previewWindow) {
        const styledHtml = `
          <style>
            body {
              zoom: 0.75;
              -moz-transform: scale(0.75);
              -moz-transform-origin: 0 0;
              margin: 0;
              padding: 0;
            }
          </style>
          ${updatedHtml}
        `;
        previewWindow.document.write(styledHtml);
        previewWindow.document.close();
      }
    }
  };

  const resetForm = () => {
    setCountryUrls(buildCountryUrlState(countryConfigs));
    setStep("input");
    setTemplate(null);
    setOriginalTemplate(null);
    setProductInfo(null);
    setSelectedTemplateType(null);
    setSelectedImageIndex(0);
    setSelectedProductIndex(0);
    setMultiProductImageSelections({});
    setBaseCountry(null);
    setCountryScrapeResults({});
    setPublishModalOpen(false);
    setPublishError("");
    setPublishForm({ sendDate: "", subject: "", preheader: "" });
    setError("");
    setGlobalToast(null);
  };

  const openPublishModal = () => {
    setPublishError("");
    setPublishForm((prev) => ({
      ...prev,
      subject: prev.subject || template?.subject || "",
    }));
    setPublishModalOpen(true);
  };

  const closePublishModal = () => {
    if (!publishLoading) {
      setPublishModalOpen(false);
      setPublishError("");
    }
  };

  const updatePublishForm = (
    field: "sendDate" | "subject" | "preheader",
    value: string
  ) => {
    setPublishForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handlePublish = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!template || !activeClientId) {
      setPublishError("Generate a template before publishing.");
      return;
    }
    if (!publishForm.subject.trim()) {
      setPublishError("Subject is required.");
      return;
    }
    if (
      !countryScrapeResults ||
      Object.keys(countryScrapeResults).length === 0
    ) {
      setPublishError("No country data available. Generate a template first.");
      return;
    }

    setPublishLoading(true);
    setPublishError("");

    try {
      // Convert datetime-local value to ISO string with timezone
      // datetime-local returns "2025-10-14T15:30" which is in user's local time
      // We need to send it as a full ISO string so the backend knows the timezone
      let sendDateISO = null;
      if (publishForm.sendDate) {
        const localDate = new Date(publishForm.sendDate);
        if (!isNaN(localDate.getTime())) {
          sendDateISO = localDate.toISOString();
        }
      }

      const response = await fetch(
        `/api/clients/${activeClientId}/campaigns/squalomail`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            baseCountry,
            subject: publishForm.subject,
            preheader: publishForm.preheader,
            sendDate: sendDateISO,
            emailTemplate: originalTemplate ?? template,
            countryResults: countryScrapeResults,
            imageOverrides: buildImageOverrides(),
          }),
        }
      );

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        const message = payload?.error || "Failed to publish campaign.";
        throw new Error(message);
      }

      setPublishLoading(false);
      const successMessage =
        "Publishing campaign to SqualoMail. Track progress in Campaigns.";
      setPublishModalOpen(false);
      setPublishForm({ sendDate: "", subject: "", preheader: "" });
      setPublishError("");
      setGlobalToast(successMessage);
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(
          "templaito_publish_toast",
          successMessage
        );
      }
      const params = new URLSearchParams();
      params.set("clientId", activeClientId);
      router.push(`/campaigns?${params.toString()}`);
    } catch (error) {
      console.error("Failed to publish to SqualoMail", error);
      setPublishError(
        error instanceof Error
          ? error.message
          : "Failed to publish. Please try again."
      );
    } finally {
      setPublishLoading(false);
    }
  };

  const goBackToTemplateSelection = () => {
    setStep("template-selection");
    setTemplate(null);
    setOriginalTemplate(null);
    setSelectedTemplateType(null);
    setSelectedImageIndex(0);
    setSelectedProductIndex(0);
    setMultiProductImageSelections({});
  };

  const handleMultiProductImageSelection = (
    productIndex: number,
    imageIndex: number
  ) => {
    setMultiProductImageSelections((prev) => ({
      ...prev,
      [productIndex]: imageIndex,
    }));
  };

  // Determine which templates to show
  const isMultiProduct = hasMultiProductCountry;

  const buildImageOverrides = useCallback(():
    | PublishImageOverrides
    | undefined => {
    if (!productInfo) {
      return undefined;
    }

    if (isMultiProduct && "products" in productInfo) {
      const multiInfo = productInfo as MultiProductInfo;
      const selections: Record<number, number> = {};

      multiInfo.products?.forEach((product: ProductInfo, index: number) => {
        const chosen = multiProductImageSelections[index] ?? 0;
        const images = Array.isArray(product.images) ? product.images : [];
        const selectedUrl = images[chosen];
        if (selectedUrl && selectedUrl !== product.bestImageUrl) {
          selections[index] = chosen;
        }
      });

      return Object.keys(selections).length > 0
        ? { multiImageSelections: selections }
        : undefined;
    }

    if (!("products" in productInfo)) {
      const singleInfo = productInfo as ProductInfo;
      const images = Array.isArray(singleInfo.images) ? singleInfo.images : [];
      const selectedUrl = images[selectedImageIndex] ?? singleInfo.bestImageUrl;
      if (selectedUrl && selectedUrl !== singleInfo.bestImageUrl) {
        return { singleImageIndex: selectedImageIndex };
      }
    }

    return undefined;
  }, [
    productInfo,
    isMultiProduct,
    multiProductImageSelections,
    selectedImageIndex,
  ]);

  const availableTemplates = isMultiProduct
    ? availablePrompts.filter(
        (prompt) => prompt.templateType === "MULTI_PRODUCT"
      ) // Only Multi-Product templates
    : availablePrompts.filter(
        (prompt) => prompt.templateType === "SINGLE_PRODUCT"
      ); // Only Single-Product templates

  // Get UI configs for available templates
  const availableUIConfigs = availableTemplates.map(
    (template) => templateUIConfig[template.name] || templateUIConfig.default
  );

  useEffect(() => {
    if (previewRef.current && template && productInfo) {
      const doc = previewRef.current.contentDocument;
      if (doc) {
        let updatedHtml = template.html;

        if (isMultiProduct && "products" in productInfo) {
          // For multi-product, replace each product's best image with selected image
          const multiProductInfo = productInfo as MultiProductInfo;
          multiProductInfo.products.forEach((product, productIndex) => {
            const selectedImageIndex =
              multiProductImageSelections[productIndex] || 0;
            const selectedImageUrl =
              product.images[selectedImageIndex] || product.bestImageUrl;

            if (selectedImageUrl !== product.bestImageUrl) {
              const originalImageUrl = product.bestImageUrl;
              updatedHtml = updatedHtml
                .split(originalImageUrl)
                .join(selectedImageUrl);
            }
          });
        } else {
          // For single product, replace the best image URL with the selected image URL
          const selectedImageUrl =
            productInfo.images[selectedImageIndex] || productInfo.bestImageUrl;
          const originalImageUrl = productInfo.bestImageUrl;
          updatedHtml = template.html
            .split(originalImageUrl)
            .join(selectedImageUrl);
        }

        doc.open();
        doc.write(updatedHtml);
        doc.close();
      }
    }
  }, [
    template,
    productInfo,
    selectedImageIndex,
    isMultiProduct,
    multiProductImageSelections,
  ]);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/signin");
    }
  }, [status, router]);

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50">
        {/* Animated Background Elements */}
        <div className="fixed inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-80 h-80 bg-purple-300 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse"></div>
          <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-yellow-300 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse animation-delay-2000"></div>
          <div className="absolute top-40 left-40 w-80 h-80 bg-pink-300 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse animation-delay-4000"></div>
        </div>

        <div className="relative z-10 flex flex-col items-center justify-center py-32 min-h-screen">
          <div className="relative">
            <div className="w-32 h-32 border-8 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <SparklesIcon className="w-12 h-12 text-indigo-600 animate-pulse" />
            </div>
          </div>
          <div className="mt-8 text-center">
            <h3 className="text-2xl font-bold text-gray-800 mb-2">
              Getting ready...
            </h3>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {globalToast && (
        <div className="fixed top-4 right-4 z-[2000] max-w-sm rounded-2xl border border-emerald-200 bg-white/95 px-4 py-3 shadow-xl backdrop-blur">
          <div className="flex items-start gap-3">
            <div className="mt-1 h-2 w-2 rounded-full bg-emerald-500" />
            <div className="text-sm text-emerald-700">{globalToast}</div>
          </div>
        </div>
      )}
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50">
        {/* Animated Background Elements */}
        <div className="fixed inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-80 h-80 bg-purple-300 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse"></div>
          <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-yellow-300 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse animation-delay-2000"></div>
          <div className="absolute top-40 left-40 w-80 h-80 bg-pink-300 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse animation-delay-4000"></div>
        </div>

        <div className="relative z-10">
          {/* Header */}
          <header className="pt-12 pb-8 text-center">
            <div className="inline-flex items-center gap-3 mb-6">
              <div className="p-3 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl shadow-lg">
                <SparklesIcon className="w-8 h-8 text-white" />
              </div>
              <h1 className="text-5xl font-bold bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
                TemplAIto
              </h1>
            </div>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto leading-relaxed">
              Transform any product URL into stunning, conversion-optimized
              email templates using AI in seconds
            </p>

            {/* Stats */}
            <div className="flex justify-center gap-8 mt-8">
              <div className="text-center">
                <div className="text-2xl font-bold text-indigo-600">9</div>
                <div className="text-sm text-gray-500">Template Styles</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-600">AI</div>
                <div className="text-sm text-gray-500">Powered</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-pink-600">2</div>
                <div className="text-sm text-gray-500">Step Process</div>
              </div>
            </div>
          </header>

          <div className="max-w-7xl mx-auto px-6">
            {step === "input" && (
              <div className="max-w-4xl mx-auto">
                {/* Input Form */}
                <div className="bg-white/80 backdrop-blur-sm rounded-3xl shadow-2xl border border-white/20 p-8 mb-12">
                  <div className="space-y-6">
                    <div className="relative">
                      <label className="block text-sm font-semibold text-gray-700 mb-3">
                        Step 1: Provide product URLs for each active country
                      </label>

                      {contextLoading ? (
                        <div className="flex items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-8">
                          <InlineLoadingSpinner text="Loading client configuration..." />
                        </div>
                      ) : countryConfigs.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-8 text-center space-y-3">
                          <h3 className="text-lg font-semibold text-gray-800">
                            No ready countries
                          </h3>
                          <p className="text-sm text-gray-500">
                            Activate countries and connect mailing lists for
                            your active client before generating templates.
                          </p>
                          <button
                            type="button"
                            onClick={() => router.push("/clients")}
                            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-2 text-white text-sm font-semibold shadow-lg hover:shadow-xl"
                          >
                            Manage clients
                            <ArrowTopRightOnSquareIcon className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="space-y-6">
                            {countryConfigs.map((config) => {
                              const entries = countryUrls[
                                config.countryCode
                              ] ?? [""];
                              const countryName =
                                config.country?.name || config.countryCode;

                              return (
                                <div
                                  key={config.id}
                                  className="rounded-2xl border border-gray-200 bg-white/70 p-5 shadow-sm"
                                >
                                  <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                                    <div>
                                      <h3 className="text-lg font-semibold text-gray-900">
                                        {countryName}
                                      </h3>
                                      <p className="text-sm text-gray-500">
                                        Mailing list:{" "}
                                        {config.mailingListName ||
                                          config.mailingListId}
                                      </p>
                                    </div>
                                    <div className="text-xs font-medium text-indigo-600 bg-indigo-50 border border-indigo-100 px-3 py-1 rounded-full">
                                      {config.countryCode}
                                    </div>
                                  </div>

                                  <div className="space-y-2.5">
                                    {entries.map((value, index) => (
                                      <div
                                        key={`${config.countryCode}-${index}`}
                                        className="relative group"
                                      >
                                        <LinkIcon className="absolute left-3.5 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                                        <input
                                          type="url"
                                          value={value}
                                          onChange={(event) =>
                                            updateCountryUrl(
                                              config.countryCode,
                                              index,
                                              event.target.value
                                            )
                                          }
                                          onKeyDown={(event) => {
                                            if (event.key === "Enter") {
                                              handleUrlSubmit(event);
                                            }
                                          }}
                                          placeholder={`https://example.com/product/${config.countryCode.toLowerCase()}-${
                                            index + 1
                                          }`}
                                          className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-gray-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 placeholder:text-gray-400 placeholder:text-sm transition-all text-gray-700 duration-200 text-sm"
                                        />
                                        {entries.length > 1 && (
                                          <button
                                            type="button"
                                            onClick={() =>
                                              removeCountryUrl(
                                                config.countryCode,
                                                index
                                              )
                                            }
                                            className="absolute cursor-pointer right-3 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center text-gray-400 hover:text-red-500 transition-colors duration-200 text-xl leading-none"
                                            title="Remove URL"
                                          >
                                            {"×"}
                                          </button>
                                        )}
                                      </div>
                                    ))}
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() =>
                                      addCountryUrl(config.countryCode)
                                    }
                                    className="mt-4 cursor-pointer inline-flex items-center gap-2 text-indigo-600 hover:text-indigo-700 text-sm font-semibold"
                                  >
                                    <span className="text-base leading-none">
                                      +
                                    </span>
                                    Add another URL for {countryName}
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                          <div className="flex items-center justify-between pt-2 text-sm text-gray-500">
                            <span>{`Active countries: ${countryConfigs.length}`}</span>
                            <span>
                              {allValidUrls.length === 0
                                ? "No product URLs added yet"
                                : `${allValidUrls.length} product URL${
                                    allValidUrls.length > 1 ? "s" : ""
                                  } ready`}
                            </span>
                          </div>
                        </>
                      )}
                      <div className="mt-6">
                        <button
                          type="button"
                          onClick={handleUrlSubmit}
                          disabled={loading || contextLoading}
                          className="w-full cursor-pointer bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-bold py-4 px-8 rounded-2xl shadow-xl hover:shadow-2xl transition-all duration-200 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                        >
                          <span className="flex items-center justify-center gap-2 text-lg">
                            <SparklesIcon className="w-6 h-6" />
                            Continue to Template Selection
                          </span>
                        </button>
                      </div>
                      {error && (
                        <div className="mt-4 bg-red-50 border-l-4 border-red-400 p-4 rounded-r-lg">
                          <p className="text-red-700">{error}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Feature Preview */}
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
                  <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-6 border border-white/20 hover:bg-white/80 transition-all duration-200">
                    <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center mb-4">
                      <EyeIcon className="w-6 h-6 text-white" />
                    </div>
                    <h3 className="font-semibold text-gray-800 mb-2">
                      Smart Analysis
                    </h3>
                    <p className="text-gray-600 text-sm">
                      AI analyzes your product page and extracts the most
                      important information automatically.
                    </p>
                  </div>

                  <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-6 border border-white/20 hover:bg-white/80 transition-all duration-200">
                    <div className="w-12 h-12 bg-gradient-to-r from-purple-500 to-pink-600 rounded-xl flex items-center justify-center mb-4">
                      <PaintBrushIcon className="w-6 h-6 text-white" />
                    </div>
                    <h3 className="font-semibold text-gray-800 mb-2">
                      Template Selection
                    </h3>
                    <p className="text-gray-600 text-sm">
                      Choose from 9 professionally designed email template
                      styles for different campaigns.
                    </p>
                  </div>

                  <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-6 border border-white/20 hover:bg-white/80 transition-all duration-200 md:col-span-2 lg:col-span-1">
                    <div className="w-12 h-12 bg-gradient-to-r from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center mb-4">
                      <BeakerIcon className="w-6 h-6 text-white" />
                    </div>
                    <h3 className="font-semibold text-gray-800 mb-2">
                      AI Copywriting + Design
                    </h3>
                    <p className="text-gray-600 text-sm">
                      OpenAI creates compelling copy while Claude designs
                      beautiful HTML templates.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {step === "template-selection" && (
              <div className="max-w-6xl mx-auto">
                <div className="bg-white/90 backdrop-blur-sm rounded-3xl shadow-2xl border border-white/20 p-8">
                  <div className="text-center mb-8">
                    <h2 className="text-3xl font-bold text-gray-800 mb-2">
                      Step 2: Choose Your Template Style
                    </h2>
                    <p className="text-lg text-gray-600">
                      {isMultiProduct
                        ? "Multi-Product Landing Page - Perfect for showcasing multiple products"
                        : "Select the email template style that best fits your campaign goals"}
                    </p>
                    <div className="mt-4 text-sm text-gray-500">
                      {isMultiProduct ? (
                        <div className="space-y-1">
                          <div>Products ({allValidUrls.length}):</div>
                          {allValidUrls.map((url, index) => (
                            <div
                              key={index}
                              className="font-mono bg-gray-100 px-2 py-1 rounded inline-block mr-2 mb-1"
                            >
                              Product {index + 1}:{" "}
                              {url.length > 50
                                ? url.substring(0, 50) + "..."
                                : url}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span>
                          URL:{" "}
                          <span className="font-mono bg-gray-100 px-2 py-1 rounded">
                            {allValidUrls[0]}
                          </span>
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
                    {availableTemplates.length > 0 ? (
                      availableTemplates.map((templateType, availableIndex) => {
                        return (
                          <button
                            key={availableIndex}
                            onClick={() =>
                              handleTemplateSelection(availableIndex)
                            }
                            className={`text-left p-6 rounded-2xl transition-all duration-200 cursor-pointer transform hover:scale-105 hover:shadow-lg bg-white/60 hover:bg-white/80 border-2 border-transparent hover:border-gray-200`}
                            style={{
                              backgroundColor: `${
                                availableUIConfigs[availableIndex]?.bgColor ||
                                "#6b7280"
                              }20`,
                            }}
                          >
                            <div className="mb-4">
                              <span
                                className={`font-bold text-lg ${
                                  availableUIConfigs[availableIndex]
                                    ?.textColor || "text-gray-700"
                                }`}
                              >
                                {templateType.name}
                              </span>
                            </div>
                            <p className="text-gray-600 text-sm leading-relaxed">
                              {templateType.description}
                            </p>
                          </button>
                        );
                      })
                    ) : (
                      <div className="col-span-full text-center py-12">
                        <div className="text-gray-500 mb-4">
                          <SparklesIcon className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                          <h3 className="text-xl font-semibold text-gray-700 mb-2">
                            No templates available
                          </h3>
                          <p className="text-gray-600">
                            {isMultiProduct
                              ? "No multi-product templates found. Try with a single URL."
                              : "No single-product templates found. Please check your prompts in admin panel."}
                          </p>
                          <p className="text-sm text-gray-500 mt-2">
                            Debug: {availablePrompts.length} total prompts
                            loaded
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="text-center">
                    <button
                      onClick={resetForm}
                      className="text-gray-500 hover:text-gray-700 transition-colors duration-200"
                    >
                      ← Back to URL Input
                    </button>
                  </div>
                </div>
              </div>
            )}

            {step === "processing" && (
              <div className="flex flex-col items-center justify-center py-32">
                <div className="relative">
                  <div className="w-32 h-32 border-8 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <SparklesIcon className="w-12 h-12 text-indigo-600 animate-pulse" />
                  </div>
                </div>
                <div className="mt-8 text-center">
                  <h3 className="text-2xl font-bold text-gray-800 mb-2">
                    Creating Your{" "}
                    {selectedTemplateType !== null
                      ? availableTemplates[selectedTemplateType]?.name
                      : ""}{" "}
                    Template
                  </h3>
                  <p className="text-lg text-gray-600 mb-6">
                    Our AI is crafting your perfect email template...
                  </p>

                  <div className="space-y-2">
                    <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
                      <div className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse"></div>
                      OpenAI is writing compelling copy
                    </div>
                    <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
                      <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse animation-delay-1000"></div>
                      Claude is designing beautiful HTML
                    </div>
                    <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
                      <div className="w-2 h-2 bg-pink-500 rounded-full animate-pulse animation-delay-2000"></div>
                      Finalizing your template
                    </div>
                  </div>
                </div>
              </div>
            )}
            {step === "results" && template && (
              <div className="bg-white/90 backdrop-blur-sm rounded-3xl shadow-2xl border border-white/20 overflow-hidden mb-8">
                <div className="p-6 bg-gradient-to-r from-indigo-500 to-purple-600 text-white">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-2xl font-bold mb-2">
                        Your{" "}
                        {selectedTemplateType !== null
                          ? availableTemplates[selectedTemplateType]?.name
                          : ""}{" "}
                        Template Is Ready! 🎉
                      </h2>
                      <p className="opacity-90">
                        {productInfo?.title && `For: ${productInfo.title}`}
                        {productInfo?.language &&
                          ` (${productInfo.language.toUpperCase()})`}
                        {isMultiProduct && ` - ${allValidUrls.length} Products`}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-3 justify-end">
                      <button
                        onClick={openPublishModal}
                        className="bg-white text-indigo-600 hover:bg-indigo-50 cursor-pointer px-4 py-2 rounded-xl shadow transition-colors duration-200"
                      >
                        Publish to SqualoMail
                      </button>
                      <button
                        onClick={goBackToTemplateSelection}
                        className="bg-white/20 hover:bg-white/30 cursor-pointer px-4 py-2 rounded-xl transition-colors duration-200"
                      >
                        Try Another Style
                      </button>
                      <button
                        onClick={resetForm}
                        className="bg-white/20 hover:bg-white/30 cursor-pointer px-4 py-2 rounded-xl transition-colors duration-200"
                      >
                        Create New
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col h-[75vh]">
                  {/* Template Header */}
                  <div className="p-4 bg-white border-b border-gray-200 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 flex items-center justify-center">
                        {selectedTemplateType !== null &&
                        availableTemplates[selectedTemplateType] ? (
                          (() => {
                            const selectedTemplate =
                              availableTemplates[selectedTemplateType];
                            const config =
                              templateUIConfig[selectedTemplate.name] ||
                              templateUIConfig.default;
                            const IconComponent = config.icon;
                            return IconComponent ? (
                              <IconComponent className="w-6 h-6 text-gray-600" />
                            ) : null;
                          })()
                        ) : (
                          <SparklesIcon className="w-6 h-6 text-gray-400" />
                        )}
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-800">
                          {selectedTemplateType !== null
                            ? availableTemplates[selectedTemplateType]?.name
                            : ""}
                        </h3>
                        <p className="text-sm text-gray-600">
                          {template.subject}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <button
                        onClick={handlePreview}
                        className={`inline-flex cursor-pointer items-center gap-2 px-6 py-3 rounded-xl font-semibold transition-all duration-200 bg-gradient-to-r from-emerald-500 to-teal-600 text-white hover:shadow-lg transform hover:scale-105`}
                      >
                        <ArrowTopRightOnSquareIcon className="w-5 h-5" />
                        Preview
                      </button>

                      <button
                        onClick={copyHtml}
                        className={`inline-flex cursor-pointer items-center gap-2 px-6 py-3 rounded-xl font-semibold transition-all duration-200 ${
                          copied
                            ? "bg-green-100 text-green-700 border-2 border-green-200"
                            : selectedTemplateType !== null &&
                              availableTemplates[selectedTemplateType]
                            ? `bg-gradient-to-r ${(() => {
                                const selectedTemplate =
                                  availableTemplates[selectedTemplateType];
                                const config =
                                  templateUIConfig[selectedTemplate.name] ||
                                  templateUIConfig.default;
                                return config.color;
                              })()} text-white hover:shadow-lg transform hover:scale-105`
                            : "bg-gradient-to-r from-indigo-500 to-purple-600 text-white hover:shadow-lg transform hover:scale-105"
                        }`}
                      >
                        {copied ? (
                          <>
                            <CheckIcon className="w-5 h-5" />
                            Copied!
                          </>
                        ) : (
                          <>
                            <DocumentDuplicateIcon className="w-5 h-5" />
                            Copy HTML
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Image Selector */}
                  {productInfo &&
                    !isMultiProduct &&
                    productInfo.images &&
                    productInfo.images.length > 1 && (
                      <div className="p-4 bg-gray-50 border-b border-gray-200">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="font-semibold text-gray-800">
                            Choose Product Image
                          </h4>
                          <span className="text-sm text-gray-500">
                            {selectedImageIndex + 1} of{" "}
                            {productInfo.images.length}
                          </span>
                        </div>
                        <div className="flex gap-2 overflow-x-auto pb-2">
                          {productInfo.images.map((image, index) => (
                            <button
                              key={index}
                              onClick={() => setSelectedImageIndex(index)}
                              className={`flex-shrink-0 w-16 h-16 rounded-lg border-2 transition-all duration-200 ${
                                selectedImageIndex === index
                                  ? "border-blue-500 ring-2 ring-blue-200"
                                  : "border-gray-200 hover:border-gray-300"
                              }`}
                            >
                              <ExternalImage
                                src={image}
                                alt={`Product image ${index + 1}`}
                                className="w-full h-full object-cover rounded-md"
                                width={64}
                                height={64}
                                onError={(e) => {
                                  e.currentTarget.style.display = "none";
                                }}
                              />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                  {/* Multi-Product Image Selector */}
                  {productInfo &&
                    isMultiProduct &&
                    "products" in productInfo && (
                      <div className="p-4 bg-gray-50 border-b border-gray-200">
                        <div className="flex items-center justify-between mb-4">
                          <h4 className="font-semibold text-gray-800">
                            Choose Product Images
                          </h4>
                          <span className="text-sm text-gray-500">
                            {(productInfo as MultiProductInfo).products.length}{" "}
                            Products
                          </span>
                        </div>

                        {/* Product Tabs */}
                        <div className="flex gap-2 mb-4 overflow-x-auto">
                          {(productInfo as MultiProductInfo).products.map(
                            (product: ProductInfo, productIndex: number) => (
                              <button
                                key={productIndex}
                                onClick={() =>
                                  setSelectedProductIndex(productIndex)
                                }
                                className={`flex-shrink-0 px-4 py-2 rounded-lg font-medium transition-all duration-200 ${
                                  selectedProductIndex === productIndex
                                    ? "bg-blue-500 text-white shadow-md"
                                    : "bg-white text-gray-600 hover:bg-gray-100 border border-gray-200"
                                }`}
                              >
                                Product {productIndex + 1}
                              </button>
                            )
                          )}
                        </div>

                        {/* Selected Product Image Selection */}
                        {(() => {
                          const multiProductInfo =
                            productInfo as MultiProductInfo;
                          const currentProduct =
                            multiProductInfo.products[selectedProductIndex];
                          const currentSelectedImageIndex =
                            multiProductImageSelections[selectedProductIndex] ||
                            0;

                          return (
                            <div className="bg-white rounded-lg p-4">
                              <div className="flex items-center justify-between mb-3">
                                <h5 className="font-medium text-gray-800">
                                  {currentProduct.title}
                                </h5>
                                <span className="text-sm text-gray-500">
                                  {currentSelectedImageIndex + 1} of{" "}
                                  {currentProduct.images.length}
                                </span>
                              </div>

                              {currentProduct.images &&
                                currentProduct.images.length > 1 && (
                                  <div className="flex gap-2 overflow-x-auto pb-2">
                                    {currentProduct.images.map(
                                      (image: string, imageIndex: number) => (
                                        <button
                                          key={imageIndex}
                                          onClick={() =>
                                            handleMultiProductImageSelection(
                                              selectedProductIndex,
                                              imageIndex
                                            )
                                          }
                                          className={`flex-shrink-0 w-16 h-16 rounded-lg border-2 transition-all duration-200 ${
                                            currentSelectedImageIndex ===
                                            imageIndex
                                              ? "border-blue-500 ring-2 ring-blue-200"
                                              : "border-gray-200 hover:border-gray-300"
                                          }`}
                                        >
                                          <ExternalImage
                                            src={image}
                                            alt={`Product ${
                                              selectedProductIndex + 1
                                            } image ${imageIndex + 1}`}
                                            className="w-full h-full object-cover rounded-md"
                                            width={64}
                                            height={64}
                                            onError={(e) => {
                                              e.currentTarget.style.display =
                                                "none";
                                            }}
                                          />
                                        </button>
                                      )
                                    )}
                                  </div>
                                )}

                              {currentProduct.images &&
                                currentProduct.images.length <= 1 && (
                                  <div className="text-sm text-gray-500 italic">
                                    Only one image available for this product
                                  </div>
                                )}
                            </div>
                          );
                        })()}
                      </div>
                    )}

                  {/* Template Preview */}
                  <div className="flex-1 p-4 bg-gray-100">
                    <iframe
                      ref={previewRef}
                      title="Email preview"
                      className="w-full h-full bg-white rounded-2xl shadow-lg border-2 border-gray-200"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <footer className="mt-20 py-12 text-center text-gray-500">
            <div className="flex justify-center gap-6 text-sm">
              <span>⚡ 2-Step Process</span>
              <span>🎨 AI Copywriting + Design</span>
              <span>📱 Mobile Responsive</span>
            </div>
          </footer>
        </div>

        {publishModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
            <div
              className="absolute inset-0 bg-gray-900/50 backdrop-blur-sm"
              onClick={closePublishModal}
            />
            <div className="relative w-full max-w-xl bg-white rounded-3xl shadow-2xl border border-gray-100 p-8">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <h3 className="text-2xl font-semibold text-gray-900">
                    Schedule Squalomail Campaign
                  </h3>
                  <p className="text-sm text-gray-500 mt-1">
                    Pick a subject, preheader, and optional send date before we
                    hand the template to Squalomail.
                  </p>
                </div>
                <button
                  onClick={closePublishModal}
                  className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
                  aria-label="Close"
                  type="button"
                >
                  &times;
                </button>
              </div>

              <form onSubmit={handlePublish} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Subject line *
                  </label>
                  <input
                    type="text"
                    value={publishForm.subject}
                    onChange={(e) =>
                      updatePublishForm("subject", e.target.value)
                    }
                    placeholder="e.g. {subtag:name}, Exclusive weekend offer"
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-gray-900 bg-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Preheader
                  </label>
                  <input
                    type="text"
                    value={publishForm.preheader}
                    onChange={(e) =>
                      updatePublishForm("preheader", e.target.value)
                    }
                    placeholder="Short teaser that appears in the inbox preview"
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-gray-900 bg-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Send date/time (optional)
                  </label>
                  <input
                    type="datetime-local"
                    value={publishForm.sendDate}
                    onChange={(e) =>
                      updatePublishForm("sendDate", e.target.value)
                    }
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-gray-900 bg-white"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Leave empty to send immediately after publishing.
                  </p>
                </div>

                {publishError && (
                  <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl px-4 py-3 text-sm">
                    {publishError}
                  </div>
                )}

                <div className="flex flex-col gap-3 pt-2">
                  <p className="text-xs text-gray-400">
                    We&apos;ll translate subject/preheader per country before
                    creating the newsletter.
                  </p>
                  <div className="flex gap-2 sm:gap-3">
                    <button
                      type="button"
                      onClick={closePublishModal}
                      className="flex-1 px-3 py-2.5 cursor-pointer rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-60 disabled:cursor-not-allowed text-sm font-medium"
                      disabled={publishLoading}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="flex-1 px-3 py-2.5 cursor-pointer rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-sm font-medium"
                      disabled={publishLoading}
                    >
                      {publishLoading ? "Preparing..." : "Publish"}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        )}

        <style jsx>{`
          .animation-delay-1000 {
            animation-delay: 1s;
          }
          .animation-delay-2000 {
            animation-delay: 2s;
          }
          .animation-delay-4000 {
            animation-delay: 4s;
          }
          .hover\:scale-102:hover {
            transform: scale(1.02);
          }
        `}</style>
      </div>
    </>
  );
}
