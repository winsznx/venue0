# @venue0/portfolio

Holdings, targets and intents: the math between "where I want to be" and "what I sign".

**Main functions.**
- `buildValuationSnapshot`, `hashValuationSnapshot`, `snapshotProblems`, `priceMap`: one price per asset for a round, from a single declared source, with age checks.
- `computeRebalance`: current holdings plus target values to per-asset deltas.
- `deltaLimits`: deltas to the per-asset `maxOutRaw` / `maxInRaw` limits in a signed intent.
- `hashPolicy`, `hashIntent`, `intentProblems`: execution policy and intent integrity.
- `allocationErrorBps`, `applyRawDeltas`: allocation error before and after a settlement.

**Invariants.** bigint fixed-point throughout (USD in 1e18 units, raw token units); prices are already multiplier-adjusted, so nothing here applies a multiplier; a snapshot mixes no price sources.

**Tests.** Exercised through the matcher, reference-matcher, agent and circles test suites.

**In the product.** Target checks, round snapshots and intent building in `apps/web/lib/server/`.
