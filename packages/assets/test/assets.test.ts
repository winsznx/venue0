import { describe, expect, it } from "vitest";
import fixture from "./fixtures/assets-2026-09-17-subset.json" with { type: "json" };
import {
  canTrade,
  chainlinkAnswerToPriceE18,
  findStockTokenFeed,
  parseAssetsResponse,
  parseTradingCapabilities,
  restSnapshot,
  StockTokenRegistry,
  tokenPriceFromUnderlying,
  underlyingPriceFromToken,
  uiShareEquivalent,
  valueUsdE18,
  type ApiAsset,
} from "../src/index.ts";

const NVDA_UID = "0x00000000000000000000000000000000915f477416294f5099a5e0e09f327ce5";

function registry(assets: unknown[] = fixture.response.assets): StockTokenRegistry {
  const parsed = parseAssetsResponse({ assets });
  return new StockTokenRegistry(parsed.valid, fixture.capturedAt);
}

describe("parseAssetsResponse", () => {
  it("accepts the live 2026-09-17 schema", () => {
    const parsed = parseAssetsResponse(fixture.response);
    expect(parsed.rejected).toEqual([]);
    expect(parsed.valid).toHaveLength(fixture.response.assets.length);
  });

  it("rejects malformed records individually", () => {
    const parsed = parseAssetsResponse({ assets: [...fixture.response.assets, { id: "nope" }] });
    expect(parsed.valid).toHaveLength(fixture.response.assets.length);
    expect(parsed.rejected).toHaveLength(1);
  });
});

describe("StockTokenRegistry", () => {
  it("resolves canonical identity by uid, address and unique symbol", () => {
    const reg = registry();
    const nvda = reg.getByUid(NVDA_UID);
    expect(nvda.symbol).toBe("NVDA");
    expect(nvda.chainId).toBe(4663);
    expect(reg.requireCanonicalAddress(nvda.contractAddress.toLowerCase()).uid).toBe(NVDA_UID);
    expect(reg.resolveSymbol("nvda").uid).toBe(NVDA_UID);
  });

  it("rejects lookalike addresses", () => {
    const reg = registry();
    expect(() => reg.requireCanonicalAddress("0x000000000000000000000000000000000000dEaD")).toThrow(/not a canonical/);
  });

  it("refuses ambiguous tickers", () => {
    const nvda = fixture.response.assets.find((a) => a.tokenSymbol === "NVDA");
    const lookalike = {
      ...nvda,
      id: "0x00000000000000000000000000000000aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      deployments: [{ contractAddress: "0x1111111111111111111111111111111111111111", chainId: 4663 }],
    };
    const reg = registry([...fixture.response.assets, lookalike]);
    expect(() => reg.resolveSymbol("NVDA")).toThrow(/resolves to 2/);
  });

  it("excludes inactive, wrong-chain and malformed-multiplier assets", () => {
    const [first] = fixture.response.assets as ApiAsset[];
    const variants = [
      { ...first, id: `0x${"1".repeat(64)}`, status: "ASSET_STATUS_INACTIVE" },
      { ...first, id: `0x${"2".repeat(64)}`, deployments: [{ contractAddress: "0x2222222222222222222222222222222222222222", chainId: 46630 }] },
      { ...first, id: `0x${"3".repeat(64)}`, currentMultiplier: "abc", deployments: [{ contractAddress: "0x3333333333333333333333333333333333333333", chainId: 4663 }] },
    ];
    const reg = registry(variants);
    expect(reg.size).toBe(0);
    expect(reg.rejected.map((r) => r.reason)).toEqual([
      expect.stringMatching(/status/),
      expect.stringMatching(/deployment/),
      expect.stringMatching(/currentMultiplier/),
    ]);
  });
});

describe("parseTradingCapabilities", () => {
  it("reads the live session-map shape", () => {
    const partial = fixture.response.assets.at(-1);
    const caps = parseTradingCapabilities(partial?.tradingCapabilities);
    expect(caps.shape).toBe("SESSION_MAP");
    expect(canTrade(caps, "market", "whole")).toBe(true);
    expect(canTrade(caps, "market", "fractional")).toBe(false);
  });

  it("reads the documented tradability-fields shape", () => {
    const caps = parseTradingCapabilities({
      fractionalTradability: "tradable",
      allDayTradability: "position_closing_only",
      extendedHoursFractionalTradability: null,
    });
    expect(caps.shape).toBe("TRADABILITY_FIELDS");
    expect(caps.sessions.market.fractional).toBe("TRADABLE");
    expect(caps.sessions.market.whole).toBe("UNKNOWN");
    expect(caps.sessions.overnight.whole).toBe("CLOSING_ONLY");
    expect(caps.sessions.extended.fractional).toBe("UNKNOWN");
  });

  it("fails safe on missing or unknown data", () => {
    for (const raw of [undefined, null, "x", { market: { whole: "TRADING_STATUS_SOMETHING_NEW" } }]) {
      const caps = parseTradingCapabilities(raw);
      expect(canTrade(caps, "market", "whole")).toBe(false);
    }
  });
});

describe("valuation", () => {
  const multiplier = 1_000_775_159_164_630_595n;

  it("applies the multiplier exactly once on the REST path", () => {
    const underlying = 218_885_000_000_000_000_000n;
    const tokenPrice = tokenPriceFromUnderlying(underlying, multiplier);
    expect(tokenPrice).toBe(219_054_670_713_750_167_786n);
    expect(underlyingPriceFromToken(tokenPrice, multiplier)).toBeLessThanOrEqual(underlying);
    expect(underlying - underlyingPriceFromToken(tokenPrice, multiplier)).toBeLessThanOrEqual(1n);
  });

  it("does not apply a multiplier to Chainlink answers", () => {
    expect(chainlinkAnswerToPriceE18(21_967_214_898n, 8)).toBe(219_672_148_980_000_000_000n);
    expect(() => chainlinkAnswerToPriceE18(0n, 8)).toThrow();
  });

  it("values raw balances and share equivalents", () => {
    const twoTokens = 2n * 10n ** 18n;
    expect(valueUsdE18(twoTokens, 219_000_000_000_000_000_000n)).toBe(438_000_000_000_000_000_000n);
    expect(uiShareEquivalent(10n ** 18n, 4n * 10n ** 18n)).toBe(4n * 10n ** 18n);
  });

  it("builds a normalized REST snapshot with staleness", () => {
    const token = registry().resolveSymbol("CRWD");
    const quote = {
      tokenSymbol: "CRWD",
      deployments: [],
      bid: "100.00",
      ask: "100.02",
      currency: "USD",
      isTradingHalt: false,
      generatedAt: "2026-09-17T16:50:00Z",
    };
    const now = Date.parse("2026-09-17T16:50:10Z") / 1000;
    const snap = restSnapshot(token, quote, 60, now);
    expect(snap.priceUsdE18).toBe(400_040_000_000_000_000_000n);
    expect(snap.stale).toBe(false);
    expect(restSnapshot(token, { ...quote, isTradingHalt: true }, 60, now).stale).toBe(true);
    expect(restSnapshot(token, quote, 5, now).stale).toBe(true);
  });
});

describe("findStockTokenFeed", () => {
  it("requires exactly one ticker-named feed", () => {
    const feeds = [
      { name: "Robinhood NVDA / USD", proxyAddress: "0x379EC4f7C378F34a1B47E4F3cbeBCbAC3E8E9F15" as const, decimals: 8, heartbeatSec: 86400 },
      { name: "USDG / USD", proxyAddress: "0x61B7e5650328764B076A108EFF5fa7282a1B9aD2" as const, decimals: 8, heartbeatSec: 86400 },
    ];
    expect(findStockTokenFeed(feeds, "NVDA").decimals).toBe(8);
    expect(() => findStockTokenFeed(feeds, "AAPL")).toThrow();
  });
});
