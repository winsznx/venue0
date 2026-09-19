# Evaluation Campaign: Methodology (frozen)

[README](../README.md) · [Campaign results](CAMPAIGN_RESULTS.md)

Frozen before the campaign ran. The frozen run (`pnpm campaign`) refuses to start if the seed, versions or input hashes in `campaign/manifest.json` differ from the code and data. Before freezing, the code was only exercised with a different seed (`smoke`, 2 scenarios per cohort, output gitignored), to check correctness invariants.

## Question

1. How much requested Stock Token rebalance notional crosses internally instead of going to external liquidity?
2. How much of that comes from multi-party portfolio matching beyond what simple two-wallet swaps capture (**multi-party uplift**)?
3. Where does crossing stop helping, and what does the residual engine do with what's left?

## Frozen inputs

| Input | Source | File |
|---|---|---|
| Asset universe | NVDA, AAPL, SPY, QQQ, TSLA, MSFT, AMZN, GOOGL, META. All nine passed live canonical checks in P0 | `campaign/data/price-snapshot.json` |
| Valuation prices | Chainlink Stock Token feeds on Robinhood Chain, read once at capture | `campaign/data/price-snapshot.json` |
| External route costs | Live quotes captured once: Uniswap Trading API (EXACT_INPUT, router 2.1.1) and Definitive Flash (LIMIT at reference). 9 assets x {$1, $10, $100, $1k, $10k} x {SELL to USDG, BUY with USDG}. Cost reference is the Robinhood REST mid x `currentMultiplier`, fetched per asset right before its quotes (Chainlink answers can be hours old and would leak staleness into cost). No orders were placed | `campaign/data/cost-curves.json` |

Seed `venue0-campaign-2026-09-18-frozen`. 10 cohorts x 40 scenarios = 400 scenarios. Per-scenario seed = keccak256(`seed:cohort:index`), PRNG mulberry32.

## Scenario generation

Every participant has holdings and a target in USD. Both are converted to raw units at the frozen prices (floored), then run through the same code as live rounds: `computeRebalance` -> `deltaLimits` (deltas under $0.01 ignored) -> `PortfolioIntent`. Portfolio values are log-uniform.

| Cohort | Nature | Participants | Construction |
|---|---|---|---|
| RANDOM_INDEPENDENT | natural/randomized | 2-12 | holdings and target each: 2-5 random assets, flat-Dirichlet weights, $500-$50k |
| THEME_CIRCLE | natural/randomized | 4-12 | same, restricted to NVDA, AAPL, MSFT, GOOGL, META |
| INDEX_REBALANCE | natural/randomized | 4-12 | holdings and target are independent +/-25% perturbations of one index-like base (SPY .4, QQQ .2, AAPL/MSFT/NVDA/AMZN .1) |
| CONCENTRATED_TECH | natural/randomized | 3-10 | 60-90% in NVDA or TSLA plus 2 tech names; random tech target |
| SIZE_SKEW | natural/randomized | 4-10 | one $500k participant, others $1k-$10k, random targets |
| HIGH_COMPLEMENTARITY | constructed-positive | 3-9 | each sells one asset (30-50% of a $1k-$20k position) into an asset another participant sells; random functional graph, so pairs and longer cycles both occur |
| PARTIAL_MATCH | constructed-positive | 3-9 | as above but moving 5-65%, so sizes mismatch and residual is unavoidable |
| LOW_COMPLEMENTARITY | stress/control | 4-12 | 80% move NVDA/TSLA -> SPY/QQQ, 20% random |
| ZERO_OVERLAP | stress/control | 2-10 | everyone sells from {NVDA, TSLA, AMZN, META} and buys from {SPY, QQQ, AAPL, MSFT, GOOGL}. Correct answer: nothing crosses |
| EXTERNAL_ROUTE_STRESS | stress/control | 3-10 | random $20-$300 portfolios, measured costs x3, two random assets with Uniswap disabled, half of participants forbid market residuals |

Constructed-positive and stress cohorts are never reported as naturally observed behavior. Headline numbers use `natural/randomized` cohorts, and all-cohort numbers are reported separately.

## Arms

Same intents, snapshot and cost model for every arm.

| Arm | Crossing | Residual execution |
|---|---|---|
| A MARKET_ONLY | none | every requested asset order goes to Uniswap market |
| B BILATERAL_ONLY | exact LP optimum (HiGHS) over direct transfers where **each pair's exchange is value-balanced**: only two-wallet swaps, including multi-asset swaps between the same two wallets | Uniswap market |
| C VENUE0_CROSSING | production matcher (`venue0-mmcc-1`): each participant balances across all counterparties, so cycles of any length | Uniswap market |
| D VENUE0_FULL | same as C | economic residual engine (`venue0-residual-2-economic`) choosing among measured Uniswap MARKET and Flash LIMIT costs, or AGGREGATE / WAIT / CANCEL |

B uses the same eligible participants, lot size ($0.01) and caps as C. B's feasible set is a subset of C's, so B <= C must hold. The runner reports any scenario where it doesn't.

## Metrics

- `requested_notional`: sum over every intent asset of |requested value| (sell side and buy side both count).
- `crossed_notional`: crossed value on the same entries. `cross_rate` = crossed / requested.
- `residual_notional` = requested - crossed. `dust_residual_notional`: residual under $0.10 on a fill that crossed (D-009).
- `external_order_count`: residual asset orders sent externally (A-C: every EXTERNAL residual; D: residuals the engine executes now).
- **`multi_party_uplift`** = C crossed - B crossed (USD), reported as a share of B's crossed notional and as a share of requested notional.
- `est_external_cost_usd` / `_bps`: from the frozen cost model only. Between measured sizes: linear interpolation of USD cost. Below $1: the $1 cost. Above $10k: $10k bps, flagged `cost_extrapolated_orders`. Sizes at or above a measured `NoRouteFoundError` are unavailable and become `unfilled_notional` in A-C. Transient provider errors are skipped (nearest measured points used).
- `deferred_notional` (D: AGGREGATE + WAIT) and `cancelled_notional` are reported and never counted as executed.
- `reference_matcher_parity`: `EXACT_PASS` (rational simplex, <=6 participants) or `LP_PASS` (HiGHS, |diff| <= 1 lot).
- `allocation_error_before_bps` / `_after_bps`: value-weighted half-L1 distance to target, after crossing and before any external execution.
- `solver_latency_ms`: production matcher wall time on the run machine.

Pooled rates (sum crossed / sum requested) and per-scenario medians and deciles are both reported.

## Exclusion and failure rules

- No scenario is excluded after generation. Any exception is recorded in `summary.failures` with its scenario id.
- Parity failures are listed by scenario. Any parity failure blocks the matcher claim until explained.
- B > C in any scenario is a correctness failure and is reported.

## Known limitations (decided before the results)

- Synthetic portfolios, not users. Cohort distributions are assumptions.
- One price snapshot and one cost capture: no intraday variation, no depth changes, no session effects (all residual decisions use session `market`).
- Flash LIMIT cost assumes a fill at quoted terms. Fill probability and time-to-fill are not modeled. TWAP was not quoted, so arm D never selects TWAP.
- Uniswap costs are single-swap quotes at fixed sizes. Many residuals hitting one pool at once would cost more than modeled.
- External order count convention: one order per residual asset against USDG. A real user might route asset-to-asset in one swap.
- Bilateral-only is the optimal pairwise baseline, stronger than a greedy P2P matcher. Uplift over a greedy matcher would be larger and is not claimed.
