"use client";

import Image, { type ImageProps } from "next/image";
import { useState } from "react";

// next/image that fades in once the photo has loaded, instead of popping in line by line.
export function FadeInImage({ className = "", onLoad, alt, ...props }: ImageProps) {
  const [loaded, setLoaded] = useState(false);
  return (
    <Image
      {...props}
      alt={alt}
      onLoad={(event) => {
        setLoaded(true);
        onLoad?.(event);
      }}
      className={`photo-fade ${loaded ? "opacity-100" : "opacity-0"} ${className}`}
    />
  );
}
