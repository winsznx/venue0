import postgres from "postgres";
import { createPublicClient, decodeEventLog, http, type Hex } from "viem";
import { venue0SettlementAbi } from "@venue0/settlement";
import { robinhoodChain } from "@venue0/shared";

/**
 * Independent-verification gate record for one deployed round: stored plan, approvals and verifier report (read from
 * the production database), plus the receipt and settlement events decoded onchain. Prints JSON; no secrets.
 * Args: <roundId>
 */
const [roundId] = process.argv.slice(2) as [string];
const sql = postgres(process.env.DATABASE_URL as string, { max: 1, onnotice: () => undefined });
const revive = (v: unknown): unknown => (Array.isArray(v) ? v.map(revive) : v && typeof v === "object" ? ((o) => (typeof o.$bigint === "string" && Object.keys(o).length === 1 ? o.$bigint : Object.fromEntries(Object.entries(o).map(([k, x]) => [k, revive(x)]))))(v as Record<string, unknown>) : v);
try {
  const [round] = await sql<Array<{ state: string; plan: unknown; settlement_tx: string; verification: unknown }>>`select state, plan, settlement_tx, verification from rounds where id = ${roundId}`;
  if (!round) throw new Error("round not found");
  const plan = revive(round.plan) as { planHash: string; settlementContract: string; contractPlan: { participants: string[]; legs: Array<{ token: string; from: string; to: string; amount: string }> } };
  const verification = revive(round.verification) as { status: string; blockNumber: string; checks: Array<{ name: string; status: string; detail: string }>; balances: Array<{ owner: string; token: string; expectedDelta: string; observedDelta: string }>; providers: { executor: string; verifier: string; independent: boolean; fallbackReason?: string } };
  const approvals = await sql<Array<{ participant: string }>>`select participant from approvals where round_id = ${roundId} order by participant`;
  const rpc = createPublicClient({ chain: robinhoodChain(process.env.ROBINHOOD_RPC_URL), transport: http(process.env.ROBINHOOD_RPC_URL) });
  const receipt = await rpc.getTransactionReceipt({ hash: round.settlement_tx as Hex });
  const events = receipt.logs.flatMap((l) => {
    try {
      const d = decodeEventLog({ abi: venue0SettlementAbi, data: l.data, topics: l.topics });
      return [{ event: d.eventName, args: JSON.parse(JSON.stringify(d.args, (_k, v: unknown) => (typeof v === "bigint" ? v.toString() : v))) }];
    } catch {
      return [];
    }
  });
  const lower = (a: string) => a.toLowerCase();
  const record = {
    EXECUTION_PROVIDER: verification.providers.executor,
    VERIFICATION_PROVIDER: verification.providers.verifier,
    independent: verification.providers.independent,
    fallbackReason: verification.providers.fallbackReason ?? null,
    roundId,
    roundState: round.state,
    planHash: plan.planHash,
    settlementContract: plan.settlementContract,
    txHash: round.settlement_tx,
    receipt: { status: receipt.status, blockNumber: receipt.blockNumber.toString(), to: receipt.to, gasUsed: receipt.gasUsed.toString(), logCount: receipt.logs.length },
    settlementEvents: events,
    participantSet: plan.contractPlan.participants.map(lower).sort(),
    approvalParticipantSet: approvals.map((a) => lower(a.participant)).sort(),
    nonceConsumedSet: events.filter((e) => e.event === "NonceConsumed").map((e) => lower(String((e.args as { owner: string }).owner))).sort(),
    expectedTokenDeltas: verification.balances.map((b) => ({ owner: b.owner, token: b.token, delta: b.expectedDelta })),
    observedTokenDeltas: verification.balances.map((b) => ({ owner: b.owner, token: b.token, delta: b.observedDelta })),
    verificationBlock: verification.blockNumber,
    verifierStatus: verification.status,
    checks: verification.checks.map((c) => `${c.status} ${c.name}`),
  };
  console.log(JSON.stringify(record, null, 2));
} finally {
  await sql.end();
}
