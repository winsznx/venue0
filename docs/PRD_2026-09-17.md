# VENUE0
## Full Product Requirements Document
### Runtime / Bankr — AI × Onchain Finance
**Document status:** Build-ready PRD  
**Version:** 1.0  
**Verified against live/current documentation:** 2026-09-17  
**Competition deadline:** Saturday, 2026-09-19, 4:00 PM EDT / 9:00 PM WAT  
**Working product name:** VENUE0  
**Working tagline:** The market before the market. Portfolio agents cross first. Markets handle only the residual.  
**Spoken name:** Venue Zero  
**Short mark:** V0

---

# 0. Document contract

This PRD is the source of truth for product scope, architecture, claims, build sequence, acceptance gates, evidence, and submission behavior for VENUE0.

It is intentionally broader than the minimum hackathon demo. The build order below is a proof and dependency order, not a reduction of the product vision.

The complete product includes:

- multi-user portfolio intents;
- canonical Robinhood Stock Token identity;
- natural-language portfolio goals;
- autonomous portfolio agents;
- multi-party portfolio crossing;
- multi-asset cycle discovery;
- partial fills;
- atomic self-custodied settlement;
- residual formation;
- Uniswap residual execution;
- Definitive Flash advanced residual execution;
- session-aware residual policy;
- Dynamic wallet ownership and delegated agent access;
- independent postcondition verification;
- Venue0 Circles for coordinated communities;
- portfolio preference negotiation;
- reproducible comparison against market-only execution;
- live-chain and wide-campaign evidence;
- full judge and submission surfaces.

Nothing above is removed from the product. Some pieces are sequenced after the dominant mechanism is proven.

## 0.1 Source hierarchy

When implementation reality conflicts with this PRD, follow this order:

1. Current official sponsor/protocol documentation.
2. Current network state, contract bytecode, live API response, or successful/failed integration test.
3. Current competition handbook/rules.
4. This PRD.
5. Prior notes, cached snippets, old blog posts, or assumptions.

A real observed incompatibility is allowed to correct this PRD. Record the correction in `docs/DECISIONS.md` and `docs/GATES.md`.

## 0.2 No-stale-data rule

Do not hard-code facts that the upstream provider exposes dynamically when those facts can change.

Specifically:

- Do not hard-code per-ticker Robinhood Stock Token addresses.
- Resolve canonical token deployments from `GET https://api.robinhood.com/rhj/assets`.
- Do not identify a Stock Token by ticker alone.
- Do not assume a Stock Token is currently tradable in every session. Read its current trading capabilities/status.
- Do not mix Robinhood REST raw-equity prices with multiplier-adjusted onchain prices without normalization.
- Do not hard-code a Chainlink feed address from an old article or cached list. Resolve from the current official source at integration time.
- Do not assume a Uniswap router version. The current Robinhood Chain API path uses Universal Router 2.1.1, but the integration must explicitly request/pin the intended version.
- Do not assume an old Dynamic SDK method name. Pin the package versions actually installed and implement against their current docs/types.
- Do not assume Flash asset coverage solely from marketing copy. Obtain a live quote for the exact asset before declaring support.
- Do not claim a current venue, pool, order type, price, liquidity level, wallet feature, or geographic availability until the running integration confirms it.

Every external fact used in a headline claim must be timestamped in the evidence bundle.

---

# 1. Executive summary

VENUE0 is a multi-agent portfolio crossing network for Robinhood Stock Tokens.

A normal portfolio rebalance sends each user's buys and sells independently into public liquidity. VENUE0 first looks across multiple independently owned portfolios to find complementary changes.

If one user needs to reduce NVDA and another needs to increase NVDA, that stock exposure can move directly between them. The same process extends across multiple assets and participants, allowing three-way and larger portfolio cycles.

Only the portion that cannot be satisfied inside the crossing round becomes a public-market residual.

The residual is then executed through the appropriate external rail:

- Uniswap for immediate spot execution and public liquidity;
- Definitive Flash for Limit, TWAP, Stop/Take-Profit, DCA, or other managed advanced execution when the residual should not simply hit the market;
- WAIT or CANCEL when current execution conditions violate the user's constraints.

The system preserves self-custody. Users do not deposit portfolios into a pooled VENUE0 account. A participant authorizes a bounded settlement plan from their own wallet, and the settlement transaction transfers only the approved amounts.

The product's core decision primitive is:

> Given several independently owned portfolios and their target changes, which compatible pieces can settle directly between participants, and which residual still requires external liquidity?

The hero mechanism is not bilateral OTC settlement. It is multi-portfolio intent matching that discovers non-trivial cycles and calculates the residual before the venue sees it.

---

# 2. Competition strategy

## 2.1 Runtime / Bankr grand prize facts

Current Runtime handbook rules supplied for this build state:

- Runtime runs September 13–19, 2026.
- Submission closes September 19 at 4:00 PM EDT.
- Online entries require a recorded demo.
- Every Runtime submission is automatically eligible for the Bankr grand prize.
- Bankr grand prize is $20,000 in participant prizes.
- Bankr integration is optional.
- Bankr judges in this priority order:
  1. Product
  2. Founder Market Fit
  3. Execution
  4. Originality
  5. Onchain potential
  6. Token design & distribution, only if a token is planned
- Onchain equities receive bonus consideration.
- The same product may opt into multiple sponsor tracks.

## 2.2 Sponsor tracks targeted

### Bankr grand prize — PRIMARY

VENUE0 attacks a real financial-market workflow and is built around Stock Tokens.

We will not add a project token for V1.

Bankr does not need to be forced into the runtime path because the rules explicitly make Bankr integration optional.

Optional Bankr use may be added only if it improves the product without altering the thesis, for example:

- Bankr LLM Gateway for agent inference;
- Bankr Stock Token discovery/quote comparison;
- future project-token funding after real usage exists.

No Bankr feature may become a decorative dependency.

### Dynamic — PRIMARY SECONDARY TRACK

Current Runtime requirement: a documented Dynamic wallet pattern must power a real wallet/payment action made by an agent.

VENUE0 target path:

user-owned Dynamic embedded wallet  
→ user approves delegated access  
→ portfolio agent evaluates/accepts a settlement plan  
→ Dynamic-delegated signer signs a real Robinhood Chain action  
→ independent readback confirms the effect.

Fallback if delegation integration blocks:

- use Dynamic Agent Wallets or Server Wallets for the sponsor proof;
- use ordinary EOAs for the core portfolio-cycle proof;
- do not let Dynamic block the dominant mechanism.

### Uniswap — PRIMARY SECONDARY TRACK

Current Runtime requirement:

- integrate Uniswap API, AMM, or CCA;
- public GitHub repo;
- `FEEDBACK.md`;
- complete Uniswap developer feedback form;
- README points reviewers directly to Uniswap integration code.

VENUE0 uses Uniswap as a genuine residual-liquidity venue.

The sponsor-removal experiment is natural:

- full system with Uniswap: residual can complete;
- Uniswap disabled: internal crossing still works, but unmatched demand cannot complete through this rail.

### Definitive Flash — TARGET IF LIVE

Current Runtime requirement:

- use at least one advanced Flash order type;
- make the social/agent trading experience clear;
- post on X and tag `@DefinitiveFi`;
- include the X link in submission.

VENUE0 uses Flash for residual execution, not for the portfolio-crossing mechanism.

A strong live path is:

partial crossing  
→ residual remains  
→ session/liquidity policy chooses TWAP or Limit  
→ Flash quote  
→ EIP-712 signature  
→ Flash order submission  
→ order id/status/fill evidence.

### Blackbird / Flynet — NOT TARGETED

No forced sponsor stacking.

---

# 3. Product truth

## 3.1 Problem

Self-custodied Stock Tokens are programmable and transferable, but each wallet normally interacts with public liquidity independently.

Portfolio rebalancing therefore creates avoidable venue demand when several participants have complementary portfolio changes.

Example:

- Alice wants to reduce NVDA and increase AAPL.
- Bob wants to reduce AAPL and increase SPY.
- Charlie wants to reduce SPY and increase NVDA.

None of those participants is an exact bilateral counterparty for the complete rebalance.

Collectively, they form a cycle:

Alice's NVDA → Charlie  
Charlie's SPY → Bob  
Bob's AAPL → Alice

A portfolio-aware matcher can recognize this before the trades reach an AMM or external execution venue.

## 3.2 Why now

Current official documentation establishes the necessary substrate:

- Robinhood Stock Tokens are standard 18-decimal ERC-20s.
- They can be held, transferred, and composed onchain.
- Robinhood Chain is EVM-compatible.
- Chain ID is `4663`.
- Stock Tokens expose corporate-action multipliers and per-asset market/trading metadata.
- Uniswap is supported on Robinhood Chain through its Trading API and UniswapX v3.
- Definitive Flash is live on Robinhood Chain and supports Stock Token/RWA advanced execution.
- Dynamic supports custom EVM networks and agent wallet patterns including delegated access.

This creates the combination required for portfolio-level agent coordination followed by real onchain settlement.

## 3.3 User problem, not protocol problem

The user is not looking for "netting infrastructure."

The user's job is:

> Move from my current portfolio to the portfolio I want, under my price/risk constraints, with less unnecessary public-market execution.

The product should always present that job first.

---

# 4. Decision primitive and dominant mechanism

## 4.1 Decision primitive

For a set of active portfolio intents:

> Determine which requested portfolio changes can be satisfied directly among participants, what exact transfer graph satisfies them, and what residual still needs an external market.

## 4.2 Dominant mechanism

One sentence:

> Portfolio agents discover when independently owned portfolios can be liquidity for one another, settle the compatible portion directly, and expose only the residual to public markets.

## 4.3 What VENUE0 does not claim to invent

Do not claim that VENUE0 invented:

- atomic delivery-versus-payment;
- multilateral netting;
- direct OTC transfer;
- canonical asset registries;
- Stock Token settlement;
- Uniswap routing;
- advanced order execution.

Pipeshift is an important adjacent protocol. Its current public repository describes:

- atomic DvP;
- multilateral netting;
- canonical ticker/ISIN registry;
- batch settlement;
- partial settlement;
- Robinhood Chain fork tests.

Its own framing is:

> Venues match. Pipeshift settles.

VENUE0 sits upstream of that boundary:

> VENUE0 decides what should be matched from portfolio goals before the trades exist.

That is the originality claim.

---

# 5. Product scope

## 5.1 Full product scope

VENUE0 includes all of the following:

1. Portfolio dashboard.
2. Current holdings read.
3. Natural-language target request.
4. Structured target-weight editor.
5. Portfolio agent.
6. Canonical Stock Token resolver.
7. Corporate-action-aware valuation.
8. User constraints and execution policy.
9. Signed portfolio intents.
10. Crossing rounds.
11. Private/public Venue0 Circles.
12. Pair matching.
13. Three-way and N-way cycle matching.
14. Partial fills.
15. Residual calculation.
16. Final settlement-plan generation.
17. Participant/agent plan approval.
18. Atomic onchain settlement.
19. Replay and nonce protection.
20. Dynamic wallet integration.
21. Dynamic delegated agent execution.
22. Uniswap residual quotes and swaps.
23. Definitive Flash residual Limit/TWAP/advanced orders.
24. Session-aware residual execution.
25. Independent verifier.
26. Receipt UI.
27. Market-only baseline.
28. Crossing-only comparison.
29. Full-system comparison.
30. 100+ scenario offline evidence campaign.
31. Live-chain proof campaign.
32. Public judge replay/evidence surfaces.
33. Submission and claim-parity tooling.

## 5.2 Build-order tiers

These are dependency tiers, not product cuts.

### Tier 0 — feasibility
- canonical live Stock Token resolution;
- ordinary Stock Token transfer;
- two-token atomic exchange.

### Tier 1 — dominant mechanism
- three wallets;
- three assets;
- non-trivial cycle;
- independent readback;
- partial overlap;
- zero-overlap control.

### Tier 2 — complete market
- residual formation;
- Uniswap residual execution;
- market-only baseline;
- receipt.

### Tier 3 — agentic product
- Dynamic wallet;
- delegated or agent-wallet signing;
- natural-language target agent;
- policy evaluation.

### Tier 4 — execution intelligence
- session-aware residual policy;
- Flash Limit/TWAP/advanced order;
- residual status lifecycle.

### Tier 5 — network product
- Venue0 Circles;
- preference negotiation;
- member history;
- recurring rounds;
- public/private circle discovery.

---

# 6. External terminology and brand requirements

Robinhood's current brand guidelines require external-facing product copy to use:

- `Robinhood Chain` in full;
- `Stock Tokens` for Robinhood's equity/ETF token product.

Do not use "Hood Chain."

Do not externally describe Robinhood Stock Tokens as ordinary shares.

Stock Tokens are tokenised debt securities issued by Robinhood Assets (Jersey) Limited that provide economic exposure to underlying securities and do not give holders legal or beneficial rights in the underlying securities.

The app must include a concise risk/eligibility disclosure and must not describe itself as investment advice.

---

# 7. Users and personas

## 7.1 Primary persona — self-custodied portfolio user

Wants a target allocation.

Example goal:

> Bring NVDA down to 20%, increase SPY to 40%, keep at least 10% in USDG, and do not accept more than 35 bps of external execution loss.

Needs:

- clear target preview;
- custody clarity;
- explicit maximums;
- understandable execution;
- proof of final holdings.

## 7.2 Primary persona — portfolio agent

Acts under user-granted wallet authority.

Needs:

- canonical asset ids;
- bounded intent schema;
- current prices/status;
- ability to accept/reject settlement plans;
- deterministic amount calculation;
- external execution tools;
- postcondition verification.

## 7.3 Primary persona — Venue0 Circle organizer

Creates a group where members coordinate rounds.

Examples:

- investment club;
- trading community;
- family portfolio;
- DAO treasury team;
- group of agent-managed accounts.

Needs:

- membership;
- round scheduling;
- asset universe;
- privacy defaults;
- aggregate results;
- no forced sharing of complete portfolio details.

## 7.4 Judge/reviewer

Needs to understand in less than 20 seconds:

- what the product is;
- what portfolios are trying to do;
- what VENUE0 discovered;
- what moved directly;
- what remained residual;
- what happened onchain;
- what the market-only baseline would have done.

---

# 8. Robinhood Chain integration

## 8.1 Network

Current official configuration:

### Mainnet
- Chain ID: `4663`
- Native gas: `ETH`
- Public RPC: `https://rpc.mainnet.chain.robinhood.com`
- Explorer: `https://robinhoodchain.blockscout.com`
- Recommended production RPC provider in Robinhood docs: Alchemy or another supported provider.

### Testnet
- Chain ID: `46630`
- Native gas: `ETH`
- Public RPC: `https://rpc.testnet.chain.robinhood.com`
- Explorer: `https://explorer.testnet.chain.robinhood.com`

Use testnet for deployment rehearsal, but the hackathon's strongest evidence should use real mainnet Stock Token state where legally and operationally allowed.

## 8.2 Canonical asset discovery

At runtime:

`GET https://api.robinhood.com/rhj/assets`

Store:

```ts
type CanonicalStockToken = {
  uid: string;
  symbol: string;
  name: string;
  chainId: 4663;
  contractAddress: `0x${string}`;
  currentMultiplier: string;
  pendingMultiplier?: string;
  pendingMultiplierEffectiveAt?: string;
  status: string;
  tradingCapabilities: unknown;
  resolvedAt: string;
};
```

Never derive token identity from display symbol alone.

Asset-selection invariant:

```text
chainId == 4663
AND deployment address came from current Robinhood assets API
AND token status is acceptable
AND onchain contract bytecode exists
AND onchain symbol/decimals agree with expected metadata
```

## 8.3 Trading-capability compatibility

Robinhood documentation currently exposes two differently described forms of `tradingCapabilities`.

Do not hard-code one undocumented parser assumption.

Implementation rule:

1. Preserve the raw object.
2. Build a tolerant adapter.
3. Support the current actual API response shape.
4. Unit-test both documented shapes if practical.
5. Fail safe when a capability field is unknown.
6. Record the actual response schema in `SPONSOR_FINDINGS.md`.

## 8.4 Corporate-action normalization

Stock Tokens are ERC-20s with 18 decimals plus a UI multiplier.

Current docs:

- raw `balanceOf()` does not rebase;
- `uiMultiplier()` changes the effective share-equivalent amount;
- Robinhood REST `/prices/{symbol}` is raw underlying-equity bid/ask;
- onchain Chainlink Stock Token price is multiplier-adjusted.

Never apply the multiplier twice.

The application must explicitly distinguish:

```text
rawTokenUnits
uiShareEquivalent
rawUnderlyingPrice
multiplierAdjustedTokenPrice
usdValue
```

For valuation snapshots, choose one canonical path.

Preferred V1:

```text
onchain Stock Token oracle price
× raw ERC-20 balance
= Stock Token USD value
```

because the onchain feed already incorporates the multiplier.

If REST price is used:

```text
raw underlying price
× currentMultiplier
= token-equivalent price
```

Store the multiplier and source timestamp with the valuation.

## 8.5 Price snapshot object

```ts
type PriceSnapshot = {
  assetUid: string;
  tokenAddress: `0x${string}`;
  chainId: 4663;
  priceUsdE18: bigint;
  source:
    | "CHAINLINK_STOCK_TOKEN_FEED"
    | "ROBINHOOD_REST_NORMALIZED"
    | "UNISWAP_EXECUTABLE_QUOTE"
    | "FLASH_EXECUTABLE_QUOTE";
  sourceTimestamp: number;
  sourceBlock?: bigint;
  multiplierE18?: bigint;
  rawUnderlyingPrice?: string;
  bid?: string;
  ask?: string;
  stale: boolean;
};
```

The matcher must not mix assets from unrelated price snapshots without recording the timestamp/age.

---

# 9. Portfolio model

## 9.1 Holding

```ts
type Holding = {
  owner: `0x${string}`;
  assetUid: string;
  token: `0x${string}`;
  rawBalance: bigint;
  valueUsdE18: bigint;
  targetValueUsdE18?: bigint;
  deltaValueUsdE18?: bigint;
};
```

## 9.2 Target portfolio

```ts
type PortfolioTarget = {
  account: `0x${string}`;
  targets: Array<{
    assetUid: string;
    targetWeightBps?: number;
    targetValueUsdE18?: bigint;
    minWeightBps?: number;
    maxWeightBps?: number;
  }>;
  cashFloorUsdE18?: bigint;
};
```

## 9.3 User execution constraints

```ts
type ExecutionPolicy = {
  maxExternalSlippageBps: number;
  maxReferencePriceDriftBps: number;
  maxRoundDurationSec: number;
  allowPartialCross: boolean;
  minCrossPercentBps?: number;
  allowMarketResidual: boolean;
  allowLimitResidual: boolean;
  allowTwapResidual: boolean;
  allowWaitResidual: boolean;
  maxTwapDurationSec?: number;
  validUntil: number;
};
```

## 9.4 Portfolio intent

A portfolio intent is an offchain, typed representation of:

- current wallet;
- target deltas;
- assets the user permits to leave;
- maximum raw amount of each sell asset;
- desired receive assets;
- minimum or maximum acceptable quantities where relevant;
- reference snapshot hash;
- policy;
- round/circle scope;
- expiry;
- nonce.

Suggested EIP-712 domain:

```text
name: VENUE0
version: 1
chainId: 4663
verifyingContract: Venue0Settlement
```

Suggested conceptual struct:

```solidity
struct AssetDeltaLimit {
    address token;
    uint256 maxOut;
    uint256 minIn;
}

struct PortfolioIntent {
    address owner;
    address agent;
    bytes32 circleId;
    bytes32 roundId;
    bytes32 valuationSnapshotHash;
    bytes32 policyHash;
    AssetDeltaLimit[] assets;
    uint256 nonce;
    uint64 validAfter;
    uint64 validUntil;
}
```

The exact Solidity encoding may use hashes for dynamic arrays to keep EIP-712 handling clean.

---

# 10. Portfolio agent

## 10.1 Role

The agent is an operator and negotiator, not a generic stock researcher.

It converts human portfolio goals into constrained machine-readable intents and evaluates proposed settlement/residual execution.

## 10.2 Agent responsibilities

The agent may:

- interpret a natural-language target;
- map tickers to canonical Stock Token ids;
- propose target weights;
- calculate required deltas;
- create an intent;
- join a compatible round;
- inspect a proposed settlement plan;
- reject a plan outside user bounds;
- select residual execution mode;
- submit an allowed wallet action;
- explain the outcome.

The agent must not:

- invent token addresses;
- invent prices;
- invent fills;
- move more than the delegated/user-authorized limit;
- silently substitute a different Stock Token issuer;
- treat a perp as equivalent to spot;
- ignore a revoked delegation;
- sign a different settlement plan than the one shown to the user/agent policy.

## 10.3 Natural-language goal examples

```text
"Reduce my NVDA exposure to 20%, put the difference into SPY, and keep 10% in USDG."

"Move half of my AAPL overweight into QQQ but do not hit the market if the external spread is above 40 bps."

"Join tonight's AI Stocks Circle round. Cross as much as possible. TWAP any residual over two hours."
```

The parser output is structured data. The model is never the authority for arithmetic.

---

# 11. Venue0 Circles

## 11.1 Purpose

Venue0 Circles solve the network cold-start problem by concentrating participants who already share an asset universe or coordinate portfolio activity.

Examples:

- AI Stocks Club;
- family investment group;
- community treasury circle;
- DAO treasury operators;
- agent-managed model portfolios.

## 11.2 Circle configuration

```ts
type CrossingCircle = {
  id: string;
  name: string;
  visibility: "PRIVATE" | "INVITE_ONLY" | "PUBLIC";
  organizer: string;
  allowedAssetUids: string[];
  minParticipants: number;
  roundCadence?: string;
  defaultRoundDurationSec: number;
  privacyMode: "DELTAS_ONLY" | "AGGREGATE_ONLY";
  createdAt: string;
};
```

## 11.3 Privacy

By default, VENUE0 should not publish each participant's complete holdings.

The matcher needs:

- permitted outgoing amount;
- desired incoming amount;
- constraints.

The public/social surface can show:

- participant count;
- assets involved;
- requested turnover;
- crossed value;
- residual value;
- completion rate.

Do not expose wallet-level positions unless the user explicitly chooses to.

---

# 12. Crossing round lifecycle

Round state machine:

```text
DRAFT
  ↓
OPEN
  ↓
COLLECTING
  ↓
FROZEN
  ↓
SOLVING
  ↓
PROPOSED
  ↓
APPROVING
  ↓
READY_TO_SETTLE
  ↓
SETTLING
  ↓
SETTLED
  ↓
RESIDUAL_EXECUTION
  ↓
VERIFYING
  ↓
COMPLETE
```

Failure states:

```text
EXPIRED
INSUFFICIENT_PARTICIPANTS
NO_CROSS
PLAN_REJECTED
PLAN_STALE
SETTLEMENT_REVERTED
RESIDUAL_PARTIAL
RESIDUAL_FAILED
VERIFICATION_FAILED
CANCELLED
```

A round with zero overlap can end successfully as:

`NO_CROSS`

That is not an implementation failure.

---

# 13. Matching engine

## 13.1 Goal

Maximize economically valid crossed portfolio value subject to participant constraints.

Secondary objectives:

1. minimize target-allocation error;
2. minimize number of transfer legs;
3. minimize residual external notional;
4. avoid unnecessary dust;
5. preserve fairness/value constraints.

## 13.2 Inputs

For participant `p` and asset `a`:

- current raw balance;
- permitted maximum outflow;
- desired maximum inflow;
- target delta;
- canonical USD valuation snapshot;
- execution policy.

Convert each signed/accepted target into:

```text
sellCapacity[p,a]  >= 0
buyDemand[p,a]     >= 0
```

in both:

- raw token units;
- common normalized USD value.

## 13.3 Solver variables

Conceptually:

`x[p,q,a]`

= USD-normalized amount of asset `a` transferred from seller `p` to buyer `q`.

Constraints:

### Asset outflow
For each `(p,a)`:

`Σ_q x[p,q,a] <= sellCapacityValue[p,a]`

### Asset inflow
For each `(q,a)`:

`Σ_p x[p,q,a] <= buyDemandValue[q,a]`

### No self transfer
`x[p,p,a] = 0`

### Participant value balance
For a pure asset-for-asset round:

`abs(totalValueIn[p] - totalValueOut[p]) <= valueTolerance[p]`

A future version may permit an explicit USDG balancing leg.

### User constraints
The resulting plan may not exceed:

- max sell amount;
- min receive amount;
- max price drift;
- target corridor;
- expiry;
- participant-specific asset restrictions.

## 13.4 Objective

Primary:

`maximize total crossed value`

Then score equivalent solutions by:

- lower residual;
- lower number of token transfers;
- lower total allocation error;
- lower rounding loss.

## 13.5 Implementation approach

The architecture should support a general N-participant solver.

Recommended V1 implementation:

- deterministic offchain solver;
- integer/fixed-point arithmetic;
- no floating point in final amount calculation;
- use a linear-programming/min-cost-flow library only if it is maintained and reproducible;
- otherwise implement a bounded deterministic circulation solver for the hackathon asset universe.

Regardless of library choice:

- pin dependency version;
- add a reference solver;
- add property tests;
- expose input and output JSON.

The core proof must not depend on a hidden LLM decision.

## 13.6 Three-way cycle

Hero proof:

```text
A sells NVDA, wants AAPL
B sells AAPL, wants SPY
C sells SPY, wants NVDA
```

The matcher discovers:

```text
A.NVDA → C
C.SPY  → B
B.AAPL → A
```

with values/amounts sized under the same valuation snapshot.

This is the minimum originality proof.

## 13.7 Partial overlap

The solver must support:

- only part of a participant's sell capacity being matched;
- only part of a target asset demand being satisfied;
- multiple counterparties per asset;
- residual calculation after crossing.

Residual for participant/asset:

```text
residualDelta = originalRequestedDelta - crossedDelta
```

## 13.8 Zero-overlap behavior

If there is no compatible circulation:

```text
crossedNotional = 0
residualNotional = requestedNotional
status = NO_CROSS
```

Do not manufacture a match.

This case is mandatory in the evidence campaign.

---

# 14. Reference matcher

Build a second, deliberately simple reference implementation.

Purpose:

- prove the production matcher is correct;
- prevent optimization code from silently creating or destroying value.

Reference matcher may be slower.

It should:

- enumerate small-case cycle possibilities;
- produce a valid result for 2–5 participants;
- verify conservation and constraints.

For campaign fixtures, production and reference outputs must agree on:

- feasibility;
- per-asset conservation;
- per-wallet outflow bounds;
- total crossed notional within rounding tolerance;
- final target deltas.

Correctness oracle and competitive baseline are separate.

The reference matcher answers:

> Is our matcher correct?

The market-only baseline answers:

> Does crossing improve the portfolio execution workflow?

---

# 15. Settlement plan

## 15.1 Plan generation

The matcher outputs:

```ts
type SettlementLeg = {
  token: `0x${string}`;
  from: `0x${string}`;
  to: `0x${string}`;
  amountRaw: bigint;
  assetUid: string;
};

type SettlementPlan = {
  roundId: string;
  planId: string;
  chainId: 4663;
  valuationSnapshotHash: string;
  legs: SettlementLeg[];
  participantSummaries: ParticipantPlanSummary[];
  residuals: ResidualOrder[];
  generatedAt: number;
  validUntil: number;
};
```

## 15.2 Participant acceptance

Every participant/authorized agent receives the exact final plan before settlement.

Acceptance signature binds:

- plan hash;
- round id;
- wallet;
- expiry;
- nonce;
- chain id;
- settlement contract.

No server-side plan mutation is allowed after signatures are collected.

If any plan field changes, all affected signatures are invalid.

---

# 16. `Venue0Settlement.sol`

## 16.1 Contract purpose

The contract is intentionally narrow.

It is not:

- a custodian;
- an AMM;
- a price oracle;
- a matching engine;
- a netting protocol;
- a portfolio manager.

It atomically executes an already-approved multi-party settlement plan.

## 16.2 Required behavior

The contract must:

- verify chain/domain separation;
- verify plan id/hash;
- verify required participant signatures;
- enforce nonces;
- enforce expiry;
- ensure each token is in the plan;
- transfer each leg with `transferFrom`;
- revert the entire transaction if any required transfer fails;
- emit plan/leg events;
- mark plan/nonces consumed.

## 16.3 Custody invariant

VENUE0 must not hold user Stock Tokens between transactions.

Flow:

wallet allowance  
→ atomic `transferFrom` inside settlement  
→ recipient wallet

No user deposits into a protocol vault for the crossing mechanism.

## 16.4 Approval model

Spike path:

- standard ERC-20 `approve(Venue0Settlement, amount)`.

Product path may support:

- exact allowance;
- Permit2 if compatible and useful;
- approval reset/management.

Do not assume Robinhood Stock Tokens implement ERC-2612 permit.

## 16.5 Signature compatibility

Hackathon primary:

- EOA / Dynamic MPC EVM wallets;
- ECDSA EIP-712 recovery.

Optional full product:

- ERC-1271 smart-contract wallet signatures.

## 16.6 Required events

```solidity
event PlanSettled(
    bytes32 indexed roundId,
    bytes32 indexed planId,
    uint256 participantCount,
    uint256 legCount
);

event CrossingLeg(
    bytes32 indexed planId,
    address indexed token,
    address indexed from,
    address to,
    uint256 amount
);
```

Exact event names may change. They must be independently indexable.

---

# 17. Residual engine

## 17.1 Purpose

The crossing solver answers:

> Who can satisfy whom?

The residual engine answers:

> How should the unmatched portion reach the external market?

## 17.2 Residual object

```ts
type ResidualOrder = {
  owner: `0x${string}`;
  assetUid: string;
  token: `0x${string}`;
  side: "BUY" | "SELL";
  amountRaw: bigint;
  notionalUsdE18: bigint;
  urgency: "LOW" | "NORMAL" | "HIGH";
  maxSlippageBps: number;
  validUntil: number;
};
```

## 17.3 Decision outputs

```text
EXECUTE_NOW
LIMIT
TWAP
WAIT
CANCEL
```

Do not reduce the product to an allow/refuse policy engine.

## 17.4 Inputs

Residual decision may consider:

- Robinhood asset trading capability;
- current trading halt;
- cash-session state;
- tokenization window;
- executable Uniswap quote;
- Flash quote;
- price drift from round snapshot;
- external slippage;
- user urgency;
- user's max delay;
- residual size;
- available route/liquidity.

## 17.5 Session awareness

Robinhood Stock Tokens may remain transferable/onchain even outside the primary tokenization window, but per-asset trading capabilities vary.

The residual engine must read current asset metadata instead of assuming "24/7" means identical execution quality.

Session awareness is a residual execution feature, not the core product thesis.

---

# 18. Uniswap integration

## 18.1 Current Robinhood Chain support

Current Uniswap docs:

- chain ID `4663` supported;
- Universal Router `2.1.1` available;
- UniswapX v3 supported;
- default `BEST_PRICE` can consider AMM and UniswapX;
- any token is not guaranteed to have sufficient liquidity;
- quote before execution.

## 18.2 V1 flow

For every residual considered for immediate execution:

1. `POST /check_approval`
2. sign/send approval if needed
3. `POST /quote`
4. inspect `routing`
5. if `CLASSIC`, generate transaction using `/swap`
6. if UniswapX route, submit through `/order`
7. record request id, route, quote, tx/order id
8. independently read final wallet balances

Pin:

`x-universal-router-version: 2.1.1`

for Robinhood Chain during the hackathon to avoid silent router-version drift.

## 18.3 Quote failure

A quote can fail because:

- token unsupported by policy;
- liquidity insufficient;
- UniswapX minimum;
- route unavailable;
- amount too small.

A quote failure is a legitimate product outcome.

Residual status becomes:

`NO_EXTERNAL_ROUTE`

The user/agent may then:

- WAIT;
- choose Flash;
- reduce size;
- choose another approved venue;
- cancel.

## 18.4 Evidence

Store:

- quote request/response sanitized;
- routing type;
- router version;
- expected output;
- transaction/order id;
- final balance delta;
- quote timestamp.

---

# 19. Definitive Flash integration

## 19.1 Current capabilities

Current Flash docs advertise/support:

- Robinhood Chain;
- ERC-20 spot assets and RWAs/Stock Token execution;
- Market;
- Limit;
- Stop Loss;
- Take Profit;
- TWAP;
- DCA;
- managed transaction landing;
- non-custodial EIP-712 signing;
- status/order lifecycle.

Flash has a current public case study showing Stock Token advanced-order execution on Robinhood Chain for NVDA, AAPL, and SPY.

Still run a live quote for the exact chosen demo token before declaring the path green.

## 19.2 Primary sponsor-track path

Best case:

```text
partial crossing
→ residual sell/buy
→ residual engine decides TWAP or Limit
→ Flash /v1/quote
→ sign returned EIP-712 order data
→ Flash /v1/order
→ save order id
→ poll order status
→ show fill/status
→ independent wallet readback
```

## 19.3 Order selection

### Market
Use only when:
- user allows;
- execution conditions satisfy constraints;
- immediacy dominates waiting.

### Limit
Use when:
- price protection dominates immediacy;
- residual may wait;
- user supplies or policy derives limit.

### TWAP
Use when:
- residual is large relative to desired market interaction;
- user allows delay;
- slicing is preferable to one immediate print.

### WAIT
Use when:
- no valid quote;
- external execution violates user bounds;
- metadata is stale/ambiguous;
- user allows delayed execution.

## 19.4 Flash is downstream

Flash may never decide the core crossing match.

If Flash fails, the crossing mechanism still exists.

The complete portfolio may remain partially unresolved.

That distinction must be visible.

---

# 20. Dynamic integration

## 20.1 Current agent wallet patterns

Current Dynamic agent docs provide:

1. Server wallets
2. Agent wallets
3. Delegated access

For VENUE0, the target is delegated access because:

- end user owns the embedded wallet;
- user explicitly approves agent access;
- multi-user app;
- agent acts with limited signing rights;
- user can revoke.

## 20.2 Sandbox strategy

Dynamic states that all features are available in Sandbox for testing, with a 1,000-user limit.

Use Sandbox during Runtime.

## 20.3 Custom Robinhood Chain network

Dynamic supports custom EVM networks.

Configure:

```ts
{
  chainId: 4663,
  networkId: 4663,
  name: "Robinhood Chain",
  nativeCurrency: {
    name: "Ether",
    symbol: "ETH",
    decimals: 18
  },
  rpcUrls: ["<provider-or-public-rpc>"],
  blockExplorerUrls: ["https://robinhoodchain.blockscout.com"]
}
```

Pin the actual SDK field names/types from the installed Dynamic version.

## 20.4 Delegated access flow

Current Dynamic model:

1. User authenticates.
2. User approves delegation in Dynamic SDK.
3. Dynamic sends encrypted delegated credentials to server webhook.
4. Server verifies webhook signature.
5. Server decrypts and securely stores delegated materials.
6. Agent uses delegated EVM signer to sign an approved operation.
7. Revocation webhook removes/invalidates access.

## 20.5 Security

Delegated key materials plus API credentials provide signing authority.

Required:

- never log key shares;
- never return delegated credentials to browser;
- webhook signature verification;
- encrypted-at-rest storage;
- short-lived hackathon storage if possible;
- revoke/delete on `wallet.delegation.revoked`;
- idempotent webhook handling;
- per-action policy validation before signing.

## 20.6 Fallback

If delegated transaction signing on chain 4663 cannot be made reliable quickly:

- preserve Dynamic for authentication/wallet creation;
- use an Agent Wallet or Server Wallet for sponsor-track proof;
- use three EOAs for the dominant crossing proof.

Never block G0–G4 on Dynamic.

---

# 21. Bankr integration policy

Bankr APIs are optional for the grand prize.

Do not add Bankr to satisfy a logo count.

Permitted optional integrations:

- Bankr LLM Gateway as agent inference provider;
- Bankr Stock Token route/quote comparison;
- future token launch after real demand/volume.

A Bankr token is explicitly out of V1.

If a token is ever added later, it must have a real role in:

- fee rebates;
- funding recurring agent costs;
- distribution;
- coordination;
- protocol governance with genuine necessity.

No meme token attached to the product.

---

# 22. Backend services

Recommended logical modules:

```text
apps/web
services/api
packages/assets
packages/portfolio
packages/matcher
packages/reference-matcher
packages/agent
packages/verifier
packages/uniswap
packages/flash
packages/dynamic
contracts
campaign
```

These may live in one monorepo/process for the hackathon.

Do not create microservices for diagram aesthetics.

## 22.1 Asset service

Responsibilities:

- query Robinhood assets API;
- canonicalize Stock Tokens;
- cache briefly;
- resolve token contract;
- track multiplier/status/trading capabilities;
- reject unknown lookalikes.

## 22.2 Portfolio service

Responsibilities:

- balances;
- valuations;
- targets;
- deltas;
- allocation error;
- residual calculation.

## 22.3 Round service

Responsibilities:

- round lifecycle;
- intent collection;
- freeze;
- plan status;
- participant approvals.

## 22.4 Matcher

Responsibilities:

- solve;
- generate legs;
- produce residuals;
- output explanation;
- deterministic artifact.

## 22.5 Settlement executor

Responsibilities:

- assemble transaction;
- participant approvals;
- submit;
- record hash;
- never mark complete before verifier passes.

## 22.6 External execution

Responsibilities:

- Uniswap quote/swap/order;
- Flash quote/order;
- order status;
- sanitized artifacts.

## 22.7 Verifier

Responsibilities:

- independent chain reads;
- compare before/after;
- verify exact expected deltas;
- verify zero unexpected transfers;
- verify residual state.

---

# 23. Database model

Use PostgreSQL/Supabase if persistence is needed.

Tables:

## users
- id
- dynamic_user_id
- created_at

## wallets
- id
- user_id
- address
- chain_id
- wallet_type
- delegation_status
- created_at

Never store raw private keys.

## circles
- id
- name
- organizer_user_id
- visibility
- config_json
- created_at

## rounds
- id
- circle_id
- state
- opens_at
- freezes_at
- valuation_snapshot_id
- plan_id
- created_at

## intents
- id
- round_id
- owner
- intent_hash
- payload_json
- signature
- nonce
- expires_at
- status

## valuation_snapshots
- id
- block_number
- captured_at
- prices_json
- asset_metadata_hash

## settlement_plans
- id
- round_id
- plan_hash
- legs_json
- residuals_json
- solver_version
- generated_at
- valid_until

## plan_approvals
- plan_id
- owner
- signature
- approved_at

## executions
- id
- plan_id
- type
- provider
- tx_hash
- external_order_id
- state
- request_artifact
- response_artifact
- created_at

## verification_runs
- id
- plan_id
- verifier_version
- status
- expected_json
- observed_json
- completed_at

## campaign_runs
- id
- scenario_id
- arm
- result_json
- artifact_path

---

# 24. Internal API

Suggested REST routes.

## Asset
`GET /api/assets`
`GET /api/assets/:uid`
`GET /api/assets/:uid/price`

## Portfolio
`GET /api/portfolio/:address`
`POST /api/portfolio/target`
`POST /api/portfolio/preview`

## Circles
`POST /api/circles`
`GET /api/circles/:id`
`POST /api/circles/:id/join`

## Rounds
`POST /api/rounds`
`GET /api/rounds/:id`
`POST /api/rounds/:id/intents`
`POST /api/rounds/:id/freeze`
`POST /api/rounds/:id/solve`
`POST /api/rounds/:id/approve`
`POST /api/rounds/:id/settle`
`GET /api/rounds/:id/receipt`

## Residual
`POST /api/residual/quote`
`POST /api/residual/execute`
`GET /api/residual/:id/status`

## Verify
`POST /api/verify/:roundId`
`GET /api/verify/:roundId`

## Campaign
`POST /api/campaign/run`
`GET /api/campaign/results`

Every mutating endpoint must be idempotent or have an explicit idempotency key.

---

# 25. Frontend product architecture

Recommended stack:

- Next.js;
- TypeScript;
- React;
- Tailwind or equivalent;
- Viem/Wagmi;
- Dynamic;
- server-side API routes or lightweight backend service;
- no generic "AI dashboard" visual style.

## 25.1 `/`

Landing page.

Must communicate:

1. what it is;
2. user;
3. problem;
4. mechanism;
5. result;
6. primary action.

Hero:

> Rebalance together.  
> Your portfolio agent crosses with other portfolios before touching public liquidity.

Primary CTA:

`Start a crossing round`

Secondary:

`Watch live proof`

## 25.2 `/portfolio`

Shows:

- wallet;
- current holdings;
- UI-adjusted Stock Token identity;
- current value;
- target allocation;
- delta;
- user constraints.

Primary action:

`Create rebalance intent`

## 25.3 `/agent`

Natural-language target input plus structured preview.

Never show raw model output as authoritative.

Flow:

goal  
→ parsed target  
→ deterministic portfolio math  
→ user review  
→ intent.

## 25.4 `/circles`

Create/join Venue0 Circles.

Show aggregate statistics only by default.

## 25.5 `/round/:id`

This is the main product moment.

Show:

- participants;
- portfolio deltas in privacy-safe form;
- assets;
- requested rebalance notional;
- match graph;
- crossable percent;
- residual;
- round state.

The visualization should make the 3-wallet cycle obvious.

## 25.6 `/round/:id/proposal`

Show exact participant result:

- assets leaving;
- assets arriving;
- expected target improvement;
- crossed amount;
- residual;
- constraints;
- approval status.

## 25.7 `/round/:id/execute`

Live sequence:

```text
Plan approved
Settlement submitted
Settlement confirmed
Residual policy evaluated
External order submitted
External order filled/pending
Independent verification complete
```

## 25.8 `/round/:id/receipt`

Winning screenshot surface.

Required:

- requested notional;
- crossed notional;
- cross rate;
- residual;
- market-only external orders;
- VENUE0 external orders;
- before/after allocation error;
- participant wallet links;
- settlement transaction;
- external order links;
- verifier status.

## 25.9 `/proof`

Deep judge evidence.

Do not make this the homepage.

Include:

- live campaign cases;
- 100-scenario summary;
- raw artifacts;
- comparison arms;
- limitations;
- one-command reproduction instructions.

---

# 26. UI state requirements

Every critical route must implement:

- loading;
- empty;
- disconnected wallet;
- wrong network;
- insufficient balance;
- allowance needed;
- intent expired;
- plan changed;
- user rejected;
- no cross;
- partial cross;
- settlement pending;
- settlement reverted;
- external route unavailable;
- Flash order pending;
- Flash partially filled;
- verifier failed;
- complete.

The app must never show `COMPLETE` merely because an API returned `200`.

---

# 27. Security model

## 27.1 Threats

### Wrong token / ticker collision
Mitigation:
- canonical UID + contract address + chain;
- live Robinhood registry lookup;
- show address in technical detail;
- reject unverified asset.

### Replay
Mitigation:
- per-owner nonce;
- round id;
- plan id;
- consumed signature/nonces.

### Expired intent
Mitigation:
- `validUntil`;
- checked before solve and settlement.

### Plan mutation
Mitigation:
- hash entire plan;
- every approval signs final plan hash.

### Balance changes after solve
Mitigation:
- re-read balance/allowance before settlement;
- atomic revert if transfer fails;
- allow re-solve.

### Corporate action
Mitigation:
- valuation snapshot hashes multiplier;
- reject/re-solve when material metadata changes before settlement.

### Stale price
Mitigation:
- source timestamp;
- max age;
- re-snapshot before final plan if outside bound.

### Trading halt
Mitigation:
- do not route residual blindly;
- check current metadata/quote state.

### Agent overreach
Mitigation:
- bounded policy;
- delegated wallet;
- exact settlement-plan signature;
- server-side validation.

### Delegation revocation
Mitigation:
- webhook;
- immediate local invalidation;
- agent action checks delegation status each time.

### Partial atomic settlement
Mitigation:
- one transaction;
- revert all crossing legs on any failed required leg.

### API/provider spoofing
Mitigation:
- TLS;
- server-side keys;
- validate response shape;
- independently verify onchain state.

### Front-running
The crossing plan should reveal no more than necessary before signature/submission.
Residual Flash orders may benefit from Flash's private/managed execution.

### Secret leakage
Never commit:
- deployer private key;
- Dynamic API key/key share;
- Flash API secret/key;
- Uniswap API key where policy requires server-side protection;
- webhook secret.

---

# 28. Economic and market integrity rules

VENUE0 may not claim "better execution" solely because it matched internally.

Measure.

A crossed transfer may still be economically poor if reference pricing is unfair or stale.

Every plan must preserve:

- value fairness within tolerance;
- participant sell caps;
- target bounds;
- no unapproved asset substitution.

No participant may receive a worse plan than the exact plan they/agent approved.

---

# 29. Evidence strategy

## 29.1 Three proof arms

### A — MARKET_ONLY

Every participant independently executes the requested rebalance through public liquidity.

### B — CROSSING_IMMEDIATE

Cross internally first. Send every residual immediately to external liquidity.

### C — CROSSING_SMART_RESIDUAL

Cross internally first. Residual engine chooses Market, Limit, TWAP, WAIT, or CANCEL under user constraints.

This separates the value of:

- portfolio crossing;
- residual intelligence.

## 29.2 Primary metric

`crossed_notional / requested_rebalance_notional`

This directly measures how much requested rebalance turnover never needed external liquidity.

## 29.3 Supporting metrics

- external notional;
- number of external orders;
- number of onchain transfer legs;
- estimated external price impact/slippage;
- realized execution cost when live;
- time to completion;
- allocation error before;
- allocation error after;
- settlement success;
- residual completion;
- gas;
- sponsor calls;
- failures/abstentions.

## 29.4 Headline claim target

Pre-register:

> VENUE0 materially reduces how much Stock Token portfolio-rebalance flow needs to consume public liquidity by matching complementary portfolio intents first.

Do not insert a percentage until measured.

## 29.5 Falsification

The thesis is weakened or killed if:

- realistic cohorts show negligible crossability;
- matching creates unacceptable value imbalance;
- settlement complexity/cost overwhelms external-order reduction;
- multi-party cycles rarely add value over simple bilateral matching;
- residual execution repeatedly fails for the chosen asset universe.

---

# 30. Live-chain proof campaign

The live campaign is deliberately small and high quality.

## L0 — canonical transfer
- resolve one real Stock Token from current Robinhood API;
- fund Wallet A;
- transfer to Wallet B;
- confirm explorer;
- independently read both balances.

PASS only if the intended Stock Token balance changed exactly.

## L1 — atomic bilateral exchange
- Wallet A has asset X;
- Wallet B has asset Y;
- single atomic settlement transaction;
- X A→B;
- Y B→A;
- readback.

This is plumbing proof, not headline proof.

## L2 — HERO: 3-wallet, 3-asset cycle
- three independent wallet addresses;
- three Stock Token assets;
- no simple bilateral solution covers all three;
- matcher finds cycle;
- single atomic settlement;
- independent readback;
- public explorer links.

This is the implementation-lock gate.

## L3 — partial overlap
- only part of requested rebalance crosses;
- residual is exact;
- residual does not silently disappear.

## L4 — zero overlap
- no valid cross;
- `crossed = 0`;
- full request becomes residual.

## L5 — residual execution
- run through Uniswap and/or Flash;
- actual tx/order id;
- postcondition check.

## L6 — revocation/expiry/balance-change case
At least one:
- expired intent rejected;
- revoked delegation blocks action;
- balance change makes plan re-solve/revert safely.

---

# 31. Wide campaign

Run 100+ frozen scenarios offchain.

Do not send all scenarios to mainnet.

## 31.1 Scenario generator

Freeze before results:

- asset universe;
- participant-count distribution;
- starting portfolio distribution;
- target-generation distribution;
- overlap/correlation regimes;
- price snapshots;
- policy thresholds.

Include cohorts:

1. Random independent portfolios.
2. Same-theme circle.
3. Index-like portfolios.
4. Concentrated tech portfolios.
5. High-overlap rebalance.
6. Low-overlap/no-overlap.
7. One large participant + small participants.
8. Partial liquidity.
9. Corporate-action metadata change fixture.
10. External-route failure fixture.

## 31.2 Output columns

```text
scenario_id
cohort
participants
assets
requested_notional
crossed_notional
cross_rate
residual_notional
market_only_external_orders
crossing_external_orders
arm
estimated_external_cost
allocation_error_before
allocation_error_after
solve_ms
status
```

Publish:

- CSV;
- JSON;
- campaign manifest;
- methodology;
- seed;
- source revision;
- matcher commit.

---

# 32. Independent verification

Never let the executor be the sole source of truth.

Write:

`Venue0Settlement`

Verify through:

- independent Viem RPC client;
- Blockscout/explorer link;
- fresh `balanceOf()` calls;
- transaction receipt/logs.

For each participant:

```text
observed_after_balance
-
observed_before_balance
==
expected_net_delta
```

Also verify:

- zero unexpected token contracts changed;
- plan nonce consumed;
- tx succeeded;
- all expected logs present;
- residual tx/order corresponds to expected owner/asset/amount.

A successful HTTP call, tx broadcast, order submission, or tx receipt alone is insufficient.

---

# 33. Claim ledger

Create `docs/CLAIM_LEDGER.md`.

Every public claim has:

- exact wording;
- status: TARGET / PROVEN / PARTIAL / WITHDRAWN;
- evidence path;
- denominator;
- environment;
- mainnet/testnet/offline;
- limitation.

Examples:

### Claim
"VENUE0 completed a 3-wallet Stock Token cycle atomically."

Evidence:
- mainnet tx;
- three wallet before/after balance files;
- verifier output.

### Claim
"VENUE0 reduced external notional by X% across 100 scenarios."

Evidence:
- campaign CSV;
- frozen seed;
- market-only and crossing outputs;
- reproduction command.

Do not convert scenarios into users.

---

# 34. Build contract for Claude Code

Create `BUILD_CONTRACT.md` before major implementation.

It must say:

1. This PRD is the product source of truth.
2. Current official docs override stale assumptions.
3. Never fabricate a transaction, user, quote, fill, order id, metric, wallet, or price.
4. Targets are not results.
5. No hard-coded Stock Token address from memory.
6. Resolve the current canonical address at runtime.
7. No float math for settlement quantities.
8. Any headline number must originate in machine-readable evidence.
9. Keep failed proof cases.
10. Never silently fall back from a sponsor path while continuing to claim that sponsor.
11. Never mark an action successful until postconditions are checked.
12. The 3-wallet cycle outranks decorative product work until it passes.
13. Flash and Dynamic do not block the core cycle.
14. No project token.
15. No governance.
16. No fake adoption.
17. External-facing Robinhood copy follows current naming guidelines.
18. Every integration failure goes into `SPONSOR_FINDINGS.md`.
19. Every architecture-changing observation goes into `DECISIONS.md`.
20. Every acceptance gate pass/fail goes into `GATES.md` immediately.

---

# 35. Repository

```text
/
├── apps/
│   └── web/
├── services/
│   └── api/
├── packages/
│   ├── assets/
│   ├── portfolio/
│   ├── matcher/
│   ├── reference-matcher/
│   ├── agent/
│   ├── verifier/
│   ├── uniswap/
│   ├── flash/
│   ├── dynamic/
│   └── shared/
├── contracts/
│   ├── src/
│   │   └── Venue0Settlement.sol
│   ├── test/
│   └── script/
├── campaign/
│   ├── scenarios/
│   ├── runner/
│   ├── results/
│   └── manifest.json
├── evidence/
│   ├── live/
│   │   ├── L0-transfer/
│   │   ├── L1-bilateral/
│   │   ├── L2-cycle/
│   │   ├── L3-partial/
│   │   ├── L4-no-cross/
│   │   ├── L5-residual/
│   │   └── L6-boundary/
│   └── campaign/
├── docs/
│   ├── PRD.md
│   ├── THESIS.md
│   ├── BUILD_CONTRACT.md
│   ├── ARCHITECTURE.md
│   ├── DECISIONS.md
│   ├── GATES.md
│   ├── SECURITY.md
│   ├── CLAIM_LEDGER.md
│   ├── EVAL_CAMPAIGN.md
│   ├── COMPETITOR_MAP.md
│   ├── JUDGE_SCORECARD.md
│   ├── SPONSOR_FINDINGS.md
│   ├── DEMO_SCRIPT.md
│   └── SUBMISSION.md
├── FEEDBACK.md
├── submission-facts.json
└── README.md
```

Do not create empty placeholder docs for optics. Generate them when their information becomes real.

---

# 36. Testing

## 36.1 Contract unit tests

Must include:

- valid 2-party plan;
- valid 3-party cycle;
- invalid signature;
- expired plan;
- reused nonce;
- duplicate plan;
- transferFrom failure;
- insufficient allowance;
- insufficient balance;
- one failing leg reverts all legs;
- zero amount;
- duplicate leg;
- unsupported token if allowlist enforced;
- plan tampering;
- wrong chain/domain;
- fuzz conservation.

## 36.2 Matcher tests

- exact bilateral;
- exact 3-cycle;
- 4-cycle;
- partial overlap;
- no overlap;
- multiple sellers same asset;
- multiple buyers same asset;
- rounding;
- dust;
- participant value balance;
- sell cap;
- buy cap;
- expired input;
- stale snapshot;
- reference solver parity;
- deterministic output for same input.

## 36.3 Property tests

For every successful plan:

```text
No wallet sends more than approved.
No wallet receives negative amount.
Asset transfer total out == total in.
No token is created/destroyed by matcher.
Residual + crossed request == original request within rounding tolerance.
Final allocation is no farther outside accepted bounds.
```

## 36.4 Integration tests

- Robinhood API live schema;
- canonical asset resolve;
- RPC connection;
- contract deploy;
- live testnet transfer;
- mainnet spike;
- Uniswap quote;
- Uniswap route handling;
- Flash quote;
- Flash order lifecycle;
- Dynamic wallet;
- Dynamic delegation/revocation;
- verifier.

Separate:

- reproducible local tests;
- live tests requiring secrets/funds.

---

# 37. Observability

Every round gets a correlation id.

Structured logs:

- round created;
- intent received;
- snapshot created;
- solver input hash;
- solver output hash;
- plan generated;
- approval received;
- settlement submitted;
- tx confirmed;
- residual quote;
- residual submitted;
- residual status;
- verifier result.

Never log secrets or full delegated materials.

Store enough metadata to replay a judge case.

---

# 38. Infrastructure and deployment

## 38.1 Web
Vercel or Cloudflare where appropriate.

## 38.2 API
Serverless or small Node service.

Use the simplest deployment that supports:
- secure server-only keys;
- webhook;
- persistent DB;
- live API calls.

## 38.3 Database
Supabase/Postgres acceptable.

## 38.4 RPC
Prefer an authenticated Robinhood Chain RPC provider for production/judge reliability.

Public RPC is acceptable as fallback, but official docs state it is rate-limited and not recommended for production.

## 38.5 Contracts
Deploy:

1. testnet rehearsal;
2. mainnet once gate tests pass.

Verify source on Blockscout.

---

# 39. Environment variables

Example:

```bash
NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID=
DYNAMIC_API_KEY=
DYNAMIC_WEBHOOK_SECRET=
DYNAMIC_DELEGATION_PRIVATE_KEY=

ROBINHOOD_RPC_URL=
ROBINHOOD_TESTNET_RPC_URL=
DEPLOYER_PRIVATE_KEY=

UNISWAP_API_KEY=
FLASH_API_KEY=
FLASH_API_SECRET=

DATABASE_URL=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

CROSSING_SETTLEMENT_ADDRESS=
NEXT_PUBLIC_CHAIN_ID=4663
```

Do not commit `.env`.

---

# 40. Spike gates before deep UI

## G0 — live Stock Token transfer

Output:

- timestamp;
- asset UID;
- current live contract address;
- wallet A;
- wallet B;
- amount;
- tx hash;
- before balances;
- after balances.

PASS only after independent readback.

## G1 — atomic bilateral exchange

Output:

- two canonical Stock Tokens;
- two wallets;
- single atomic tx;
- explorer;
- readback.

## G2 — 3-wallet cycle

This is the core implementation lock.

Output:

- three canonical Stock Tokens;
- three wallets;
- input intents;
- valuation snapshot;
- matcher artifact;
- settlement plan;
- approval/signatures;
- single settlement transaction;
- verifier output;
- three explorer links or one tx plus three wallet explorer links.

## G3 — partial overlap

Output:
- requested;
- crossed;
- residual;
- exact conservation.

## G4 — zero overlap

Output:
- requested;
- crossed = 0;
- residual = requested.

After G2–G4 pass, the product can move from:

`THESIS LOCKED`

to:

`MECHANISM LOCKED`.

---

# 41. Build sequence

## Phase 0 — research freeze and repo initialization

Deliver:
- PRD committed;
- BUILD_CONTRACT;
- source matrix;
- install/pin current dependency versions;
- RPC connectivity;
- live assets API script.

Acceptance:
- current Robinhood API response saved;
- chain 4663 block read;
- candidate demo assets selected from live data.

## Phase 1 — G0/G1

Deliver:
- funded wallets;
- transfer;
- minimal settlement contract;
- bilateral atomic exchange.

No full UI required.

## Phase 2 — matcher + G2

Deliver:
- portfolio delta model;
- production matcher;
- reference matcher;
- 3-wallet cycle fixture;
- plan signing;
- atomic cycle;
- verifier.

This phase outranks all sponsor polish.

## Phase 3 — partial/no-cross + campaign harness

Deliver:
- partial matching;
- zero-overlap;
- residual object;
- campaign runner;
- initial 100 scenarios.

## Phase 4 — product web app

Deliver:
- landing;
- portfolio;
- target;
- round;
- proposal;
- execute;
- receipt.

## Phase 5 — Uniswap

Deliver:
- quote;
- approval;
- route handling;
- live residual;
- evidence.

## Phase 6 — Dynamic

Deliver:
- Sandbox;
- custom Robinhood Chain network;
- wallet;
- delegation or documented fallback pattern;
- one real agent-authorized action.

## Phase 7 — Flash

Deliver:
- exact demo asset quote;
- Limit/TWAP;
- signed order;
- order status;
- evidence.

## Phase 8 — Venue0 Circles

Deliver:
- create/join;
- round membership;
- privacy-safe aggregate;
- recurring-circle UX.

## Phase 9 — preference-aware agent

Deliver:
- natural-language target;
- structured constraints;
- plan evaluation;
- residual strategy.

## Phase 10 — evidence and submission

Deliver:
- final live campaign;
- final wide campaign;
- README;
- FEEDBACK.md;
- forms;
- video;
- claim parity;
- valid submission V0.

---

# 42. Kill / revise criteria

## Kill chain choice if:
- chosen Stock Token cannot transfer between ordinary wallets;
- standard allowance/transfer semantics block atomic settlement and no honest alternative exists in time.

## Revise asset universe if:
- funding required assets is impractical;
- pools/quotes do not exist;
- restrictions block demo.

## Kill/rethink market thesis if:
- realistic campaign shows negligible crossability;
- multi-party cycle matching rarely improves on bilateral-only matching;
- matched execution cannot maintain participant fairness.

## Drop sponsor track, not product, if:
- Dynamic delegation blocks;
- Flash exact asset is unsupported;
- Uniswap has no usable residual route.

## Kill public claim if:
- evidence cannot reproduce it;
- reference matcher disagrees;
- verifier fails;
- methodology changed after seeing results without disclosure.

---

# 43. Jurisdiction and eligibility

Robinhood Stock Tokens are restricted in multiple jurisdictions and are not available to U.S. persons or UK persons under the current official documentation, with additional restrictions elsewhere.

The product must:

- show an eligibility/risk notice;
- never instruct users to evade location/geographic controls;
- never fake a permitted jurisdiction;
- treat provider/issuer restrictions as authoritative;
- use an eligible demo path.

VENUE0 itself is software. It does not guarantee that every user may lawfully trade every Stock Token.

---

# 44. Business and distribution

## 44.1 Initial wedge

Venue0 Circles.

Why:

Random global participants may not have synchronized complementary rebalance demand.

Existing groups already share:

- similar asset universe;
- recurring rebalance behavior;
- coordination;
- trust/community context.

## 44.2 Earliest users

- crypto-native Stock Token traders;
- investing communities;
- DAO/treasury groups;
- agent-managed portfolio experiments;
- family/small investment clubs where legally appropriate.

## 44.3 Network effect

Each additional compatible portfolio is potential liquidity for other members.

Value can compound through:

- more participants;
- more assets;
- more recurring rounds;
- more complementary demand;
- better residual routing;
- historical execution data.

## 44.4 Revenue

Post-hackathon options:

- small fee on crossed notional;
- fee on external execution;
- premium recurring circles;
- API for portfolio agents;
- institutional/private crossing groups;
- analytics/reporting.

Do not turn on a protocol fee in the hackathon unless it helps the product and is clearly disclosed.

---

# 45. Product roadmap after Runtime

## R1 — richer preferences

Agents negotiate:

- substitute assets;
- target corridors;
- maximum delay;
- minimum crossing percentage;
- price improvement requirements.

## R2 — continuous crossing

Move from discrete rounds to rolling intent windows.

## R3 — institution/API

Agent SDK:

```ts
venue0.submitIntent(...)
venue0.getProposal(...)
venue0.approvePlan(...)
venue0.getReceipt(...)
```

## R4 — settlement adapters

Potentially integrate external settlement systems such as Pipeshift where their production deployment and guarantees fit.

VENUE0 remains the matching/portfolio-intent layer.

## R5 — privacy

Explore:
- encrypted intents;
- commit/reveal;
- TEEs;
- privacy-preserving match discovery.

Only if they materially improve adoption.

## R6 — broader assets

- ETFs;
- third-party equity tokens;
- other onchain RWAs;
- treasury/fund tokens.

Canonical issuer identity stays mandatory.

---

# 46. Judge-facing narrative

## 10 seconds

> Portfolios usually rebalance against the market one wallet at a time. VENUE0 lets portfolio agents find when their changes cancel each other first.

## 20 seconds

> Multiple self-custodied portfolios submit target changes. VENUE0 discovers multi-party Stock Token cycles, settles the compatible portion directly, and sends only the residual to Uniswap or Flash.

## 60 seconds

> These three wallets want three different target portfolios. Market-only would create several external orders. VENUE0 finds a three-way cycle, settles it atomically from the users' own wallets, verifies every balance independently, and leaves only the unmatched amount for external execution. Here is the exact crossed notional and the market-only comparison from the same portfolio inputs.

---

# 47. Demo script

Target video: 90–120 seconds.

## Scene 1 — 0:00–0:12

Show three portfolio cards.

Narration:

> Three independently controlled portfolios want to rebalance. Normally each one sends its buys and sells into public liquidity.

## Scene 2 — 0:12–0:25

Show `Run market-only baseline`.

Display:
- requested turnover;
- external orders;
- external notional.

## Scene 3 — 0:25–0:45

Open Venue0 Round.

Visual graph forms:

A.NVDA → C  
C.SPY → B  
B.AAPL → A

Narration:

> VENUE0 sees the portfolios together and discovers a cycle no single bilateral swap resolves.

## Scene 4 — 0:45–1:05

Execute.

Show:
- participant approvals;
- settlement tx;
- Blockscout;
- wallet balance change.

## Scene 5 — 1:05–1:20

Show residual.

If Flash live:
- residual engine selects TWAP/Limit;
- Flash order id.

Else:
- Uniswap quote and residual swap.

## Scene 6 — 1:20–1:35

Receipt.

Show:

```text
Requested rebalance
Crossed between portfolios
Residual to public market
External orders avoided
Final allocation error
VERIFIED
```

## Scene 7 — end

Show:
- repo;
- evidence link;
- one-line mechanism.

No architecture lecture before the product moment.

---

# 48. Winning screenshot

One receipt screen.

Layout:

```text
VENUE0 ROUND #...
3 portfolios · 3 Stock Tokens · Robinhood Chain

REQUESTED REBALANCE       $...
CROSSED DIRECTLY          $...
PUBLIC RESIDUAL           $...
CROSS RATE                ...%

MARKET-ONLY
... external orders

VENUE0
... external orders

FINAL TARGET ERROR        ...%

✓ ATOMIC SETTLEMENT VERIFIED
✓ WALLET A
✓ WALLET B
✓ WALLET C
✓ RESIDUAL ORDER
```

Numbers must come from artifacts.

---

# 49. Submission requirements

## Bankr
- Runtime submission;
- product/demo/repo;
- no mandatory Bankr API.

## Dynamic
- select Dynamic;
- explain wallet pattern;
- show who owns wallet;
- show how agent authenticates;
- real wallet action;
- tx/execution evidence.

## Uniswap
- select Uniswap;
- public repo;
- `FEEDBACK.md`;
- complete feedback form;
- README links to exact Uniswap integration code;
- demo/repo links.

## Definitive Flash
- select Flash;
- advanced order type;
- Runtime submission;
- X post tagging `@DefinitiveFi`;
- X link in submission;
- demo explains advanced order.

## Online Runtime
- recorded demo required.

---

# 50. Submission timing

Deadline: 2026-09-19 4:00 PM EDT / 9:00 PM WAT.

Do not target the external deadline.

Internal targets:

## Submission V0
Create as early as possible once:
- public repo;
- live URL;
- required track choices;
- working demo path;
- provisional video;
- required form copy;
- FEEDBACK.md if Uniswap;
- X post if Flash is entered.

## Final freeze
Before final submission:
- rerun verifier;
- hash evidence;
- verify links in clean browser;
- sync `submission-facts.json`;
- sync README/submission/video/UI claims;
- verify no stale addresses/metrics.

---

# 51. `submission-facts.json`

Example schema:

```json
{
  "projectName": "VENUE0",
  "tagline": "Portfolio agents cross first. Markets handle only the residual.",
  "chain": {
    "name": "Robinhood Chain",
    "chainId": 4663
  },
  "deployment": {
    "settlementContract": "",
    "deployedBlock": null,
    "explorer": ""
  },
  "heroProof": {
    "roundId": "",
    "participants": 3,
    "assets": [],
    "settlementTx": "",
    "crossedNotionalUsd": null,
    "requestedNotionalUsd": null,
    "crossRatePct": null
  },
  "integrations": {
    "dynamic": {
      "status": "TARGET"
    },
    "uniswap": {
      "status": "TARGET"
    },
    "flash": {
      "status": "TARGET"
    }
  },
  "campaign": {
    "scenarioCount": null,
    "resultArtifact": ""
  },
  "limitations": []
}
```

No judge-facing number should be manually retyped when it can be generated from this source.

---

# 52. Acceptance definition

The hackathon build is only called strong when all applicable conditions below are true.

## Product
- user can understand the product without narration;
- user can create a portfolio target;
- user can participate in a round;
- non-trivial match is visible;
- residual is visible;
- receipt is understandable.

## Mechanism
- live 3-wallet cycle;
- partial case;
- no-cross control;
- independent verifier.

## Onchain
- canonical Stock Tokens;
- real wallets;
- real settlement;
- explorer evidence.

## Agent
- target/plan decision visible;
- wallet action real;
- agent does not invent arithmetic/data.

## External market
- at least one real residual execution route;
- Uniswap preferred for track;
- Flash advanced order if track entered.

## Evidence
- market-only baseline;
- same inputs;
- wide campaign;
- raw artifacts;
- limitations.

## Repo
- build/test/typecheck/lint as applicable;
- setup;
- architecture;
- security;
- claim ledger;
- evidence;
- public links.

## Submission
- valid recorded demo;
- track-specific requirements;
- all links work;
- no stale claims.

---

# 53. Current verified source matrix

Checked 2026-09-17 unless noted.

## Runtime handbook / sponsor track capture supplied for this build
Used for:
- deadline;
- Bankr judging order;
- prize/track requirements;
- online demo requirement.

## Robinhood Chain official
Stock Tokens:
https://docs.robinhood.com/chain/stock-tokens/

Stock Token APIs:
https://docs.robinhood.com/chain/stock-token-apis/

Canonical Token Contracts:
https://docs.robinhood.com/chain/contracts/

Connect/network:
https://docs.robinhood.com/chain/connecting/

Deploy:
https://docs.robinhood.com/chain/deploy-smart-contracts/

Chain overview:
https://docs.robinhood.com/chain/

Terms:
https://docs.robinhood.com/chain/terms-of-service/

Brand guidelines:
https://docs.robinhood.com/chain/brand-guidelines/

## Bankr official
Stock Token trading/venue information:
https://docs.bankr.bot/features/trading/tokenized-stocks/

Supported chains:
https://docs.bankr.bot/getting-started/supported-chains/

## Dynamic official
Agents overview:
https://www.dynamic.xyz/docs/overview/agents/overview

Custom EVM networks:
https://docs.dynamic.xyz/chains/evmNetwork

Delegated access webhook:
https://www.dynamic.xyz/docs/recipes/integrations/ai-agents/delegated-access-webhook

Delegated developer actions:
https://www.dynamic.xyz/docs/javascript/wallets/embedded-wallets/mpc/delegated-access/developer-actions

Revocation:
https://www.dynamic.xyz/docs/javascript/wallets/embedded-wallets/mpc/delegated-access/revoking-delegation

Sandbox:
https://www.dynamic.xyz/docs/overview/developer-dashboard/sandbox-vs-live

## Uniswap official
Supported chains:
https://developers.uniswap.org/docs/trading/swapping-api/supported-chains

Integration:
https://developers.uniswap.org/docs/trading/swapping-api/start-building/integration-guide

Getting started:
https://developers.uniswap.org/docs/trading/swapping-api/getting-started

Routing:
https://developers.uniswap.org/docs/trading/swapping-api/concepts/swap-routing

## Definitive official
Flash API:
https://www.definitive.fi/flash-api

Flash FAQ:
https://www.definitive.fi/flash-api/faq

Robinhood Chain + Stock Token case study:
https://www.definitive.fi/blog/skopos

Current detailed API docs:
https://ddp.definitive.fi/

## Closest adjacent protocol
Pipeshift:
https://github.com/pipeshiftprotocol/pipeshift

Important boundary:
Pipeshift settles matched trades and explicitly states that it does not perform venue matching. VENUE0 owns portfolio-intent matching and residual formation.

---

# 54. Final build directive

Do not begin with a polished dashboard.

Begin with reality:

1. Resolve current canonical Stock Tokens from Robinhood.
2. Transfer one between ordinary wallets.
3. Atomically exchange two.
4. Prove a three-wallet, three-asset cycle.
5. Independently verify every resulting balance.
6. Prove partial overlap.
7. Prove zero overlap.
8. Execute a real residual.
9. Add Dynamic agent authority.
10. Add Flash session-aware residual execution.
11. Build the complete user experience around that working mechanism.
12. Publish the evidence.
13. Submit early.

The full vision remains:

> A network where portfolio agents can discover complementary portfolio changes across self-custodied wallets, settle what they can directly, negotiate and execute what remains, and progressively turn groups of independently managed portfolios into liquidity for one another.

The hackathon must prove the first non-trivial instance of that future onchain.
