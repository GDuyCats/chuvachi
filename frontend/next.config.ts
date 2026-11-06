import type { NextConfig } from "next";

// Security headers sent with every page.
const securityHeaders = [
  // Stop other sites from showing our pages inside a frame (clickjacking).
  { key: "X-Frame-Options", value: "DENY" },
  // Stop browsers from guessing file types.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Only send our domain (not full URLs) to other sites.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Turn off browser features the site never uses.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

// Product photos are served from our Cloudflare R2 bucket (see backend/.env.example).
// next/image only loads pictures from addresses listed here.
const imageBaseUrl = process.env.NEXT_PUBLIC_IMAGE_BASE_URL?.replace(/\/+$/, "");

const nextConfig: NextConfig = {
  images: {
    remotePatterns: imageBaseUrl ? [new URL(`${imageBaseUrl}/**`)] : [],
  },
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // Don't advertise which framework we run.
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
