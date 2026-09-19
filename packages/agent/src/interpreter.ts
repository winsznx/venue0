import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { GoalSpecSchema, type GoalSpec } from "./goal.ts";

export type GoalInterpreter = (instruction: string, context: { heldSymbols: string[]; circles: string[] }) => Promise<GoalSpec>;

export const INTERPRETER_MODEL = "claude-opus-5";

export const INTERPRETER_SYSTEM = `You translate a user's portfolio instruction for Robinhood Chain Stock Tokens into the given JSON schema.
Rules:
- Record only what the user said. Never invent tickers, prices, amounts, addresses or issuers.
- Copy tickers exactly as written. Do not map company names to other tickers unless the user wrote the ticker.
- "keep X% in USDG/cash" goes in cashWeightPct, never as an operation.
- "reduce/raise NVDA to 20%" is SET_WEIGHT. "move half of my AAPL into QQQ" is MOVE_POSITION_FRACTION with fraction 0.5.
- "move half of my AAPL overweight" is MOVE_OVERWEIGHT_FRACTION; overweight is measured against the user's saved target by code.
- "put the difference into SPY" sets remainderTo.
- "do not hit the market if the spread is above 40 bps" sets maxExternalSlippageBps 40.
- "TWAP any residual over two hours" sets residualStyle TWAP and twapDurationSec 7200.
- If the instruction gives no concrete portfolio change but asks to join a round, use USE_SAVED_TARGET.
- Put every ambiguity in clarificationsNeeded instead of guessing. Do not do arithmetic beyond converting words like "half" to 0.5.`;

export function interpreterUserMessage(instruction: string, context: { heldSymbols: string[]; circles: string[] }): string {
  return `Tickers the user currently holds: ${context.heldSymbols.join(", ") || "none"}.\nCircles the user belongs to: ${context.circles.join(", ") || "none"}.\n\nInstruction: ${instruction}`;
}

/** Interprets a goal with Claude structured outputs. The output is untrusted and always goes through resolveGoal. */
export function claudeInterpreter(client = new Anthropic()): GoalInterpreter {
  return async (instruction, context) => {
    const response = await client.messages.parse({
      model: INTERPRETER_MODEL,
      max_tokens: 16000,
      system: INTERPRETER_SYSTEM,
      messages: [
        {
          role: "user",
          content: interpreterUserMessage(instruction, context),
        },
      ],
      output_config: { format: zodOutputFormat(GoalSpecSchema) },
    });
    if (response.stop_reason === "refusal") throw new Error(`model declined to interpret the goal (${response.stop_details?.category ?? "no category"})`);
    if (!response.parsed_output) throw new Error(`model output did not match the goal schema (stop_reason ${response.stop_reason})`);
    return response.parsed_output;
  };
}
