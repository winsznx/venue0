import { existsSync } from "node:fs";
import { appendFile } from "node:fs/promises";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

/**
 * Creates three fresh proof wallets and appends their keys to the local, gitignored .env.
 * Keys are printed nowhere; only addresses are shown so they can be funded.
 */
const names = ["VENUE0_WALLET_A_PRIVATE_KEY", "VENUE0_WALLET_B_PRIVATE_KEY", "VENUE0_WALLET_C_PRIVATE_KEY"];
if (names.some((n) => process.env[n])) throw new Error("proof wallet keys already present in the environment; refusing to overwrite");
const lines: string[] = [];
for (const name of names) {
  const key = generatePrivateKey();
  lines.push(`${name}=${key}`);
  console.log(`${name.replace("_PRIVATE_KEY", "")} address: ${privateKeyToAccount(key).address}`);
}
await appendFile(".env", `${existsSync(".env") ? "\n" : ""}${lines.join("\n")}\n`, { mode: 0o600 });
console.log("appended keys to .env (gitignored)");
