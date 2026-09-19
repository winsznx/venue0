# Gates

[README](../README.md) · [Evidence](EVIDENCE.md) · [Live deployments](LIVE_DEPLOYMENTS.md) · [Gate log](history/GATE_LOG.md)

A gate passes only on an independently checked postcondition, never on a broadcast or an HTTP 200. The chronological log with every intermediate state is in [history/GATE_LOG.md](history/GATE_LOG.md).

| Gate | Status | Environment | Evidence | Notes |
|---|---|---|---|---|
| G0 transfer | PASS | Robinhood Chain mainnet | [`evidence/live/L0-transfer/`](../evidence/live/L0-transfer/), [0xb3ea…74f8](https://robinhoodchain.blockscout.com/tx/0xb3eaab11773e0341ceea4a10854740d9a1cfc5e575f3e72140968232fa2074f8) | Stock Token transfer and balance readback |
| G1 bilateral | PASS | mainnet | [`evidence/live/L1-bilateral/`](../evidence/live/L1-bilateral/), [0xd125…4a94](https://robinhoodchain.blockscout.com/tx/0xd125f8668883ae888a6f0507a09d665e49f77a202b1dc2dbf7e9936fc2764a94) | verifier PASS; independent re-verification PASS |
| G2 three-wallet cycle | PASS | mainnet | [`evidence/live/L2-cycle/`](../evidence/live/L2-cycle/), [0xfdd1…3035](https://robinhoodchain.blockscout.com/tx/0xfdd14b8e7c4c4a2aedd567a51a15492159c0d0e67ae7ef94028f7c7aff863035) | $11.88 of $11.93 crossed; no bilateral pair existed; 0 external orders vs 6 |
| G3 partial | PASS | mainnet | [`evidence/live/L3-partial/`](../evidence/live/L3-partial/), [0x9d4d…aced](https://robinhoodchain.blockscout.com/tx/0x9d4d14d2eee13e542cbbf58e8feab98755035f9280585878f2213984e23faced) | crossed + residual = requested, exactly |
| G4 no-cross | PASS | mainnet state | [`evidence/live/L4-no-cross/`](../evidence/live/L4-no-cross/) | NO_CROSS, no transaction by design |
| Uniswap residual | PASS | mainnet | [`evidence/live/L5-residual/`](../evidence/live/L5-residual/), [0xaec4…84db](https://robinhoodchain.blockscout.com/tx/0xaec4488e2ba8d2dcd14fdbaec15d6fde31398a980175fd1fe5bcf8f56d8a84db) | exact quoted output received |
| Flash LIMIT | PASS (integration) | mainnet | [`evidence/live/L6-flash-residual/`](../evidence/live/L6-flash-residual/), fill [0xa30e…5fc6](https://robinhoodchain.blockscout.com/tx/0xa30e95a18cc90b99f141f611118dce5bcd7251111038d5bab9d79947f9e55fc6) | economically poor at $1.20 (13.6% fee); the engine now returns AGGREGATE for it |
| Dynamic agent round | PASS | mainnet, Dynamic Sandbox | [`evidence/live/L7-dynamic-agent/`](../evidence/live/L7-dynamic-agent/), [0x0f85…1873](https://robinhoodchain.blockscout.com/tx/0x0f851b81082f93f863ddceeae3f4aff47ad6eac52f04482985eb75e187a91873) | server wallet, not delegated access |
| Campaign | COMPLETE | offline | [`campaign/results/`](../campaign/results/), [CAMPAIGN_RESULTS.md](CAMPAIGN_RESULTS.md) | 400 frozen synthetic scenarios, 0 failures, 400/400 reference parity |
| Local product E2E | PASS | local app, mainnet | [`evidence/product/2026-09-18/`](../evidence/product/2026-09-18/) | two-user round and three-user cycle through the app; edges 22/22; concurrency 13/13 |
| Public deployment | PASS | Cloudflare Workers, Supabase | [LIVE_DEPLOYMENTS.md](LIVE_DEPLOYMENTS.md) | https://venue0.timjosh507.workers.dev |
| Production auth | PASS | public app, HTTPS, Dynamic Sandbox | [`prod-edges.log`](../evidence/production/2026-09-19/prod-edges.log) | 15/15, including forged wallet association rejected |
| Production multi-user | PASS | public app | [`prod-journey.log`](../evidence/production/2026-09-19/prod-journey.log), [`prod-concurrency.log`](../evidence/production/2026-09-19/prod-concurrency.log) | three operator test accounts, separate browser profiles; concurrency 13/13 |
| Production settlement | PASS | public app, mainnet | P1 [0x45c0…ec35](https://robinhoodchain.blockscout.com/tx/0x45c0a4ad35c98e180365bd88bf912ef978f8c1a5a66f8474527cf47d9ec1ec35), P2 [0x17b0…6b1e](https://robinhoodchain.blockscout.com/tx/0x17b084d5239e6277e9bde84b89ab9f7aea3e1bb2fa40bf7c91bf285fb8d56b1e), P3 [0xd8d9…edd3](https://robinhoodchain.blockscout.com/tx/0xd8d95dd809ece9ca6dc4b2fcf343332f62f50005677ef9def433d06edca7edd3) | P1, P2: verifier PASS, independent false. P3: verifier PASS, independent true |
| Production persistence | PASS | public app | [history/GATE_LOG.md](history/GATE_LOG.md) | rounds, sessions, targets and activity survived redeploys during the run |
| Independent verification | PASS | public app, mainnet | [`p3-verification.json`](../evidence/production/2026-09-19/p3-verification.json) | P3: executed through Alchemy, verified through Chainstack, 14/14 |
| Production E2E | PASS | public app | this table | all production gates above |

Checks at closeout: 95 TypeScript tests, 32 Foundry tests, typecheck, lint and `next build` pass.
