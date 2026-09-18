import { defineChain } from "viem";

export const ROBINHOOD_CHAIN_ID = 4663;
export const ROBINHOOD_TESTNET_CHAIN_ID = 46630;

export const ROBINHOOD_PUBLIC_RPC = "https://rpc.mainnet.chain.robinhood.com";
export const ROBINHOOD_TESTNET_PUBLIC_RPC = "https://rpc.testnet.chain.robinhood.com";
export const ROBINHOOD_EXPLORER = "https://robinhoodchain.blockscout.com";
export const ROBINHOOD_TESTNET_EXPLORER = "https://explorer.testnet.chain.robinhood.com";

export function robinhoodChain(rpcUrl = process.env.ROBINHOOD_RPC_URL || ROBINHOOD_PUBLIC_RPC) {
  return defineChain({
    id: ROBINHOOD_CHAIN_ID,
    name: "Robinhood Chain",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
    blockExplorers: { default: { name: "Blockscout", url: ROBINHOOD_EXPLORER } },
  });
}

export function robinhoodTestnet(rpcUrl = process.env.ROBINHOOD_TESTNET_RPC_URL || ROBINHOOD_TESTNET_PUBLIC_RPC) {
  return defineChain({
    id: ROBINHOOD_TESTNET_CHAIN_ID,
    name: "Robinhood Chain Testnet",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
    blockExplorers: { default: { name: "Blockscout", url: ROBINHOOD_TESTNET_EXPLORER } },
    testnet: true,
  });
}

export function explorerTx(hash: string, explorer = ROBINHOOD_EXPLORER): string {
  return `${explorer}/tx/${hash}`;
}

export function explorerAddress(address: string, explorer = ROBINHOOD_EXPLORER): string {
  return `${explorer}/address/${address}`;
}
