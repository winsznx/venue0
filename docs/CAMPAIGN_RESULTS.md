# Campaign results

[README](../README.md) · [Methodology](EVAL_CAMPAIGN.md) · [Thesis](THESIS.md) · [Claim ledger](CLAIM_LEDGER.md)

**400 frozen synthetic scenarios. Not users. Not live market adoption.**

## Arms

Every arm saw identical intents and prices.

| Arm | Matching | Residual |
|---|---|---|
| A MARKET_ONLY | none | every requested asset order goes to the Uniswap market |
| B BILATERAL_ONLY | exact pairwise optimum (HiGHS LP): only two-wallet swaps, each value-balanced | Uniswap market |
| C VENUE0_CROSSING | production matcher: each participant balances across all counterparties, so cycles of any length | Uniswap market |
| D VENUE0_FULL | same as C | economic residual engine choosing among measured Uniswap and Flash costs, or AGGREGATE / WAIT / CANCEL |

## Headline

- Venue0 crossed **10.2%** of requested notional overall (median scenario 13.5%).
- **32% fewer** external orders than market-only (39% in natural cohorts).
- **26.3%** more crossed notional than the optimal bilateral-only matcher, which is about **+2.1 points** of requested notional in absolute terms.
- **400/400** reference-solver parity.
- Natural and randomized cohorts only: 10.5% crossed pooled, +23.6% relative uplift (+2.0 points).

The failure envelope is below: crossing is about 2% below 10% complementarity, 2-3 participant rounds gain little, template-style flows are mostly captured bilaterally, one-directional flows often cross nothing, and a whale in a small crowd crosses 2.7%. Multi-party uplift is strongest in larger, circle-style rounds.

## Detail

Frozen methodology: `docs/EVAL_CAMPAIGN.md`, committed in `a853b32` before this run. Seed `venue0-campaign-2026-09-18-frozen`, 400 scenarios (10 cohorts x 40), 4 arms. Raw data: `campaign/results/results.csv` and `results.json` (1,600 rows), `summary.json`. Post-hoc breakdowns: `analysis.json`. Reproduce with `pnpm campaign && pnpm campaign:analyze`.

These are synthetic portfolios, not users.

## Run health

| Check | Result |
|---|---|
| Scenarios | 400 generated, 400 evaluated, 0 failures, 0 excluded |
| Reference parity | 400/400: 188 exact rational simplex (<=6 participants), 212 HiGHS LP (7-12 participants), 0 failures |
| Bilateral > Venue0 (correctness check) | 0 scenarios |
| ZERO_OVERLAP control | 40/40 crossed exactly $0 |
| Matcher latency | p50 1 ms, p95 2 ms, max 5 ms (up to 12 participants, 9 assets) |

## Headline numbers

Pooled = sum crossed / sum requested, so large portfolios weigh more. Median = the typical scenario.

| Population | Scenarios | Bilateral-only cross rate (pooled) | Venue0 cross rate (pooled) | Venue0 median scenario | Multi-party uplift over bilateral |
|---|---|---|---|---|---|
| All cohorts | 400 | 8.1% | 10.2% | 13.5% | +26.3% more crossed notional (+2.1 pts of requested) |
| Natural/randomized cohorts | 200 | 8.5% | 10.5% | 17.8% | +23.6% (+2.0 pts) |
| Natural, excluding SIZE_SKEW | 160 | 23.1% | 28.2% | 26.7% | +21.8% (+5.0 pts) |

The natural pooled rate is dragged down by SIZE_SKEW. Each of those scenarios has one $500k participant whose rebalance can't find enough counterparties among $1k-$10k wallets (2.7% crossed). That single cohort holds most of the natural requested notional.

## By cohort

| Cohort | Nature | Bilateral | Venue0 | Uplift vs bilateral | Scenarios with uplift | Zero-cross | External orders A -> C |
|---|---|---|---|---|---|---|---|
| THEME_CIRCLE | natural | 34.4% | 43.3% | +25.9% | 40/40 | 0 | 1503 -> 804 |
| INDEX_REBALANCE | natural | 48.3% | 51.7% | +7.0% | 39/40 | 0 | 2009 -> 964 |
| RANDOM_INDEPENDENT | natural | 19.8% | 25.2% | +27.5% | 30/40 | 4 | 1454 -> 967 |
| CONCENTRATED_TECH | natural | 14.2% | 15.9% | +12.1% | 27/40 | 3 | 1269 -> 974 |
| SIZE_SKEW | natural | 2.1% | 2.7% | +32.7% | 40/40 | 0 | 1650 -> 1110 |
| HIGH_COMPLEMENTARITY | constructed-positive | 9.9% | 19.7% | +99.5% | 20/40 | 0 | 504 -> 420 |
| PARTIAL_MATCH | constructed-positive | 7.6% | 14.8% | +95.8% | 17/40 | 0 | 462 -> 378 |
| LOW_COMPLEMENTARITY | stress | 7.5% | 8.3% | +9.8% | 9/40 | 21 | 830 -> 755 |
| ZERO_OVERLAP | stress | 0.0% | 0.0% | n/a | 0/40 | 40 | 739 -> 739 |
| EXTERNAL_ROUTE_STRESS | stress | 23.8% | 31.5% | +32.1% | 34/40 | 1 | 1445 -> 982 |

## When does multi-party matching matter?

Participant count (natural cohorts, pooled):

| Participants | 2 | 3 | 4-6 | 7-9 | 10 | 11 | 12 |
|---|---|---|---|---|---|---|---|
| Bilateral | 1.9% | 3.1% | 4-7% | 7-8% | 8.5% | 31.2% | 35.7% |
| Venue0 | 1.9% | 3.3% | 5-8% | 8-10% | 10.8% | 35.4% | 46.8% |
| Uplift, pts of requested | 0 | 0.2 | 0.8-1.2 | 1.3-2.1 | 2.3 | 4.2 | 11.2 |

Note: the jump at 11-12 participants partly reflects which cohorts produce those counts (THEME_CIRCLE and INDEX_REBALANCE), not only size.

Complementarity (share of requested value that could cross if value balance were the only constraint):

| Complementarity | <0.1 | 0.1 | 0.2 | 0.3 | 0.4 | 0.5 | 0.6 | 0.7+ |
|---|---|---|---|---|---|---|---|---|
| Scenarios | 129 | 34 | 52 | 60 | 53 | 35 | 26 | 11 |
| Bilateral | 1.9% | 7.2% | 12.7% | 21.3% | 23.6% | 33.1% | 46.6% | ~47-60% |
| Venue0 | 2.4% | 8.5% | 15.4% | 25.4% | 31.0% | 41.3% | 55.5% | ~68-82% |
| Uplift, pts | 0.6 | 1.4 | 2.7 | 4.1 | 7.4 | 8.2 | 8.9 | ~21 |

Per scenario, the multi-party share of requested notional has median 0.9% (all) and 1.8% (natural), and p90 12.9% (all) and 7.7% (natural). Multi-party matching adds more than 1% of requested notional in 191/400 scenarios (121/200 natural). In 75 scenarios, pairwise swaps alone captured everything that crossed.

## Residual economics (arm D vs arm C)

| Measure | A market-only | C crossing + market residual | D crossing + economic engine |
|---|---|---|---|
| External orders | 11,865 | 8,093 | 7,328 |
| External notional executed | $55.53M | $49.88M | $49.87M |
| Unfilled (no route) | $9.5k | $6.3k | $0 |
| Deferred (AGGREGATE/WAIT) | 0 | 0 | $16.8k (natural: $119) |
| Estimated external cost | $64.9k (12 bps) | $58.8k (12 bps) | $35.3k (7 bps) |

Arm D decisions over 8,093 external residuals: EXECUTE_NOW 4,917, LIMIT 2,411, AGGREGATE 759, WAIT 6, CANCEL 0. AGGREGATE fired almost entirely in EXTERNAL_ROUTE_STRESS ($20-$300 portfolios), where fixed fees dominate.

Caution: most of D's cost advantage over C comes from Flash LIMIT quotes at $1k+ (~10 bps) being cheaper than Uniswap for several assets. The model assumes LIMIT orders fill at quoted terms. Fill risk is not modeled, so the 7 bps figure is not a claim.

Flash break-even (from the measured curves): Flash LIMIT all-in fell within 50 bps from about $50 for every asset/side (from $5-$30 for a few). It beat Uniswap only from $150-$2,000 for some assets and never for others (NVDA, GOOGL, most SELL sides). The observed $1.20 L6 order sits deep in the uneconomic region (~1,350 bps).

## Failure envelope (negative results)

- **Crossing stops being useful below ~10% complementarity**: 129 of 400 scenarios, 2.4% crossed.
- **Small rounds barely benefit**: 2-3 participants cross 2-3% of requested, with essentially no multi-party gain. Uplift becomes material from about 7+ participants.
- **Bilateral already captures most of the benefit when participants share a template.** In INDEX_REBALANCE, bilateral reaches 48.3% and multi-party adds only 3.4 points.
- **Large participants in small crowds**: SIZE_SKEW crosses 2.7%. A $500k rebalance needs a crowd of its size.
- **Directional flow**: in LOW_COMPLEMENTARITY, 21/40 scenarios crossed nothing.
- **Zero overlap is common in random data**: 69/400 scenarios crossed nothing (40 by construction, 7 natural).
- **Absolute uplift is modest**: in natural cohorts multi-party matching adds about 2 points of requested notional pooled, 1.8 points at the median. It's +23.6% relative to bilateral, but a small slice of total flow.

## Where the results support Venue0

- **Circle-style concentration** is the operating regime. THEME_CIRCLE crosses 43.3% vs 34.4% bilateral, with uplift in 40/40 scenarios. This supports the Circles wedge (PRD 44.1).
- **Larger rounds**: at 12 participants, Venue0 crossed 46.8% vs 35.7% bilateral.
- **Complementary structures** that aren't pairwise (constructed cohorts) roughly double what bilateral matching finds. That's an existence proof, not a frequency claim.
- **Fewer external orders**: C cuts external orders 32% vs market-only across all cohorts, and 39% in natural cohorts (7,885 -> 4,819).

## What would make these conclusions misleading

- Treating scenarios as users, or the cohort mix as the real distribution of Stock Token portfolios.
- Quoting the constructed-positive cohorts (~2x uplift) as typical.
- Quoting pooled all-cohort numbers without noting SIZE_SKEW dominates notional, or the ex-SIZE_SKEW 28.2% without noting it drops a cohort.
- Quoting arm D's 7 bps cost as realized. It assumes limit fills and uses one cost snapshot.
- Reading "fewer external orders" as lower cost at scale. Cost savings are modeled from single-swap quotes at one moment.
- Comparing against a greedy peer-to-peer matcher. The bilateral baseline here is the pairwise optimum.

## Limitations

See `docs/EVAL_CAMPAIGN.md`: synthetic portfolios, one price snapshot, one cost capture, no fill risk for LIMIT, no TWAP quotes, one order per residual asset against USDG, session fixed to `market`.
