// Shared TypeScript interfaces for template-related types
// This file defines types that can be used across server and client components

export interface Template {
  subject: string;
  html: string;
}

export interface ProductInfo {
  title: string;
  description: string;
  images: string[];
  bestImageUrl: string;
  language: string;
  regularPrice: string;
  salePrice: string;
  discount: string;
}

export interface MultiProductInfo {
  products: ProductInfo[];
  language: string;
}

export type TemplateStep = "input" | "template-selection" | "processing" | "results";

export interface TemplateUIConfig {
  icon: string;
  color: string;
  bgColor: string;
  textColor: string;
}