# Uniswap Trading API feedback

[README](README.md) · [Sponsor integrations](docs/SPONSOR_INTEGRATIONS.md) · [Sponsor findings](docs/SPONSOR_FINDINGS.md)

Venue0 crosses complementary Stock Token rebalances between wallets on Robinhood Chain (4663) first. Whatever doesn't cross is a residual, and the residual goes to Uniswap. So the Trading API is the last step of every round that leaves something unmatched. This is what we ran into building that step in September 2026.

The client is [`packages/uniswap/src/trading-api.ts`](packages/uniswap/src/trading-api.ts), the approve, quote, sign and swap sequence is [`packages/uniswap/src/execute.ts#L35-L122`](packages/uniswap/src/execute.ts#L35-L122), and the live run is [`scripts/live/l5-residual.ts`](scripts/live/l5-residual.ts) with its record in [`evidence/live/L5-residual/`](evidence/live/L5-residual/).

## What worked

We sold 0.002547 NVDA for AAPL on mainnet in [0xaec4…84db](https://robinhoodchain.blockscout.com/tx/0xaec4488e2ba8d2dcd14fdbaec15d6fde31398a980175fd1fe5bcf8f56d8a84db). The quote said 1658383465256918 wei of AAPL out, and the wallet's AAPL balance went up by exactly 1658383465256918. The route was a single v4 pool, Stock Token straight to Stock Token, with no USDG hop.

Stock Tokens quoted on the first request. We expected to fight for a route on a chain this new, and we didn't have to.

`simulateTransaction: true` on `/swap` meant we could check a mainnet swap before sending it from a script. Keep it.

`/permissions` answered a question the docs didn't. It told us NVDA and AAPL aren't permissioned on 4663.

## Where we lost time

The permissioned pools page says to send `x-universal-router-version: 2.2.0`. The OpenAPI spec only allows `2.0` and `2.1.1`, and we couldn't find a 2.2.0 deployment listed for any chain. We couldn't tell which one was right until we called `/permissions` and found out it didn't apply to our tokens at all. We use 2.1.1.

Nothing in the docs says whether Robinhood Stock Tokens are permissioned. One line would have saved us that `/permissions` detour.

After a Permit2 approval, the `permitData` from the quote we'd fetched before the approval can go stale, so we requote after approving. The code handles it in [`execute.ts#L69`](packages/uniswap/src/execute.ts#L69). A sentence in the integration guide would save the next team a failed swap.

Some v4 Stock Token to USDG routes print a fee of `838.8608%` in `routeString`. It looks like a dynamic-fee sentinel formatted as a percentage. It's harmless, but it looks alarming in logs we keep as evidence, and we had to check it wasn't a real fee.

The errors page calls API keys self-serve and the FAQ still says to request access. We weren't sure which path to take.

## What we'd ask for

- Per-chain UniswapX minimum order sizes. The docs say minimums exist but give no number for 4663. Our residuals are often a dollar or less, so this decides whether UniswapX is ever an option for us.
- `isPermissioned` in the `/quote` response, so we don't need a separate `/permissions` call to know whether a quote is usable.
- A note on the chain page listing which Robinhood Stock Tokens have pools, so we could check coverage before writing code.
