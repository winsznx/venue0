import { createPublicClient, erc20Abi, formatEther, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { robinhoodChain } from "@venue0/shared";

/** Prints proof wallet addresses and their live Robinhood Chain balances. Never prints keys. */
const TOKENS = {
  NVDA: "0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC",
  AAPL: "0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9",
  SPY: "0x117cc2133c37B721F49dE2A7a74833232B3B4C0C",
} as const;

const client = createPublicClient({ chain: robinhoodChain(), transport: http() });
for (const label of ["A", "B", "C"]) {
  const key = process.env[`VENUE0_WALLET_${label}_PRIVATE_KEY`];
  if (!key) {
    console.log(`${label}: MISSING key`);
    continue;
  }
  const address = privateKeyToAccount(key as Hex).address;
  const parts = [`ETH=${formatEther(await client.getBalance({ address }))}`];
  for (const [symbol, token] of Object.entries(TOKENS)) {
    parts.push(`${symbol}=${formatEther(await client.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [address] }))}`);
  }
  console.log(`${label} ${address} ${parts.join(" ")}`);
}
