import "server-only";
import type { Address } from "viem";
import { CircleService } from "@venue0/circles";
import type { AssetUid } from "@venue0/shared";
import { priceable, universe } from "./portfolio";

/**
 * One CircleService per server process. State is in memory until the API database lands (D-013), so circles reset when
 * the server restarts. Nothing is seeded: every circle shown was created through this UI.
 */
const globalForCircles = globalThis as unknown as { venue0Circles?: Promise<CircleService> };

export function circles(): Promise<CircleService> {
  globalForCircles.venue0Circles ??= (async () => {
    const u = await universe();
    const tokens = new Map<AssetUid, Address>(priceable(u.registry, u.feeds).map(({ token }) => [token.uid, token.contractAddress]));
    return new CircleService(tokens);
  })();
  return globalForCircles.venue0Circles;
}

export async function assetChoices() {
  const u = await universe();
  return priceable(u.registry, u.feeds).map(({ token }) => ({ uid: token.uid, symbol: token.symbol })).sort((a, b) => a.symbol.localeCompare(b.symbol));
}
