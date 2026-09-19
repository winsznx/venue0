# Product limitations (2026-09-18)

What the Venue0 app does not do yet, or has only shown in a weaker setting than production.

- **Users.** Every end-to-end run used operator-controlled Dynamic Sandbox test accounts signing with funded proof wallets through an automated browser. No independent human user has used the product.
- **Independent verification in production.** Deployed rounds verify PASS but on the same RPC provider that sent the transaction, recorded `independent: false`. The Robinhood public RPC rate-limits Cloudflare Worker egress; a second keyed provider with archive state is needed.
- **Auth environment.** Dynamic Sandbox only. The sandbox rate-limits an origin (Cloudflare 429, error 1015, ~43 min block) after repeated sign-in or page loads; production needs a live Dynamic environment on the product's own domain with CORS set.
- **Database.** Production runs on Supabase Postgres through Cloudflare Hyperdrive (direct connection). Supabase free tier: no point-in-time recovery, and the project pauses after a week without activity. Local runs without `DATABASE_URL` use embedded Postgres.
- **Round scheduling.** Rounds advance when someone loads them (no background worker). A circle's cadence is displayed but rounds are opened on demand from the lobby.
- **Delegated access.** Not implemented (D-018). Every intent, approval and transaction is signed by the user.
- **Language agent.** Needs `ANTHROPIC_API_KEY`; without it the "Describe it" mode is disabled and weights mode is used. Natural-language mode has not been run live.
- **Residual execution.** Leftovers can carry forward, be dropped, or trade on Uniswap from the user's wallet. The Uniswap path in the app was not exercised in the e2e runs (the engine judged the leftovers too small; carrying forward spent nothing). Flash limit/TWAP routes are evaluated in the engine but not offered as in-app actions. Cash (USDG) legs are not crossable.
- **Sizes.** Test rounds moved $1-5. No claim about cost savings for real users follows from them.
- **Privacy.** Members see their own legs and anonymized counterparties; the settlement transaction itself is public onchain and reveals every participant's address and transfer.
- **Concurrency.** State changes are compare-and-set and duplicate requests are no-ops, shown with bursts of 10-20 concurrent requests on embedded Postgres, a Postgres 17 server and production Supabase, and 80 concurrent invite redemptions in production. Not load-tested beyond that.
- **Latency.** Pages and API calls take roughly 0.4-3 s: each Worker instance refetches the Robinhood registry and Chainlink directory (cached 60 s per instance), and Supabase is in eu-west-1.
- **Sessions.** A Venue0 session ends when Dynamic's session ends in the browser (observed after about 3 hours in Sandbox).
