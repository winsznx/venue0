import { getAddress, isAddress, isHex } from "viem";
import { z } from "zod";

export const ROBINHOOD_ASSETS_URL = "https://api.robinhood.com/rhj/assets";
export const ROBINHOOD_PRICES_URL = "https://api.robinhood.com/rhj/prices";

const addressSchema = z.string().refine((v) => isAddress(v, { strict: false }), "invalid address");

const deploymentSchema = z.looseObject({
  contractAddress: addressSchema,
  chainId: z.number().int(),
  networkName: z.string().optional(),
});

export const apiAssetSchema = z.looseObject({
  id: z.string().refine((v) => isHex(v) && v.length === 66, "id must be 0x + 64 hex chars"),
  tokenSymbol: z.string().min(1),
  tokenName: z.string(),
  deployments: z.array(deploymentSchema),
  currentMultiplier: z.string(),
  pendingMultiplier: z.string().optional(),
  pendingMultiplierEffectiveTime: z.string().optional(),
  status: z.string(),
  tradingCapabilities: z.unknown().optional(),
  tokenDecimals: z.number().int().optional(),
  isin: z.string().optional(),
  logoUrl: z.string().optional(),
});

export const assetsResponseSchema = z.looseObject({ assets: z.array(z.unknown()) });

export type ApiAsset = z.infer<typeof apiAssetSchema>;

export type AssetsFetchResult = {
  fetchedAt: string;
  url: string;
  valid: ApiAsset[];
  rejected: Array<{ index: number; issues: string[]; raw: unknown }>;
  raw: unknown;
};

export async function fetchRobinhoodAssets(fetchImpl: typeof fetch = fetch): Promise<AssetsFetchResult> {
  const fetchedAt = new Date().toISOString();
  const response = await fetchImpl(ROBINHOOD_ASSETS_URL, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`Robinhood assets API returned HTTP ${response.status}`);
  const raw: unknown = await response.json();
  return { ...parseAssetsResponse(raw), fetchedAt, url: ROBINHOOD_ASSETS_URL };
}

/** Validates each record independently so one malformed record never hides the rest. */
export function parseAssetsResponse(raw: unknown): Omit<AssetsFetchResult, "fetchedAt" | "url"> {
  const envelope = assetsResponseSchema.parse(raw);
  const valid: ApiAsset[] = [];
  const rejected: AssetsFetchResult["rejected"] = [];
  envelope.assets.forEach((item, index) => {
    const parsed = apiAssetSchema.safeParse(item);
    if (parsed.success) {
      valid.push({
        ...parsed.data,
        deployments: parsed.data.deployments.map((d) => ({ ...d, contractAddress: getAddress(d.contractAddress) })),
      });
    } else {
      rejected.push({ index, issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`), raw: item });
    }
  });
  return { valid, rejected, raw };
}

export const apiQuoteSchema = z.looseObject({
  tokenSymbol: z.string(),
  deployments: z.array(deploymentSchema),
  bid: z.string(),
  ask: z.string(),
  currency: z.string(),
  isTradingHalt: z.boolean(),
  generatedAt: z.string(),
  dailyTradingVolume: z.string().optional(),
});

export type ApiQuote = z.infer<typeof apiQuoteSchema>;

export async function fetchRobinhoodQuote(symbol: string, fetchImpl: typeof fetch = fetch): Promise<ApiQuote> {
  const url = `${ROBINHOOD_PRICES_URL}/${encodeURIComponent(symbol)}`;
  const response = await fetchImpl(url, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`Robinhood prices API returned HTTP ${response.status} for ${symbol}`);
  const body = z.looseObject({ quotes: z.array(apiQuoteSchema) }).parse(await response.json());
  const matches = body.quotes.filter((q) => q.tokenSymbol === symbol);
  if (matches.length !== 1) throw new Error(`expected exactly one quote for ${symbol}, got ${matches.length}`);
  return matches[0] as ApiQuote;
}
