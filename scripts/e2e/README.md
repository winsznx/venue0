# End-to-end harness

Drives the real Venue0 app in Chrome with operator-controlled test accounts. Each account has its own persistent browser profile and an injected EIP-1193 wallet (`wallet-bridge.ts`) that signs in Node with a proof-wallet key; the key never enters the page. Sign-in goes through Dynamic's real modal with a Sandbox test email and the static test code (`DYNAMIC_TEST_OTP`).

Set `E2E_BASE` to target a deployment (default `http://localhost:3100`) and `E2E_PROFILE_PREFIX` to reuse a set of profiles. Every script takes the profile directory as its first argument. Scripts that settle send real mainnet transactions from the proof wallets; the wallet bridge logs the wallet, call, exact approval amount and gas estimate before each one.

| Script | What it checks |
|---|---|
| `test1.ts` | two-user journey: onboarding, target, Circle, round, approvals, settlement, verification, residual, receipt, activity |
| `test2.ts` | three-user cycle through the app |
| `edges.ts`, `edges2.ts`, `wrong-otp.ts` | forged wallet association, authorization, idempotency, wrong chain, expiry, no-cross, sign out and back in, wrong verification code |
| `concurrency.ts` | concurrent joins, lobby entry, duplicate intents and approvals, the solve race, forged settlement reports (no tokens move) |
| `invite-race.ts` | one single-use invite redeemed concurrently by two accounts |
| `persist.ts` | sessions and state after a server restart |
| `smoke.ts` | public pages render, product routes gate, no horizontal overflow |
| `pg-invite.ts` | onboarding and an invite race against a fresh Postgres |
| `prod-journey.ts`, `prod-round2.ts`, `prod-finish.ts`, `prod-edges.ts` | the production runs against the public app |
| `gate-record.ts` | writes a round's verification record (plan, events, participant sets, token deltas, providers) from the database and chain |
| `profile-target.ts` | timings of the portfolio read and target check |

Results from these runs are in `evidence/product/` and `evidence/production/`.
