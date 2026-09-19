# Uniswap Trading API feedback

[README](../README.md) · [Sponsor integrations](SPONSOR_INTEGRATIONS.md) · [Sponsor findings](SPONSOR_FINDINGS.md)

From building VENUE0's residual execution on Robinhood Chain (4663), September 2026. VENUE0 crosses complementary portfolio rebalances between wallets first, then sends only the unmatched residual to Uniswap. Integration code: [`packages/uniswap/src/`](../packages/uniswap/src/), live run: [`scripts/live/l5-residual.ts`](../scripts/live/l5-residual.ts), evidence: [`evidence/live/L5-residual/`](../evidence/live/L5-residual/).

## What worked

- Robinhood Stock Tokens quoted on the first try with CLASSIC routes through v3 and v4 pools, including a direct Stock Token to Stock Token route (NVDA -> AAPL, v4).
- The live swap delivered exactly the quoted output.
- `/permissions` answered the question the docs leave open: NVDA and AAPL are not permissioned on 4663.
- `simulateTransaction: true` on `/swap` gave confidence before sending a mainnet tx.

## Friction

- **Permissioned-token router version conflict.** The permissioned-pools page says to send `x-universal-router-version: 2.2.0`, but the OpenAPI enum only allows `2.0` and `2.1.1`, and no 2.2.0 deployment is listed for any chain. We had to call `/permissions` to learn it didn't apply to us.
- **No token-level statement for Robinhood Stock Tokens.** The docs could say whether Stock Tokens are permissioned; we only found out via the API.
- **`routeString` fee rendering.** Some v4 Stock Token / USDG routes show a fee of `838.8608%`, which looks like a dynamic-fee sentinel printed as a percentage. It's confusing when logging routes as evidence.
- **API key onboarding wording differs.** The errors page calls keys self-serve; the FAQ still says to request access.
- **Approval then quote ordering.** After a Permit2 approval, the earlier quote's `permitData` can be stale, so we requote. A note in the integration guide would save a failed swap.

## Requests

- Publish per-chain UniswapX minimum order sizes (the docs say they exist but give no numbers for 4663).
- Include `isPermissioned` in `/quote` responses so integrators don't need a separate call.
