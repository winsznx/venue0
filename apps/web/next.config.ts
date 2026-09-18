import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: ["@venue0/shared", "@venue0/assets", "@venue0/portfolio", "@venue0/agent", "@venue0/residual", "@venue0/circles", "@venue0/matcher", "@venue0/settlement", "@venue0/verifier", "@venue0/uniswap"],
  serverExternalPackages: ["@anthropic-ai/sdk", "@electric-sql/pglite", "postgres"],
};

export default config;
