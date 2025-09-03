"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import {
  PlusIcon,
  MagnifyingGlassIcon,
  EyeIcon,
  PencilIcon,
  TrashIcon,
  CommandLineIcon,
  SparklesIcon,
  ClockIcon,
  CheckCircleIcon,
  XCircleIcon,
  ArchiveBoxIcon,
} from "@heroicons/react/24/outline";
import CustomSelect from "@/components/ui/custom-select";

interface Prompt {
  id: string;
  name: string;
  description: string | null;
  color: string;
  designEngine: "CLAUDE" | "GPT4O";
  templateType: "SINGLE_PRODUCT" | "MULTI_PRODUCT";
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  isDefault: boolean;
  version: string;
  usageCount: number;
  successRate: number | null;
  createdAt: string;
  updatedAt: string;
  lastTestedAt: string | null;
  creator: {
    name: string | null;
    email: string | null;
  };
}

export default function AdminPromptsPage() {
  const {} = useSession();
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterEngine, setFilterEngine] = useState("all");
  const [filterTemplateType, setFilterTemplateType] = useState("all");
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(9); // Fixed at 9 items per page

  useEffect(() => {
    fetchPrompts();
  }, []);

  const fetchPrompts = async () => {
    try {
      const response = await fetch("/api/admin/prompts");
      if (response.ok) {
        const data = await response.json();
        setPrompts(data.prompts);
      }
    } catch (error) {
      console.error("Failed to fetch prompts:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (promptId: string, promptName: string) => {
    // Show confirmation dialog
    if (
      !confirm(
        `Are you sure you want to delete "${promptName}"? This action cannot be undone.`
      )
    ) {
      return;
    }

    // Add to deleting set
    setDeletingIds((prev) => new Set(prev).add(promptId));

    try {
      const response = await fetch(`/api/admin/prompts/${promptId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        // Remove the prompt from the local state
        setPrompts(prompts.filter((prompt) => prompt.id !== promptId));
      } else {
        const error = await response.json();
        alert(`Failed to delete prompt: ${error.error}`);
      }
    } catch (error) {
      console.error("Error deleting prompt:", error);
      alert("An error occurred while deleting the prompt");
    } finally {
      // Remove from deleting set
      setDeletingIds((prev) => {
        const newSet = new Set(prev);
        newSet.delete(promptId);
        return newSet;
      });
    }
  };

  const filteredPrompts = prompts.filter((prompt) => {
    const matchesSearch =
      prompt.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      prompt.description?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus =
      filterStatus === "all" || prompt.status === filterStatus;
    const matchesEngine =
      filterEngine === "all" || prompt.designEngine === filterEngine;
    const matchesTemplateType =
      filterTemplateType === "all" ||
      prompt.templateType === filterTemplateType;

    return (
      matchesSearch && matchesStatus && matchesEngine && matchesTemplateType
    );
  });

  // Pagination logic
  const totalItems = filteredPrompts.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedPrompts = filteredPrompts.slice(startIndex, endIndex);

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterStatus, filterEngine, filterTemplateType]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "ACTIVE":
        return <CheckCircleIcon className="w-4 h-4 text-green-500" />;
      case "DRAFT":
        return <ClockIcon className="w-4 h-4 text-yellow-500" />;
      case "ARCHIVED":
        return <ArchiveBoxIcon className="w-4 h-4 text-gray-500" />;
      default:
        return <XCircleIcon className="w-4 h-4 text-red-500" />;
    }
  };

  const getEngineIcon = (engine: string) => {
    return engine === "CLAUDE" ? (
      <CommandLineIcon className="w-4 h-4 text-indigo-600" />
    ) : (
      <SparklesIcon className="w-4 h-4 text-green-600" />
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="bg-white rounded-2xl shadow-xl p-8 border border-gray-100">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center space-x-4">
            <div className="w-16 h-16 bg-gradient-to-r from-purple-500 to-pink-500 rounded-2xl flex items-center justify-center shadow-lg">
              <CommandLineIcon className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
                Prompt Generator
              </h1>
              <p className="text-gray-600 text-lg mt-1">
                Manage AI prompts and templates
              </p>
            </div>
          </div>
          <div className="mt-6 lg:mt-0">
            <Link
              href="/admin/prompts/create"
              className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-bold py-3 px-6 rounded-2xl shadow-xl hover:shadow-2xl transition-all duration-300 transform hover:scale-105 flex items-center space-x-2"
            >
              <PlusIcon className="w-5 h-5" />
              <span>Create Prompt</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Total Prompts</p>
              <p className="text-3xl font-bold text-gray-900">
                {prompts.length}
              </p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
              <CommandLineIcon className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">
                Active Prompts
              </p>
              <p className="text-3xl font-bold text-green-600">
                {prompts.filter((p) => p.status === "ACTIVE").length}
              </p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
              <CheckCircleIcon className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">
                Claude Templates
              </p>
              <p className="text-3xl font-bold text-indigo-600">
                {prompts.filter((p) => p.designEngine === "CLAUDE").length}
              </p>
            </div>
            <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center">
              <CommandLineIcon className="w-6 h-6 text-indigo-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">
                GPT-4o Templates
              </p>
              <p className="text-3xl font-bold text-green-600">
                {prompts.filter((p) => p.designEngine === "GPT4O").length}
              </p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
              <SparklesIcon className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
        <div className="flex flex-col space-y-4">
          {/* Search */}
          <div className="relative">
            <MagnifyingGlassIcon className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search prompts by name or description..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-4 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-purple-500 focus:border-transparent text-gray-900 placeholder-gray-500 bg-white text-lg"
            />
          </div>

          {/* Filter Pills */}
          <div className="flex flex-wrap gap-3">
            {/* Status Filter */}
            <CustomSelect
              options={[
                { value: "all", label: "All Status", emoji: "📊" },
                { value: "ACTIVE", label: "Active", emoji: "✅" },
                { value: "DRAFT", label: "Draft", emoji: "📝" },
                { value: "ARCHIVED", label: "Archived", emoji: "📦" },
              ]}
              value={filterStatus}
              onChange={setFilterStatus}
              gradientFrom="blue-50"
              gradientTo="indigo-50"
              borderColor="blue-200"
              textColor="blue-800"
              hoverFrom="blue-100"
              hoverTo="indigo-100"
            />

            {/* Engine Filter */}
            <CustomSelect
              options={[
                { value: "all", label: "All Engines", emoji: "🤖" },
                { value: "CLAUDE", label: "Claude", emoji: "⚡" },
                { value: "GPT4O", label: "GPT-4o", emoji: "✨" },
              ]}
              value={filterEngine}
              onChange={setFilterEngine}
              gradientFrom="purple-50"
              gradientTo="pink-50"
              borderColor="purple-200"
              textColor="red-800"
              hoverFrom="purple-100"
              hoverTo="pink-100"
            />

            {/* Template Type Filter */}
            <CustomSelect
              options={[
                { value: "all", label: "All Types", emoji: "🏷️" },
                {
                  value: "SINGLE_PRODUCT",
                  label: "Single Product",
                  emoji: "🔗",
                },
                { value: "MULTI_PRODUCT", label: "Multi Product", emoji: "🛒" },
              ]}
              value={filterTemplateType}
              onChange={setFilterTemplateType}
              gradientFrom="green-50"
              gradientTo="emerald-50"
              borderColor="green-200"
              textColor="green-800"
              hoverFrom="green-100"
              hoverTo="emerald-100"
            />

            {/* Clear Filters */}
            {(searchTerm ||
              filterStatus !== "all" ||
              filterEngine !== "all" ||
              filterTemplateType !== "all") && (
              <button
                onClick={() => {
                  setSearchTerm("");
                  setFilterStatus("all");
                  setFilterEngine("all");
                  setFilterTemplateType("all");
                }}
                className="bg-gradient-to-r from-gray-100 to-gray-200 border border-gray-300 text-gray-700 px-4 py-2 rounded-full font-medium cursor-pointer hover:from-gray-200 hover:to-gray-300 transition-all duration-200 flex items-center space-x-2"
              >
                <span>🗑️</span>
                <span>Clear All</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Prompts Table */}
      <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gradient-to-r from-purple-50 to-pink-50">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  Prompt
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  Color
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  Engine
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  Usage
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {paginatedPrompts.map((prompt) => (
                <tr
                  key={prompt.id}
                  className="hover:bg-gray-50 transition-colors duration-200"
                >
                  <td className="px-6 py-4">
                    <div className="flex items-start space-x-3">
                      <div>
                        <div className="flex items-center space-x-2">
                          <h3 className="text-sm font-semibold text-gray-900">
                            {prompt.name}
                          </h3>
                          {prompt.isDefault && (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                              Default
                            </span>
                          )}
                        </div>
                        {prompt.description && (
                          <p className="text-sm text-gray-500 mt-1 max-w-xs truncate">
                            {prompt.description}
                          </p>
                        )}
                        <p className="text-xs text-gray-400 mt-1">
                          v{prompt.version}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center space-x-2">
                      <div
                        className="w-6 h-6 rounded-full border border-gray-200"
                        style={{ backgroundColor: prompt.color }}
                      ></div>
                      <span className="text-sm text-gray-600 font-mono">
                        {prompt.color}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center space-x-2">
                      {getEngineIcon(prompt.designEngine)}
                      <span className="text-sm text-gray-600">
                        {prompt.designEngine}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center space-x-2">
                      {getStatusIcon(prompt.status)}
                      <span className="text-sm text-gray-600">
                        {prompt.status}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {prompt.usageCount} uses
                      </p>
                      {prompt.successRate !== null && (
                        <p className="text-xs text-gray-500">
                          {Math.round(prompt.successRate * 100)}% success
                        </p>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center space-x-2">
                      <Link
                        href={`/admin/prompts/${prompt.id}`}
                        className="p-2 text-indigo-600 hover:text-indigo-900 hover:bg-indigo-50 rounded-lg transition-colors duration-200"
                        title="View"
                      >
                        <EyeIcon className="w-4 h-4" />
                      </Link>
                      <Link
                        href={`/admin/prompts/${prompt.id}/edit`}
                        className="p-2 text-purple-600 hover:text-purple-900 hover:bg-purple-50 rounded-lg transition-colors duration-200"
                        title="Edit"
                      >
                        <PencilIcon className="w-4 h-4" />
                      </Link>
                      <button
                        onClick={() => handleDelete(prompt.id, prompt.name)}
                        disabled={deletingIds.has(prompt.id)}
                        className="p-2 text-red-600 hover:text-red-900 hover:bg-red-50 rounded-lg transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                        title="Delete"
                      >
                        {deletingIds.has(prompt.id) ? (
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-600"></div>
                        ) : (
                          <TrashIcon className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalItems === 0 && (
          <div className="text-center py-12">
            <CommandLineIcon className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">
              No prompts found
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              {searchTerm || filterStatus !== "all" || filterEngine !== "all"
                ? "Try adjusting your filters."
                : "Get started by creating a new prompt."}
            </p>
            {!searchTerm &&
              filterStatus === "all" &&
              filterEngine === "all" && (
                <div className="mt-6">
                  <Link
                    href="/admin/prompts/create"
                    className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
                  >
                    <PlusIcon className="-ml-1 mr-2 h-5 w-5" />
                    Create Prompt
                  </Link>
                </div>
              )}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="border-t border-gray-200 px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center text-sm text-gray-500">
                <span>
                  Showing {startIndex + 1} to {Math.min(endIndex, totalItems)}{" "}
                  of {totalItems} results
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                  disabled={currentPage === 1}
                  className={`px-3 py-2 text-sm font-medium rounded-md ${
                    currentPage === 1
                      ? "text-gray-400 cursor-not-allowed"
                      : "text-gray-700 bg-white border border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  Previous
                </button>

                {/* Page numbers */}
                <div className="flex items-center space-x-1">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                    (page) => {
                      if (
                        page === 1 ||
                        page === totalPages ||
                        (page >= currentPage - 2 && page <= currentPage + 2)
                      ) {
                        return (
                          <button
                            key={page}
                            onClick={() => setCurrentPage(page)}
                            className={`px-3 py-2 text-sm font-medium rounded-md ${
                              page === currentPage
                                ? "bg-gradient-to-r from-purple-600 to-pink-600 text-white"
                                : "text-gray-700 bg-white border border-gray-300 hover:bg-gray-50"
                            }`}
                          >
                            {page}
                          </button>
                        );
                      } else if (
                        page === currentPage - 3 ||
                        page === currentPage + 3
                      ) {
                        return (
                          <span
                            key={page}
                            className="px-2 py-2 text-sm text-gray-400"
                          >
                            ...
                          </span>
                        );
                      }
                      return null;
                    }
                  )}
                </div>

                <button
                  onClick={() =>
                    setCurrentPage(Math.min(totalPages, currentPage + 1))
                  }
                  disabled={currentPage === totalPages}
                  className={`px-3 py-2 text-sm font-medium rounded-md ${
                    currentPage === totalPages
                      ? "text-gray-400 cursor-not-allowed"
                      : "text-gray-700 bg-white border border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
