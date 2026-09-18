import { existsSync } from "node:fs";
import { recoverTypedDataAddress } from "viem";
import { createAgentWallet, DEFAULT_AGENT_WALLET_PATH, dynamicConfigFromEnv, loadAgentWallet } from "@venue0/dynamic";
import { log, robinhoodChain, ROBINHOOD_PUBLIC_RPC } from "@venue0/shared";

/** Creates the Dynamic agent wallet once, then proves Dynamic MPC signs VENUE0 EIP-712 data for chain 4663. */
const config = dynamicConfigFromEnv();
if (!existsSync(DEFAULT_AGENT_WALLET_PATH)) await createAgentWallet(config);
const rpcUrl = process.env.ROBINHOOD_RPC_URL || ROBINHOOD_PUBLIC_RPC;
const agent = await loadAgentWallet(config, robinhoodChain(rpcUrl), rpcUrl);

const typed = {
  domain: { name: "VENUE0", version: "1", chainId: 4663, verifyingContract: "0x9cf871315674830046ab0541ee018f6978e86a3d" as const },
  types: { AgentHello: [{ name: "agent", type: "address" }, { name: "purpose", type: "string" }] },
  primaryType: "AgentHello" as const,
  message: { agent: agent.address, purpose: "venue0 dynamic signing smoke test" },
};
const signature = await agent.client.signTypedData(typed);
const recovered = await recoverTypedDataAddress({ ...typed, signature });
log("dynamic.smoke", { address: agent.address, walletId: agent.walletId, recovered, ok: recovered.toLowerCase() === agent.address.toLowerCase() });
