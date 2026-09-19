# Security

[README](../README.md) · [Architecture](ARCHITECTURE.md) · [Production config](PRODUCTION_CONFIG.md) · [Limitations](PRODUCT_LIMITATIONS.md)

`Venue0Settlement` has not undergone an external security audit. Everything below describes design and testing, not third-party assurance.

## Threat model

| Actor | Could try to | Defense |
|---|---|---|
| Another round participant | move more of your tokens than you agreed, change a leg after you signed, replay your approval | you sign the exact plan (every leg and amount); any change alters the plan hash; nonces are consumed once; exact allowances |
| The Venue0 server | build a plan that differs from your intent, report a false outcome | the plan you approve is shown and signed in your wallet; the contract checks every participant's signature over that plan; the verifier derives the outcome from chain data, and the receipt shows which RPC it used |
| A malicious member | fail a round by reporting an unrelated transaction, read other members' positions | the server accepts a settlement hash only if it is a `settle()` call to the contract on chain 4663 whose calldata hashes to this round's plan; round views show other members only as "Member 2", "Member 3" |
| A web client | claim a wallet it does not control, act as another user | the server verifies Dynamic's RS256 JWT against the environment JWKS and binds the session only to a wallet listed in the token's verified credentials |
| An RPC provider | return wrong or stale data | execution and verification use different providers; a verification that fell back to the execution provider is recorded as `independent: false` |
| The language model | invent an asset, address or amount | its output is untrusted structured text; every ticker is resolved against the canonical registry and every number is computed by code ([ARCHITECTURE.md](ARCHITECTURE.md#language-agent-boundary)) |
| A lookalike token | pose as a Stock Token | assets come only from the live Robinhood registry and are checked onchain (bytecode, `symbol()`, `decimals()`, `uid()`); same-ticker tokens elsewhere are rejected |

## Settlement contract

- **No custody.** Legs move wallet to wallet with `transferFrom` in one call; the contract never holds user tokens or fees ([source](../contracts/src/Venue0Settlement.sol)).
- **Signature model.** EIP-712 domain `VENUE0` / `1` / chain / contract. Each participant signs `PlanApproval(participant, nonce, plan)` over the full plan: round, plan id, valuation snapshot hash, validity window, participants and every leg. ECDSA signatures from EIP-7702-delegated EOAs are accepted; contract accounts fall back to ERC-1271.
- **Plan immutability.** Participants and legs must be sorted canonically, so each plan has exactly one hash. Every participant must appear in a leg; every leg party must be a participant.
- **Replay.** `planSettled[hash]` settles each plan once; `nonceUsed[owner][nonce]` consumes each approval once; `cancelNonce` withdraws an unused approval.
- **Atomicity.** All legs or none. A paused or blocklisted Stock Token, a missing allowance or a short balance on any leg reverts the whole plan.
- **Validity window.** Plans carry `validAfter` and `validUntil`; the app gives participants 30 minutes after the solve.
- **Tests.** 32 Foundry tests including fuzzing ([`contracts/test/`](../contracts/test/)).

## Application

- **Exact approvals.** The app requests allowances for exactly the plan's outflows, never unlimited. Flash quotes are requested with `forceMinimalAllowance`.
- **Participant authorization.** Only circle members can open a round, read it or sign into it; only plan participants can approve or report its settlement; only the organizer can close collection early or create invites.
- **Idempotency.** Round state changes are compare-and-set on the stored state; duplicate joins, intents, approvals and settlement reports are no-ops. Tested with bursts of 10-20 concurrent requests and 80 concurrent invite redemptions on production Postgres.
- **Database authorization.** Every product table has row-level security enabled with no policies, so Supabase's public REST API can read or write nothing; the app connects as the owning role through Hyperdrive.
- **Sessions.** HS256 cookie, HttpOnly, Secure, SameSite=Lax, 7-day expiry; the app ends the session when Dynamic ends it in the browser.
- **Residual execution.** Every residual trade is signed in the user's wallet; the server only fetches quotes. Swaps are recorded from balance readback at the receipt block, not from the API response.

## Secrets

- `.env`, `keys/`, `.dev.vars`, build output and the local database are gitignored.
- Production secrets are Worker secrets, uploaded from a temporary file that is deleted immediately; values are never printed.
- OpenNext inlines any `.env` file it finds into the Worker bundle. Production builds therefore run from a copy of the repository with no `.env`, and [`scripts/deploy/secret-scan.ts`](../scripts/deploy/secret-scan.ts) blocks the deploy if any local secret value appears in the output (for URLs it checks the password, path and query parts).
- The web app never holds a user key. The proof scripts' operator keys live only in the local `.env` and are never deployed.

## Fixed during production testing

| Issue | Fix |
|---|---|
| A member could report any successful unrelated transaction as the settlement and fail the round's verification | the reported hash must be a chain-4663 `settle()` call to the contract whose calldata hashes to this plan |
| The verifier did not check who approved | `participants.set`: approvals consumed onchain must equal the plan's participants |
| Duplicate joins, intents and approvals logged twice | inserts that report whether they changed anything; activity only on change |
| Forged wallet association | the wallet must appear in the Dynamic JWT's verified credentials; tested with a real token and another account's address (401) |
| Round views exposed other members' addresses (graph data, history, verifier check names) | addresses replaced with member labels before leaving the server |
| JSON columns stored as JSON strings on Postgres | parameters bound as `$n::text::jsonb`; migration 004 converted rows in place |
| `.env` secrets inlined into the Worker by OpenNext | clean-copy builds and the secret-scan gate (nothing was deployed before the fix) |
| A settle request waited for the receipt and verified inline, and the edge cancelled it mid-way | reporting returns at once; each later poll does one short step; stuck rounds resume on the next read |

## Not done

External audit, formal verification, a bug bounty, and load testing beyond the bursts above. See [PRODUCT_LIMITATIONS.md](PRODUCT_LIMITATIONS.md).
