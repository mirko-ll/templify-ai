"use client";

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeftIcon,
  PencilIcon,
  TrashIcon,
  ChartBarIcon,
  ClockIcon,
  CheckCircleIcon,
  XCircleIcon,
  ArchiveBoxIcon,
  CommandLineIcon,
  SparklesIcon,
  DocumentDuplicateIcon,
} from '@heroicons/react/24/outline';

interface Prompt {
  id: string;
  name: string;
  description: string | null;
  category: string;
  systemPrompt: string;
  userPrompt: string;
  designEngine: 'CLAUDE' | 'GPT4O';
  templateType?: 'SINGLE_PRODUCT' | 'MULTI_PRODUCT';
  version: string;
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  isDefault: boolean;
  usageCount: number;
  successRate: number | null;
  createdAt: string;
  updatedAt: string;
  lastTestedAt: string | null;
  creator: {
    name: string | null;
    email: string | null;
  };
  recentGenerations: Array<{
    id: string;
    inputUrl: string;
    wasSuccessful: boolean;
    generationTime: number;
    createdAt: string;
    user?: {
      name: string | null;
      email: string | null;
    };
  }>;
}

export default function PromptDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Remove edit functionality - this is now a view-only page

  useEffect(() => {
    const fetchPrompt = async (id: string) => {
      try {
        const response = await fetch(`/api/admin/prompts/${id}`);
        if (response.ok) {
          const data = await response.json();
          setPrompt(data.prompt);
        } else {
          console.error('Failed to fetch prompt');
          router.push('/admin/prompts');
        }
      } catch (error) {
        console.error('Error fetching prompt:', error);
        router.push('/admin/prompts');
      } finally {
        setLoading(false);
      }
    };

    if (params.id) {
      fetchPrompt(params.id as string);
    }
  }, [params.id, router]);


  const handleDelete = async () => {
    if (!prompt || !confirm('Are you sure you want to delete this prompt? This action cannot be undone.')) {
      return;
    }

    try {
      const response = await fetch(`/api/admin/prompts/${prompt.id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        router.push('/admin/prompts');
      } else {
        alert('Failed to delete prompt');
      }
    } catch (error) {
      console.error('Error deleting prompt:', error);
      alert('Failed to delete prompt');
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return <CheckCircleIcon className="w-5 h-5 text-green-500" />;
      case 'DRAFT':
        return <ClockIcon className="w-5 h-5 text-yellow-500" />;
      case 'ARCHIVED':
        return <ArchiveBoxIcon className="w-5 h-5 text-gray-500" />;
      default:
        return <XCircleIcon className="w-5 h-5 text-red-500" />;
    }
  };

  const getEngineIcon = (engine: string) => {
    return engine === 'CLAUDE' ? 
      <CommandLineIcon className="w-5 h-5 text-indigo-600" /> : 
      <SparklesIcon className="w-5 h-5 text-green-600" />;
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
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
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-4">
            <Link
              href="/admin/prompts"
              className="p-3 hover:bg-gray-100 rounded-xl transition-colors duration-200"
            >
              <ArrowLeftIcon className="w-6 h-6 text-gray-600" />
            </Link>
            <div>
              <div className="flex items-center space-x-3 mb-2">
                <h1 className="text-4xl font-bold text-gray-900">{prompt.name}</h1>
                {getStatusIcon(prompt.status)}
                {prompt.isDefault && (
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                    Default Template
                  </span>
                )}
              </div>
              {prompt.description && (
                <p className="text-gray-600 text-lg mb-2">{prompt.description}</p>
              )}
              <div className="flex items-center space-x-4 text-sm text-gray-500">
                <span className="flex items-center space-x-1">
                  {getEngineIcon(prompt.designEngine)}
                  <span>{prompt.designEngine}</span>
                </span>
                <span>•</span>
                <span>{prompt.category}</span>
                <span>•</span>
                <span>v{prompt.version}</span>
                <span>•</span>
                <span>{prompt.usageCount} uses</span>
                {prompt.successRate && (
                  <>
                    <span>•</span>
                    <span>{Math.round(prompt.successRate * 100)}% success rate</span>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <Link
              href={`/admin/prompts/${prompt.id}/edit`}
              className="flex items-center px-4 py-2 text-purple-600 hover:text-purple-800 hover:bg-purple-50 rounded-xl transition-colors duration-200"
            >
              <PencilIcon className="w-5 h-5 mr-2" />
              Edit
            </Link>
            <button
              onClick={handleDelete}
              className="flex items-center px-4 py-2 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-xl transition-colors duration-200"
            >
              <TrashIcon className="w-5 h-5 mr-2" />
              Delete
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-8">
          {/* Prompt Content */}
          <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
            <h2 className="text-2xl font-semibold text-gray-900 mb-6 flex items-center">
              <DocumentDuplicateIcon className="w-6 h-6 text-indigo-600 mr-2" />
              Prompt Configuration
            </h2>
            
            <div className="space-y-6">
              {/* System Prompt Display */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-semibold text-gray-900">System Prompt</h3>
                  <button
                    onClick={() => copyToClipboard(prompt.systemPrompt)}
                    className="p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors duration-200"
                    title="Copy system prompt"
                  >
                    <DocumentDuplicateIcon className="w-4 h-4" />
                  </button>
                </div>
                <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                  <pre className="text-sm text-gray-700 whitespace-pre-wrap font-mono">
                    {prompt.systemPrompt}
                  </pre>
                </div>
              </div>

              {/* User Prompt Display */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-semibold text-gray-900">User Prompt</h3>
                  <button
                    onClick={() => copyToClipboard(prompt.userPrompt)}
                    className="p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors duration-200"
                    title="Copy user prompt"
                  >
                    <DocumentDuplicateIcon className="w-4 h-4" />
                  </button>
                </div>
                <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                  <pre className="text-sm text-gray-700 whitespace-pre-wrap font-mono">
                    {prompt.userPrompt}
                  </pre>
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* Sidebar */}
        <div className="space-y-6">

          {/* Statistics */}
          <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
            <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center">
              <ChartBarIcon className="w-5 h-5 text-indigo-600 mr-2" />
              Statistics
            </h2>
            
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Total Uses</span>
                <span className="font-semibold text-gray-900">{prompt.usageCount}</span>
              </div>
              
              {prompt.successRate && (
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Success Rate</span>
                  <span className="font-semibold text-green-600">
                    {Math.round(prompt.successRate * 100)}%
                  </span>
                </div>
              )}
              
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Status</span>
                <div className="flex items-center space-x-1">
                  {getStatusIcon(prompt.status)}
                  <span className="font-semibold text-gray-900">{prompt.status}</span>
                </div>
              </div>
              
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Engine</span>
                <div className="flex items-center space-x-1">
                  {getEngineIcon(prompt.designEngine)}
                  <span className="font-semibold text-gray-900">{prompt.designEngine}</span>
                </div>
              </div>
              
              {prompt.lastTestedAt && (
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Last Tested</span>
                  <span className="font-semibold text-gray-900">
                    {new Date(prompt.lastTestedAt).toLocaleDateString()}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Meta Information */}
          <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Meta Information</h2>
            
            <div className="space-y-3 text-sm">
              <div>
                <span className="text-gray-500">Created by:</span>
                <p className="font-medium text-gray-900">
                  {prompt.creator.name || prompt.creator.email || 'Unknown'}
                </p>
              </div>
              
              <div>
                <span className="text-gray-500">Created:</span>
                <p className="font-medium text-gray-900">
                  {new Date(prompt.createdAt).toLocaleString()}
                </p>
              </div>
              
              <div>
                <span className="text-gray-500">Last updated:</span>
                <p className="font-medium text-gray-900">
                  {new Date(prompt.updatedAt).toLocaleString()}
                </p>
              </div>
              
              <div>
                <span className="text-gray-500">Version:</span>
                <p className="font-medium text-gray-900">v{prompt.version}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}