# VENUE0 Build Contract

[README](../README.md) · [Architecture](ARCHITECTURE.md) · [Decisions](DECISIONS.md)

The engineering rules the build followed, extracted from the PRD. Where the final implementation differs (for example, residual decisions also include AGGREGATE, and the campaign ran four arms), the implementation is described in [ARCHITECTURE.md](ARCHITECTURE.md) and [EVAL_CAMPAIGN.md](EVAL_CAMPAIGN.md).

Source: [PRD_2026-09-17.md](PRD_2026-09-17.md) (PRD v1.0). This file extracts the rules every commit must respect. When this file and the PRD disagree, the PRD wins, and current official docs or observed chain/API behavior win over both (record the conflict in `DECISIONS.md`).

## 1. Product scope is not negotiable

The build order is a dependency order, never a scope cut. The product is:

portfolio agents, canonical Stock Token identity, multi-user portfolio intents, N-party crossing, 3-wallet and larger cycles, partial matching, atomic self-custodied settlement, residual formation, Uniswap residual execution, Definitive Flash advanced residual execution, session-aware residual policy, Dynamic wallet and delegated agent access, Venue0 Circles, preference-aware agents, independent verification, market-only baseline, live-chain proof campaign, 100+ scenario offline campaign, judge/demo/submission surfaces.

"Drop sponsor track, not product" (PRD §42) if Dynamic delegation, Flash asset coverage, or Uniswap routes block.

## 2. The twenty rules (PRD §34)

1. The PRD is the product source of truth.
2. Current official docs override stale assumptions (source hierarchy §0.1: official docs > live network/API/test result > handbook > PRD > notes).
3. Never fabricate a transaction, user, quote, fill, order id, metric, wallet, or price.
4. Targets are not results.
5. No hard-coded Stock Token address from memory.
6. Resolve the canonical address at runtime from `GET https://api.robinhood.com/rhj/assets`.
7. No float math for settlement quantities. bigint / fixed-point only.
8. Any headline number must originate in machine-readable evidence.
9. Keep failed proof cases.
10. Never silently fall back from a sponsor path while still claiming that sponsor.
11. Never mark an action successful until postconditions are checked.
12. The 3-wallet cycle (G2) outranks decorative product work until it passes.
13. Flash and Dynamic never block G0-G4.
14. No project token.
15. No governance.
16. No fake adoption. Scenarios are not users.
17. External copy says "Robinhood Chain" in full and "Stock Tokens". Never "Hood Chain". Stock Tokens are not shares: they are tokenised debt securities issued by Robinhood Assets (Jersey) Limited giving economic exposure only.
18. Every integration failure goes into `SPONSOR_FINDINGS.md`.
19. Every architecture-changing observation goes into `DECISIONS.md`.
20. Every gate pass/fail goes into `GATES.md` immediately.

## 3. Asset identity and valuation invariants

A Stock Token is usable only when all hold:

```
chainId == 4663
AND deployment address came from the current Robinhood assets API response
AND status is acceptable (ASSET_STATUS_ACTIVE)
AND onchain bytecode exists at that address
AND onchain symbol() / decimals() / uid() agree with the API record
```

- Identity key is the asset uid plus chain plus contract address. Never ticker alone. Unknown lookalikes are rejected.
- Preserve raw `tradingCapabilities`; parse with a tolerant adapter that fails safe (unknown means not tradable).
- Keep these quantities distinct in types: `rawTokenUnits`, `uiShareEquivalent`, `rawUnderlyingPrice`, `multiplierAdjustedTokenPrice`, `usdValue`.
- Canonical valuation: multiplier-adjusted token price x raw ERC-20 balance. If a raw underlying price is used, multiply by `currentMultiplier` exactly once. Never apply the multiplier twice.
- Every price snapshot stores source, source timestamp, block (if onchain), multiplier, and a stale flag. The matcher refuses to mix snapshots without recording their age.
- Timestamp every external fact used in a headline claim.

## 4. Matcher invariants

- Deterministic. Same input bytes produce the same output bytes.
- Integer arithmetic for every final amount. No LLM in the matching path.
- Primary objective: maximize crossed value. Tie-breaks: lower residual, fewer transfer legs, lower allocation error, lower rounding loss.
- Constraints: per (p,a) outflow <= sell capacity; per (q,a) inflow <= buy demand; no self transfer; per-participant |valueIn - valueOut| <= tolerance; max sell, min receive, drift, corridor, expiry, asset restrictions.
- Residual: `residualDelta = originalRequestedDelta - crossedDelta`. `crossed + residual == requested` within an explicit rounding tolerance. Nothing disappears.
- Zero overlap ends as `NO_CROSS` with `crossed = 0`, `residual = requested`. Never manufacture a match.
- A separate reference matcher (enumerative, 2-5 participants) must agree on feasibility, per-asset conservation, per-wallet outflow bounds, crossed notional within tolerance, and final target deltas.
- Reference matcher answers "is the matcher correct?". Market-only baseline answers "does crossing help?". They are different things.

## 5. Settlement invariants (`Venue0Settlement.sol`)

- Not a custodian, AMM, oracle, matcher, or portfolio manager. It only executes an approved plan.
- Tokens move wallet -> wallet via `transferFrom` inside one transaction. The contract never holds user Stock Tokens between transactions.
- EIP-712 domain `VENUE0` / `1` / chainId / verifyingContract. Signatures bind plan hash, round id, wallet, expiry, nonce, chain, contract.
- Every participant whose tokens move must have signed the exact plan hash. Any field change invalidates signatures.
- Nonce / plan replay protection, expiry, all-or-nothing, indexable events per plan and per leg.
- Do not assume ERC-2612 permit; standard approve is the spike path.
- Re-read balances and allowances before settlement; re-solve on change.

## 6. Verification invariants

- Verifier is independent from the executor: its own RPC client, fresh `balanceOf` reads, receipt, logs, nonce state.
- For every participant and every plan token: `after - before == expectedNetDelta`.
- No unexpected Stock Token balance changes, no overspend, every leg present, plan consumed, tx status success, residual matches.
- Never trust database status fields. Never show `COMPLETE` because an API returned 200.
- Never convert: scenario -> user, transaction -> adoption, test -> production security, quote -> fill, submission -> execution, HTTP 200 -> success, broadcast -> state change.

## 7. Residual and sponsor rules

- Residual decisions: `EXECUTE_NOW | LIMIT | TWAP | WAIT | CANCEL`. An execution-choice system, not an allow/refuse policy engine.
- Uniswap: check_approval -> quote -> inspect routing -> `/swap` (CLASSIC) or `/order` (UniswapX) -> record -> independent readback. Pin `x-universal-router-version` explicitly. Quote failure is a legitimate outcome: `NO_EXTERNAL_ROUTE`.
- Flash: live quote for the exact asset before claiming support. Flash never decides the crossing match.
- Dynamic: target delegated access; documented fallback to agent or server wallets. The wallet action must be real.
- Bankr: optional; never decorative.

## 8. Evidence rules

- Live campaign: L0 transfer, L1 bilateral, L2 hero cycle, L3 partial, L4 zero overlap, L5 residual, L6 boundary (expiry / revocation / balance change). Small and high quality.
- Wide campaign: 100+ frozen offline scenarios, three arms (`MARKET_ONLY`, `VENUE0_CROSSING_IMMEDIATE`, `VENUE0_CROSSING_SMART_RESIDUAL`), 10 cohorts including no-overlap, corporate-action change and external-route failure. Freeze universe, generator, seed, targets and metric definitions before reading results.
- Output CSV, JSON, manifest, methodology, seed, source revision.
- Every claim in `CLAIM_LEDGER.md`: wording, TARGET/PROVEN/PARTIAL/WITHDRAWN, environment, sample size, evidence path, limitation.
- Kill a public claim if evidence cannot reproduce it, the reference matcher disagrees, the verifier fails, or methodology changed after results without disclosure.

## 9. Originality boundary

Venue0 did not invent DvP, multilateral netting, batch settlement, direct OTC transfer, canonical registries, Stock Token settlement, Uniswap routing, or advanced orders. Pipeshift is adjacent and settles matched trades. Protected sentence:

> Venues normally match trades and settlement systems settle them. Venue0 looks at portfolio goals before those trades exist and discovers which portfolio changes should become direct trades at all.

## 10. Security

No protocol custody. No private keys, API keys, delegated shares, or webhook secrets in the repo or logs. EIP-712, nonce, expiry, domain separation, plan immutability after approval, exact allowances where practical, atomic settlement, replay prevention, balance revalidation, independent verifier, stale-price handling, lookalike rejection, webhook signature validation, idempotent external actions, eligibility/risk notice, no geo-evasion.

## 11. Agent rules

The model proposes structured intent. Code validates and calculates. The agent never invents addresses, prices, or fills, never performs settlement arithmetic, never substitutes assets or issuers, never treats a perp as spot, never exceeds delegated limits, never signs a plan other than the one shown, and checks delegation status before every action.
