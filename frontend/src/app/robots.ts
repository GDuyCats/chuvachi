import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site-url";

// /robots.txt - tells search engines what to index. Private pages are left out.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/api", "/*/order", "/*/account", "/*/login", "/*/signup", "/*/track"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
