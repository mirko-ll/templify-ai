"use client";

import { useState, useRef, useEffect } from "react";
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
import Image from "next/image";
import { promptTypes } from "@/app/utils/promptTypes";

interface Template {
  subject: string;
  html: string;
}

interface ProductInfo {
  title: string;
  description: string;
  images: string[];
  bestImageUrl: string;
  language: string;
  regularPrice: string;
  salePrice: string;
  discount: string;
}

interface MultiProductInfo {
  products: ProductInfo[];
  language: string;
}

interface Template {
  subject: string;
  html: string;
}

// Template type icons and colors for UI display
const templateUIConfig = [
  {
    icon: "💼",
    color: "from-blue-500 to-indigo-600",
    bgColor: "bg-blue-50",
    textColor: "text-blue-700",
  },
  {
    icon: "🎯",
    color: "from-red-500 to-pink-600",
    bgColor: "bg-red-50",
    textColor: "text-red-700",
  },
  {
    icon: "📈",
    color: "from-orange-500 to-red-600",
    bgColor: "bg-orange-50",
    textColor: "text-orange-700",
  },
  {
    icon: "✨",
    color: "from-gray-500 to-slate-600",
    bgColor: "bg-gray-50",
    textColor: "text-gray-700",
  },
  {
    icon: "✦",
    color: "from-amber-700 to-stone-800",
    bgColor: "bg-amber-50",
    textColor: "text-amber-800",
  },
  {
    icon: "🚀",
    color: "from-emerald-500 to-teal-600",
    bgColor: "bg-emerald-50",
    textColor: "text-emerald-700",
  },
  {
    icon: "📝",
    color: "from-indigo-500 to-violet-600",
    bgColor: "bg-indigo-50",
    textColor: "text-indigo-700",
  },
  {
    icon: "📰",
    color: "from-cyan-500 to-blue-600",
    bgColor: "bg-cyan-50",
    textColor: "text-cyan-700",
  },
  {
    icon: "🛍️",
    color: "from-purple-500 to-pink-600",
    bgColor: "bg-purple-50",
    textColor: "text-purple-700",
  },
];

export default function Templaito() {
  const { status } = useSession();
  const router = useRouter();
  const [urls, setUrls] = useState<string[]>([""]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [template, setTemplate] = useState<Template | null>(null);
  const [productInfo, setProductInfo] = useState<ProductInfo | null>(null);
  const [selectedTemplateType, setSelectedTemplateType] = useState<
    number | null
  >(null);
  const [copied, setCopied] = useState(false);
  const [step, setStep] = useState<
    "input" | "template-selection" | "processing" | "results"
  >("input");
  const [selectedImageIndex, setSelectedImageIndex] = useState<number>(0);
  const [selectedProductIndex, setSelectedProductIndex] = useState<number>(0);
  const [multiProductImageSelections, setMultiProductImageSelections] =
    useState<{ [key: number]: number }>({});
  const previewRef = useRef<HTMLIFrameElement>(null);

  const handleUrlSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Filter out empty URLs
    const validUrls = urls.filter((url) => url.trim() !== "");

    if (validUrls.length === 0) {
      setError("Please enter at least one URL");
      return;
    }

    setError("");
    setStep("template-selection");
  };

  const addUrlInput = () => {
    setUrls([...urls, ""]);
  };

  const removeUrlInput = (index: number) => {
    if (urls.length > 1) {
      const newUrls = urls.filter((_, i) => i !== index);
      setUrls(newUrls);
    }
  };

  const updateUrl = (index: number, value: string) => {
    const newUrls = [...urls];
    newUrls[index] = value;
    setUrls(newUrls);
  };

  const handleTemplateSelection = async (templateIndex: number) => {
    setSelectedTemplateType(templateIndex);
    setLoading(true);
    setError("");
    setTemplate(null);
    setProductInfo(null);
    setSelectedImageIndex(0); // Reset selected image
    setSelectedProductIndex(0); // Reset selected product
    setMultiProductImageSelections({}); // Reset multi-product selections
    setStep("processing");

    try {
      const validUrls = urls.filter((url) => url.trim() !== "");

      const response = await fetch("/api/scrape", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: validUrls.length === 1 ? validUrls[0] : validUrls, // Send single URL or array
          templateType: promptTypes[templateIndex],
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to process URL");
      }

      const data = await response.json();

      setTemplate(data.emailTemplate);
      setProductInfo(data.productInfo);
      setStep("results");

      // Track successful template generation
      try {
        await fetch("/api/track", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            templateType: promptTypes[templateIndex].name,
            templateId: templateIndex,
            urlCount: validUrls.length,
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
            templateType: promptTypes[templateIndex].name,
            templateId: templateIndex,
            urlCount: validUrls.length,
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
            updatedHtml = updatedHtml.replace(
              new RegExp(
                product.bestImageUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
                "g"
              ),
              selectedImageUrl
            );
          }
        });
      } else {
        // For single product, replace the best image URL with the selected image URL
        const selectedImageUrl =
          productInfo.images[selectedImageIndex] || productInfo.bestImageUrl;
        updatedHtml = template.html.replace(
          new RegExp(
            productInfo.bestImageUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
            "g"
          ),
          selectedImageUrl
        );
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
            updatedHtml = updatedHtml.replace(
              new RegExp(
                product.bestImageUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
                "g"
              ),
              selectedImageUrl
            );
          }
        });
      } else {
        // For single product, replace the best image URL with the selected image URL
        const selectedImageUrl =
          productInfo.images[selectedImageIndex] || productInfo.bestImageUrl;
        updatedHtml = template.html.replace(
          new RegExp(
            productInfo.bestImageUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
            "g"
          ),
          selectedImageUrl
        );
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
    setUrls([""]);
    setStep("input");
    setTemplate(null);
    setProductInfo(null);
    setSelectedTemplateType(null);
    setSelectedImageIndex(0);
    setSelectedProductIndex(0);
    setMultiProductImageSelections({});
    setError("");
  };

  const goBackToTemplateSelection = () => {
    setStep("template-selection");
    setTemplate(null);
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
  const validUrls = urls.filter((url) => url.trim() !== "");
  const isMultiProduct = validUrls.length > 1;
  const availableTemplates = isMultiProduct
    ? promptTypes.filter((_, index) => index === promptTypes.length - 1) // Only Multi-Product Landing
    : promptTypes.slice(0, -1); // All except Multi-Product Landing

  const availableUIConfigs = isMultiProduct
    ? [templateUIConfig[templateUIConfig.length - 1]] // Only Multi-Product Landing UI
    : templateUIConfig.slice(0, -1); // All except Multi-Product Landing UI

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
              updatedHtml = updatedHtml.replace(
                new RegExp(
                  product.bestImageUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
                  "g"
                ),
                selectedImageUrl
              );
            }
          });
        } else {
          // For single product, replace the best image URL with the selected image URL
          const selectedImageUrl =
            productInfo.images[selectedImageIndex] || productInfo.bestImageUrl;
          updatedHtml = template.html.replace(
            new RegExp(
              productInfo.bestImageUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
              "g"
            ),
            selectedImageUrl
          );
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
      <div className="flex flex-col items-center justify-center py-32 min-h-screen">
        <div className="relative">
          <div className="w-32 h-32 border-8 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
          <div className="absolute inset-0 flex items-center justify-center">
            <SparklesIcon className="w-12 h-12 text-indigo-600 animate-pulse" />
          </div>
        </div>
        <div className="mt-8 text-center">
          <h3 className="text-2xl font-bold text-gray-800 mb-2">Loading...</h3>
        </div>
      </div>
    );
  }

  return (
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
            Transform any product URL into stunning, conversion-optimized email
            templates using AI in seconds
          </p>

          {/* Stats */}
          <div className="flex justify-center gap-8 mt-8">
            <div className="text-center">
              <div className="text-2xl font-bold text-indigo-600">8</div>
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
                      Product URL{urls.length > 1 ? "s" : ""}
                    </label>

                    {/* URL Inputs */}
                    <div className="space-y-3">
                      {urls.map((url, index) => (
                        <div key={index} className="relative">
                          <LinkIcon className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                          <input
                            type="url"
                            value={url}
                            onChange={(e) => updateUrl(index, e.target.value)}
                            placeholder={`https://example.com/product/amazing-widget-${
                              index + 1
                            }`}
                            className="w-full pl-12 pr-12 py-4 rounded-2xl border-2 border-gray-200 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 placeholder:text-gray-400 placeholder:text-sm transition-all text-gray-500 duration-200 text-lg"
                            onKeyPress={(e) =>
                              e.key === "Enter" && handleUrlSubmit(e)
                            }
                          />
                          {urls.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeUrlInput(index)}
                              className="absolute right-4 top-1/2 transform -translate-y-1/2 w-6 h-6 text-gray-400 hover:text-red-500 transition-colors duration-200"
                              title="Remove URL"
                            >
                              ×
                            </button>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Add URL Button */}
                    <div className="mt-4 flex items-center justify-between cursor-pointer">
                      <button
                        type="button"
                        onClick={addUrlInput}
                        className="inline-flex items-center cursor-pointer gap-2 text-indigo-600 hover:text-indigo-700 font-semibold transition-colors duration-200"
                      >
                        <span className="text-lg cursor-pointer">+</span>
                        Add URL
                      </button>
                      <p className="text-sm text-gray-500">
                        {urls.length === 1
                          ? "Step 1: Enter your product URL ✨"
                          : `Step 1: ${validUrls.length} URLs for Multi-Product Landing 🛍️`}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={handleUrlSubmit}
                    disabled={loading}
                    className="w-full cursor-pointer bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-bold py-4 px-8 rounded-2xl shadow-xl hover:shadow-2xl transition-all duration-200 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                  >
                    <span className="flex items-center justify-center gap-2 text-lg">
                      <SparklesIcon className="w-6 h-6" />
                      Continue to Template Selection
                    </span>
                  </button>

                  {error && (
                    <div className="bg-red-50 border-l-4 border-red-400 p-4 rounded-r-lg">
                      <p className="text-red-700">{error}</p>
                    </div>
                  )}
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
                    Choose from 8 professionally designed email template styles
                    for different campaigns.
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
                        <div>Products ({validUrls.length}):</div>
                        {validUrls.map((url, index) => (
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
                          {validUrls[0]}
                        </span>
                      </span>
                    )}
                  </div>
                </div>

                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
                  {availableTemplates.map((templateType, availableIndex) => {
                    // Map back to original template index
                    const originalIndex = isMultiProduct
                      ? promptTypes.length - 1 // Multi-Product Landing is last
                      : availableIndex; // Regular templates keep their index

                    return (
                      <button
                        key={availableIndex}
                        onClick={() => handleTemplateSelection(originalIndex)}
                        className={`text-left p-6 rounded-2xl transition-all duration-200 cursor-pointer transform hover:scale-105 hover:shadow-lg ${availableUIConfigs[availableIndex].bgColor} hover:bg-white/80 border-2 border-transparent hover:border-gray-200`}
                      >
                        <div className="flex items-center gap-3 mb-4">
                          <span className="text-3xl">
                            {availableUIConfigs[availableIndex].icon}
                          </span>
                          <span
                            className={`font-bold text-lg ${availableUIConfigs[availableIndex].textColor}`}
                          >
                            {templateType.name}
                          </span>
                        </div>
                        <p className="text-gray-600 text-sm leading-relaxed">
                          {templateType.description}
                        </p>
                      </button>
                    );
                  })}
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
                    ? promptTypes[selectedTemplateType].name
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
                        ? promptTypes[selectedTemplateType].name
                        : ""}{" "}
                      Template Is Ready! 🎉
                    </h2>
                    <p className="opacity-90">
                      {productInfo?.title && `For: ${productInfo.title}`}
                      {productInfo?.language &&
                        ` (${productInfo.language.toUpperCase()})`}
                      {isMultiProduct && ` - ${validUrls.length} Products`}
                    </p>
                  </div>
                  <div className="flex gap-3">
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
                    <span className="text-2xl">
                      {selectedTemplateType !== null
                        ? isMultiProduct
                          ? templateUIConfig[templateUIConfig.length - 1].icon // Multi-Product Landing icon
                          : templateUIConfig[selectedTemplateType].icon // Regular template icon
                        : ""}
                    </span>
                    <div>
                      <h3 className="font-semibold text-gray-800">
                        {selectedTemplateType !== null
                          ? promptTypes[selectedTemplateType].name
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
                          : selectedTemplateType !== null
                          ? `bg-gradient-to-r ${
                              isMultiProduct
                                ? templateUIConfig[templateUIConfig.length - 1]
                                    .color // Multi-Product Landing color
                                : templateUIConfig[selectedTemplateType].color // Regular template color
                            } text-white hover:shadow-lg transform hover:scale-105`
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
                            <Image
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
                {productInfo && isMultiProduct && "products" in productInfo && (
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
                      const multiProductInfo = productInfo as MultiProductInfo;
                      const currentProduct =
                        multiProductInfo.products[selectedProductIndex];
                      const currentSelectedImageIndex =
                        multiProductImageSelections[selectedProductIndex] || 0;

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
                                        currentSelectedImageIndex === imageIndex
                                          ? "border-blue-500 ring-2 ring-blue-200"
                                          : "border-gray-200 hover:border-gray-300"
                                      }`}
                                    >
                                      <Image
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
            <span>🚀 2-Step Process</span>
            <span>🎨 AI Copywriting + Design</span>
            <span>📱 Mobile Responsive</span>
            <span>⚡ Claude + OpenAI</span>
          </div>
        </footer>
      </div>

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
        .hover\\:scale-102:hover {
          transform: scale(1.02);
        }
      `}</style>
    </div>
  );
}
