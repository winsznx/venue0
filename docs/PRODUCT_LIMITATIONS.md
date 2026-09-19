# Product limitations

[README](../README.md) · [Claim ledger](CLAIM_LEDGER.md) · [Security](SECURITY.md)

What Venue0 has shown, and where that stops.

## Evidence scope

- **No users.** Every product run used operator-controlled test accounts (three Dynamic Sandbox test accounts driving funded proof wallets through an automated browser). Nothing here measures adoption.
- **Synthetic campaign.** The 400-scenario campaign uses generated portfolios with one price snapshot and one cost capture. It shows where the mechanism helps, not how often real portfolios are in that regime.
- **Small live sizes.** Live rounds moved $1-$12. No realized cost saving is claimed.
- **No external audit.** `Venue0Settlement` is covered by 32 Foundry tests including fuzzing, and by live settlements, but has not been audited.

## Infrastructure

- **Dynamic Sandbox.** Auth runs in Dynamic's Sandbox environment, which rate-limits a single IP after a handful of sign-ins (about 45 minutes) and ended browser sessions after about three hours. A Venue0 session ends when Dynamic's does.
- **Verification window.** Production verification uses Chainstack's free plan, which keeps about 126 blocks of state (about 13 seconds). Verification runs as soon as a settlement is reported; a verification that misses the window falls back to the execution provider and is recorded as `independent: false`.
- **Database.** Supabase free tier: no point-in-time recovery, and projects pause after a week without activity.
- **Latency.** Pages and API calls take roughly 0.4-3 s. Each Worker instance refetches the Robinhood registry and the Chainlink feed directory (cached 60 s per instance), and the database is in eu-west-1.
- **Round scheduling.** Rounds advance when someone loads them; there is no background worker. A Circle's cadence is displayed, and rounds open when a member enters the lobby.
- **Load.** Concurrency was tested with bursts of 10-20 requests and 80 concurrent invite redemptions, not with a load test.

## Product scope

- **Priced assets only.** Only Stock Tokens with a Chainlink feed (35 of 194 at build time) can be valued in rounds.
- **Asset-for-asset only.** Cash (USDG) targets are shown but cannot cross between wallets; that part of a rebalance is always residual.
- **Residual actions in the app.** Carry forward, drop, or trade on Uniswap from the user's wallet. The in-app Uniswap path was not exercised in the end-to-end runs (leftovers were small and carried forward). Flash routes are priced by the engine but are not an in-app action. UniswapX and live TWAP were not executed.
- **No delegated access.** Every intent, approval and transaction is signed by the user; no agent acts for them.
- **Language agent optional.** Natural-language targets need a Groq or Anthropic key; production runs without one, and the model path was not run live. Weights mode is complete without it.
- **Session model.** The residual engine's market-session model uses a fixed UTC-4 offset and ignores US holidays.
- **Eligibility.** Stock Tokens are not offered to U.S. persons and are restricted elsewhere. Venue0 does not decide whether a user may hold a given Stock Token.
