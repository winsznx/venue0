import { erc20Abi, type Address, type Hex, type PublicClient, type TypedDataDomain, type WalletClient } from "viem";
import { log } from "@venue0/shared";
import { NO_ROUTE_CODES, UniswapApiError, UNIVERSAL_ROUTER_VERSION, type UniswapTradingApi } from "./trading-api.ts";

export type ResidualSwapRequest = {
  tokenIn: Address;
  tokenOut: Address;
  amountIn: bigint;
  slippageTolerance: number;
};

export type ResidualSwapOutcome =
  | { status: "NO_EXTERNAL_ROUTE"; errorCode: string; detail: string; requestId?: string }
  | { status: "UNSUPPORTED_ROUTING"; routing: string; quoteRequestId: string }
  | {
      status: "SUBMITTED";
      routing: string;
      routerVersion: string;
      quoteRequestId: string;
      swapRequestId: string;
      quotedAmountOut: string | undefined;
      routeString: string | undefined;
      approvalTx: Hex | null;
      swapTx: Hex;
      receiptStatus: "success" | "reverted";
      balances: { tokenInBefore: bigint; tokenInAfter: bigint; tokenOutBefore: bigint; tokenOutAfter: bigint };
      postcondition: { spentExact: boolean; receivedAtLeastMinimum: boolean };
      minimumOut: bigint;
    };

/**
 * PRD 18.2 flow: check_approval -> approve if needed -> quote -> inspect routing -> /swap for CLASSIC ->
 * send -> read balances before and after. A quote failure is a product outcome (NO_EXTERNAL_ROUTE), not an error.
 */
export async function executeResidualSwap(
  api: UniswapTradingApi,
  wallet: WalletClient,
  publicClient: PublicClient,
  readClient: PublicClient,
  request: ResidualSwapRequest,
): Promise<ResidualSwapOutcome> {
  const swapper = wallet.account?.address as Address;
  if (!swapper) throw new Error("wallet client has no account");

  let quote;
  try {
    quote = await api.quote({ tokenIn: request.tokenIn, tokenOut: request.tokenOut, amount: request.amountIn, swapper, slippageTolerance: request.slippageTolerance });
  } catch (error) {
    if (error instanceof UniswapApiError && (NO_ROUTE_CODES.has(error.error.errorCode) || error.error.status === 404)) {
      return { status: "NO_EXTERNAL_ROUTE", errorCode: error.error.errorCode, detail: error.error.detail, ...(error.error.requestId ? { requestId: error.error.requestId } : {}) };
    }
    throw error;
  }
  log("uniswap.quote", { requestId: quote.requestId, routing: quote.routing, out: quote.quote.output?.amount, route: quote.quote.routeString });
  if (quote.routing !== "CLASSIC") return { status: "UNSUPPORTED_ROUTING", routing: quote.routing, quoteRequestId: quote.requestId };

  let approvalTx: Hex | null = null;
  const approval = await api.checkApproval(swapper, request.tokenIn, request.amountIn);
  if (approval.approval) {
    approvalTx = await wallet.sendTransaction({
      account: wallet.account ?? swapper,
      chain: wallet.chain ?? null,
      to: approval.approval.to,
      data: approval.approval.data,
      value: BigInt(approval.approval.value || "0"),
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash: approvalTx });
    if (receipt.status !== "success") throw new Error(`approval tx ${approvalTx} reverted`);
    // The quote may predate the approval; requote so permitData reflects current Permit2 state.
    quote = await api.quote({ tokenIn: request.tokenIn, tokenOut: request.tokenOut, amount: request.amountIn, swapper, slippageTolerance: request.slippageTolerance });
  }

  let permit;
  if (quote.permitData) {
    const { domain, types, values } = quote.permitData;
    const primaryType = Object.keys(types).find((t) => t !== "EIP712Domain") as string;
    const signature = await wallet.signTypedData({ account: wallet.account ?? swapper, domain: domain as TypedDataDomain, types, primaryType, message: values });
    permit = { signature, permitData: quote.permitData };
  }

  const balance = (token: Address, blockNumber?: bigint) =>
    readClient.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [swapper], ...(blockNumber === undefined ? {} : { blockNumber }) });

  const swap = await api.swap(quote.quote, permit);
  const swapTx = await wallet.sendTransaction({
    account: wallet.account ?? swapper,
    chain: wallet.chain ?? null,
    to: swap.swap.to,
    data: swap.swap.data,
    value: BigInt(swap.swap.value || "0"),
    ...(swap.swap.gasLimit ? { gas: BigInt(swap.swap.gasLimit) } : {}),
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: swapTx });

  const [tokenInBefore, tokenInAfter, tokenOutBefore, tokenOutAfter] = await Promise.all([
    balance(request.tokenIn, receipt.blockNumber - 1n),
    balance(request.tokenIn, receipt.blockNumber),
    balance(request.tokenOut, receipt.blockNumber - 1n),
    balance(request.tokenOut, receipt.blockNumber),
  ]);
  const quoted = BigInt(quote.quote.output?.amount ?? "0");
  const minimumOut = (quoted * BigInt(Math.floor((100 - request.slippageTolerance) * 100))) / 10_000n;

  return {
    status: "SUBMITTED",
    routing: quote.routing,
    routerVersion: UNIVERSAL_ROUTER_VERSION,
    quoteRequestId: quote.requestId,
    swapRequestId: swap.requestId,
    quotedAmountOut: quote.quote.output?.amount,
    routeString: quote.quote.routeString,
    approvalTx,
    swapTx,
    receiptStatus: receipt.status,
    balances: { tokenInBefore, tokenInAfter, tokenOutBefore, tokenOutAfter },
    postcondition: {
      spentExact: tokenInBefore - tokenInAfter === request.amountIn,
      receivedAtLeastMinimum: tokenOutAfter - tokenOutBefore >= minimumOut,
    },
    minimumOut,
  };
}
