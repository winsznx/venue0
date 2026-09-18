import type { Address, Hex } from "viem";
import { ROBINHOOD_CHAIN_ID } from "@venue0/shared";

export const UNISWAP_TRADING_API = "https://trade-api.gateway.uniswap.org/v1";

/** Pinned per Uniswap docs: 2.1.1 is the only Universal Router on Robinhood Chain, and the default may drift. */
export const UNIVERSAL_ROUTER_VERSION = "2.1.1";

export type TransactionRequest = { to: Address; from: Address; data: Hex; value: string; chainId: number; gasLimit?: string };

export type PermitData = { domain: Record<string, unknown>; types: Record<string, Array<{ name: string; type: string }>>; values: Record<string, unknown> } | null;

export type QuoteResponse = {
  requestId: string;
  routing: string;
  quote: Record<string, unknown> & { output?: { amount?: string }; input?: { amount?: string }; routeString?: string; priceImpact?: number };
  permitData: PermitData;
};

export type ApiError = { status: number; errorCode: string; detail: string; requestId?: string };

export class UniswapApiError extends Error {
  constructor(readonly error: ApiError) {
    super(`Uniswap ${error.status} ${error.errorCode}: ${error.detail}`);
  }
}

/** Error codes that mean "no usable external route right now" rather than a bug on our side. */
export const NO_ROUTE_CODES = new Set(["NoRouteFoundError", "QuoteAmountTooLowError", "UnsupportedTokenError", "UniswapXNotSupportedOnChainError"]);

export class UniswapTradingApi {
  constructor(private readonly apiKey: string, private readonly baseUrl = UNISWAP_TRADING_API) {
    if (!apiKey) throw new Error("Uniswap API key is required");
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: {
        "x-api-key": this.apiKey,
        "content-type": "application/json",
        accept: "application/json",
        "x-universal-router-version": UNIVERSAL_ROUTER_VERSION,
      },
      body: JSON.stringify(body),
    });
    const json = (await response.json()) as Record<string, unknown>;
    if (!response.ok) {
      throw new UniswapApiError({
        status: response.status,
        errorCode: String(json.errorCode ?? "Unknown"),
        detail: String(json.detail ?? ""),
        ...(typeof json.requestId === "string" ? { requestId: json.requestId } : {}),
      });
    }
    return json as T;
  }

  permissions(walletAddress: Address, tokens: Address[]) {
    return this.post<{ requestId: string; results: Array<{ token: Address; isPermissioned: boolean; isAllowlisted?: boolean }> }>("/permissions", {
      walletAddress,
      tokens,
      chainId: ROBINHOOD_CHAIN_ID,
    });
  }

  checkApproval(walletAddress: Address, token: Address, amount: bigint) {
    return this.post<{ requestId: string; approval: TransactionRequest | null }>("/check_approval", {
      walletAddress,
      token,
      amount: amount.toString(),
      chainId: ROBINHOOD_CHAIN_ID,
    });
  }

  quote(params: { tokenIn: Address; tokenOut: Address; amount: bigint; swapper: Address; slippageTolerance: number }) {
    return this.post<QuoteResponse>("/quote", {
      type: "EXACT_INPUT",
      amount: params.amount.toString(),
      tokenInChainId: ROBINHOOD_CHAIN_ID,
      tokenOutChainId: ROBINHOOD_CHAIN_ID,
      tokenIn: params.tokenIn,
      tokenOut: params.tokenOut,
      swapper: params.swapper,
      slippageTolerance: params.slippageTolerance,
      routingPreference: "BEST_PRICE",
    });
  }

  swap(quote: QuoteResponse["quote"], permit?: { signature: Hex; permitData: NonNullable<PermitData> }) {
    return this.post<{ requestId: string; swap: TransactionRequest }>("/swap", {
      quote,
      ...(permit ? { signature: permit.signature, permitData: permit.permitData } : {}),
      simulateTransaction: true,
    });
  }
}
