import { getAddress, type Address } from "viem";
import { ROBINHOOD_CHAIN_ID, parseDecimal, type AssetUid } from "@venue0/shared";
import type { ApiAsset } from "./robinhood-api.ts";
import { parseTradingCapabilities, type TradingCapabilities } from "./trading-capabilities.ts";

export const ACCEPTABLE_ASSET_STATUS = "ASSET_STATUS_ACTIVE";

export type CanonicalStockToken = {
  uid: AssetUid;
  symbol: string;
  name: string;
  chainId: typeof ROBINHOOD_CHAIN_ID;
  contractAddress: Address;
  decimals: number;
  isin?: string;
  currentMultiplierE18: bigint;
  currentMultiplier: string;
  pendingMultiplier?: string;
  pendingMultiplierEffectiveAt?: string;
  status: string;
  tradingCapabilities: TradingCapabilities;
  resolvedAt: string;
};

export type CanonicalizeResult =
  | { ok: true; token: CanonicalStockToken }
  | { ok: false; uid: string; symbol: string; reason: string };

export function canonicalize(asset: ApiAsset, resolvedAt: string, chainId = ROBINHOOD_CHAIN_ID): CanonicalizeResult {
  const reject = (reason: string): CanonicalizeResult => ({ ok: false, uid: asset.id, symbol: asset.tokenSymbol, reason });

  const deployments = asset.deployments.filter((d) => d.chainId === chainId);
  if (deployments.length !== 1) return reject(`expected exactly one deployment on chain ${chainId}, found ${deployments.length}`);
  if (asset.status !== ACCEPTABLE_ASSET_STATUS) return reject(`status ${asset.status} is not ${ACCEPTABLE_ASSET_STATUS}`);
  if (asset.tokenDecimals !== undefined && asset.tokenDecimals !== 18) return reject(`unexpected tokenDecimals ${asset.tokenDecimals}`);

  let currentMultiplierE18: bigint;
  try {
    currentMultiplierE18 = parseDecimal(asset.currentMultiplier, 18);
  } catch (error) {
    return reject(`unparseable currentMultiplier: ${(error as Error).message}`);
  }
  if (currentMultiplierE18 === 0n) return reject("currentMultiplier is zero");

  const deployment = deployments[0];
  if (!deployment) return reject("missing deployment");

  const token: CanonicalStockToken = {
    uid: asset.id.toLowerCase() as AssetUid,
    symbol: asset.tokenSymbol,
    name: asset.tokenName,
    chainId: ROBINHOOD_CHAIN_ID,
    contractAddress: getAddress(deployment.contractAddress),
    decimals: asset.tokenDecimals ?? 18,
    currentMultiplierE18,
    currentMultiplier: asset.currentMultiplier,
    status: asset.status,
    tradingCapabilities: parseTradingCapabilities(asset.tradingCapabilities),
    resolvedAt,
  };
  if (asset.isin) token.isin = asset.isin;
  if (asset.pendingMultiplier) token.pendingMultiplier = asset.pendingMultiplier;
  if (asset.pendingMultiplierEffectiveTime) token.pendingMultiplierEffectiveAt = asset.pendingMultiplierEffectiveTime;
  return { ok: true, token };
}

/**
 * Lookup over one resolved snapshot of the Robinhood registry.
 * Identity is uid + chain + address. Tickers are a convenience lookup and must resolve to exactly one token.
 */
export class StockTokenRegistry {
  readonly resolvedAt: string;
  readonly rejected: Array<Extract<CanonicalizeResult, { ok: false }>>;
  private readonly byUid = new Map<AssetUid, CanonicalStockToken>();
  private readonly byAddress = new Map<Address, CanonicalStockToken>();
  private readonly bySymbol = new Map<string, CanonicalStockToken[]>();

  constructor(assets: readonly ApiAsset[], resolvedAt: string) {
    this.resolvedAt = resolvedAt;
    this.rejected = [];
    for (const asset of assets) {
      const result = canonicalize(asset, resolvedAt);
      if (!result.ok) {
        this.rejected.push(result);
        continue;
      }
      const { token } = result;
      if (this.byUid.has(token.uid) || this.byAddress.has(token.contractAddress)) {
        throw new Error(`registry conflict for uid ${token.uid} / ${token.contractAddress}`);
      }
      this.byUid.set(token.uid, token);
      this.byAddress.set(token.contractAddress, token);
      const list = this.bySymbol.get(token.symbol) ?? [];
      list.push(token);
      this.bySymbol.set(token.symbol, list);
    }
  }

  get size(): number {
    return this.byUid.size;
  }

  all(): CanonicalStockToken[] {
    return [...this.byUid.values()];
  }

  getByUid(uid: string): CanonicalStockToken {
    const token = this.byUid.get(uid.toLowerCase() as AssetUid);
    if (!token) throw new Error(`unknown Stock Token uid ${uid}`);
    return token;
  }

  /** Rejects any address that is not a canonical deployment, including same-ticker lookalikes. */
  requireCanonicalAddress(address: string): CanonicalStockToken {
    const token = this.byAddress.get(getAddress(address));
    if (!token) throw new Error(`address ${address} is not a canonical Robinhood Stock Token on chain ${ROBINHOOD_CHAIN_ID}`);
    return token;
  }

  isCanonicalAddress(address: string): boolean {
    return this.byAddress.has(getAddress(address));
  }

  resolveSymbol(symbol: string): CanonicalStockToken {
    const matches = this.bySymbol.get(symbol.toUpperCase()) ?? [];
    if (matches.length !== 1) throw new Error(`symbol ${symbol} resolves to ${matches.length} canonical Stock Tokens`);
    return matches[0] as CanonicalStockToken;
  }
}
