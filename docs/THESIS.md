# Thesis

[README](../README.md) · [Architecture](ARCHITECTURE.md) · [Campaign results](CAMPAIGN_RESULTS.md)

## The claim

Venues normally match trades, and settlement systems settle them. Venue0 looks at portfolio goals before those trades exist and discovers which portfolio changes should become direct trades at all.

A rebalance starts as a goal ("NVDA at 20%, the rest in SPY"), not an order. Turned into orders on its own, each goal becomes one or more trades against public liquidity. Venue0 collects the goals of many portfolios in a round, turns each into bounded per-asset limits, and solves for the largest set of transfers between those portfolios that moves each of them toward its own target. Only what that solve leaves over becomes an external order.

## Three ways to execute the same round

Take three wallets. A wants to move NVDA into AAPL, B wants to move AAPL into SPY, C wants to move SPY into NVDA.

| Approach | What happens | External orders |
|---|---|---|
| Market only | Every rebalance goes to a pool on its own. Each wallet pays spread, fees and price impact on both legs. | 6 (3 sells, 3 buys) |
| Bilateral matching | Pairs whose wants are exact opposites trade directly. Here no pair qualifies: A wants what B has, but B wants what C has, not what A has. | 6 |
| Venue0 multi-party matching | Each participant only has to balance across all counterparties together, so the ring closes: A sends NVDA to C, C sends SPY to B, B sends AAPL to A. | 0 (plus rounding dust) |

This is the live G2 round on Robinhood Chain: $11.88 of $11.93 crossed in one transaction ([evidence](../evidence/live/L2-cycle/), [tx](https://robinhoodchain.blockscout.com/tx/0xfdd14b8e7c4c4a2aedd567a51a15492159c0d0e67ae7ef94028f7c7aff863035)).

The bilateral baseline in the campaign is not a greedy matcher. It is the exact pairwise optimum from an LP solver, so the measured uplift is what cycles add over the best possible pairwise result.

## What the mechanism is

- **Input is intent, not orders.** Per asset, each participant signs a maximum it will send and a maximum it will receive, valued at one price snapshot for the round.
- **Matching is a flow problem.** Participants and assets form a network. The matcher maximizes crossed value subject to each participant's limits and value balance, on a $0.01 lot grid, with integer arithmetic throughout. Cycles of any length are just flows.
- **The residual is formed, not discarded.** For every participant and asset, requested = crossed + residual, exactly. The residual goes to an engine that compares real execution costs against the user's cap, or carries it into the next round.
- **Settlement is a consequence.** Once participants approve the exact plan, a small contract moves every leg atomically. The contract does not match or price anything.

## What Venue0 did not invent

Delivery versus payment, multilateral netting, batch auctions, atomic settlement, direct OTC transfer, canonical asset registries and advanced order types all predate Venue0. Venue0 uses them. Its contribution is the step before them: deciding, from portfolio goals, which transfers should exist.

## Adjacent work

Pipeshift settles matched trades: given trades that have already been agreed, it moves assets safely between parties. Venue0 works upstream of that. It starts from portfolio targets, discovers which transfers between portfolios should exist, and forms the residual that still needs a market. The two are complementary; a Venue0 plan is exactly the kind of matched set a settlement layer executes.

Pairwise crossing networks, dark pools and internalization match orders that already exist. They see an order, not the portfolio behind it, and they match pairs. Venue0 sees the target and matches rings.

## Where it helps and where it does not

From 400 frozen synthetic scenarios ([CAMPAIGN_RESULTS.md](CAMPAIGN_RESULTS.md)):

- It helps most when many participants rebalance the same set of assets: circle-style rounds crossed 43.3% of requested notional against 34.4% for the best pairwise matcher.
- It adds little in 2-3 participant rounds, when participants follow the same template (pairs already capture most of it), when flow is one-directional, and when one large participant sits in a crowd of small ones.
- Below about 10% complementarity almost nothing crosses (2.4%).

Circles exist because of this: they gather people who rebalance the same assets on a shared schedule, which is the regime where multi-party matching matters.
