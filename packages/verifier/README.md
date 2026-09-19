# @venue0/verifier

Verifies a settlement from chain data only. It never reads Venue0's database or the executor's records.

**Input.** Transaction hash, settlement contract, the approved contract plan, each participant's approval nonce, and tokens to watch; plus a viem `PublicClient` for the verifier's own RPC.

**Output.** `SettlementVerification`: overall status (PASS, FAIL, INCONCLUSIVE), the block, every check with its detail, and per owner/token balance observations (before, after, observed and expected delta).

**Checks.** Receipt status; transaction target; calldata decodes to `settle()` with the approved plan hash; PlanSettled, CrossingLeg and per-participant NonceConsumed events; no unexpected ERC-20 transfers; `planSettled` and `nonceUsed` state; balance deltas at the receipt block against the block before, equal to the plan's expected net deltas; no tokens left in the contract. The web app adds a participant-set check (approvals consumed onchain equal the plan's participants).

**Invariants.** A failed historical read is INCONCLUSIVE, never PASS. The caller chooses the RPC; production uses a different provider from the one that executed ([docs/SECURITY.md](../../docs/SECURITY.md)).

**Tests.** `test/settle-verify.devnet.test.ts` against a local anvil chain, including a tampered-plan case that must FAIL.

**In the product.** Runs after every settlement (`apps/web/lib/server/rounds.ts`); its report is stored with the round and shown on the receipt.
