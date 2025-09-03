"use client";

import { useState } from "react";
import {
  PlayIcon,
  CheckCircleIcon,
  XCircleIcon,
  PlusIcon,
  TrashIcon,
  ArrowTopRightOnSquareIcon,
} from "@heroicons/react/24/outline";

interface Prompt {
  id?: string;
  name: string;
  systemPrompt: string;
  userPrompt: string;
  designEngine: "CLAUDE" | "GPT4O";
  templateType: "SINGLE_PRODUCT" | "MULTI_PRODUCT";
}

interface TestResult {
  success: boolean;
  data?: {
    emailTemplate?: {
      html: string;
      subject: string;
    };
    productInfo?: any;
    generationTime?: number;
  } | null;
  error?: string;
}

interface TestPromptProps {
  prompt: Prompt;
  onTestComplete?: (result: TestResult) => void;
}

export default function TestPrompt({
  prompt,
  onTestComplete,
}: TestPromptProps) {
  const isMultiProduct = prompt.templateType === "MULTI_PRODUCT";
  const [urls, setUrls] = useState<string[]>([""]);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  const addUrlInput = () => {
    if (isMultiProduct) {
      setUrls([...urls, ""]);
    }
  };

  const removeUrlInput = (index: number) => {
    if (urls.length > 1 && isMultiProduct) {
      const newUrls = urls.filter((_, i) => i !== index);
      setUrls(newUrls);
    }
  };

  const updateUrl = (index: number, value: string) => {
    const newUrls = [...urls];
    newUrls[index] = value;
    setUrls(newUrls);
  };

  const handleTest = async () => {
    // Reset previous results
    setTestResult(null);

    // Filter out empty URLs and validate
    const validUrls = urls.filter((url) => url.trim() !== "");

    // Validation - show UI error only, no API call
    if (validUrls.length === 0) {
      const errorResult = {
        success: false,
        error: "Please enter at least one URL",
      };
      setTestResult(errorResult);
      onTestComplete?.(errorResult);
      return; // Early return - no API call made
    }

    // Validate URL format
    const invalidUrls = validUrls.filter((url) => {
      try {
        new URL(url);
        return false;
      } catch {
        return true;
      }
    });

    if (invalidUrls.length > 0) {
      const errorResult = {
        success: false,
        error: "Please enter valid URLs (e.g., https://example.com)",
      };
      setTestResult(errorResult);
      onTestComplete?.(errorResult);
      return; // Early return - no API call made
    }

    // All validation passed, proceed with API call
    setTesting(true);

    try {
      // Create template object similar to how the main app does it
      const templateType = {
        name: prompt.name,
        description: `Test template: ${prompt.name}`,
        system: prompt.systemPrompt,
        user: prompt.userPrompt,
        designEngine: prompt.designEngine,
      };

      const requestBody = {
        url: validUrls.length === 1 ? validUrls[0] : validUrls,
        templateType,
        isTest: true, // Flag to indicate this is a test request from create/edit pages
      };

      const response = await fetch("/api/scrape", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();

      const result: TestResult = {
        success: response.ok,
        data: response.ok ? data : null,
        error: response.ok ? null : data.error,
      };

      setTestResult(result);
      onTestComplete?.(result);
    } catch (error: unknown) {
      const errorResult = {
        success: false,
        data: null,
        error: (error as Error).message || "Failed to test prompt",
      };
      setTestResult(errorResult);
      onTestComplete?.(errorResult);
    } finally {
      setTesting(false);
    }
  };

  const openPreview = () => {
    if (testResult?.success && testResult.data?.emailTemplate?.html) {
      const newWindow = window.open("", "_blank");
      if (newWindow) {
        newWindow.document.write(testResult.data.emailTemplate.html);
        newWindow.document.close();
      }
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
      <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center">
        <PlayIcon className="w-5 h-5 text-green-600 mr-2" />
        Test Prompt
      </h2>

      <div className="space-y-4">
        <div>
          <div className="flex items-center justify-between mb-3">
            <label className="block text-sm font-medium text-gray-700">
              Test URL{isMultiProduct || urls.length > 1 ? "s" : ""}
            </label>
            <span className="text-xs text-gray-500">
              {isMultiProduct
                ? "Multi-product template"
                : "Single-product template"}
            </span>
          </div>

          <div className="space-y-2">
            {urls.map((url, index) => (
              <div key={index} className="flex space-x-2">
                <input
                  type="url"
                  value={url}
                  onChange={(e) => updateUrl(index, e.target.value)}
                  placeholder={`https://example.com/product${
                    urls.length > 1 ? `-${index + 1}` : ""
                  }`}
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
                />
                {urls.length > 1 && isMultiProduct && (
                  <button
                    type="button"
                    onClick={() => removeUrlInput(index)}
                    className="px-3 py-2 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg transition-colors duration-200"
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>

          {isMultiProduct && urls.length < 5 && (
            <button
              type="button"
              onClick={addUrlInput}
              className="mt-2 flex items-center text-sm text-purple-600 hover:text-purple-800"
            >
              <PlusIcon className="w-4 h-4 mr-1" />
              Add another URL
            </button>
          )}
        </div>

        <div className="space-y-3">
          <button
            type="button"
            onClick={handleTest}
            disabled={testing}
            className="w-full flex cursor-pointer items-center justify-center px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {testing ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
            ) : (
              <>
                <PlayIcon className="w-4 h-4 mr-2" />
                Test Prompt
              </>
            )}
          </button>

          {/* Test Status and Preview Button */}
          {testResult && (
            <div className="pt-3 border-t border-gray-200">
              {testResult.success ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2 text-green-600">
                      <CheckCircleIcon className="w-4 h-4" />
                      <span className="text-sm font-medium">
                        Test Successful
                      </span>
                    </div>
                    {testResult.data?.generationTime && (
                      <span className="text-xs text-gray-500">
                        {testResult.data.generationTime}ms
                      </span>
                    )}
                  </div>

                  {testResult.data?.emailTemplate && (
                    <button
                      type="button"
                      onClick={openPreview}
                      className="w-full flex cursor-pointer items-center justify-center px-4 py-2 border border-purple-200 text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-lg transition-colors duration-200"
                    >
                      <ArrowTopRightOnSquareIcon className="w-4 h-4 mr-2" />
                      Open Preview
                    </button>
                  )}

                  {testResult.data?.emailTemplate?.subject && (
                    <div className="text-xs text-gray-600">
                      <span className="font-medium">Subject:</span>{" "}
                      {testResult.data.emailTemplate.subject}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center space-x-2 text-red-600">
                    <XCircleIcon className="w-4 h-4" />
                    <span className="text-sm font-medium">Test Failed</span>
                  </div>
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                    <p className="text-xs text-red-700">{testResult.error}</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
