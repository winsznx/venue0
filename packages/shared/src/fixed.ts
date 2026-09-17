export const E18 = 10n ** 18n;
export const BPS = 10_000n;

const DECIMAL_PATTERN = /^(\d+)(?:\.(\d+))?$/;

/** Parses a non-negative decimal string into an integer scaled by 10^decimals. Rejects precision loss. */
export function parseDecimal(value: string, decimals = 18): bigint {
  const match = DECIMAL_PATTERN.exec(value.trim());
  if (!match) throw new Error(`invalid decimal string: "${value}"`);
  const whole = match[1] ?? "0";
  const fraction = match[2] ?? "";
  const significant = fraction.replace(/0+$/, "");
  if (significant.length > decimals) {
    throw new Error(`decimal "${value}" exceeds ${decimals} fractional digits`);
  }
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(significant.padEnd(decimals, "0") || "0");
}

export function formatDecimal(value: bigint, decimals = 18): string {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const scale = 10n ** BigInt(decimals);
  const whole = abs / scale;
  const fraction = (abs % scale).toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

export function mulDivDown(a: bigint, b: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw new Error("mulDivDown: division by zero");
  if (a < 0n || b < 0n || denominator < 0n) throw new Error("mulDivDown: negative operand");
  return (a * b) / denominator;
}

export function mulDivUp(a: bigint, b: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw new Error("mulDivUp: division by zero");
  if (a < 0n || b < 0n || denominator < 0n) throw new Error("mulDivUp: negative operand");
  const product = a * b;
  return product === 0n ? 0n : (product - 1n) / denominator + 1n;
}

export function rescale(value: bigint, fromDecimals: number, toDecimals: number): bigint {
  if (fromDecimals === toDecimals) return value;
  if (toDecimals > fromDecimals) return value * 10n ** BigInt(toDecimals - fromDecimals);
  const divisor = 10n ** BigInt(fromDecimals - toDecimals);
  if (value % divisor !== 0n) throw new Error(`rescale would truncate ${value} from ${fromDecimals} to ${toDecimals} decimals`);
  return value / divisor;
}

export function absDiff(a: bigint, b: bigint): bigint {
  return a > b ? a - b : b - a;
}

export function minBig(a: bigint, b: bigint): bigint {
  return a < b ? a : b;
}

export function maxBig(a: bigint, b: bigint): bigint {
  return a > b ? a : b;
}

/** |a - b| / reference in basis points, rounded up so tolerance checks stay conservative. */
export function divergenceBps(a: bigint, b: bigint, reference: bigint): bigint {
  if (reference <= 0n) throw new Error("divergenceBps: reference must be positive");
  return mulDivUp(absDiff(a, b), BPS, reference);
}
