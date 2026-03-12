import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["postgres", "ioredis", "bullmq"],
};

export default nextConfig;
