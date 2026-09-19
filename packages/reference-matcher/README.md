# @venue0/reference-matcher

Independent solvers used to check the production matcher, and the bilateral baseline used in the campaign.

**Input.** The same `MatchInput` the production matcher receives, plus its `MatchResult` for comparison.

**Output.** `compareWithReference` reports agreement on eligibility, feasibility and optimum crossed lots. `validateMatchResult` recomputes caps, conservation, value balance and fills from the raw input.

**Method.** The direct transfer formulation `x[p,q,a]` solved two independent ways: exact rational simplex with Bland's rule (up to 6 participants) and the HiGHS LP solver (larger rounds). The pairwise-only baseline is the exact optimum where each pair's exchange must be value-balanced.

**Invariants.** Shares no solving code with `@venue0/matcher`. Agreement is required on the optimum value; per-asset legs may differ when several optima tie.

**Tests.** `test/reference.test.ts`: 150 randomized property rounds against the production matcher.

**Results.** 400/400 parity in the campaign ([docs/CAMPAIGN_RESULTS.md](../../docs/CAMPAIGN_RESULTS.md)).
