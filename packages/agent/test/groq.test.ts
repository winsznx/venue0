import { describe, expect, it } from "vitest";
import { GOAL_JSON_SCHEMA, groqInterpreter } from "../src/groq.ts";

const spec = {
  operations: [{ op: "SET_WEIGHT", symbol: "NVDA", weightPct: 20, from: null, to: null, fraction: null }],
  remainderTo: "SPY",
  cashWeightPct: null,
  constraints: { maxExternalSlippageBps: 40, allowMarketResidual: null, residualStyle: null, twapDurationSec: null, urgency: null, crossAsMuchAsPossible: null },
  circleName: null,
  roundTiming: null,
  clarificationsNeeded: [],
};

const reply = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe("groqInterpreter", () => {
  it("sends a strict schema: every object closed, every property required", () => {
    const walk = (n: Record<string, unknown>): void => {
      if (n.properties) {
        expect(n.additionalProperties).toBe(false);
        expect(new Set(n.required as string[])).toEqual(new Set(Object.keys(n.properties as object)));
        Object.values(n.properties as Record<string, Record<string, unknown>>).forEach(walk);
      }
      if (n.items) walk(n.items as Record<string, unknown>);
      for (const b of (n.anyOf as Array<Record<string, unknown>> | undefined) ?? []) walk(b);
    };
    walk(GOAL_JSON_SCHEMA as Record<string, unknown>);
  });

  it("returns the parsed goal spec", async () => {
    const out = await groqInterpreter("k", undefined, reply(200, { choices: [{ message: { content: JSON.stringify(spec) } }] }))("Reduce NVDA to 20%, rest to SPY", { heldSymbols: ["NVDA"], circles: [] });
    expect(out.operations[0]?.symbol).toBe("NVDA");
    expect(out.remainderTo).toBe("SPY");
  });

  it("rejects output that does not match the schema", async () => {
    const bad = { ...spec, operations: [{ op: "BUY_EVERYTHING" }] };
    await expect(groqInterpreter("k", undefined, reply(200, { choices: [{ message: { content: JSON.stringify(bad) } }] }))("x", { heldSymbols: [], circles: [] })).rejects.toThrow(/goal schema/);
  });

  it("surfaces provider errors and refusals", async () => {
    await expect(groqInterpreter("k", undefined, reply(429, { error: { message: "rate limit" } }))("x", { heldSymbols: [], circles: [] })).rejects.toThrow(/429: rate limit/);
    await expect(groqInterpreter("k", undefined, reply(200, { choices: [{ message: { content: null, refusal: "no" } }] }))("x", { heldSymbols: [], circles: [] })).rejects.toThrow(/declined/);
  });
});
