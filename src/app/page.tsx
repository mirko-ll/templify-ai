"use client";

import { useState, useRef, useEffect } from "react";
import {
  DocumentDuplicateIcon,
  CheckIcon,
  SparklesIcon,
  EyeIcon,
  LinkIcon,
  PaintBrushIcon,
  BeakerIcon,
} from "@heroicons/react/24/outline";

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
}

const promptTypes = [
  {
    name: "Professional",
    description:
      "Clean, professional email template with clear CTAs and minimal design",
    icon: "💼",
    color: "from-blue-500 to-indigo-600",
    bgColor: "bg-blue-50",
    textColor: "text-blue-700",
  },
  {
    name: "Promotional",
    description:
      "Eye-catching promotional email with emphasis on discounts and limited offers",
    icon: "🎯",
    color: "from-red-500 to-pink-600",
    bgColor: "bg-red-50",
    textColor: "text-red-700",
  },
  {
    name: "Minimal",
    description:
      "Clean, minimal design with focus on product image and simplicity",
    icon: "✨",
    color: "from-gray-500 to-slate-600",
    bgColor: "bg-gray-50",
    textColor: "text-gray-700",
  },
  {
    name: "Elegant & Sophisticated",
    description:
      "Refined, premium design with sophisticated aesthetic for high-end products",
    icon: "✦",
    color: "from-amber-700 to-stone-800",
    bgColor: "bg-amber-50",
    textColor: "text-amber-800",
  },
  {
    name: "Modern & Sleek",
    description: "Contemporary design with clean lines and modern aesthetic",
    icon: "🚀",
    color: "from-emerald-500 to-teal-600",
    bgColor: "bg-emerald-50",
    textColor: "text-emerald-700",
  },
  {
    name: "Text-Only",
    description:
      "Clean, text-focused design without images for faster loading and better accessibility",
    icon: "📝",
    color: "from-indigo-500 to-violet-600",
    bgColor: "bg-indigo-50",
    textColor: "text-indigo-700",
  },
];

export default function Templaito() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [productInfo, setProductInfo] = useState<ProductInfo | null>(null);
  const [activeTemplate, setActiveTemplate] = useState(0);
  const [copied, setCopied] = useState(false);
  const [step, setStep] = useState<"input" | "processing" | "results">("input");
  const previewRef = useRef<HTMLIFrameElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!url) {
      setError("Please enter a URL");
      return;
    }

    setLoading(true);
    setError("");
    setTemplates([]);
    setProductInfo(null);
    setStep("processing");

    try {
      const response = await fetch("/api/scrape", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url }),
      });

      if (!response.ok) {
        throw new Error("Failed to process URL");
      }

      const data = await response.json();

      setTemplates(data.emailTemplates);
      setProductInfo(data.productInfo);
      setStep("results");
    } catch (err) {
      console.error(err);
      setError("Failed to process URL. Please try a different product URL.");
      setStep("input");
    } finally {
      setLoading(false);
    }
  };

  const copyHtml = () => {
    if (templates[activeTemplate]) {
      navigator.clipboard.writeText(templates[activeTemplate].html);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const resetForm = () => {
    setUrl("");
    setStep("input");
    setTemplates([]);
    setProductInfo(null);
    setError("");
  };

  useEffect(() => {
    if (previewRef.current && templates[activeTemplate]) {
      const doc = previewRef.current.contentDocument;
      if (doc) {
        doc.open();
        doc.write(templates[activeTemplate].html);
        doc.close();
      }
    }
  }, [activeTemplate, templates]);

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
              Templaito
            </h1>
          </div>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto leading-relaxed">
            Transform any product URL into stunning, conversion-optimized email
            templates using AI in seconds
          </p>

          {/* Stats */}
          <div className="flex justify-center gap-8 mt-8">
            <div className="text-center">
              <div className="text-2xl font-bold text-indigo-600">5</div>
              <div className="text-sm text-gray-500">Template Styles</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">AI</div>
              <div className="text-sm text-gray-500">Powered</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-pink-600">∞</div>
              <div className="text-sm text-gray-500">Possibilities</div>
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
                      Product URL
                    </label>
                    <div className="relative">
                      <LinkIcon className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <input
                        type="url"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        placeholder="https://example.com/product/amazing-widget"
                        className="w-full pl-12 pr-4 py-4 rounded-2xl border-2 border-gray-200 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 placeholder:text-gray-400 placeholder:text-sm transition-all text-gray-500 duration-200 text-lg"
                        onKeyPress={(e) => e.key === "Enter" && handleSubmit(e)}
                      />
                    </div>
                    <p className="mt-2 text-sm text-gray-500">
                      Paste any product URL and watch the magic happen ✨
                    </p>
                  </div>

                  <button
                    onClick={handleSubmit}
                    disabled={loading}
                    className="w-full cursor-pointer bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-bold py-4 px-8 rounded-2xl shadow-xl hover:shadow-2xl transition-all duration-200 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                  >
                    <span className="flex items-center justify-center gap-2 text-lg">
                      <SparklesIcon className="w-6 h-6" />
                      Generate Email Templates
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
                    Multiple Styles
                  </h3>
                  <p className="text-gray-600 text-sm">
                    Choose from 5 professionally designed email template styles
                    for different campaigns.
                  </p>
                </div>

                <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-6 border border-white/20 hover:bg-white/80 transition-all duration-200 md:col-span-2 lg:col-span-1">
                  <div className="w-12 h-12 bg-gradient-to-r from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center mb-4">
                    <BeakerIcon className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="font-semibold text-gray-800 mb-2">
                    One-Click Copy
                  </h3>
                  <p className="text-gray-600 text-sm">
                    Copy the HTML code instantly and paste it into your favorite
                    email marketing platform.
                  </p>
                </div>
              </div>
            </div>
          )}

          {step === "processing" && (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="relative">
                <div className="w-32 h-32 border-8 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <SparklesIcon className="w-12 h-12 text-indigo-600 animate-pulse" />
                </div>
              </div>
              <div className="mt-8 text-center">
                <h3 className="text-2xl font-bold text-gray-800 mb-2">
                  AI is working its magic
                </h3>
                <p className="text-lg text-gray-600 mb-6">
                  Analyzing your product and crafting beautiful templates...
                </p>

                <div className="space-y-2">
                  <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
                    <div className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse"></div>
                    Extracting product information
                  </div>
                  <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
                    <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse animation-delay-1000"></div>
                    Selecting best product images
                  </div>
                  <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
                    <div className="w-2 h-2 bg-pink-500 rounded-full animate-pulse animation-delay-2000"></div>
                    Generating email templates
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === "results" && templates.length > 0 && (
            <div className="bg-white/90 backdrop-blur-sm rounded-3xl shadow-2xl border border-white/20 overflow-hidden">
              <div className="p-6 bg-gradient-to-r from-indigo-500 to-purple-600 text-white">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-bold mb-2">
                      Your Email Templates Are Ready! 🎉
                    </h2>
                    <p className="opacity-90">
                      {productInfo?.title && `For: ${productInfo.title}`}
                      {productInfo?.language &&
                        ` (${productInfo.language.toUpperCase()})`}
                    </p>
                  </div>
                  <button
                    onClick={resetForm}
                    className="bg-white/20 hover:bg-white/30 cursor-pointer px-4 py-2 rounded-xl transition-colors duration-200"
                  >
                    Create New
                  </button>
                </div>
              </div>

              <div className="grid lg:grid-cols-4 h-[70vh]">
                {/* Template Selector */}
                <div className="lg:col-span-1 border-r border-gray-200 bg-gray-50/50 overflow-y-auto">
                  <div className="p-4">
                    <h3 className="font-semibold text-gray-800 mb-4">
                      Template Styles
                    </h3>
                    <div className="space-y-3">
                      {templates.map((template, index) => (
                        <button
                          key={index}
                          onClick={() => setActiveTemplate(index)}
                          className={`w-full cursor-pointer text-left p-4 rounded-2xl transition-all duration-200 ${
                            activeTemplate === index
                              ? `bg-gradient-to-r ${promptTypes[index]?.color} text-white shadow-lg transform scale-105`
                              : `${promptTypes[index]?.bgColor} hover:shadow-md hover:scale-102`
                          }`}
                        >
                          <div className="flex items-center gap-3 mb-2">
                            <span className="text-2xl">
                              {promptTypes[index]?.icon}
                            </span>
                            <span
                              className={`font-semibold ${
                                activeTemplate === index
                                  ? "text-white"
                                  : promptTypes[index]?.textColor
                              }`}
                            >
                              {promptTypes[index]?.name}
                            </span>
                          </div>
                          <p
                            className={`text-sm ${
                              activeTemplate === index
                                ? "text-white/90"
                                : "text-gray-600"
                            }`}
                          >
                            {template.subject}
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Template Preview */}
                <div className="lg:col-span-3 flex flex-col">
                  <div className="p-4 bg-white border-b border-gray-200 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">
                        {promptTypes[activeTemplate]?.icon}
                      </span>
                      <div>
                        <h3 className="font-semibold text-gray-800">
                          {promptTypes[activeTemplate]?.name}
                        </h3>
                        <p className="text-sm text-gray-600">
                          {templates[activeTemplate]?.subject}
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={copyHtml}
                      className={`inline-flex cursor-pointer items-center gap-2 px-6 py-3 rounded-xl font-semibold transition-all duration-200 ${
                        copied
                          ? "bg-green-100 text-green-700 border-2 border-green-200"
                          : `bg-gradient-to-r ${promptTypes[activeTemplate]?.color} text-white hover:shadow-lg transform hover:scale-105`
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

                  <div className="flex-1 p-4 bg-gray-100">
                    <iframe
                      ref={previewRef}
                      title="Email preview"
                      className="w-full h-full bg-white rounded-2xl shadow-lg border-2 border-gray-200"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="mt-20 py-12 text-center text-gray-500">
          <div className="flex justify-center gap-6 text-sm">
            <span>🚀 Fast Processing</span>
            <span>🎨 Professional Design</span>
            <span>📱 Mobile Responsive</span>
            <span>⚡ AI Powered</span>
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
