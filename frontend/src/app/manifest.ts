import type { MetadataRoute } from "next";

// Lets customers add the shop to their phone's home screen. On iPhone this is also
// what makes push notifications possible (Apple only allows them for home-screen web apps).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Chuvachi",
    short_name: "Chuvachi",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#000000",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
