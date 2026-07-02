import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produce a self-contained .next/standalone (node server.js) for the Alibaba
  // ECS Docker image — no node_modules copy needed at runtime.
  output: "standalone",
  // pg / @modelcontextprotocol/sdk spawn shouldn't be bundled into the server.
  serverExternalPackages: ["pg", "@modelcontextprotocol/sdk", "openai"],
};

export default nextConfig;
