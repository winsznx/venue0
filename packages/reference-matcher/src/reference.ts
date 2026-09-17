import { getAddress } from "viem";
import { E18, type Address, type AssetUid } from "@venue0/shared";
import { hashValuationSnapshot, type PortfolioIntent } from "@venue0/portfolio";
import { DEFAULT_LOT_USD_E18, type MatchInput, type MatchResult } from "@venue0/matcher";
import { cmp, rat, type Rational } from "./rational.ts";
import { solveLinearProgram } from "./simplex.ts";

export type ReferenceReport = {
  feasibilityAgrees: boolean;
  objectiveAgrees: boolean;
  productionCrossedLots: bigint;
  referenceOptimumLots: Rational;
  eligibilityDisagreements: string[];
  validationIssues: string[];
  ok: boolean;
};

const MAX_REFERENCE_PARTICIPANTS = 6;

/** Deliberately independent re-derivation of who may participate. Mirrors the rules, not the code. */
function referenceEligible(intent: PortfolioIntent, input: MatchInput): boolean {
  if (intent.roundId !== input.roundId) return false;
  if (intent.valuationSnapshotHash !== hashValuationSnapshot(input.snapshot)) return false;
  if (input.nowSec < intent.validAfter || input.nowSec > intent.validUntil || input.nowSec > intent.policy.validUntil) return false;
  let sells = 0;
  let buys = 0;
  const seen = new Set<string>();
  for (const a of intent.assets) {
    const canonical = input.universe.get(a.assetUid);
    if (!canonical || getAddress(canonical) !== getAddress(a.token)) return false;
    if (!input.snapshot.prices.some((p) => p.assetUid === a.assetUid)) return false;
    if (seen.has(a.assetUid)) return false;
    seen.add(a.assetUid);
    if (a.maxOutRaw > 0n && a.maxInRaw === 0n) sells++;
    else if (a.maxInRaw > 0n && a.maxOutRaw === 0n) buys++;
    else return false;
  }
  return sells > 0 && buys > 0;
}

type Transfer = { from: Address; to: Address; assetUid: AssetUid };

/**
 * Max crossed lots via LP on direct transfer variables x[p,q,a] (PRD 13.3), solved exactly.
 * Production solves a different graph formulation, so agreement is a real cross-check.
 */
export function referenceOptimum(input: MatchInput, owners: readonly Address[]): Rational {
  if (owners.length > MAX_REFERENCE_PARTICIPANTS) throw new Error(`reference matcher supports at most ${MAX_REFERENCE_PARTICIPANTS} participants`);
  const lot = input.lotUsdE18 ?? DEFAULT_LOT_USD_E18;
  const price = (uid: AssetUid) => input.snapshot.prices.find((p) => p.assetUid === uid)?.priceUsdE18 ?? 0n;
  const lots = (raw: bigint, uid: AssetUid) => (raw * price(uid)) / E18 / lot;

  const intents = input.intents.filter((i) => owners.includes(i.owner));
  const sellLots = new Map<string, bigint>();
  const buyLots = new Map<string, bigint>();
  for (const i of intents) {
    for (const a of i.assets) {
      if (a.maxOutRaw > 0n) sellLots.set(`${i.owner}|${a.assetUid}`, lots(a.maxOutRaw, a.assetUid));
      if (a.maxInRaw > 0n) buyLots.set(`${i.owner}|${a.assetUid}`, lots(a.maxInRaw, a.assetUid));
    }
  }

  const transfers: Transfer[] = [];
  for (const [sellKey] of sellLots) {
    const [from, assetUid] = sellKey.split("|") as [Address, AssetUid];
    for (const [buyKey] of buyLots) {
      const [to, buyAsset] = buyKey.split("|") as [Address, AssetUid];
      if (buyAsset === assetUid && to !== from) transfers.push({ from, to, assetUid });
    }
  }
  if (transfers.length === 0) return rat(0n);

  const constraints: Array<{ coefficients: bigint[]; rhs: bigint }> = [];
  for (const [key, cap] of sellLots) {
    const [owner, uid] = key.split("|");
    constraints.push({ coefficients: transfers.map((t) => (t.from === owner && t.assetUid === uid ? 1n : 0n)), rhs: cap });
  }
  for (const [key, cap] of buyLots) {
    const [owner, uid] = key.split("|");
    constraints.push({ coefficients: transfers.map((t) => (t.to === owner && t.assetUid === uid ? 1n : 0n)), rhs: cap });
  }
  for (const owner of owners) {
    const balance = transfers.map((t) => (t.from === owner ? 1n : 0n) - (t.to === owner ? 1n : 0n));
    constraints.push({ coefficients: balance, rhs: 0n });
    constraints.push({ coefficients: balance.map((c) => -c), rhs: 0n });
  }
  return solveLinearProgram({ objective: transfers.map(() => 1n), constraints }).optimum;
}

/** Checks a production result against the raw input without trusting any production-computed aggregate. */
export function validateMatchResult(result: MatchResult, input: MatchInput): string[] {
  const issues: string[] = [];
  const price = (uid: AssetUid) => input.snapshot.prices.find((p) => p.assetUid === uid)?.priceUsdE18;
  const intentOf = (owner: Address) => input.intents.find((i) => i.owner === owner);

  const outRaw = new Map<string, bigint>();
  const inRaw = new Map<string, bigint>();
  const valueOut = new Map<Address, bigint>();
  const valueIn = new Map<Address, bigint>();
  const perAssetOut = new Map<AssetUid, bigint>();
  const perAssetIn = new Map<AssetUid, bigint>();

  for (const [i, leg] of result.legs.entries()) {
    const p = price(leg.assetUid);
    if (p === undefined) issues.push(`leg ${i}: asset ${leg.assetUid} not in snapshot`);
    if (leg.amountRaw <= 0n) issues.push(`leg ${i}: non-positive amount`);
    if (leg.from === leg.to) issues.push(`leg ${i}: self transfer`);
    const canonical = input.universe.get(leg.assetUid);
    if (!canonical || getAddress(canonical) !== getAddress(leg.token)) issues.push(`leg ${i}: non-canonical token ${leg.token}`);
    const outKey = `${leg.from}|${leg.assetUid}`;
    const inKey = `${leg.to}|${leg.assetUid}`;
    outRaw.set(outKey, (outRaw.get(outKey) ?? 0n) + leg.amountRaw);
    inRaw.set(inKey, (inRaw.get(inKey) ?? 0n) + leg.amountRaw);
    perAssetOut.set(leg.assetUid, (perAssetOut.get(leg.assetUid) ?? 0n) + leg.amountRaw);
    perAssetIn.set(leg.assetUid, (perAssetIn.get(leg.assetUid) ?? 0n) + leg.amountRaw);
    const value = ((p ?? 0n) * leg.amountRaw) / E18;
    valueOut.set(leg.from, (valueOut.get(leg.from) ?? 0n) + value);
    valueIn.set(leg.to, (valueIn.get(leg.to) ?? 0n) + value);
  }

  for (const [uid, sent] of perAssetOut) {
    if (sent !== perAssetIn.get(uid)) issues.push(`asset ${uid}: sent ${sent} != received ${perAssetIn.get(uid)}`);
  }

  for (const [key, amount] of outRaw) {
    const [owner, uid] = key.split("|") as [Address, AssetUid];
    const limit = intentOf(owner)?.assets.find((a) => a.assetUid === uid);
    if (!limit) issues.push(`${owner} sends ${uid} without an intent`);
    else if (amount > limit.maxOutRaw) issues.push(`${owner} sends ${amount} ${uid} above maxOut ${limit.maxOutRaw}`);
  }
  for (const [key, amount] of inRaw) {
    const [owner, uid] = key.split("|") as [Address, AssetUid];
    const limit = intentOf(owner)?.assets.find((a) => a.assetUid === uid);
    if (!limit) issues.push(`${owner} receives ${uid} without an intent`);
    else if (amount > limit.maxInRaw) issues.push(`${owner} receives ${amount} ${uid} above maxIn ${limit.maxInRaw}`);
  }

  const owners = new Set([...valueOut.keys(), ...valueIn.keys()]);
  for (const owner of owners) {
    const legs = BigInt(result.legs.filter((l) => l.from === owner || l.to === owner).length);
    const maxPrice = input.snapshot.prices.reduce((m, p) => (p.priceUsdE18 > m ? p.priceUsdE18 : m), 0n);
    const tolerance = legs * (maxPrice / E18 + 1n);
    const diff = (valueIn.get(owner) ?? 0n) - (valueOut.get(owner) ?? 0n);
    if ((diff < 0n ? -diff : diff) > tolerance) issues.push(`${owner} value imbalance ${diff} exceeds rounding tolerance ${tolerance}`);
  }

  for (const f of result.fills) {
    const limit = intentOf(f.owner)?.assets.find((a) => a.assetUid === f.assetUid);
    const requested = limit ? limit.maxOutRaw + limit.maxInRaw : undefined;
    if (requested !== f.requestedRaw) issues.push(`fill ${f.owner}/${f.assetUid}: requested ${f.requestedRaw} != intent ${requested}`);
    const key = `${f.owner}|${f.assetUid}`;
    const crossed = f.side === "SELL" ? (outRaw.get(key) ?? 0n) : (inRaw.get(key) ?? 0n);
    if (crossed !== f.crossedRaw) issues.push(`fill ${key}: crossed ${f.crossedRaw} != legs ${crossed}`);
    if (f.crossedRaw + f.residualRaw !== f.requestedRaw) issues.push(`fill ${key}: crossed + residual != requested`);
  }

  if (result.legs.length === 0 && result.totals.crossedNotionalUsdE18 !== 0n) issues.push("no legs but crossed notional is non-zero");
  if (result.status === "NO_CROSS" && result.legs.length > 0) issues.push("NO_CROSS with legs");
  return issues;
}

export function compareWithReference(result: MatchResult, input: MatchInput): ReferenceReport {
  const validationIssues = validateMatchResult(result, input);
  const eligibilityDisagreements: string[] = [];
  for (const intent of input.intents) {
    const productionRejected = result.participants.find((p) => p.owner === intent.owner)?.status === "REJECTED";
    if (productionRejected === referenceEligible(intent, input)) {
      eligibilityDisagreements.push(`${intent.owner}: production rejected=${productionRejected}, reference eligible=${!productionRejected}`);
    }
  }

  const solvable = result.status !== "PLAN_STALE" && result.status !== "INSUFFICIENT_PARTICIPANTS";
  const active = result.participants.filter((p) => p.status !== "REJECTED" && p.status !== "EXCLUDED_MIN_CROSS").map((p) => p.owner);
  const optimum = solvable ? referenceOptimum(input, active) : rat(0n);
  const productionLots = result.legs.reduce((sum, l) => sum + l.lots, 0n);
  const objectiveAgrees = cmp(optimum, rat(productionLots)) === 0;
  const feasibilityAgrees = (optimum.n > 0n) === (productionLots > 0n);

  return {
    feasibilityAgrees,
    objectiveAgrees,
    productionCrossedLots: productionLots,
    referenceOptimumLots: optimum,
    eligibilityDisagreements,
    validationIssues,
    ok: feasibilityAgrees && objectiveAgrees && eligibilityDisagreements.length === 0 && validationIssues.length === 0,
  };
}
