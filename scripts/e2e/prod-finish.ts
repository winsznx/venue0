import { apiGet, openUser } from "./session.ts";
import { residualAndReceipt } from "./steps.ts";

/** Finishes a production round in the UI for each participant: leftover decision, receipt, Activity. Args: <dir> <roundId> */
const [dir, roundId] = process.argv.slice(2) as [string, string];
for (const label of ["A", "B", "C"] as const) {
  const u = await openUser(label, dir, { profile: `prod-${label}` });
  try {
    await residualAndReceipt(u, roundId, dir);
    if (label === "A") {
      const v = await apiGet<{ round: { state: string; settlementTx: string; planHash: string; verification: { status: string; checks: Array<{ name: string; status: string }>; providers: unknown } } }>(u.page, `/api/rounds/${roundId}`);
      console.log(JSON.stringify({ state: v.round.state, tx: v.round.settlementTx, planHash: v.round.planHash, verifier: v.round.verification.status, passed: v.round.verification.checks.filter((c) => c.status === "PASS").length, total: v.round.verification.checks.length, notPass: v.round.verification.checks.filter((c) => c.status !== "PASS").map((c) => `${c.name}:${c.status}`), providers: v.round.verification.providers }));
    }
  } finally {
    await u.context.close();
  }
}
