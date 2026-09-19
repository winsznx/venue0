# @venue0/assets

Canonical Robinhood Stock Token identity and valuation.

**Input.** The live Robinhood registry (`https://api.robinhood.com/rhj/assets`), the Chainlink feed directory, Robinhood's price endpoint, and onchain reads on Robinhood Chain.

**Output.** `StockTokenRegistry` of canonical tokens; `verifyStockTokenOnchain` results; `PriceSnapshot` values from Chainlink (`readChainlinkSnapshot`, and `readChainlinkSnapshots` for many feeds in one pinned-block multicall) or from REST (`restSnapshot`); `canTrade` from trading capabilities.

**Invariants.**
- A token is usable only if its address came from the current registry, its status is active, bytecode exists, and onchain `symbol()`, `decimals()` and `uid()` match the registry record.
- Lookalikes (same ticker, other address) are rejected.
- Raw underlying prices are multiplied by the token multiplier exactly once; Chainlink feed prices are already adjusted.
- A feed is bound to a token by exact directory name and must agree with the normalized REST price.
- Unknown trading-capability shapes mean not tradable.

**Tests.** `test/assets.test.ts` (against a recorded registry fixture) and `test/chainlink-batch.test.ts`.

**In the product.** Portfolio reads, round snapshots and target checks. Design notes: [docs/DECISIONS.md](../../docs/DECISIONS.md) (D-002 to D-005).
