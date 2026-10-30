export interface ProductInfo {
    title: string;
    description: string;
    images: string[];
    bestImageUrl: string;
    language: string;
    regularPrice: string;
    salePrice: string;
    discount: string;
    /** Shop's average product rating ("4.6") — only for templates that opt in. */
    rating?: string;
    reviewCount?: string;
    reviews?: ProductReview[];
}

export interface ProductReview {
    name: string;
    text: string;
    rating: number;
}

export interface MultiProductInfo {
    products: ProductInfo[];
    language: string;
}

export interface TemplateType {
    name: string;
    description: string;
    user: string;
    system: string;
    designEngine?: 'CLAUDE' | 'GPT4O';
}