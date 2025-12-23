"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeftIcon,
  SparklesIcon,
  CommandLineIcon,
  DocumentPlusIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";
import CustomSelect from "@/components/ui/custom-select";
import TestPrompt from "@/components/ui/test-prompt";

export default function CreatePromptPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    color: "#6366f1",
    systemPrompt: "",
    userPrompt: "",
    designEngine: "CLAUDE",
    templateType: "SINGLE_PRODUCT",
    status: "DRAFT",
    isDefault: false,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch("/api/admin/prompts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        const data = await response.json();
        router.push(`/admin/prompts/${data.prompt.id}`);
      } else {
        const error = await response.json();
        alert(error.message || "Failed to create prompt");
      }
    } catch (error) {
      console.error("Error creating prompt:", error);
      alert("Failed to create prompt");
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: string, value: string | boolean) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="bg-white rounded-2xl shadow-xl p-8 border border-gray-100">
        <div className="flex items-center space-x-4">
          <Link
            href="/admin/prompts"
            className="p-3 hover:bg-gray-100 rounded-xl transition-colors duration-200"
          >
            <ArrowLeftIcon className="w-6 h-6 text-gray-600" />
          </Link>
          <div className="flex items-center space-x-4">
            <div className="w-16 h-16 bg-gradient-to-r from-purple-500 to-pink-500 rounded-2xl flex items-center justify-center shadow-lg">
              <SparklesIcon className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
                Create New Prompt
              </h1>
              <p className="text-gray-600 text-lg mt-1">
                Design a new AI prompt template
              </p>
            </div>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Form Content */}
          <div className="lg:col-span-2 space-y-8">
            {/* Basic Information */}
            <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
              <h2 className="text-xl font-semibold text-gray-900 mb-6 flex items-center">
                <CheckCircleIcon className="w-6 h-6 text-green-500 mr-2" />
                Basic Information
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Prompt Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => handleInputChange("name", e.target.value)}
                    placeholder="e.g., Professional Email Template"
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent text-gray-900 placeholder-gray-500 bg-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Template Color *
                  </label>
                  <div className="flex items-center space-x-3">
                    <input
                      type="color"
                      value={formData.color}
                      onChange={(e) =>
                        handleInputChange("color", e.target.value)
                      }
                      className="w-12 h-12 rounded-lg border border-gray-200 cursor-pointer"
                    />
                    <input
                      type="text"
                      value={formData.color}
                      onChange={(e) =>
                        handleInputChange("color", e.target.value)
                      }
                      placeholder="#6366f1"
                      className="flex-1 px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent font-mono text-gray-900 placeholder-gray-500 bg-white"
                    />
                  </div>
                </div>
              </div>

              <div className="mt-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) =>
                    handleInputChange("description", e.target.value)
                  }
                  placeholder="Brief description of this prompt template..."
                  rows={3}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent text-gray-900 bg-white"
                />
              </div>
            </div>

            {/* AI Configuration */}
            <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
              <h2 className="text-xl font-semibold text-gray-900 mb-6 flex items-center">
                <CommandLineIcon className="w-6 h-6 text-indigo-500 mr-2" />
                AI Configuration
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Design Engine
                  </label>
                  <CustomSelect
                    options={[
                      {
                        value: "CLAUDE",
                        label: "Claude Sonnet-4",
                        emoji: "⚡",
                      },
                      { value: "GPT4O", label: "GPT-4o", emoji: "✨" },
                    ]}
                    value={formData.designEngine}
                    onChange={(value) =>
                      handleInputChange("designEngine", value)
                    }
                    gradientFrom="purple-50"
                    gradientTo="pink-50"
                    borderColor="purple-200"
                    textColor="red-800"
                    hoverFrom="purple-100"
                    hoverTo="pink-100"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Template Type
                  </label>
                  <CustomSelect
                    options={[
                      {
                        value: "SINGLE_PRODUCT",
                        label: "Single Product",
                        emoji: "🔗",
                      },
                      {
                        value: "MULTI_PRODUCT",
                        label: "Multi Product",
                        emoji: "🛒",
                      },
                    ]}
                    value={formData.templateType}
                    onChange={(value) =>
                      handleInputChange("templateType", value)
                    }
                    gradientFrom="green-50"
                    gradientTo="emerald-50"
                    borderColor="green-200"
                    textColor="green-800"
                    hoverFrom="green-100"
                    hoverTo="emerald-100"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Status
                  </label>
                  <CustomSelect
                    options={[
                      { value: "DRAFT", label: "Draft", emoji: "📝" },
                      { value: "ACTIVE", label: "Active", emoji: "✅" },
                      { value: "ARCHIVED", label: "Archived", emoji: "📦" },
                    ]}
                    value={formData.status}
                    onChange={(value) => handleInputChange("status", value)}
                    gradientFrom="blue-50"
                    gradientTo="indigo-50"
                    borderColor="blue-200"
                    textColor="blue-800"
                    hoverFrom="blue-100"
                    hoverTo="indigo-100"
                  />
                </div>
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="isDefault"
                  checked={formData.isDefault}
                  onChange={(e) =>
                    handleInputChange("isDefault", e.target.checked)
                  }
                  className="mr-3 text-purple-600 focus:ring-purple-500 rounded"
                />
                <label
                  htmlFor="isDefault"
                  className="text-sm font-medium text-gray-700"
                >
                  Set as default template
                </label>
              </div>
            </div>

            {/* Prompts */}
            <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
              <h2 className="text-xl font-semibold text-gray-900 mb-6 flex items-center">
                <SparklesIcon className="w-6 h-6 text-purple-500 mr-2" />
                AI Prompts
              </h2>

              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    System Prompt *
                  </label>
                  <p className="text-xs text-gray-500 mb-3">
                    This defines the AI&apos;s role and behavior. Be specific
                    about expertise and approach.
                  </p>
                  <textarea
                    required
                    value={formData.systemPrompt}
                    onChange={(e) =>
                      handleInputChange("systemPrompt", e.target.value)
                    }
                    placeholder="You are a strategic email marketing expert specializing in..."
                    rows={4}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent font-mono text-sm text-gray-900 placeholder-gray-500 bg-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    User Prompt *
                  </label>
                  <p className="text-xs text-gray-500 mb-3">
                    This is the instruction for the AI. Use variables like{" "}
                    {`{{product_name}}`}, {`{{image_url}}`}, etc.
                  </p>
                  <textarea
                    required
                    value={formData.userPrompt}
                    onChange={(e) =>
                      handleInputChange("userPrompt", e.target.value)
                    }
                    placeholder="Create an HTML email template for {{product_name}}..."
                    rows={8}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent font-mono text-sm text-gray-900 placeholder-gray-500 bg-white"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-1 space-y-6">
            {/* Actions */}
            <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100 sticky top-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Actions
              </h3>

              <div className="space-y-3">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full cursor-pointer flex items-center justify-center px-4 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  ) : (
                    <>
                      <DocumentPlusIcon className="w-5 h-5 mr-2" />
                      Create Prompt
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Help */}
            <div className="bg-gradient-to-br from-yellow-50 to-orange-50 rounded-2xl shadow-lg p-6 border border-yellow-200">
              <div className="flex items-center mb-3">
                <ExclamationTriangleIcon className="w-6 h-6 text-yellow-600 mr-2" />
                <h3 className="text-lg font-semibold text-yellow-800">
                  Quick Tips
                </h3>
              </div>

              <div className="space-y-3 text-sm text-yellow-700">
                <p>• Use clear, specific instructions in your prompts</p>
                <p>• Include variable placeholders like {`{{product_name}}`}</p>
                <p>• Test your prompts before setting them as active</p>
                <p>• Consider your target audience and use case</p>
              </div>
            </div>

            {/* Available Variables */}
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl shadow-lg p-6 border border-blue-200">
              <h3 className="text-lg font-semibold text-blue-800 mb-3">
                Available Variables
                <span className="ml-2 text-sm font-normal">
                  (
                  {formData.templateType === "MULTI_PRODUCT"
                    ? "Multi-Product"
                    : "Single Product"}
                  )
                </span>
              </h3>

              <div className="space-y-2 text-sm">
                <div className="flex flex-col space-y-1">
                  {formData.templateType === "MULTI_PRODUCT" ? (
                    // Multi-Product Variables
                    <>
                      <code className="text-blue-700 bg-blue-100 px-2 py-1 rounded">
                        {`{{product_names}}`}
                      </code>
                      <span className="text-xs text-blue-600 ml-1">
                        Multiple product names
                      </span>

                      <code className="text-blue-700 bg-blue-100 px-2 py-1 rounded">
                        {`{{product_links}}`}
                      </code>
                      <span className="text-xs text-blue-600 ml-1">
                        Multiple product URLs
                      </span>

                      <code className="text-blue-700 bg-blue-100 px-2 py-1 rounded">
                        {`{{product_images}}`}
                      </code>
                      <span className="text-xs text-blue-600 ml-1">
                        Multiple product images
                      </span>

                      <code className="text-blue-700 bg-blue-100 px-2 py-1 rounded">
                        {`{{product_prices}}`}
                      </code>
                      <span className="text-xs text-blue-600 ml-1">
                        Multiple product prices
                      </span>
                    </>
                  ) : (
                    // Single Product Variables
                    <>
                      <code className="text-blue-700 bg-blue-100 px-2 py-1 rounded">
                        {`{{product_name}}`}
                      </code>
                      <span className="text-xs text-blue-600 ml-1">
                        Single product name
                      </span>

                      <code className="text-blue-700 bg-blue-100 px-2 py-1 rounded">
                        {`{{image_url}}`}
                      </code>
                      <span className="text-xs text-blue-600 ml-1">
                        Product image URL
                      </span>

                      <code className="text-blue-700 bg-blue-100 px-2 py-1 rounded">
                        {`{{product_link}}`}
                      </code>
                      <span className="text-xs text-blue-600 ml-1">
                        Product page URL
                      </span>

                      <code className="text-blue-700 bg-blue-100 px-2 py-1 rounded">
                        {`{{regular_price}}`}
                      </code>
                      <span className="text-xs text-blue-600 ml-1">
                        Original price
                      </span>

                      <code className="text-blue-700 bg-blue-100 px-2 py-1 rounded">
                        {`{{sale_price}}`}
                      </code>
                      <span className="text-xs text-blue-600 ml-1">
                        Sale price
                      </span>

                      <code className="text-blue-700 bg-blue-100 px-2 py-1 rounded">
                        {`{{discount}}`}
                      </code>
                      <span className="text-xs text-blue-600 ml-1">
                        Discount percentage
                      </span>
                    </>
                  )}

                  {/* Common Variables */}
                  <div className="border-t border-blue-200 pt-2 mt-3">
                    <p className="text-xs text-blue-600 font-medium mb-1">
                      Common Variables:
                    </p>
                    <code className="text-blue-700 bg-blue-100 px-2 py-1 rounded">
                      {`{{email_address}}`}
                    </code>
                    <span className="text-xs text-blue-600 ml-1">
                      User&apos;s email
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Test Prompt */}
            {formData.name && formData.systemPrompt && formData.userPrompt && (
              <TestPrompt
                key={`${formData.designEngine}-${formData.templateType}`}
                prompt={{
                  name: formData.name,
                  systemPrompt: formData.systemPrompt,
                  userPrompt: formData.userPrompt,
                  designEngine: formData.designEngine as "CLAUDE" | "GPT4O",
                  templateType: formData.templateType as
                    | "SINGLE_PRODUCT"
                    | "MULTI_PRODUCT",
                }}
                onTestComplete={() => {}}
              />
            )}
          </div>
        </div>
      </form>

      {/* Preview Modal */}
      {showPreview && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl max-h-[90vh] overflow-auto m-4">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-900">
                  Prompt Preview
                </h2>
                <button
                  onClick={() => setShowPreview(false)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors duration-200"
                >
                  ×
                </button>
              </div>
            </div>
            <div className="p-6 space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">
                  System Prompt
                </h3>
                <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                  <pre className="text-sm text-gray-700 whitespace-pre-wrap font-mono">
                    {formData.systemPrompt || "No system prompt defined"}
                  </pre>
                </div>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">
                  User Prompt
                </h3>
                <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                  <pre className="text-sm text-gray-700 whitespace-pre-wrap font-mono">
                    {formData.userPrompt || "No user prompt defined"}
                  </pre>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
