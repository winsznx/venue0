# Keys, Funds and Accounts Needed

Checked against current docs on 2026-09-17. Put values in a local `.env` (copy `.env.example`); `.env` is gitignored. Don't paste private keys into chat.

## Required now: live G0-G4

These gates are fully built and rehearsed on a mainnet fork (`docs/GATES.md`). Only funds and keys stand between them and live evidence.

| Provider | Exact credential | Required | Network | Used for | Where to get it | Env var | Costs money | Approval / allowlist | Can build continue without it | Security notes |
|---|---|---|---|---|---|---|---|---|---|---|
| Self-custodied wallets | 3 EOA private keys (wallets A, B, C) | Required | Robinhood Chain mainnet 4663 | Sign intents, plan approvals, allowances; hold proof Stock Tokens. Wallet A also deploys `Venue0Settlement` and submits settlement unless a deployer key is set | Run `pnpm wallets:generate` (writes fresh keys to `.env`, prints only addresses), or supply your own new keys | `VENUE0_WALLET_A_PRIVATE_KEY`, `VENUE0_WALLET_B_PRIVATE_KEY`, `VENUE0_WALLET_C_PRIVATE_KEY` | No | No | Yes for code; no for live G0-G4 | Use brand-new hot wallets that hold only proof funds. Never reuse a personal wallet. |
| Robinhood Chain gas | ETH on Robinhood Chain | Required | Mainnet 4663 | Gas for 1 deploy, about 6 approvals, 3 settlements, 1 transfer | Bridge ETH per https://docs.robinhood.com/chain/bridging/ (Arbitrum canonical, Relay, Across, LiFi and others listed there) | none (funds) | Yes, small. Observed execution gas price 0.054 gwei; the fork's 3-leg settlement used 345k gas | No | Yes for code; no for live | Suggest 0.003 ETH per wallet. Confirm the bridge route supports chain 4663 before sending. |
| Robinhood Stock Tokens | Canonical NVDA, AAPL, SPY Stock Tokens | Required | Mainnet 4663 | G2 hero cycle needs A holding NVDA, B holding AAPL, C holding SPY. The same balances then cover G0, G1, G3 (G4 sends no tx) | Secondary-market routes listed in https://docs.robinhood.com/chain/building-with-stock-tokens/ (RFQ via 0x / 1inch Fusion / LiFi, AMMs such as Uniswap, Rialto, Lighter), or Robinhood Wallet where available. Use exactly these contracts from the live registry: NVDA `0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC`, AAPL `0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9`, SPY `0x117cc2133c37B721F49dE2A7a74833232B3B4C0C` | none (funds) | Yes. Suggest about $30 each (the rehearsal used $25) | Eligibility: not offered to U.S. persons; also restricted in Canada, UK, Switzerland and elsewhere (https://docs.robinhood.com/chain/stock-tokens/). Must be lawfully eligible; no VPN circumvention | Yes for code; no for live | Tokens with the same ticker at any other address are not Robinhood Stock Tokens. The scripts reject them. |

## Strongly recommended now

| Provider | Exact credential | Required | Network | Used for | Where to get it | Env var | Costs money | Approval / allowlist | Can build continue without it | Security notes |
|---|---|---|---|---|---|---|---|---|---|---|
| Alchemy (Robinhood's recommended provider) | Alchemy API key with Robinhood Chain mainnet enabled | Optional | Mainnet | Reliable executor RPC. Public RPC is rate-limited, load-balanced across backends at different heights, and prunes state older than about 10,000 blocks | https://www.alchemy.com/ ; endpoint format from https://docs.robinhood.com/chain/connecting/ : `https://robinhood-mainnet.g.alchemy.com/v2/<key>` | `ROBINHOOD_RPC_URL` | Free tier exists | No | Yes (public RPC fallback works, verified today) | Server-side only. |
| Second RPC provider (QuickNode, Chainstack, dRPC or Blockdaemon per Robinhood docs) | Endpoint URL with archive/historical state | Optional | Mainnet | Independent verifier readback from a different provider than the executor (PRD section 32) | Provider list: https://docs.robinhood.com/chain/connecting/ | `VERIFIER_RPC_URL` | Free tiers vary | No | Yes, but live verifier independence is weaker and must run within minutes | Server-side only. |

## Can wait (later phases; sign-ups can start now because of lead time)

| Provider | Exact credential | Required | Network | Used for | Where to get it | Env var | Costs money | Approval / allowlist | Can build continue without it | Security notes |
|---|---|---|---|---|---|---|---|---|---|---|
| Uniswap Trading API | API key | Required for Phase 9 | Mainnet (no sandbox) | `/check_approval`, `/quote`, `/swap` or `/order` for residuals; `/permissions` to learn whether Stock Tokens are permissioned on chain 4663 | https://developers.uniswap.org/dashboard/welcome | `UNISWAP_API_KEY` | API is free (docs FAQ). Swaps cost gas and the traded amount | Error docs call it self-serve; the FAQ still says to request access | Yes | Keep server-side. Default 6 rps. |
| Definitive Flash | Flash API key (single `x-definitive-api-key` header; there is no secret) | Required for Phase 11 | Mainnet (no sandbox) | Quote, sign and submit Limit / TWAP residual orders, then order status | app.definitive.fi -> sign up -> More -> Flash -> Create Flash Key (https://flash.definitive.fi/docs/getting-started.md) | `FLASH_API_KEY` | No integration fee; 10 bps per trade plus gas. Orders are cancelled when gas + fees exceed 30% of order value, so residuals need real size | Self-serve | Yes | A public dev key exists in the docs, but orders placed with it attribute to Definitive, so the track needs our own key. |
| Dynamic | Sandbox Environment ID | Required for Phase 10 | Sandbox | Identify the Dynamic environment | Dynamic dashboard -> Developer -> SDK and API Keys (https://www.dynamic.xyz/docs/overview/developer-dashboard/tokens-api-keys) | `DYNAMIC_ENVIRONMENT_ID` | Sandbox free, 1,000-user cap | No | Yes | Not secret, but keep it per environment. |
| Dynamic | API token (scopes for WaaS / server wallets; delegated signing scope `waas.delegatedAccess.signMessage`) | Required for Phase 10 | Sandbox | Server or agent wallet creation and signing from the backend | Same dashboard page | `DYNAMIC_API_TOKEN` | Sandbox free | Dashboard toggles: Embedded Wallets on; "multiple embedded wallets per chain" for server wallets; Delegated Access toggle for the delegated path | Yes | Secret. Grants signing authority together with key shares. |
| Dynamic | Wallet backup password (we generate it) | Required for server/agent wallets | Sandbox | Encrypts key-share backups; losing it makes backups undecryptable | Generated locally | `DYNAMIC_WALLET_PASSWORD` | No | No | Yes | Secret; store like a private key. |
| Dynamic | Delegation RSA private key (PEM) and webhook secret, plus a public HTTPS webhook URL | Required only for the delegated-access path | Sandbox | Decrypt delegated key shares from `wallet.delegation.created`; verify webhook HMAC | RSA pair can be generated by us or by Dynamic (Embedded Wallets -> Delegated Access); webhook secret on the webhook detail page | `DYNAMIC_DELEGATION_PRIVATE_KEY_PEM`, `DYNAMIC_WEBHOOK_SECRET` | Sandbox free; Delegated Access needs Enterprise in production | End user must approve delegation in a client SDK, so this needs the frontend and a deployed webhook | Yes | Never log shares; delete on `wallet.delegation.revoked`. |
| LLM for the portfolio agent (Phase 14) | Provider API key. Provider not chosen yet (Anthropic API or Bankr LLM Gateway); docs will be checked before Phase 14 | Required for Phase 14 | n/a | Natural-language goal -> structured target. Never used for arithmetic, addresses or prices | To be confirmed | TBD | Yes, usage-based | TBD | Yes | Server-side only. |
| X account | Post tagging @DefinitiveFi | Required for the Flash track submission | n/a | Flash track requirement | Your X account | n/a | No | No | Yes | Human action. |
| Uniswap developer feedback form | Form submission | Required for the Uniswap track | n/a | Uniswap track requirement | Link from the Runtime Uniswap track page | n/a | No | No | Yes | Human action. |

## Not needed

| Item | Why |
|---|---|
| Flash API secret | Flash auth is one header, `x-definitive-api-key`; no secret or HMAC (OpenAPI `securitySchemes`). |
| Robinhood API key | `/rhj/assets` and `/rhj/prices/{symbol}` answered without auth today. |
| Chainlink key | Feeds are read onchain; the feed directory is a public JSON file. |
| Blockscout API key | Robinhood's deploy docs verify with `--verifier blockscout` and no key. |
| Database / Supabase credentials | Proof state and evidence are machine-readable files. The PRD makes Postgres conditional on needing persistence; revisit with the web app and Circles. |
| Robinhood Chain testnet funds | No Stock Tokens or faucet are documented for testnet 46630. The mainnet-fork rehearsal uses the real token contracts instead (D-010). |
| Separate deployer key | Wallet A deploys and submits by default. `VENUE0_DEPLOYER_PRIVATE_KEY` is optional. |
| Bankr API key | Bankr integration is optional for the grand prize and nothing in the build depends on it. |

## Run order once funded

```bash
pnpm rehearse                         # fork rehearsal of everything below, no funds used
pnpm proof:round --live L2 30         # hero cycle first, on fresh balances
pnpm proof:l0 --live NVDA 0.01        # G0 transfer A -> B
pnpm proof:round --live L1 30         # bilateral
pnpm proof:round --live L3 30         # partial overlap
pnpm proof:round --live L4 30         # zero overlap, no transaction
```

After the first live round, set `CROSSING_SETTLEMENT_ADDRESS` so later rounds reuse the deployed contract.
