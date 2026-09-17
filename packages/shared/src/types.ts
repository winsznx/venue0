import type { Address, Hex } from "viem";

export type { Address, Hex };

/** Asset uid from the Robinhood assets API `id` field; equals the token's onchain `uid()`. */
export type AssetUid = Hex;
