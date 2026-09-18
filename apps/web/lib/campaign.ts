import { proof } from "./data";

type ArmStats = { external_orders: number; cross_rate_pooled: number; cross_rate_median: number; requested_notional: number; crossed_notional: number };
type Uplift = { multi_party_uplift_pct_of_bilateral: number; multi_party_uplift_pct_of_requested: number; bilateral_crossed_notional: number; venue0_crossed_notional: number };

/** Headline campaign figures, read from campaign/results/summary.json via the derived proof data. */
export function campaignHeadline() {
  const s = proof.campaign.summary as { scenarios: number; parity: { exact_pass: number; lp_pass: number; fail: string[] }; overall: { arms: Record<string, ArmStats>; uplift: Uplift }; natural_randomized_only: { arms: Record<string, ArmStats>; uplift: Uplift } };
  const market = s.overall.arms.MARKET_ONLY as ArmStats;
  const crossing = s.overall.arms.VENUE0_CROSSING as ArmStats;
  return {
    scenarios: s.scenarios,
    fewerOrders: 1 - crossing.external_orders / market.external_orders,
    marketOrders: market.external_orders,
    crossingOrders: crossing.external_orders,
    upliftRelative: s.overall.uplift.multi_party_uplift_pct_of_bilateral,
    upliftAbsolutePts: s.overall.uplift.multi_party_uplift_pct_of_requested,
    crossRate: crossing.cross_rate_pooled,
    crossRateMedian: crossing.cross_rate_median,
    naturalCrossRate: (s.natural_randomized_only.arms.VENUE0_CROSSING as ArmStats).cross_rate_pooled,
    naturalUpliftRelative: s.natural_randomized_only.uplift.multi_party_uplift_pct_of_bilateral,
    parityPass: s.parity.exact_pass + s.parity.lp_pass,
    parityFail: s.parity.fail.length,
    seed: String(proof.campaign.manifest.seed),
  };
}
