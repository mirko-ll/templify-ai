"use client";

import { useState, useRef, useEffect } from "react";
import {
  DocumentDuplicateIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";
import { promptTypes } from "./utils/promptTypes";

interface Template {
  subject: string;
  html: string;
}

interface ProductInfo {
  title: string;
  description: string;
  price: string;
  images: string[];
  bestImageUrl: string;
}

export default function Home() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [productInfo, setProductInfo] = useState<ProductInfo | null>(null);
  const [activeTemplate, setActiveTemplate] = useState(0);
  const [copied, setCopied] = useState(false);
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

    try {
      const response = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      if (!response.ok) {
        throw new Error("Failed to process URL");
      }

      const data = await response.json();

      if (data.productInfo) {
        setProductInfo(data.productInfo);

        if (data.emailTemplates && data.emailTemplates.length > 0) {
          setTemplates(data.emailTemplates);
        } else {
          throw new Error("No email templates were generated");
        }
      } else {
        throw new Error("No product information found");
      }
    } catch (err) {
      console.error(err);
      setError("Failed to process URL. Please try a different product URL.");
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
    <main className="min-h-screen p-6 md:p-12">
      <div className="max-w-7xl mx-auto">
        <div className="mb-12 text-center">
          <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-4">
            Templify AI
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-300">
            Transform product URLs into stunning email templates in seconds
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mb-10">
          <div className="flex flex-col md:flex-row gap-4">
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Enter product URL (e.g., https://netscroll.si/shop/tabletholder/)"
              className="flex-1 p-4 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg shadow-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center">
                  <ArrowPathIcon className="w-5 h-5 mr-2 animate-spin" />
                  Processing...
                </span>
              ) : (
                "Generate Templates"
              )}
            </button>
          </div>
          {error && <p className="mt-2 text-red-500">{error}</p>}
        </form>

        {loading && (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-16 h-16 border-t-4 border-blue-500 border-solid rounded-full animate-spin"></div>
            <p className="mt-4 text-lg">
              Analyzing product and generating templates...
            </p>
          </div>
        )}

        {templates.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl overflow-hidden h-[calc(100vh-320px)]">
            <div className="grid md:grid-cols-5 h-full">
              {/* Template selector sidebar */}
              <div className="md:col-span-1 border-r border-gray-200 dark:border-gray-700 overflow-y-auto">
                <div className="p-4 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                  <h2 className="font-semibold text-lg">Email Templates</h2>
                </div>
                <nav className="p-2">
                  {templates.map((template, index) => (
                    <button
                      key={index}
                      onClick={() => setActiveTemplate(index)}
                      className={`w-full text-left p-3 rounded-lg mb-1 transition-colors ${
                        activeTemplate === index
                          ? "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300"
                          : "hover:bg-gray-100 dark:hover:bg-gray-700"
                      }`}
                    >
                      <div className="font-medium">
                        {promptTypes[index]?.name || `Template ${index + 1}`}
                      </div>
                      <div className="text-sm truncate text-gray-600 dark:text-gray-400">
                        {template.subject}
                      </div>
                    </button>
                  ))}
                </nav>
              </div>

              {/* Template preview */}
              <div className="md:col-span-4 flex flex-col h-full">
                <div className="p-4 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
                  <h2 className="font-semibold text-lg">
                    {templates[activeTemplate]?.subject || "Preview"}
                  </h2>
                  <button
                    onClick={copyHtml}
                    className="inline-flex items-center px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md transition-colors"
                  >
                    <DocumentDuplicateIcon className="w-4 h-4 mr-1" />
                    {copied ? "Copied!" : "Copy HTML"}
                  </button>
                </div>
                <div className="flex-1 p-4 bg-gray-100 dark:bg-gray-900 overflow-hidden">
                  <iframe
                    ref={previewRef}
                    title="Email preview"
                    className="w-full h-full bg-white rounded-lg border border-gray-200 dark:border-gray-700 shadow"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {productInfo && templates.length === 0 && !loading && (
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
            <h2 className="text-xl font-semibold mb-4">
              Product Information Found
            </h2>
            <p>
              We found information about {productInfo.title}, but there was an
              issue generating templates. Please try again.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
