"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeftIcon,
  CheckCircleIcon,
  DocumentPlusIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";
import CustomSelect from "@/components/ui/custom-select";
import TestPrompt from "@/components/ui/test-prompt";

interface Prompt {
  id: string;
  name: string;
  description: string | null;
  systemPrompt: string;
  userPrompt: string;
  designEngine: "CLAUDE" | "GPT4O";
  templateType?: "SINGLE_PRODUCT" | "MULTI_PRODUCT";
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  isDefault: boolean;
  version: string;
}

export default function EditPromptPage() {
  const params = useParams();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    systemPrompt: "",
    userPrompt: "",
    designEngine: "CLAUDE" as "CLAUDE" | "GPT4O",
    templateType: "SINGLE_PRODUCT" as "SINGLE_PRODUCT" | "MULTI_PRODUCT",
    status: "DRAFT" as "DRAFT" | "ACTIVE" | "ARCHIVED",
    isDefault: false,
  });

  useEffect(() => {
    if (params.id) {
      fetchPrompt(params.id as string);
    }
  }, [params.id]);

  const fetchPrompt = async (id: string) => {
    try {
      const response = await fetch(`/api/admin/prompts/${id}`);
      if (response.ok) {
        const data = await response.json();
        setPrompt(data.prompt);
        setFormData({
          name: data.prompt.name,
          description: data.prompt.description || "",
          systemPrompt: data.prompt.systemPrompt,
          userPrompt: data.prompt.userPrompt,
          designEngine: data.prompt.designEngine,
          templateType: data.prompt.templateType || "SINGLE_PRODUCT",
          status: data.prompt.status,
          isDefault: data.prompt.isDefault,
        });
      } else {
        console.error("Failed to fetch prompt");
        router.push("/admin/prompts");
      }
    } catch (error) {
      console.error("Error fetching prompt:", error);
      router.push("/admin/prompts");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt) return;

    setSaving(true);
    try {
      const response = await fetch(`/api/admin/prompts/${prompt.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        router.push(`/admin/prompts/${prompt.id}`);
      } else {
        const error = await response.json();
        alert(error.message || "Failed to update prompt");
      }
    } catch (error) {
      console.error("Error updating prompt:", error);
      alert("Failed to update prompt");
    } finally {
      setSaving(false);
    }
  };

  const handleInputChange = (field: string, value: string | boolean) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (!prompt) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Prompt not found</p>
      </div>
    );
  }

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
              <DocumentPlusIcon className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
                Edit Prompt
              </h1>
              <p className="text-gray-600 text-lg mt-1">
                Update prompt configuration and content
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Edit Form */}
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
                    Description
                  </label>
                  <input
                    type="text"
                    value={formData.description}
                    onChange={(e) =>
                      handleInputChange("description", e.target.value)
                    }
                    placeholder="Brief description of this prompt template..."
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent text-gray-900 placeholder-gray-500 bg-white"
                  />
                </div>
              </div>
            </div>

            {/* AI Configuration */}
            <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
              <h2 className="text-xl font-semibold text-gray-900 mb-6 flex items-center">
                <DocumentPlusIcon className="w-6 h-6 text-indigo-500 mr-2" />
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
            </div>

            {/* Prompts */}
            <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
              <h2 className="text-xl font-semibold text-gray-900 mb-6 flex items-center">
                <DocumentPlusIcon className="w-6 h-6 text-purple-500 mr-2" />
                Prompt Configuration
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
                  disabled={saving}
                  className="w-full flex cursor-pointer items-center justify-center px-4 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? (
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  ) : (
                    <>
                      <CheckCircleIcon className="w-5 h-5 mr-2" />
                      Update Prompt
                    </>
                  )}
                </button>

                <Link
                  href="/admin/prompts"
                  className="w-full flex items-center justify-center px-4 py-3 border border-gray-200 text-gray-700 bg-white hover:bg-gray-50 rounded-xl transition-colors duration-200"
                >
                  Cancel
                </Link>
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

            {/* Test Prompt */}
            {formData.name && formData.systemPrompt && formData.userPrompt && (
              <TestPrompt
                key={`${formData.designEngine}-${formData.templateType}`}
                prompt={{
                  name: formData.name,
                  systemPrompt: formData.systemPrompt,
                  userPrompt: formData.userPrompt,
                  designEngine: formData.designEngine,
                  templateType: formData.templateType,
                }}
                onTestComplete={(result) => {
                  if (result.success) {
                    console.log("Test completed successfully!", result);
                  } else {
                    // Don't log validation errors as console errors, only API/system errors
                    if (
                      result.error?.includes("URL") ||
                      result.error?.includes("valid")
                    ) {
                      // This is a validation error, just log as info
                      console.log("Validation error:", result.error);
                    } else {
                      // This is a real API/system error
                      console.error("Test failed:", result.error);
                    }
                  }
                }}
              />
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
