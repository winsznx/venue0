import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { createPublicClient, getAddress, http, type Address, type PublicClient } from "viem";
import { explorerTx, log, robinhoodChain, ROBINHOOD_PUBLIC_RPC } from "@venue0/shared";
import { executeResidualSwap, UniswapTradingApi } from "@venue0/uniswap";
import { createContext, parseMode, writeArtifact } from "./context.ts";

/**
 * L5: execute the EXTERNAL residual left by the latest live L3 partial round through Uniswap.
 * The owner's SELL residual is swapped into its BUY residual asset in one external order.
 */
type Residual = { owner: Address; assetUid: string; token: Address; side: "BUY" | "SELL"; amountRaw: string; notionalUsdE18: string; residualClass: string };

const mode = parseMode(process.argv);
const [slippageArg = "2.5"] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const base = join("evidence", "live", "L3-partial");
const runs = (await readdir(base)).sort();
const source = join(base, runs.at(-1) as string);
const planFile = JSON.parse(await readFile(join(source, "settlement-plan.json"), "utf8")) as { plan: { residuals: Residual[] } };
const external = planFile.plan.residuals.filter((r) => r.residualClass === "EXTERNAL");
const sell = external.find((r) => r.side === "SELL");
const buy = external.find((r) => r.side === "BUY" && r.owner === sell?.owner);
if (!sell || !buy) throw new Error(`no SELL/BUY EXTERNAL residual pair in ${source}`);

const ctx = await createContext(mode, 3);
try {
  const wallet = ctx.wallets.find((w) => getAddress(w.address) === getAddress(sell.owner));
  if (!wallet) throw new Error(`residual owner ${sell.owner} is not a configured wallet`);
  const apiKey = process.env.UNISWAP_API_KEY;
  if (!apiKey) throw new Error("UNISWAP_API_KEY missing");
  // Balance readback through a different provider than the executor when possible.
  const readUrl = process.env.VERIFIER_RPC_URL || (ctx.rpcUrl === ROBINHOOD_PUBLIC_RPC ? ctx.rpcUrl : ROBINHOOD_PUBLIC_RPC);
  const readClient = (mode === "fork" ? ctx.verifierClient : createPublicClient({ chain: robinhoodChain(readUrl), transport: http(readUrl) })) as PublicClient;

  const outcome = await executeResidualSwap(new UniswapTradingApi(apiKey), wallet.client, ctx.publicClient, readClient, {
    tokenIn: sell.token,
    tokenOut: buy.token,
    amountIn: BigInt(sell.amountRaw),
    slippageTolerance: Number(slippageArg),
  });
  const pass = outcome.status === "SUBMITTED" && outcome.receiptStatus === "success" && outcome.postcondition.spentExact && outcome.postcondition.receivedAtLeastMinimum;
  const dir = ctx.evidenceDir("L5-residual");
  await writeArtifact(dir, "summary.json", {
    gate: "L5",
    environment: ctx.environment,
    timestamp: new Date().toISOString(),
    venue: "UNISWAP_TRADING_API",
    sourceRound: source,
    residualSell: sell,
    residualBuy: buy,
    readbackProvider: mode === "fork" ? "fork" : new URL(readUrl).host,
    outcome,
    explorer: outcome.status === "SUBMITTED" && mode === "live" ? explorerTx(outcome.swapTx) : null,
    result: pass ? "PASS" : outcome.status === "NO_EXTERNAL_ROUTE" ? "NO_EXTERNAL_ROUTE" : "FAIL",
  });
  log("l5.done", { result: pass ? "PASS" : outcome.status, dir });
  if (!pass) process.exitCode = 1;
} finally {
  ctx.close();
}
