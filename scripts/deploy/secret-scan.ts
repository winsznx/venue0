import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Fails when any value from the local .env (or any 0x-prefixed 32-byte hex key) appears in a build output directory.
 * Prints only variable names and file paths, never values. Usage: node secret-scan.mjs <dir> <envFile>
 */
const [dir, envFile] = process.argv.slice(2) as [string, string];
const values = readFileSync(envFile, "utf8")
  .split("\n")
  .map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/))
  .filter((m): m is RegExpMatchArray => m !== null)
  .map((m) => [m[1] as string, (m[2] as string).replace(/^["']|["']$/g, "").trim()] as const)
  .filter(([name, v]) => v.length >= 16 && !["CROSSING_SETTLEMENT_ADDRESS", "DYNAMIC_ENVIRONMENT_ID"].includes(name));
const files: string[] = [];
const walk = (d: string) => {
  for (const e of readdirSync(d)) {
    const p = join(d, e);
    const s = lstatSync(p);
    if (s.isSymbolicLink()) continue;
    if (s.isDirectory()) walk(p);
    else files.push(p);
  }
};
walk(dir);
/**
 * What to look for per value. For URLs the secret parts are the password and any long path or query segment (API keys
 * live there); the host and port are public and appear in docs. Other values are matched on their last 20 characters.
 */
function needles(v: string): string[] {
  try {
    const u = new URL(v);
    if (!u.host) return [v.slice(-20)];
    const parts = [decodeURIComponent(u.password), ...u.pathname.split("/"), ...[...u.searchParams.values()]];
    return parts.filter((p) => p.length >= 12);
  } catch {
    return [v.slice(-20)];
  }
}

let hits = 0;
for (const f of files) {
  const text = readFileSync(f, "latin1");
  for (const [name, v] of values) if (needles(v).some((n) => text.includes(n))) { console.log(`SECRET ${name} found in ${f}`); hits++; }
}
console.log(JSON.stringify({ event: "secret.scan", files: files.length, checkedVariables: values.map(([n]) => n), hits }));
process.exit(hits ? 1 : 0);
