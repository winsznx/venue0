import { keccak256, toBytes, type Hex } from "viem";

/**
 * Deterministic JSON: object keys sorted, bigint encoded as decimal string, undefined dropped.
 * Artifacts and hashes must be byte-identical for identical inputs.
 */
export function canonicalJson(value: unknown, indent?: number): string {
  return JSON.stringify(normalize(value), null, indent);
}

export function hashCanonical(value: unknown): Hex {
  return keccak256(toBytes(canonicalJson(value)));
}

function normalize(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(normalize);
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => [k, normalize(v)] as const);
    return Object.fromEntries(entries);
  }
  return value;
}
