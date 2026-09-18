export function usd(value: number, digits = 2): string {
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

export function pct(bps: number, digits = 1): string {
  return `${(bps / 100).toFixed(digits)}%`;
}

export function ratio(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits)}%`;
}

export function tokens(value: number): string {
  return value >= 1 ? value.toFixed(4) : value.toPrecision(4);
}

export function short(hash: string, head = 6, tail = 4): string {
  return hash.length > head + tail + 2 ? `${hash.slice(0, head)}…${hash.slice(-tail)}` : hash;
}

export const EXPLORER = "https://robinhoodchain.blockscout.com";
export const txUrl = (hash: string) => `${EXPLORER}/tx/${hash}`;
export const addressUrl = (address: string) => `${EXPLORER}/address/${address}`;
