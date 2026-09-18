# Claim Ledger

Every public claim, with its evidence. Status: TARGET (not yet shown), PARTIAL (shown in a weaker environment than the claim needs), PROVEN, WITHDRAWN. Environments: MAINNET (Robinhood Chain 4663, broadcast), FORK (anvil fork of mainnet, not broadcast), DEVNET (local anvil, mock tokens), OFFLINE (tests or campaign), DOCS.

Never convert: scenario to user, transaction to adoption, test to production security, quote to fill, submission to execution, HTTP 200 to success, broadcast to state change.

| # | Exact wording | Status | Environment | Sample | Evidence | Limitation |
|---|---|---|---|---|---|---|
| C1 | "VENUE0 completed a 3-wallet Stock Token cycle atomically on Robinhood Chain." | PROVEN | MAINNET | 1 round, $11.93 requested | `evidence/live/L2-cycle/`, tx 0xfdd14b8e7c4c4a2aedd567a51a15492159c0d0e67ae7ef94028f7c7aff863035 | Three wallets controlled by one operator, not three independent users. Small size. Verifier shared the executor RPC. |
| C2 | "The matcher discovers multi-party cycles from portfolio targets without hard-coded legs." | PARTIAL | OFFLINE, FORK | 46 unit/property tests, 5 fork cases | `packages/matcher/test/`, `packages/reference-matcher/test/`, fork L2 `matcher-output.json` | Synthetic intents. Secondary objectives (fewest legs, lowest allocation error among equal optima) not optimized. |
| C3 | "Production matcher output agrees with an independent exact reference solver." | PARTIAL | OFFLINE | 150 random 2-5 participant rounds + fixed cases | `packages/reference-matcher/test/reference.test.ts` | Agreement is on eligibility, feasibility and optimum crossed lots, not identical per-asset legs when optima are degenerate. Campaign parity not run yet. |
| C4 | "Partial overlap crosses what it can and leaves an exact residual; nothing disappears." | PROVEN | OFFLINE, FORK, MAINNET (`evidence/live/L3-partial/`) | property tests + 1 fork round | matcher property tests; `evidence/rehearsal/fork/L3-partial/` | Exactness is in raw units; USD residual may differ from requested minus crossed by at most 1 wei-USD per fill. |
| C5 | "With zero overlap VENUE0 returns NO_CROSS and does not manufacture a match." | PROVEN | OFFLINE, FORK, MAINNET | unit tests + fork + 1 live round | `evidence/live/L4-no-cross/` | No tx by design; evidence is the matcher output on live balances and prices. |
| C6 | "Settlement is self-custodied: tokens move wallet to wallet in one transaction and the contract never holds them." | PARTIAL | OFFLINE, FORK | 32 contract tests incl. 512-run fuzz; fork L1-L3 `balances.noCustody` | `contracts/test/`, fork verifier reports | Not audited. Stock Tokens are issuer-pausable and blocklist-gated, so any leg can revert (D-005). |
| C7 | "Every settlement is independently verified from chain data." | PARTIAL | DEVNET, FORK | 1 devnet test with tamper cases, 3 fork rounds | `packages/verifier/`, fork `verifier-report.json` | In fork mode verifier and executor share the anvil RPC. Live independence requires `VERIFIER_RPC_URL` on a different provider. |
| C8 | "VENUE0 materially reduces how much Stock Token portfolio-rebalance flow needs public liquidity." | TARGET | | | | No campaign run. No percentage may be stated until the frozen 100+ scenario campaign produces it. |
| C9 | "Residuals execute through Uniswap on Robinhood Chain." | TARGET | | | | No API key, no quote yet. |
| C10 | "Residuals use Definitive Flash advanced orders (Limit/TWAP)." | TARGET | | | | No API key, no live quote for the exact asset yet. |
| C11 | "A portfolio agent acts through a Dynamic wallet on Robinhood Chain." | TARGET | | | | No Dynamic environment yet. |
