import Image from 'next/image';
import { ComponentProps } from 'react';

interface ExternalImageProps extends ComponentProps<typeof Image> {
  src: string;
  alt: string;
}

export default function ExternalImage({ src, alt, ...props }: ExternalImageProps) {
  // Check if it's a Google user avatar (configured in next.config.ts)
  const isGoogleUserContent = src.includes('googleusercontent.com');
  
  // For external product images from user shops, disable optimization
  // For Google user avatars, use Next.js optimization
  return (
    <Image
      src={src}
      alt={alt}
      unoptimized={!isGoogleUserContent}
      {...props}
    />
  );
}