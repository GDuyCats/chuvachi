import type { NextConfig } from "next";

// Product photos are served from our Cloudflare R2 bucket (see backend/.env.example).
// next/image only loads pictures from addresses listed here.
const imageBaseUrl = process.env.NEXT_PUBLIC_IMAGE_BASE_URL?.replace(/\/+$/, "");
const apiUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "");
const isDev = process.env.NODE_ENV !== "production";

// Content Security Policy: the browser only runs scripts, loads pictures and connects to the
// places listed here, so code injected by an attacker can't load tools from elsewhere or send
// customer data away. Next.js itself needs inline scripts, hence 'unsafe-inline'.
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/client https://challenges.cloudflare.com${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style",
  // Our photos, bank QR codes, Google profile photos
  `img-src 'self' data: blob: ${imageBaseUrl ?? ""} https://img.vietqr.io https://lh3.googleusercontent.com`,
  "font-src 'self'",
  `connect-src 'self' ${apiUrl ?? ""} https://accounts.google.com/gsi/${isDev ? " ws: wss:" : ""}`,
  "frame-src https://accounts.google.com/gsi/ https://challenges.cloudflare.com", // Google sign-in, bot check
  "frame-ancestors 'none'", // nobody may show our pages inside a frame
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
]
  .join("; ")
  .replace(/\s+/g, " ");

// Security headers sent with every page.
const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  // Stop other sites from showing our pages inside a frame (clickjacking).
  { key: "X-Frame-Options", value: "DENY" },
  // Stop browsers from guessing file types.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Only send our domain (not full URLs) to other sites.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Turn off browser features the site never uses.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

const nextConfig: NextConfig = {
  images: {
    remotePatterns: imageBaseUrl ? [new URL(`${imageBaseUrl}/**`)] : [],
  },
  // Builds a small self-contained server for the Docker image (see Dockerfile).
  output: "standalone",
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // app/global-not-found.tsx: our own 404 page for addresses outside /vi and /en
    globalNotFound: true,
  },
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
