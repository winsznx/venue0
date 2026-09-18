/** Browser side of lib/server/api.ts: revives {"$bigint": "..."} values in API responses. */
export function reviveBigints<T>(value: unknown): T {
  const revive = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(revive);
    if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      if (typeof o.$bigint === "string" && Object.keys(o).length === 1) return BigInt(o.$bigint);
      return Object.fromEntries(Object.entries(o).map(([k, x]) => [k, revive(x)]));
    }
    return v;
  };
  return revive(value) as T;
}

export function encodeBigints(value: unknown): string {
  return JSON.stringify(value, (_k, v: unknown) => (typeof v === "bigint" ? { $bigint: v.toString() } : v));
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const response = await fetch(path, {
    method: init.method ?? (init.body === undefined ? "GET" : "POST"),
    headers: init.body === undefined ? {} : { "content-type": "application/json" },
    ...(init.body === undefined ? {} : { body: encodeBigints(init.body) }),
    cache: "no-store",
  });
  const data = reviveBigints<T & { error?: string }>(await response.json());
  if (!response.ok) throw new ApiError(data.error ?? `Request failed (${response.status})`, response.status);
  return data;
}
