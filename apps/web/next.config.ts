import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@vortspec/pipeline", "@vortspec/ir", "@vortspec/codegen", "@vortspec/adapters", "@vortspec/llm"],
};

export default nextConfig;
