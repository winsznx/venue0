import { decodeEventLog, decodeFunctionData, erc20Abi, getAddress, type Address, type Hex, type PublicClient } from "viem";
import { expectedNetDeltas, hashContractPlan, venue0SettlementAbi, type ContractPlan } from "@venue0/settlement";

export const VERIFIER_VERSION = "venue0-verifier-1";

export type CheckStatus = "PASS" | "FAIL" | "INCONCLUSIVE";

export type Check = { name: string; status: CheckStatus; detail: string };

export type BalanceObservation = { owner: Address; token: Address; before: bigint; after: bigint; observedDelta: bigint; expectedDelta: bigint };

export type SettlementVerification = {
  verifierVersion: string;
  status: CheckStatus;
  txHash: Hex;
  settlementContract: Address;
  expectedPlanHash: Hex;
  blockNumber?: bigint;
  checks: Check[];
  balances: BalanceObservation[];
  verifiedAt: string;
};

export type VerifySettlementInput = {
  txHash: Hex;
  settlementContract: Address;
  plan: ContractPlan;
  nonces: ReadonlyMap<Address, bigint>;
  /** Tokens whose participant balances must be checked. Plan tokens are always included; add others to prove they did not move. */
  watchTokens?: readonly Address[];
};

const key = (owner: string, token: string) => `${owner.toLowerCase()}|${token.toLowerCase()}`;

/**
 * Verifies a settlement from chain data only: receipt, calldata, logs, contract state and balances at the receipt block
 * and the block before it. The executor's records are never consulted.
 */
export async function verifySettlement(client: PublicClient, input: VerifySettlementInput): Promise<SettlementVerification> {
  const checks: Check[] = [];
  const balances: BalanceObservation[] = [];
  const expectedPlanHash = hashContractPlan(input.plan);
  const settlement = getAddress(input.settlementContract);
  const add = (name: string, pass: boolean, detail: string) => checks.push({ name, status: pass ? "PASS" : "FAIL", detail });
  const result = (blockNumber?: bigint): SettlementVerification => ({
    verifierVersion: VERIFIER_VERSION,
    status: checks.some((c) => c.status === "FAIL") ? "FAIL" : checks.some((c) => c.status === "INCONCLUSIVE") ? "INCONCLUSIVE" : "PASS",
    txHash: input.txHash,
    settlementContract: settlement,
    expectedPlanHash,
    ...(blockNumber === undefined ? {} : { blockNumber }),
    checks,
    balances,
    verifiedAt: new Date().toISOString(),
  });

  const [receipt, tx] = await Promise.all([
    client.getTransactionReceipt({ hash: input.txHash }),
    client.getTransaction({ hash: input.txHash }),
  ]);
  add("tx.status", receipt.status === "success", `receipt status ${receipt.status}`);
  add("tx.to", receipt.to !== null && getAddress(receipt.to) === settlement, `tx to ${receipt.to}`);

  try {
    const call = decodeFunctionData({ abi: venue0SettlementAbi, data: tx.input });
    const executedPlan = call.args?.[0] as ContractPlan | undefined;
    const executedHash = call.functionName === "settle" && executedPlan ? hashContractPlan(executedPlan) : undefined;
    add("calldata.plan", executedHash === expectedPlanHash, `executed plan hash ${executedHash ?? "n/a"} vs approved ${expectedPlanHash}`);
  } catch (error) {
    add("calldata.plan", false, `could not decode settle calldata: ${(error as Error).message}`);
  }
  if (receipt.status !== "success") return result(receipt.blockNumber);

  const settledEvents: Array<{ planHash: Hex; participantCount: bigint; legCount: bigint }> = [];
  const crossingLegs: Array<{ token: Address; from: Address; to: Address; amount: bigint }> = [];
  const noncesConsumed = new Map<string, bigint>();
  const transfers: Array<{ token: Address; from: Address; to: Address; value: bigint }> = [];
  const planTokens = new Set(input.plan.legs.map((l) => l.token.toLowerCase()));

  for (const log of receipt.logs) {
    const emitter = getAddress(log.address);
    if (emitter === settlement) {
      const decoded = decodeEventLog({ abi: venue0SettlementAbi, data: log.data, topics: log.topics });
      if (decoded.eventName === "PlanSettled") settledEvents.push(decoded.args);
      if (decoded.eventName === "CrossingLeg") crossingLegs.push(decoded.args);
      if (decoded.eventName === "NonceConsumed") noncesConsumed.set(decoded.args.owner.toLowerCase(), decoded.args.nonce);
      continue;
    }
    try {
      const decoded = decodeEventLog({ abi: erc20Abi, data: log.data, topics: log.topics });
      if (decoded.eventName === "Transfer") transfers.push({ token: emitter, from: decoded.args.from, to: decoded.args.to, value: decoded.args.value });
    } catch {
      // Non-ERC-20 events (for example ERC-8056 TransferWithScaledUI) are not balance changes.
    }
  }

  const settled = settledEvents[0];
  add(
    "event.PlanSettled",
    settledEvents.length === 1 && settled?.planHash === expectedPlanHash && settled.legCount === BigInt(input.plan.legs.length) && settled.participantCount === BigInt(input.plan.participants.length),
    `${settledEvents.length} PlanSettled event(s)`,
  );

  const sameLeg = (a: { token: Address; from: Address; to: Address; amount: bigint }, b: { token: Address; from: Address; to: Address; amount: bigint }) =>
    getAddress(a.token) === getAddress(b.token) && getAddress(a.from) === getAddress(b.from) && getAddress(a.to) === getAddress(b.to) && a.amount === b.amount;
  add(
    "event.CrossingLeg",
    crossingLegs.length === input.plan.legs.length && input.plan.legs.every((leg, i) => crossingLegs[i] !== undefined && sameLeg(leg, crossingLegs[i])),
    `${crossingLegs.length} CrossingLeg event(s) for ${input.plan.legs.length} plan legs`,
  );

  const unexpectedTransfers = transfers.filter((tr) => !input.plan.legs.some((leg) => sameLeg(leg, { token: tr.token, from: tr.from, to: tr.to, amount: tr.value })));
  const planTransfersSeen = input.plan.legs.every((leg) => transfers.some((tr) => sameLeg(leg, { token: tr.token, from: tr.from, to: tr.to, amount: tr.value })));
  add("event.Transfer", unexpectedTransfers.length === 0 && planTransfersSeen, `${transfers.length} ERC-20 Transfer log(s); ${unexpectedTransfers.length} not in plan`);

  for (const participant of input.plan.participants) {
    const nonce = input.nonces.get(participant);
    add(`event.NonceConsumed.${participant}`, nonce !== undefined && noncesConsumed.get(participant.toLowerCase()) === nonce, `expected nonce ${nonce}, saw ${noncesConsumed.get(participant.toLowerCase())}`);
  }

  const block = receipt.blockNumber;
  const [planSettled, ...nonceFlags] = await Promise.all([
    client.readContract({ address: settlement, abi: venue0SettlementAbi, functionName: "planSettled", args: [expectedPlanHash], blockNumber: block }),
    ...input.plan.participants.map((p) =>
      client.readContract({ address: settlement, abi: venue0SettlementAbi, functionName: "nonceUsed", args: [p, input.nonces.get(p) ?? 0n], blockNumber: block }),
    ),
  ]);
  add("state.planSettled", planSettled, `planSettled(${expectedPlanHash}) = ${planSettled}`);
  add("state.nonceUsed", nonceFlags.every(Boolean), `nonceUsed flags ${nonceFlags.join(",")}`);

  const expected = expectedNetDeltas({ contractPlan: input.plan });
  const tokens = [...new Set([...planTokens, ...(input.watchTokens ?? []).map((t) => t.toLowerCase())])].map((t) => getAddress(t));
  const owners = [...input.plan.participants.map((p) => getAddress(p)), settlement];
  try {
    for (const owner of owners) {
      for (const token of tokens) {
        const [before, after] = await Promise.all([
          client.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [owner], blockNumber: block - 1n }),
          client.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [owner], blockNumber: block }),
        ]);
        const expectedDelta = expected.get(key(owner, token)) ?? 0n;
        balances.push({ owner, token, before, after, observedDelta: after - before, expectedDelta });
      }
    }
    const mismatches = balances.filter((b) => b.observedDelta !== b.expectedDelta);
    add("balances.netDelta", mismatches.length === 0, mismatches.length === 0 ? `${balances.length} balance pairs match` : `mismatch: ${mismatches.map((m) => `${m.owner}/${m.token} observed ${m.observedDelta} expected ${m.expectedDelta}`).join("; ")}`);
    const custody = balances.filter((b) => b.owner === settlement && b.after !== 0n);
    add("balances.noCustody", custody.length === 0, custody.length === 0 ? "settlement contract holds no watched tokens" : `settlement holds ${custody.map((c) => `${c.after} of ${c.token}`).join(", ")}`);
  } catch (error) {
    checks.push({ name: "balances.netDelta", status: "INCONCLUSIVE", detail: `historical balance read failed (archive state needed): ${(error as Error).message.split("\n")[0]}` });
  }

  return result(block);
}
