# @venue0/matcher

The production crossing matcher (`venue0-mmcc-1`). Given one round's signed intents and price snapshot, it finds the largest value of transfers between participants that moves each of them toward their own target.

**Input.** `MatchInput`: round id, valuation snapshot, portfolio intents (per asset: maximum raw units out, maximum raw units in), the asset universe, and the current time.

**Output.** `MatchResult`: status (CROSSED, PARTIAL_CROSS, NO_CROSS, INSUFFICIENT_PARTICIPANTS, PLAN_STALE), transfer legs, per-participant and per-asset fills (requested, crossed, residual, residual class), detected cycles and totals.

**Method.** Participants and assets form a flow network: sell capacity on participant→asset edges, buy capacity on asset→participant edges, exact value balance at every participant. Maximum crossed value is a min-cost circulation, solved by minimum-mean cycle canceling (Karp), with no external solver. Values are quantized to $0.01 lots.

**Invariants.**
- Deterministic: the same input gives the same output.
- Integer arithmetic for every amount; raw amounts never exceed a participant's limits.
- For every participant and asset, crossed + residual = requested, exactly.
- Zero overlap returns NO_CROSS with nothing crossed; no match is manufactured.
- Residuals below $0.10 on a fill that crossed are DUST, not external orders.

**Tests.** `test/matcher.test.ts` (property tests with fast-check, cycle and partial cases). Correctness is checked against [`@venue0/reference-matcher`](../reference-matcher/).

**In the product.** Runs when a round freezes (`apps/web/lib/server/rounds.ts`); its output becomes the settlement plan. Design notes: [docs/DECISIONS.md](../../docs/DECISIONS.md) (D-007, D-009).
