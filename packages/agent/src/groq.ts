import { z } from "zod";
import { GoalSpecSchema } from "./goal.ts";
import { INTERPRETER_SYSTEM, interpreterUserMessage, type GoalInterpreter } from "./interpreter.ts";

export const GROQ_MODEL = "openai/gpt-oss-120b";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

type JsonSchema = { type?: unknown; properties?: Record<string, JsonSchema>; required?: string[]; additionalProperties?: unknown; items?: JsonSchema; anyOf?: JsonSchema[]; [k: string]: unknown };

/** Groq strict mode needs every object closed and every property listed as required (nullability carries optionality). */
function strict(node: JsonSchema): JsonSchema {
  const out: JsonSchema = { ...node };
  delete out.$schema;
  if (out.properties) {
    out.properties = Object.fromEntries(Object.entries(out.properties).map(([k, v]) => [k, strict(v)]));
    out.required = Object.keys(out.properties);
    out.additionalProperties = false;
  }
  if (out.items) out.items = strict(out.items);
  if (out.anyOf) out.anyOf = out.anyOf.map(strict);
  return out;
}

export const GOAL_JSON_SCHEMA = strict(z.toJSONSchema(GoalSpecSchema) as JsonSchema);

/**
 * Interprets a goal through Groq's OpenAI-compatible API with strict JSON-schema output. The reply is parsed with the
 * same Zod schema as the Claude interpreter and, like it, is untrusted input to resolveGoal.
 */
export function groqInterpreter(apiKey: string, model = GROQ_MODEL, fetchImpl: typeof fetch = fetch): GoalInterpreter {
  if (!apiKey) throw new Error("Groq API key is required");
  return async (instruction, context) => {
    const response = await fetchImpl(GROQ_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model,
        temperature: 0,
        messages: [
          { role: "system", content: INTERPRETER_SYSTEM },
          { role: "user", content: interpreterUserMessage(instruction, context) },
        ],
        response_format: { type: "json_schema", json_schema: { name: "goal_spec", strict: true, schema: GOAL_JSON_SCHEMA } },
      }),
    });
    const body = (await response.json().catch(() => ({}))) as { choices?: Array<{ message?: { content?: string; refusal?: string | null } }>; error?: { message?: string } };
    if (!response.ok) throw new Error(`Groq returned ${response.status}: ${body.error?.message ?? "no detail"}`);
    const message = body.choices?.[0]?.message;
    if (message?.refusal) throw new Error(`model declined to interpret the goal: ${message.refusal}`);
    if (!message?.content) throw new Error("Groq returned no content");
    const parsed = GoalSpecSchema.safeParse(JSON.parse(message.content));
    if (!parsed.success) throw new Error(`model output did not match the goal schema: ${parsed.error.issues[0]?.message ?? "invalid"}`);
    return parsed.data;
  };
}
