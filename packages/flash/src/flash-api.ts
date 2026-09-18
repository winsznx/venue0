import type { Address, Hex, PublicClient, TypedDataDomain, WalletClient } from "viem";
import { log } from "@venue0/shared";

export const FLASH_API = "https://flash.definitive.fi/v1";

export type FlashOrderType = "market" | "limit" | "twap";

export type FlashOrderParams = {
  targetAsset: Address;
  contraAsset: Address;
  side: "buy" | "sell";
  /** Decimal string in units of the asset being spent (target on sell). */
  qty: string;
  orderType: FlashOrderType;
  limitCrossPrice?: string;
  durationSeconds?: number;
  twapBucketCount?: number;
  startTime?: string;
};

export type FlashOrderStatus =
  | "ORDER_STATUS_PENDING"
  | "ORDER_STATUS_ACCEPTED"
  | "ORDER_STATUS_PARTIALLY_FILLED"
  | "ORDER_STATUS_FILLED"
  | "ORDER_STATUS_CANCELLED"
  | "ORDER_STATUS_REJECTED"
  | "ORDER_STATUS_TERMINATED"
  | "ORDER_STATUS_UNSPECIFIED";

export const TERMINAL_STATUSES = new Set<string>(["ORDER_STATUS_FILLED", "ORDER_STATUS_CANCELLED", "ORDER_STATUS_REJECTED", "ORDER_STATUS_TERMINATED"]);

type Quote = Record<string, unknown> & {
  quoteId: string;
  to: { amount: string; notional: string };
  from: { amount: string; notional: string };
  fees: { estimatedFeeNotional: string };
  evm: { approveTx: { to: Address; data: Hex } | null; orderTypedData: string } | null;
};

export class FlashApi {
  constructor(private readonly apiKey: string, private readonly baseUrl = FLASH_API) {
    if (!apiKey) throw new Error("Flash API key is required");
  }

  private async request<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: { "x-definitive-api-key": this.apiKey, "content-type": "application/json", accept: "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`Flash ${method} ${path} -> ${response.status}: ${text.slice(0, 400)}`);
    return JSON.parse(text) as T;
  }

  private base(params: FlashOrderParams, funder: Address) {
    return {
      targetChain: "robinhood",
      contraChain: "robinhood",
      targetAsset: params.targetAsset,
      contraAsset: params.contraAsset,
      side: params.side,
      qty: params.qty,
      orderType: params.orderType,
      funderAddress: funder,
      ...(params.limitCrossPrice ? { limitCrossPrice: params.limitCrossPrice } : {}),
      ...(params.twapBucketCount ? { twapBucketCount: params.twapBucketCount } : {}),
      ...(params.startTime ? { startTime: params.startTime } : {}),
    };
  }

  /** Requests an exact allowance instead of Flash's default unlimited approval. */
  quote(params: FlashOrderParams, funder: Address): Promise<Quote> {
    return this.request<Quote>("POST", "/quote", {
      ...this.base(params, funder),
      ...(params.durationSeconds ? { durationSeconds: params.durationSeconds } : {}),
      forceMinimalAllowance: true,
    });
  }

  submit(params: FlashOrderParams, funder: Address, quote: Quote, userSignature: Hex): Promise<{ orderId: string }> {
    return this.request("POST", "/order", {
      ...this.base(params, funder),
      quoteId: quote.quoteId,
      evmOrderTypedData: quote.evm?.orderTypedData,
      userSignature,
    });
  }

  order(orderId: string, funder: Address): Promise<Record<string, unknown> & { status?: string }> {
    return this.request("GET", `/orders/${orderId}?funderAddress=${funder}`);
  }
}

type TypedJson = { domain: Record<string, unknown>; types: Record<string, Array<{ name: string; type: string }>>; primaryType: string; message: Record<string, unknown> };

export type FlashSubmission = {
  quoteId: string;
  quotedOut: string;
  quotedFeeNotional: string;
  approvalTx: Hex | null;
  orderId: string;
  signedOrder: TypedJson["message"];
  statusHistory: Array<{ at: string; status: string; raw: Record<string, unknown> }>;
};

/**
 * Quote -> exact approval if returned -> sign FlashOrder EIP-712 -> submit -> poll status.
 * The signature binds swapper, vault, recipient, tokens, amount and deadline. Limit / TWAP terms are enforced by Flash offchain.
 */
export async function placeFlashOrder(
  api: FlashApi,
  wallet: WalletClient,
  publicClient: PublicClient,
  params: FlashOrderParams,
  pollSeconds = 60,
): Promise<FlashSubmission> {
  const funder = wallet.account?.address as Address;
  const quote = await api.quote(params, funder);
  if (!quote.evm?.orderTypedData) throw new Error("Flash quote returned no EVM order typed data");
  log("flash.quote", { quoteId: quote.quoteId, orderType: params.orderType, out: quote.to.amount, fee: quote.fees.estimatedFeeNotional });

  let approvalTx: Hex | null = null;
  if (quote.evm.approveTx) {
    approvalTx = await wallet.sendTransaction({ account: wallet.account ?? funder, chain: wallet.chain ?? null, to: quote.evm.approveTx.to, data: quote.evm.approveTx.data });
    const receipt = await publicClient.waitForTransactionReceipt({ hash: approvalTx });
    if (receipt.status !== "success") throw new Error(`Flash approval ${approvalTx} reverted`);
  }

  const typed = JSON.parse(quote.evm.orderTypedData) as TypedJson;
  const { EIP712Domain: _domainType, ...types } = typed.types;
  const uintFields = new Set((types[typed.primaryType] ?? []).filter((f) => f.type.startsWith("uint")).map((f) => f.name));
  const message = Object.fromEntries(Object.entries(typed.message).map(([k, v]) => [k, uintFields.has(k) ? BigInt(v as string) : v]));
  const domain = { ...typed.domain, chainId: Number(typed.domain.chainId) } as TypedDataDomain;
  if (String(typed.message.swapper).toLowerCase() !== funder.toLowerCase()) throw new Error("Flash order swapper is not the funder wallet");
  const signature = await wallet.signTypedData({ account: wallet.account ?? funder, domain, types, primaryType: typed.primaryType, message });

  const { orderId } = await api.submit(params, funder, quote, signature);
  log("flash.submitted", { orderId });

  const statusHistory: FlashSubmission["statusHistory"] = [];
  const deadline = Date.now() + pollSeconds * 1000;
  for (;;) {
    const raw = await api.order(orderId, funder);
    const status = String(raw.status ?? (raw.order as Record<string, unknown> | undefined)?.status ?? "UNKNOWN");
    if (statusHistory.at(-1)?.status !== status) statusHistory.push({ at: new Date().toISOString(), status, raw });
    if (TERMINAL_STATUSES.has(status) || Date.now() > deadline) break;
    await new Promise((r) => setTimeout(r, 5_000));
  }
  return { quoteId: quote.quoteId, quotedOut: quote.to.amount, quotedFeeNotional: quote.fees.estimatedFeeNotional, approvalTx, orderId, signedOrder: typed.message, statusHistory };
}
