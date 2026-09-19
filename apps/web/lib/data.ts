import roundsJson from "@/data/rounds.json";
import proofJson from "@/data/proof.json";

/** View data derived from committed evidence by `pnpm web:data`. Nothing here is typed in by hand. */
export type Side = "SELL" | "BUY";
export type IntentLeg = { symbol: string; side: Side; amountTokens: number; valueUsd: number };
export type Participant = {
  address: string;
  label: string;
  kind: string;
  valueUsd: number | null;
  allocationErrorBeforeBps: number | null;
  allocationErrorAfterBps: number | null;
  intent: IntentLeg[];
  signature: string | null;
  policy: Record<string, unknown>;
};
export type Leg = { from: string; to: string; symbol: string; amountTokens: number; valueUsd: number };
export type Fill = { owner: string; symbol: string; side: string; requestedUsd: number; crossedUsd: number; residualUsd: number; residualTokens: number; residualClass: string };
export type Round = {
  key: string;
  gate: string;
  description: string;
  environment: string;
  evidencePath: string;
  roundId: string;
  status: string;
  result: string;
  capturedAt: string;
  snapshot: { hash: string; source: string };
  assets: Array<{ symbol: string; uid: string; address: string; priceUsd: number }>;
  participants: Participant[];
  legs: Leg[];
  fills: Fill[];
  cycles: Array<Array<{ from: string; to: string; symbol: string }>>;
  totals: { requestedUsd: number; crossedUsd: number; residualUsd: number; dustUsd: number; transferUsd: number; crossRateBps: number; externalResidualCount: number };
  comparison: {
    marketOnly: { externalOrders: number; crossedUsd: number };
    pairwise: { crossedUsd: number; transfers: Array<{ from: string; to: string; symbol: string; valueUsd: number }>; method: string };
    venue0: { crossedUsd: number; externalOrders: number };
  };
  plan: null | {
    planHash: string;
    validAfter: number;
    validUntil: number;
    settlementContract: string;
    approvals: Array<{ participant: string; nonce: string }>;
    allowanceTxs: string[];
    preflightOk: boolean;
    residuals: Array<{ owner: string; symbol: string; side: string; amountTokens: number; notionalUsd: number; residualClass: string }>;
  };
  settlement: null | { txHash: string; block: number; gasUsed: number; status: string; explorer: string };
  verifier: null | { status: string; checks: Array<{ name: string; status: string; detail: string }> };
  independentVerification: Array<{ provider: string; status: string; passed: number; total: number }>;
};

export const rounds = roundsJson as unknown as Round[];
export const proof = proofJson as unknown as {
  settlementContract: { address: string; explorer: string; deployTx: string };
  transfer: { result: string; txHash: string; explorer: string; asset: string; amountTokens: number };
  uniswap: { result: string; txHash: string; approvalTx: string; explorer: string; route: string; routing: string; routerVersion: string; soldTokens: number; soldSymbol: string; receivedTokens: number; receivedSymbol: string; at: string };
  flash: { orderId: string; status: string; fillTx: string; limitCrossPrice: string; residualTokens: number; economics: Record<string, number | string>; at: string };
  residualDecisionReplay: { at: string; decision: { decision: string; reasons: string[]; evaluated: Array<{ venue: string; style: string; allInCostBps: number; allInCostUsd: number; providerFeeUsd: number | null; networkCostUsd: number | null; fixedCostUsd: number; allowed: boolean; viable: boolean; note: string; source: string }> }; context: Record<string, unknown> };
  campaign: { summary: Record<string, any>; analysis: Record<string, any>; manifest: Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any -- frozen JSON read verbatim
  production: Array<{ id: string; roundId: string; txHash: string; explorer: string; verifier: string; independent: boolean; executionProvider: string; verificationProvider: string; checksPassed: number; checksTotal: number }>;
};

export function getRound(key: string): Round | undefined {
  return rounds.find((r) => r.key === key);
}

export const HERO_ROUND_KEY = "g2-cycle";
