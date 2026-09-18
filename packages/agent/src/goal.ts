import { z } from "zod";

/**
 * What the language model is allowed to produce: a structured reading of the user's words.
 * No addresses, prices, amounts or asset identities beyond the tickers the user said. Code resolves everything else.
 */
export const OperationSchema = z.object({
  op: z.enum(["SET_WEIGHT", "MOVE_POSITION_FRACTION", "MOVE_OVERWEIGHT_FRACTION", "USE_SAVED_TARGET"]),
  symbol: z.string().nullable().describe("SET_WEIGHT: ticker exactly as the user said it"),
  weightPct: z.number().nullable().describe("SET_WEIGHT: target weight in percent of the Stock Token portfolio"),
  from: z.string().nullable().describe("MOVE_*: ticker to reduce"),
  to: z.string().nullable().describe("MOVE_*: ticker to increase"),
  fraction: z.number().nullable().describe("MOVE_*: share to move, 0 < fraction <= 1 (\"half\" = 0.5)"),
});

export const GoalSpecSchema = z.object({
  operations: z.array(OperationSchema),
  remainderTo: z.string().nullable().describe("Ticker that receives weight freed by SET_WEIGHT reductions, if the user named one"),
  cashWeightPct: z.number().nullable().describe("Share the user wants kept in cash / USDG, in percent"),
  constraints: z.object({
    maxExternalSlippageBps: z.number().nullable().describe("Cap on external execution cost or spread, in bps"),
    allowMarketResidual: z.boolean().nullable(),
    residualStyle: z.enum(["ANY", "LIMIT", "TWAP", "WAIT"]).nullable(),
    twapDurationSec: z.number().nullable(),
    urgency: z.enum(["LOW", "NORMAL", "HIGH"]).nullable(),
    crossAsMuchAsPossible: z.boolean().nullable(),
  }),
  circleName: z.string().nullable().describe("Circle the user wants to join, as said"),
  roundTiming: z.string().nullable().describe("When the user wants the round, as said (e.g. 'tonight')"),
  clarificationsNeeded: z.array(z.string()).describe("Anything ambiguous that code should not guess"),
});

export type GoalSpec = z.infer<typeof GoalSpecSchema>;
export type Operation = z.infer<typeof OperationSchema>;
