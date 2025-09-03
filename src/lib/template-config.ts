// Server-side template configuration
// This file contains static template configuration data that can be shared
// between server and client components without including in the client bundle

import React from 'react';
import { SparklesIcon, PaintBrushIcon, ChartBarIcon, DocumentTextIcon, StarIcon, RocketLaunchIcon, PencilIcon, NewspaperIcon, ShoppingBagIcon } from '@heroicons/react/24/outline';

interface TemplateConfig {
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bgColor: string;
  textColor: string;
}

export const templateUIConfig: Record<string, TemplateConfig> = {
  'Professional': {
    icon: PaintBrushIcon,
    color: "from-blue-500 to-indigo-600",
    bgColor: "#3b82f6",
    textColor: "text-blue-700",
  },
  'Promotional': {
    icon: SparklesIcon,
    color: "from-red-500 to-pink-600",
    bgColor: "#ef4444",
    textColor: "text-red-700",
  },
  'Landing Page': {
    icon: ChartBarIcon,
    color: "from-orange-500 to-red-600",
    bgColor: "#f97316",
    textColor: "text-orange-700",
  },
  'Minimal': {
    icon: DocumentTextIcon,
    color: "from-gray-500 to-slate-600",
    bgColor: "#6b7280",
    textColor: "text-gray-700",
  },
  'Elegant & Sophisticated': {
    icon: StarIcon,
    color: "from-amber-700 to-stone-800",
    bgColor: "#d97706",
    textColor: "text-amber-800",
  },
  'Modern & Sleek': {
    icon: RocketLaunchIcon,
    color: "from-emerald-500 to-teal-600",
    bgColor: "#10b981",
    textColor: "text-emerald-700",
  },
  'Text-Only': {
    icon: PencilIcon,
    color: "from-indigo-500 to-violet-600",
    bgColor: "#6366f1",
    textColor: "text-indigo-700",
  },
  'Blog': {
    icon: NewspaperIcon,
    color: "from-cyan-500 to-blue-600",
    bgColor: "#06b6d4",
    textColor: "text-cyan-700",
  },
  'Multi-Product Landing': {
    icon: ShoppingBagIcon,
    color: "from-purple-500 to-pink-600",
    bgColor: "#a855f7",
    textColor: "text-purple-700",
  },
  default: {
    icon: SparklesIcon,
    color: "from-gray-500 to-slate-600",
    bgColor: "#6b7280",
    textColor: "text-gray-700",
  },
};