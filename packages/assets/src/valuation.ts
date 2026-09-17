import type { Address } from "viem";
import { E18, mulDivDown, rescale, ROBINHOOD_CHAIN_ID, type AssetUid } from "@venue0/shared";

export type PriceSource =
  | "CHAINLINK_STOCK_TOKEN_FEED"
  | "ROBINHOOD_REST_NORMALIZED"
  | "UNISWAP_EXECUTABLE_QUOTE"
  | "FLASH_EXECUTABLE_QUOTE";

/**
 * USD price of ONE WHOLE Stock Token (1e18 raw units), multiplier already applied, scaled 1e18.
 * Every consumer values holdings through this one type so the multiplier is applied exactly once.
 */
export type PriceSnapshot = {
  assetUid: AssetUid;
  tokenAddress: Address;
  chainId: typeof ROBINHOOD_CHAIN_ID;
  priceUsdE18: bigint;
  source: PriceSource;
  sourceTimestamp: number;
  sourceBlock?: bigint;
  multiplierE18?: bigint;
  rawUnderlyingPrice?: string;
  bid?: string;
  ask?: string;
  stale: boolean;
};

/** Raw underlying-equity price (not multiplier-adjusted) -> token-equivalent price. */
export function tokenPriceFromUnderlying(rawUnderlyingPriceE18: bigint, multiplierE18: bigint): bigint {
  return mulDivDown(rawUnderlyingPriceE18, multiplierE18, E18);
}

/** Token-equivalent price -> underlying share price. Inverse of tokenPriceFromUnderlying. */
export function underlyingPriceFromToken(tokenPriceE18: bigint, multiplierE18: bigint): bigint {
  return mulDivDown(tokenPriceE18, E18, multiplierE18);
}

/** Chainlink Stock Token feeds are already multiplier-adjusted; only rescale decimals. */
export function chainlinkAnswerToPriceE18(answer: bigint, feedDecimals: number): bigint {
  if (answer <= 0n) throw new Error(`non-positive Chainlink answer ${answer}`);
  return rescale(answer, feedDecimals, 18);
}

/** USD value of a raw ERC-20 balance (18 decimals). Rounds down. */
export function valueUsdE18(rawBalance: bigint, priceUsdE18: bigint): bigint {
  return mulDivDown(rawBalance, priceUsdE18, E18);
}

/** Raw token units worth `usdE18` at `priceUsdE18`. Rounds down so a leg never overshoots its value bound. */
export function rawUnitsForValue(usdE18: bigint, priceUsdE18: bigint): bigint {
  if (priceUsdE18 <= 0n) throw new Error("price must be positive");
  return mulDivDown(usdE18, E18, priceUsdE18);
}

/** Share-equivalent exposure displayed to users: raw * multiplier / 1e18. */
export function uiShareEquivalent(rawBalance: bigint, multiplierE18: bigint): bigint {
  return mulDivDown(rawBalance, multiplierE18, E18);
}
