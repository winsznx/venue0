import { readFile } from "node:fs/promises";
import { createPublicClient, createWalletClient, erc20Abi, http, parseEther, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { log, robinhoodChain, ROBINHOOD_PUBLIC_RPC } from "@venue0/shared";
import { DEFAULT_AGENT_WALLET_PATH } from "@venue0/dynamic";

/** Moves wallet C's SPY and a little gas ETH to the Dynamic agent wallet so it can join a live round. */
const SPY: Address = "0x117cc2133c37B721F49dE2A7a74833232B3B4C0C";
const rpcUrl = process.env.ROBINHOOD_RPC_URL || ROBINHOOD_PUBLIC_RPC;
const chain = robinhoodChain(rpcUrl);
const funder = createWalletClient({ account: privateKeyToAccount(process.env.VENUE0_WALLET_C_PRIVATE_KEY as Hex), chain, transport: http(rpcUrl) });
const reader = createPublicClient({ chain, transport: http(rpcUrl) });
const { address: agent } = JSON.parse(await readFile(DEFAULT_AGENT_WALLET_PATH, "utf8")) as { address: Address };

const spy = await reader.readContract({ address: SPY, abi: erc20Abi, functionName: "balanceOf", args: [funder.account.address] });
const spyTx = await funder.writeContract({ address: SPY, abi: erc20Abi, functionName: "transfer", args: [agent, spy] });
await reader.waitForTransactionReceipt({ hash: spyTx });
const ethTx = await funder.sendTransaction({ to: agent, value: parseEther("0.0002") });
await reader.waitForTransactionReceipt({ hash: ethTx });
log("dynamic.agent.funded", { agent, spyRaw: spy, spyTx, ethTx });
