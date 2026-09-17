# Gates

Status values: NOT_STARTED, IN_PROGRESS, PASS, FAIL, BLOCKED_ON_CREDENTIAL_OR_FUNDS. PASS requires an independently verified postcondition, never a broadcast or HTTP 200.

Current product state: THESIS LOCKED. Moves to MECHANISM LOCKED only after G2, G3 and G4 pass.

| Gate | Description | Status | Evidence | Updated |
|---|---|---|---|---|
| P0 | Reality verification: RPC, live assets API, canonical resolver, onchain metadata, demo assets | PASS | `evidence/research/robinhood-assets-current.json` | 2026-09-17 |
| G0 | Live Stock Token transfer A -> B | NOT_STARTED | `evidence/live/L0-transfer/` | |
| G1 | Two-wallet atomic exchange | NOT_STARTED | `evidence/live/L1-bilateral/` | |
| G2 | 3 wallets / 3 assets / non-trivial cycle (hero) | NOT_STARTED | `evidence/live/L2-cycle/` | |
| G3 | Partial overlap with exact residual | NOT_STARTED | `evidence/live/L3-partial/` | |
| G4 | Zero overlap, NO_CROSS | NOT_STARTED | `evidence/live/L4-no-cross/` | |

## Log

### 2026-09-17 P0 PASS

- `eth_chainId` on `https://rpc.mainnet.chain.robinhood.com` = 4663; block 65526682 read.
- `GET /rhj/assets`: 194 records, 194 schema-valid, 194 canonical, all `ASSET_STATUS_ACTIVE`, all a single deployment on 4663, all 18 decimals, capability shape `SESSION_MAP` for all 194. 27 tokens carry a non-unit multiplier (CRWD = 4.0). No pending multipliers. WYFI, SLS, XNDU are whole-only.
- Candidates NVDA, AAPL, SPY, QQQ, TSLA, MSFT, AMZN, GOOGL, META each passed: bytecode present, onchain symbol / decimals / uid / uiMultiplier equal to API, token and registry unpaused, tradable whole + fractional in all three sessions, Chainlink feed present and within 100 bps of normalized REST.
- Demo universe for G2: NVDA, AAPL, SPY (PRD hero), with QQQ/TSLA/MSFT as alternates.
- Limitation: onchain transferability was demonstrated on a mainnet fork only (D-005). Live transfer is G0.
