import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";

export type Anvil = { rpcUrl: string; stop: () => void };

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => (typeof address === "object" && address ? resolve(address.port) : reject(new Error("no port"))));
    });
  });
}

/** Starts a local anvil. With `forkUrl`, forks live Robinhood Chain state; nothing is broadcast to the real chain. */
export async function startAnvil(options: { forkUrl?: string; forkBlockNumber?: bigint; chainId?: number } = {}): Promise<Anvil> {
  const port = await freePort();
  const args = ["--port", String(port), "--silent"];
  if (options.forkUrl) args.push("--fork-url", options.forkUrl);
  if (options.forkBlockNumber !== undefined) args.push("--fork-block-number", options.forkBlockNumber.toString());
  if (options.chainId !== undefined) args.push("--chain-id", String(options.chainId));
  const child: ChildProcess = spawn("anvil", args, { stdio: "ignore" });
  const rpcUrl = `http://127.0.0.1:${port}`;

  const deadline = Date.now() + 60_000;
  for (;;) {
    if (child.exitCode !== null) throw new Error(`anvil exited with code ${child.exitCode}`);
    try {
      const response = await fetch(rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
      });
      if (response.ok) break;
    } catch {
      // anvil not accepting connections yet
    }
    if (Date.now() > deadline) {
      child.kill();
      throw new Error("anvil did not start within 60s");
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return { rpcUrl, stop: () => child.kill() };
}
