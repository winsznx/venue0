# Product limitations (2026-09-18)

What the Venue0 app does not do yet, or has only shown in a weaker setting than production.

- **Users.** Every end-to-end run used operator-controlled Dynamic Sandbox test accounts signing with funded proof wallets through an automated browser. No independent human user has used the product.
- **Auth environment.** Dynamic Sandbox only. The sandbox rate-limits an origin (Cloudflare 429, error 1015, ~43 min block) after repeated sign-in or page loads; production needs a live Dynamic environment on the product's own domain with CORS set.
- **Database.** Without `DATABASE_URL` the server uses embedded Postgres in `apps/web/.venue0-db/`, which is single-process and single-host. The Postgres driver path is implemented but was not exercised against a real server in these runs. Production must set `DATABASE_URL`.
- **Round scheduling.** Rounds advance when someone loads them (no background worker). A circle's cadence is displayed but rounds are opened on demand from the lobby.
- **Delegated access.** Not implemented (D-018). Every intent, approval and transaction is signed by the user.
- **Language agent.** Needs `ANTHROPIC_API_KEY`; without it the "Describe it" mode is disabled and weights mode is used. Natural-language mode has not been run live.
- **Residual execution.** Leftovers can carry forward, be dropped, or trade on Uniswap from the user's wallet. The Uniswap path in the app was not exercised in the e2e runs (the engine judged the leftovers too small; carrying forward spent nothing). Flash limit/TWAP routes are evaluated in the engine but not offered as in-app actions. Cash (USDG) legs are not crossable.
- **Sizes.** Test rounds moved $1-5. No claim about cost savings for real users follows from them.
- **Privacy.** Members see their own legs and anonymized counterparties; the settlement transaction itself is public onchain and reveals every participant's address and transfer.
- **Concurrency.** State changes are compare-and-set, and duplicate requests are no-ops, but concurrency was tested only at the scale of three users.
