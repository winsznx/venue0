/** Plain-language lines for activity rows, shared by home and the activity page. */
export function activityLine(kind: string, detail: Record<string, unknown>): string {
  const d = detail as Record<string, string | string[] | number | undefined>;
  switch (kind) {
    case "ONBOARDED": return "Finished setup";
    case "TARGET_SAVED": return `Saved target: ${Array.isArray(d.weights) ? d.weights.filter((w) => !w.endsWith(" 0.0%")).join(", ") : ""}`;
    case "CIRCLE_CREATED": return `Created circle ${d.name}`;
    case "CIRCLE_JOINED": return `Joined circle ${d.name}`;
    case "INTENT_SIGNED": return `Signed into round ${d.sequence} of ${d.circle}`;
    case "ROUND_MATCHED": return d.status === "NO_CROSS" ? `${d.circle}: no cross this round` : `${d.circle}: match found`;
    case "PLAN_APPROVED": return "Approved the settlement plan";
    case "ALLOWANCE_SET": return "Allowed settlement to move your tokens";
    case "SETTLED": return d.verifier === "PASS" ? "Settled and verified onchain" : `Settlement ${String(d.verifier ?? "").toLowerCase()}`;
    case "RESIDUAL_DECIDED": return d.choice === "CARRY_FORWARD" ? "Carried leftovers into the next round" : d.choice === "CANCEL" ? "Cancelled leftovers" : "Traded leftovers on Uniswap";
    default: return kind;
  }
}

export const RESIDUAL_WORDS: Record<string, string> = { EXECUTE_NOW: "Trade it now", LIMIT: "Limit order", TWAP: "Spread over time", WAIT: "Wait", CANCEL: "Drop it", AGGREGATE: "Carry into the next round" };

export const STATE_WORDS: Record<string, string> = {
  DRAFT: "Draft",
  OPEN: "Collecting",
  COLLECTING: "Collecting",
  FROZEN: "Solving",
  SOLVING: "Solving",
  PROPOSED: "Match found",
  APPROVING: "Approving",
  READY_TO_SETTLE: "Ready to settle",
  SETTLING: "Settling",
  SETTLED: "Settled",
  VERIFYING: "Verifying",
  COMPLETE: "Complete",
  EXPIRED: "Expired",
  INSUFFICIENT_PARTICIPANTS: "Not enough people",
  NO_CROSS: "No cross",
  PLAN_REJECTED: "Plan rejected",
  PLAN_STALE: "Expired before settlement",
  SETTLEMENT_REVERTED: "Settlement reverted",
  VERIFICATION_FAILED: "Verification failed",
  CANCELLED: "Cancelled",
  RESIDUAL_EXECUTION: "Trading leftovers",
  RESIDUAL_PARTIAL: "Leftovers partly traded",
  RESIDUAL_FAILED: "Leftover trade failed",
};
