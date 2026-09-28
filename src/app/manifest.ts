import type { MetadataRoute } from "next";

// Web app manifest. Icons are pre-rendered PNGs (public/icons/, built by
// scripts/pwa/make-icons.mjs from the sidebar's BeaconMark) rather than
// generated at request time, so they're reproducible and don't depend on
// sharp being available at runtime.
//
// `theme_color` here is the single static fallback manifest color — the
// real light/dark-aware browser-chrome color comes from the paired
// `<meta name="theme-color" media="...">` tags in src/app/layout.tsx, which
// browsers prefer over the manifest value when both are present.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Beacon Uptime",
    short_name: "Beacon",
    description:
      "Monitor your services, track uptime, and share status pages with your users.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#0f151d",
    theme_color: "#0f151d",
    categories: ["productivity", "utilities", "business"],
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
