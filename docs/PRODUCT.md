# Product

[README](../README.md) · [Architecture](ARCHITECTURE.md) · [Live deployments](LIVE_DEPLOYMENTS.md)

What a user does in the Venue0 app at https://venue0.timjosh507.workers.dev, screen by screen. The full original specification is [PRD_2026-09-17.md](PRD_2026-09-17.md).

## Surfaces

| Surface | Path | Audience |
|---|---|---|
| Public site | `/` | anyone: problem, mechanism, rails, evidence, entry point |
| Product | `/onboarding`, `/app`, `/portfolio`, `/circles`, `/round/[id]/…`, `/activity`, `/settings` | signed-in users; every screen shows only the user's own data |
| Proof | `/proof` | reviewers: live transactions, verifier reports, campaign |
| Demo replay | `/demo` | anyone: the verified G2 round replayed from committed evidence, bannered as test wallets |

## Onboarding

Welcome, then wallet, portfolio, target, ready. Wallet sign-in goes through Dynamic: email creates an embedded wallet, or the user connects their own. Robinhood Chain 4663 is the only network offered. The server exchanges Dynamic's JWT for its own session only for a wallet that Dynamic verified. If the wallet holds no Stock Tokens, onboarding says so and lets the user finish without a target.

## Portfolio and targets

Holdings are read live from the chain and valued with Chainlink feeds. A target is set in one of two modes:

- **Set weights:** percentages per Stock Token and an optional cash share, a cap on what the user will pay to trade leftovers, and a leftover style.
- **Describe it:** a sentence read by a language model into structured operations, only when a model key is configured.

Both modes end in the same deterministic check against live balances and prices. Only a checked target can be saved. Home shows drift from the saved target.

## Circles

A Circle is a group that rebalances the same Stock Tokens on a schedule. Users discover public Circles, join, or create one: name, description, public, invite-only or private, the assets it crosses, how often rounds run, how long each round collects, minimum people per round, and what happens to leftovers. Organizers create single-use invite links (only a hash is stored).

## Round lobby

Entering the lobby joins the Circle's current round or opens one with a fresh price snapshot. The lobby shows the user's rebalance for this round (sell up to and buy up to, per asset, restricted to the Circle's assets), a countdown, how many members have signed, and the snapshot prices. "Sign and join round" signs the intent in the user's wallet. The organizer can close collection early.

## Matching

When collection closes, or every member has signed, the round solves. The user sees their own result first: what they send, what they receive, from and to "Member 2" and so on, what share crossed, and what is left over. The crossing graph can be expanded. Other outcomes are stated plainly: no cross, not enough people, expired, plan expired.

## Proposal

"What you're authorizing": the exact amounts, the plan hash, the contract, the approval deadline, and how many participants have approved. "Approve & execute" signs the plan approval (no gas) and then asks for an exact allowance for the user's own outflows.

## Execution

A live rail: approvals, the user's allowance, the atomic settlement transaction, independent verification. Once every approval is in, any participant can send the settlement from their wallet. The page advances on its own as the receipt and the verifier come back.

## Residual

After settlement (or a no-cross round), the user sees what did not cross, the engine's suggestion with its reasons (for example, a Uniswap quote whose all-in cost exceeds the user's cap), and three choices: carry into the next round, trade it now on Uniswap from the user's wallet, or drop it. Carried leftovers come back automatically because the next intent is rebuilt from the same target.

## Receipt

Per user: sent and received legs, settlement transaction and block, plan and snapshot hashes, leftover decision, every verifier check, and which RPC providers executed and verified the settlement. It can be shared as a link, which opens only for members of the Circle.

## Activity and settings

Activity lists everything the wallet did in Venue0, with links to rounds and Circles. Settings shows the wallet, network and settlement contract, target mode, leftover preference and Dynamic delegated-access status (not offered; every step is signed by the user).
