import "server-only";

/**
 * Configuration comes only from the process environment. Local scripts pass the repo-root .env with Node's --env-file;
 * deployments set variables and secrets on the host. Nothing here reads files, so no .env can be traced into a build.
 */
export const env = {
  rpcUrl: process.env.ROBINHOOD_RPC_URL || "https://rpc.mainnet.chain.robinhood.com",
  /** Language agent provider: Groq when GROQ_API_KEY is set, else Anthropic, else none (weights mode only). */
  agentProvider: process.env.GROQ_API_KEY ? ("GROQ" as const) : process.env.ANTHROPIC_API_KEY ? ("ANTHROPIC" as const) : null,
  get agentAvailable() {
    return this.agentProvider !== null;
  },
  databaseUrl: process.env.DATABASE_URL || undefined,
  settlementContract: process.env.VENUE0_SETTLEMENT_ADDRESS || undefined,
  dynamicEnvironmentId: process.env.DYNAMIC_ENVIRONMENT_ID || process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID || undefined,
  sessionSecret: process.env.SESSION_SECRET || undefined,
};
