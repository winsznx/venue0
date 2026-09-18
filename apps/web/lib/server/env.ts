import "server-only";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

/** The repo keeps one .env at its root. Load it for the web server without copying secrets into apps/web. */
const root = resolve(process.cwd(), "../../.env");
if (existsSync(root)) {
  try {
    process.loadEnvFile(root);
  } catch (error) {
    console.error(JSON.stringify({ event: "env.load_failed", error: (error as Error).message }));
  }
}

export const env = {
  rpcUrl: process.env.ROBINHOOD_RPC_URL || "https://rpc.mainnet.chain.robinhood.com",
  anthropicAvailable: Boolean(process.env.ANTHROPIC_API_KEY),
  databaseUrl: process.env.DATABASE_URL || undefined,
  settlementContract: process.env.CROSSING_SETTLEMENT_ADDRESS || undefined,
  dynamicEnvironmentId: process.env.DYNAMIC_ENVIRONMENT_ID || process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID || undefined,
  sessionSecret: process.env.SESSION_SECRET || undefined,
};
