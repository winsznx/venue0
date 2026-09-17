import { erc20Abi, parseEventLogs } from "viem";
import { stockTokenAbi } from "@venue0/assets";
import { explorerAddress, explorerTx, log, parseDecimal } from "@venue0/shared";
import { createContext, forkFund, forkFundEth, parseMode, writeArtifact, type LiveContext } from "./context.ts";
import { resolveStockTokens } from "./resolve.ts";

/**
 * G0: move one canonical Stock Token from wallet A to wallet B and prove the balance change by independent readback.
 * Usage: tsx scripts/live/l0-transfer.ts --fork|--live [SYMBOL] [AMOUNT_TOKENS]
 */
async function run(ctx: LiveContext, symbol: string, amount: bigint) {
  const [a, b] = ctx.wallets;
  if (!a || !b) throw new Error("G0 needs two wallets");
  const dir = ctx.evidenceDir("L0-transfer");
  const resolution = await resolveStockTokens(ctx.publicClient, [symbol]);
  const asset = resolution.assets[0];
  if (!asset) throw new Error(`could not resolve ${symbol}`);
  const token = asset.token.contractAddress;

  if (ctx.mode === "fork") {
    await forkFundEth(ctx, a.address);
    await forkFund(ctx, token, a.address, amount);
  }

  const readBalances = async (blockNumber?: bigint) => {
    const at = blockNumber === undefined ? {} : { blockNumber };
    const [balanceA, balanceB] = await Promise.all([
      ctx.verifierClient.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [a.address], ...at }),
      ctx.verifierClient.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [b.address], ...at }),
    ]);
    return { [a.address]: balanceA, [b.address]: balanceB };
  };

  const preBalance = await ctx.publicClient.readContract({ address: token, abi: stockTokenAbi, functionName: "balanceOf", args: [a.address] });
  if (preBalance < amount) throw new Error(`wallet A ${a.address} holds ${preBalance} raw ${symbol}, needs ${amount}`);

  const hash = await a.client.writeContract({ address: token, abi: erc20Abi, functionName: "transfer", args: [b.address, amount], account: a.client.account ?? a.address, chain: ctx.chain });
  log("l0.submitted", { hash });
  const receipt = await ctx.publicClient.waitForTransactionReceipt({ hash });

  const before = await readBalances(receipt.blockNumber - 1n);
  const after = await readBalances(receipt.blockNumber);
  const deltaA = (after[a.address] as bigint) - (before[a.address] as bigint);
  const deltaB = (after[b.address] as bigint) - (before[b.address] as bigint);
  const transfers = parseEventLogs({ abi: erc20Abi, eventName: "Transfer", logs: receipt.logs }).filter((l) => l.address.toLowerCase() === token.toLowerCase());
  const checks = {
    txSuccess: receipt.status === "success",
    senderDelta: deltaA === -amount,
    recipientDelta: deltaB === amount,
    singleTransferLog: transfers.length === 1 && transfers[0]?.args.value === amount,
  };
  const pass = Object.values(checks).every(Boolean);

  const summary = {
    gate: "G0",
    environment: ctx.environment,
    result: pass ? "PASS" : "FAIL",
    timestamp: new Date().toISOString(),
    asset: { uid: asset.token.uid, symbol, chainId: asset.token.chainId, contractAddress: token, implementation: asset.implementation, explorer: explorerAddress(token) },
    walletA: a.address,
    walletB: b.address,
    amountRaw: amount,
    txHash: hash,
    explorer: ctx.mode === "live" ? explorerTx(hash) : null,
    blockNumber: receipt.blockNumber,
    before,
    after,
    deltas: { [a.address]: deltaA, [b.address]: deltaB },
    checks,
    readback: ctx.mode === "live" ? "VERIFIER_RPC_URL client at receipt block and block - 1" : "fork RPC at receipt block and block - 1",
  };
  await writeArtifact(dir, "asset-resolution.json", resolution);
  await writeArtifact(dir, "receipt.json", receipt);
  await writeArtifact(dir, "summary.json", summary);
  log("l0.done", { result: summary.result, dir });
  if (!pass) process.exitCode = 1;
}

const mode = parseMode(process.argv);
const [symbol = "NVDA", amountTokens = "0.01"] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const ctx = await createContext(mode, 2);
try {
  await run(ctx, symbol, parseDecimal(amountTokens));
} finally {
  ctx.close();
}
