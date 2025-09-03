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

export interface TemplateType {
    name: string;
    description: string;
    user: string;
    system: string;
    designEngine?: 'CLAUDE' | 'GPT4O';
}