import type { Round } from "./data";
import { proof } from "./data";

export type ResidualOutcome =
  | { kind: "DUST_ONLY"; dustUsd: number }
  | { kind: "NO_RESIDUAL" }
  | { kind: "UNISWAP_EXECUTED"; txHash: string; explorer: string; detail: string }
  | { kind: "FLASH_BOUNDARY"; orderId: string; fillTx: string; feeBps: number; notionalUsd: number; replayDecision: string }
  | { kind: "NOT_EXECUTED"; externalUsd: number; count: number };

/**
 * What actually happened to each live round's residual, from evidence. A residual nobody executed is reported as such.
 * The Uniswap swap executed the L3 residual (evidence/live/L5-residual cites that round as its source).
 */
export function residualOutcome(round: Round): ResidualOutcome {
  const external = round.fills.filter((f) => f.residualClass === "EXTERNAL");
  if (round.key === "g3-partial") return { kind: "UNISWAP_EXECUTED", txHash: proof.uniswap.txHash, explorer: proof.uniswap.explorer, detail: `${proof.uniswap.soldTokens.toFixed(6)} ${proof.uniswap.soldSymbol} sold for ${proof.uniswap.receivedTokens.toFixed(6)} ${proof.uniswap.receivedSymbol} via ${proof.uniswap.routing}` };
  if (round.key === "l6-flash-round") {
    return {
      kind: "FLASH_BOUNDARY",
      orderId: proof.flash.orderId,
      fillTx: proof.flash.fillTx,
      feeBps: Number(proof.flash.economics.feeBpsOfNotional),
      notionalUsd: Number(proof.flash.economics.residualNotionalUsd),
      replayDecision: proof.residualDecisionReplay.decision.decision,
    };
  }
  if (external.length > 0) return { kind: "NOT_EXECUTED", externalUsd: external.reduce((s, f) => s + f.residualUsd, 0), count: external.length };
  if (round.totals.dustUsd > 0) return { kind: "DUST_ONLY", dustUsd: round.totals.dustUsd };
  return { kind: "NO_RESIDUAL" };
}
