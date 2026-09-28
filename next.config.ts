import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["postgres", "ioredis", "bullmq"],
  // The dev-mode "N" badge (bottom-left) shows up in every screenshot taken
  // against `next dev`; disabling dev indicators is dev-only (has no effect
  // on production builds) so it's fine to commit permanently.
  devIndicators: false,
};

export default nextConfig;
