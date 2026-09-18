import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { createPublicClient, http, type Address, type Hex, type PublicClient } from "viem";
import { robinhoodChain } from "@venue0/shared";
import type { ContractPlan } from "@venue0/settlement";
import { verifySettlement } from "@venue0/verifier";
import { writeArtifact } from "./context.ts";

/**
 * Re-runs the independent verifier for every live settlement through a chosen RPC (default ROBINHOOD_RPC_URL),
 * so verification can come from a different provider than the one that executed the round.
 */
const rpcUrl = process.env.VERIFIER_RPC_URL || process.env.ROBINHOOD_RPC_URL;
if (!rpcUrl) throw new Error("set VERIFIER_RPC_URL or ROBINHOOD_RPC_URL");
const client = createPublicClient({ chain: robinhoodChain(rpcUrl), transport: http(rpcUrl) }) as PublicClient;
const provider = new URL(rpcUrl).host;

type Json = Record<string, unknown>;
const revive = (_k: string, v: unknown) => (typeof v === "string" && /^-?\d{16,}$/.test(v) ? BigInt(v) : v);

for (const gate of ["L1-bilateral", "L2-cycle", "L3-partial", "L7-dynamic-agent"]) {
  const base = join("evidence", "live", gate);
  for (const run of await readdir(base).catch(() => [])) {
    const dir = join(base, run);
    const summary = JSON.parse(await readFile(join(dir, "summary.json"), "utf8")) as Json;
    if (!summary.settlementTx) continue;
    const planFile = JSON.parse(await readFile(join(dir, "settlement-plan.json"), "utf8"), revive) as {
      plan: { contractPlan: Record<string, unknown>; settlementContract: Address };
      approvals: Record<string, { nonce: bigint }>;
    };
    const cp = planFile.plan.contractPlan;
    const legs = (cp.legs as Array<Record<string, unknown>>).map((l) => ({ ...l, amount: BigInt(l.amount as string | bigint) }));
    const plan = { ...cp, legs, validAfter: BigInt(cp.validAfter as string | bigint), validUntil: BigInt(cp.validUntil as string | bigint) } as ContractPlan;
    const nonces = new Map(Object.entries(planFile.approvals).map(([p, a]) => [p as Address, BigInt(a.nonce)]));
    const report = await verifySettlement(client, {
      txHash: summary.settlementTx as Hex,
      settlementContract: planFile.plan.settlementContract,
      plan,
      nonces,
      watchTokens: [...new Set(plan.legs.map((l) => l.token))],
    }).catch((error: unknown) => {
      console.log(gate, run, "INCONCLUSIVE via", provider, "-", (error as Error).message.split("\n")[0]);
      return undefined;
    });
    if (!report) continue;
    await writeArtifact(dir, `verifier-report-independent-${provider}.json`, { provider, ...report });
    console.log(gate, run, report.status, `${report.checks.filter((c) => c.status === "PASS").length}/${report.checks.length}`, "via", provider);
  }
}
