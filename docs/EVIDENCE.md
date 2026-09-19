# Evidence index

[README](../README.md) · [Live deployments](LIVE_DEPLOYMENTS.md) · [Gates](GATES.md) · [Claim ledger](CLAIM_LEDGER.md)

Every row points at the artifact that supports it. Transactions are on Robinhood Chain mainnet (4663) unless marked otherwise. "Operator" means wallets or test accounts controlled by the builders, never users.

## Mechanism on mainnet (proof scripts, operator wallets)

Each run directory holds the asset resolution, price evidence, valuation snapshot, signed intents, matcher output, reference-solver comparison, settlement plan with approvals, receipt and verifier report.

| Claim | Environment | Artifact | Transaction | Status | Limitation |
|---|---|---|---|---|---|
| G0: a Stock Token transfer between proof wallets, read back | mainnet | [`evidence/live/L0-transfer/`](../evidence/live/L0-transfer/) | [0xb3ea…74f8](https://robinhoodchain.blockscout.com/tx/0xb3eaab11773e0341ceea4a10854740d9a1cfc5e575f3e72140968232fa2074f8) | PASS | connectivity and balance-readback check, not a Venue0 settlement |
| G1: two-wallet crossing | mainnet | [`evidence/live/L1-bilateral/`](../evidence/live/L1-bilateral/) | [0xd125…4a94](https://robinhoodchain.blockscout.com/tx/0xd125f8668883ae888a6f0507a09d665e49f77a202b1dc2dbf7e9936fc2764a94) | PASS, verifier PASS | $3.78 requested |
| G2: three-wallet cycle where no pair could match | mainnet | [`evidence/live/L2-cycle/`](../evidence/live/L2-cycle/) | [0xfdd1…3035](https://robinhoodchain.blockscout.com/tx/0xfdd14b8e7c4c4a2aedd567a51a15492159c0d0e67ae7ef94028f7c7aff863035) | PASS, $11.88 of $11.93 crossed, 0 external orders vs 6 market-only | one operator controls all three wallets |
| G3: partial overlap with an exact residual | mainnet | [`evidence/live/L3-partial/`](../evidence/live/L3-partial/) | [0x9d4d…aced](https://robinhoodchain.blockscout.com/tx/0x9d4d14d2eee13e542cbbf58e8feab98755035f9280585878f2213984e23faced) | PASS, verifier PASS | $2.45 requested |
| G4: zero overlap returns NO_CROSS | mainnet balances and prices | [`evidence/live/L4-no-cross/`](../evidence/live/L4-no-cross/) | none by design | PASS | evidence is the matcher output on live state |
| Independent re-verification of G1-G3 through a second provider | mainnet | `verifier-report-independent.json` in each run directory | as above | PASS | same code as the primary verifier, separate RPC |
| Uniswap residual execution (the G3 residual) | mainnet | [`evidence/live/L5-residual/`](../evidence/live/L5-residual/) | [0xaec4…84db](https://robinhoodchain.blockscout.com/tx/0xaec4488e2ba8d2dcd14fdbaec15d6fde31398a980175fd1fe5bcf8f56d8a84db) | PASS, received exactly the quoted output | $0.56 swap, CLASSIC v4 route only |
| Flash LIMIT residual order | mainnet | [`evidence/live/L6-flash-round/`](../evidence/live/L6-flash-round/), [`evidence/live/L6-flash-residual/`](../evidence/live/L6-flash-residual/) | round [0xeea6…6b87](https://robinhoodchain.blockscout.com/tx/0xeea682902f0fe4c6d217b10cc2f625985c5d6e9ea147d4a6df982cd71e656b87), fill [0xa30e…5fc6](https://robinhoodchain.blockscout.com/tx/0xa30e95a18cc90b99f141f611118dce5bcd7251111038d5bab9d79947f9e55fc6), order `1ae2aa7a-91b9-46d3-bf18-5f5095a062fc` | integration PASS | fee was 13.6% of the $1.20 order: economically poor at that size |
| Economic engine on the same residual | live inputs, decision only | [`evidence/live/L6-residual-decision/`](../evidence/live/L6-residual-decision/) | none | decision AGGREGATE | decision replay; no order placed |
| Dynamic server-wallet agent takes part in a round | mainnet, Dynamic Sandbox | [`evidence/live/L7-dynamic-agent/`](../evidence/live/L7-dynamic-agent/) | [0x0f85…1873](https://robinhoodchain.blockscout.com/tx/0x0f851b81082f93f863ddceeae3f4aff47ad6eac52f04482985eb75e187a91873) | PASS, verifier PASS | server wallet, not user-delegated access; scripted agent |
| Mainnet-fork rehearsal of G0-G4 | anvil fork | [`evidence/rehearsal/fork/`](../evidence/rehearsal/fork/) | fork only | PASS | not broadcast |

## Product (the web app)

| Claim | Environment | Artifact | Transaction | Status | Limitation |
|---|---|---|---|---|---|
| Local product E2E: two-user round and three-user cycle through the app | local app, mainnet | [`evidence/product/2026-09-18/summary.json`](../evidence/product/2026-09-18/summary.json), `test1.log`, `test2.log` | [0x19ee…b85c](https://robinhoodchain.blockscout.com/tx/0x19ee8cec913d58f498937f41cff8242dcf1a5e3eb58aa317cdab0fb61176b85c), [0x4929…0f4d](https://robinhoodchain.blockscout.com/tx/0x4929221f2363cce65e9ffe1387e8287c1ed7603075878498b13cb8729cbe0f4d) | PASS | operator test accounts, embedded database |
| Local edge, concurrency and persistence checks | local app | `edges.log`, `concurrency.log`, `persist.log` in the same directory | none | PASS (22/22, 13/13, restart) | |
| Production P1 through the deployed app | public app, mainnet | [`evidence/production/2026-09-19/prod-journey.log`](../evidence/production/2026-09-19/prod-journey.log), `prod-finish.log` | [0x45c0…ec35](https://robinhoodchain.blockscout.com/tx/0x45c0a4ad35c98e180365bd88bf912ef978f8c1a5a66f8474527cf47d9ec1ec35) | verifier PASS, independent false | verification fell back to the execution provider |
| Production P2 | public app, mainnet | [`prod-round2.log`](../evidence/production/2026-09-19/prod-round2.log) | [0x17b0…6b1e](https://robinhoodchain.blockscout.com/tx/0x17b084d5239e6277e9bde84b89ab9f7aea3e1bb2fa40bf7c91bf285fb8d56b1e) | verifier PASS, independent false | same fallback |
| Production P3 with independent verification | public app, mainnet | [`p3-verification.json`](../evidence/production/2026-09-19/p3-verification.json), `prod-round3.log` | [0xd8d9…edd3](https://robinhoodchain.blockscout.com/tx/0xd8d95dd809ece9ca6dc4b2fcf343332f62f50005677ef9def433d06edca7edd3) | PASS 14/14, independent true (Alchemy executes, Chainstack verifies) | Chainstack free plan keeps ~13 s of state |
| Production auth and authorization | public app over HTTPS | [`prod-edges.log`](../evidence/production/2026-09-19/prod-edges.log) | none | 15/15 PASS | Dynamic Sandbox. The invite race in this run returned intermittent 500s (Hyperdrive through Supabase's session pooler); fixed by moving Hyperdrive to the direct connection, see `invite-race.log` |
| Production concurrency | public app, Supabase | [`prod-concurrency.log`](../evidence/production/2026-09-19/prod-concurrency.log), [`invite-race.log`](../evidence/production/2026-09-19/invite-race.log) | none | 13/13 PASS; 80 concurrent invite redemptions, no 5xx | bursts of 10-20 requests, not a load test |

## Offline

| Claim | Environment | Artifact | Status | Limitation |
|---|---|---|---|---|
| 400-scenario frozen campaign, four arms | offline | [`campaign/results/`](../campaign/results/), [CAMPAIGN_RESULTS.md](CAMPAIGN_RESULTS.md), methodology [EVAL_CAMPAIGN.md](EVAL_CAMPAIGN.md) | complete, 0 failures | synthetic portfolios, one price snapshot |
| Matcher agrees with an independent reference solver | offline | `packages/reference-matcher/test/`, `campaign/results/summary.json` (`parity`) | 400/400 plus 150 property rounds | agreement on optimum crossed value, not identical legs when optima tie |
| Settlement contract behavior | Foundry | [`contracts/test/`](../contracts/test/) | 32 tests incl. fuzz | not externally audited |
| TypeScript packages and app logic | vitest | `packages/*/test/` | 95 tests | |
