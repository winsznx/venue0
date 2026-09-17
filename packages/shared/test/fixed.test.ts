import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { canonicalJson, divergenceBps, formatDecimal, hashCanonical, mulDivUp, parseDecimal, rescale } from "../src/index.ts";

describe("parseDecimal", () => {
  it("parses API multiplier strings exactly", () => {
    expect(parseDecimal("1.000775159164630595")).toBe(1_000_775_159_164_630_595n);
    expect(parseDecimal("4.000000000000000000")).toBe(4n * 10n ** 18n);
    expect(parseDecimal("218.95")).toBe(218_950_000_000_000_000_000n);
  });

  it("rejects precision loss and garbage", () => {
    expect(() => parseDecimal("1.0000000000000000001")).toThrow();
    expect(() => parseDecimal("-1")).toThrow();
    expect(() => parseDecimal("1e18")).toThrow();
    expect(() => parseDecimal("")).toThrow();
  });

  it("round-trips through formatDecimal", () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 0n, max: 10n ** 40n }), (v) => {
        expect(parseDecimal(formatDecimal(v))).toBe(v);
      }),
    );
  });
});

describe("fixed point helpers", () => {
  it("rounds up only when there is a remainder", () => {
    expect(mulDivUp(10n, 3n, 3n)).toBe(10n);
    expect(mulDivUp(10n, 1n, 3n)).toBe(4n);
    expect(mulDivUp(0n, 5n, 3n)).toBe(0n);
  });

  it("refuses lossy rescale", () => {
    expect(rescale(21_967_214_898n, 8, 18)).toBe(219_672_148_980_000_000_000n);
    expect(() => rescale(123n, 18, 8)).toThrow();
  });

  it("computes conservative divergence", () => {
    expect(divergenceBps(10_001n, 10_000n, 10_000n)).toBe(1n);
    expect(divergenceBps(100_001n, 100_000n, 100_000n)).toBe(1n);
  });
});

describe("canonicalJson", () => {
  it("is key-order independent and bigint safe", () => {
    const a = { b: 2n, a: [{ y: 1, x: undefined, w: "z" }] };
    const b = { a: [{ w: "z", y: 1 }], b: 2n };
    expect(canonicalJson(a)).toBe('{"a":[{"w":"z","y":1}],"b":"2"}');
    expect(hashCanonical(a)).toBe(hashCanonical(b));
  });
});
