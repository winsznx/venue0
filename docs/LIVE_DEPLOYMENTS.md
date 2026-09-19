# Live deployments

[README](../README.md) · [Evidence](EVIDENCE.md) · [Production config](PRODUCTION_CONFIG.md)

The single source of deployment facts. Other documents link here.

## Web application

| | |
|---|---|
| Public app | https://venue0.timjosh507.workers.dev |
| Proof | https://venue0.timjosh507.workers.dev/proof |
| Demo replay | https://venue0.timjosh507.workers.dev/demo |
| Health | https://venue0.timjosh507.workers.dev/api/health |
| Host | Cloudflare Workers (OpenNext), Worker `venue0` |
| Database | Supabase Postgres (eu-west-1) through Cloudflare Hyperdrive |
| Auth | Dynamic, Sandbox environment |

## Chain

| | |
|---|---|
| Network | Robinhood Chain mainnet, chain ID 4663 |
| Explorer | https://robinhoodchain.blockscout.com |
| Venue0Settlement | [`0x9cf871315674830046ab0541ee018f6978e86a3d`](https://robinhoodchain.blockscout.com/address/0x9cf871315674830046ab0541ee018f6978e86a3d) |
| Deployment transaction | [`0x071ee0c035695bcfdfad52ce9e7f11fec5b19a97e6ca80d06e74323ce8d71947`](https://robinhoodchain.blockscout.com/tx/0x071ee0c035695bcfdfad52ce9e7f11fec5b19a97e6ca80d06e74323ce8d71947) |
| Stock Tokens used | NVDA `0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC`, AAPL `0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9`, SPY `0x117cc2133c37B721F49dE2A7a74833232B3B4C0C` (resolved from the live Robinhood registry) |

## Production settlements through the deployed app

Operator-controlled test accounts A, B and C, each signed in through Dynamic in its own browser profile. Each round is a three-way cycle that no pair of accounts could satisfy.

| Round | Transaction | Verifier | Independent | Execution provider | Verification provider |
|---|---|---|---|---|---|
| P1 `0x033bffb3571809957ac3899a5c625ce7025255807c20dafddcc4703b1335438b` | [`0x45c0a4ad35c98e180365bd88bf912ef978f8c1a5a66f8474527cf47d9ec1ec35`](https://robinhoodchain.blockscout.com/tx/0x45c0a4ad35c98e180365bd88bf912ef978f8c1a5a66f8474527cf47d9ec1ec35) | PASS 14/14 | false | Alchemy | Alchemy (fallback: the public RPC had pruned the block by the time verification resumed) |
| P2 `0x6833eb14f22fa9423b069f0aa938bbea61f656cf0f191c176ff939658b3b2ce7` | [`0x17b084d5239e6277e9bde84b89ab9f7aea3e1bb2fa40bf7c91bf285fb8d56b1e`](https://robinhoodchain.blockscout.com/tx/0x17b084d5239e6277e9bde84b89ab9f7aea3e1bb2fa40bf7c91bf285fb8d56b1e) | PASS 14/14 | false | Alchemy | Alchemy (fallback: the public RPC returns HTTP 429 to Cloudflare Workers) |
| P3 `0xeac408f808ecf1d35d2b8af6ccf7b5035e9f97f80a054af5dd267a70ff4a7448` | [`0xd8d95dd809ece9ca6dc4b2fcf343332f62f50005677ef9def433d06edca7edd3`](https://robinhoodchain.blockscout.com/tx/0xd8d95dd809ece9ca6dc4b2fcf343332f62f50005677ef9def433d06edca7edd3) | PASS 14/14 | **true** | Alchemy (`robinhood-mainnet.g.alchemy.com`) | Chainstack (`robinhood-mainnet.core.chainstack.com`) |

P1 and P2 are recorded as they happened and are not revised. Each round's full record (events, participant and approval sets, expected and observed token deltas, verification block, providers): [`p1-verification.json`](../evidence/production/2026-09-19/p1-verification.json), [`p2-verification.json`](../evidence/production/2026-09-19/p2-verification.json), [`p3-verification.json`](../evidence/production/2026-09-19/p3-verification.json).

## Proof-run settlements (scripts, operator wallets)

Before the app existed, the same contract settled the proof rounds G1-G3, the Flash round and the Dynamic agent round. They are listed with their artifacts in [EVIDENCE.md](EVIDENCE.md).
