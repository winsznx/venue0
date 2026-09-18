import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: ["@venue0/shared", "@venue0/assets", "@venue0/portfolio", "@venue0/agent", "@venue0/residual", "@venue0/circles", "@venue0/matcher", "@venue0/settlement"],
  serverExternalPackages: ["@anthropic-ai/sdk"],
};

export default config;
