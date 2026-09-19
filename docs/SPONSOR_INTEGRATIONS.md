# Sponsor integrations

[README](../README.md) · [Evidence](EVIDENCE.md) · [Sponsor findings](SPONSOR_FINDINGS.md)

Each section states the role, what is proven, where the code is, and what is not claimed.

## Robinhood Chain

**Role.** The settlement chain and the source of every asset. Venue0 trades only canonical Robinhood Stock Tokens on Robinhood Chain mainnet (4663).

**Proven.** Every live settlement: proof rounds G1-G3, the Flash and Dynamic rounds, and deployed-app rounds P1-P3, all through [`Venue0Settlement`](https://robinhoodchain.blockscout.com/address/0x9cf871315674830046ab0541ee018f6978e86a3d). Assets are resolved at runtime from `https://api.robinhood.com/rhj/assets` and checked onchain; holdings are valued with Chainlink Stock Token feeds read at one pinned block and cross-checked against Robinhood's REST price.

**Code.** [`packages/assets`](../packages/assets/) (registry, canonical identity, onchain checks, Chainlink valuation), [`contracts/src/Venue0Settlement.sol`](../contracts/src/Venue0Settlement.sol), [`packages/settlement`](../packages/settlement/).

**Evidence.** [EVIDENCE.md](EVIDENCE.md), [LIVE_DEPLOYMENTS.md](LIVE_DEPLOYMENTS.md).

## Dynamic

**Role.** User sign-in and wallets in the app, and a server-wallet agent that can take part in a round.

**Proven.**
- In the app: users sign in with Dynamic (email with an embedded wallet, or an external wallet) on Robinhood Chain 4663. The server verifies Dynamic's JWT and binds the session to a wallet Dynamic verified. Three test accounts used this path in production.
- As an agent: a Dynamic Sandbox server wallet (2-of-2 MPC) signed its EIP-712 intent, its plan approval and its allowance transaction in live round L7 ([evidence](../evidence/live/L7-dynamic-agent/), [tx](https://robinhoodchain.blockscout.com/tx/0x0f851b81082f93f863ddceeae3f4aff47ad6eac52f04482985eb75e187a91873)).

**Code.** [`apps/web/components/wallet/`](../apps/web/components/wallet/), [`apps/web/lib/server/session.ts`](../apps/web/lib/server/session.ts), [`packages/dynamic`](../packages/dynamic/).

**Not claimed.** User-owned delegated access (an agent signing for a user within limits) is not implemented. The app shows the SDK's delegation status and says it is not offered. Everything runs in Dynamic's Sandbox environment.

## Uniswap

**Role.** Public liquidity for residuals: the part of a rebalance no other participant could take.

**Proven.** A live residual swap through the Trading API: `/check_approval`, Permit2 approval, requote, signed permit, `/swap` with simulation, send, and a balance readback that matched the quoted output exactly ([evidence](../evidence/live/L5-residual/), [tx](https://robinhoodchain.blockscout.com/tx/0xaec4488e2ba8d2dcd14fdbaec15d6fde31398a980175fd1fe5bcf8f56d8a84db)). In the app, users can trade their residual on Uniswap from their own wallet, and the residual engine prices routes from live Uniswap quotes.

**Code.** [`packages/uniswap`](../packages/uniswap/), [`apps/web/lib/server/residuals.ts`](../apps/web/lib/server/residuals.ts).

**Not claimed.** UniswapX (`/order`) was not exercised; only CLASSIC routes were executed. The in-app Uniswap residual path was not exercised in the end-to-end runs: the engine judged those leftovers too small to trade, and they were carried forward.

**Feedback.** [FEEDBACK.md](../FEEDBACK.md).

## Definitive Flash

**Role.** Advanced residual execution: limit and TWAP orders.

**Proven.** A live LIMIT order: exact-amount approval, signed EIP-712 FlashOrder, submit, `ORDER_STATUS_FILLED`, and an onchain readback of the fill ([evidence](../evidence/live/L6-flash-residual/), fill [tx](https://robinhoodchain.blockscout.com/tx/0xa30e95a18cc90b99f141f611118dce5bcd7251111038d5bab9d79947f9e55fc6), order `1ae2aa7a-91b9-46d3-bf18-5f5095a062fc`).

**Boundary.** The order was $1.20. Flash's roughly fixed fee ($0.163) was 13.6% of it, so the fill was price-protected but economically poor. The residual engine was rebuilt to compare all-in costs; given the same residual today it returns AGGREGATE (carry it into the next round) instead of paying the fee ([decision replay](../evidence/live/L6-residual-decision/)). In the campaign's measured cost curves, Flash LIMIT beat Uniswap from about $150-$2,000 for some assets and never for others ([CAMPAIGN_RESULTS.md](CAMPAIGN_RESULTS.md)).

**Code.** [`packages/flash`](../packages/flash/), [`packages/residual`](../packages/residual/).

**Not claimed.** TWAP was quoted but not executed live. Flash routes are evaluated by the engine but are not an in-app action.

## Bankr

Venue0 has no Bankr API integration and does not claim one. Per the Runtime rules in the PRD, every Runtime submission is eligible for the Bankr grand prize and a Bankr integration is optional. Venue0's relevance is the theme, AI and onchain finance: a portfolio agent that turns intent into verified onchain settlement.
