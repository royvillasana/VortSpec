import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@vortspec/pipeline", "@vortspec/ir"],
};

export default nextConfig;
