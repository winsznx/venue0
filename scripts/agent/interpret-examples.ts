import { mkdir, writeFile } from "node:fs/promises";
import { claudeInterpreter, INTERPRETER_MODEL } from "@venue0/agent";
import { canonicalJson } from "@venue0/shared";

/**
 * Runs the PRD's example instructions through Claude structured outputs and saves the raw structured readings.
 * The readings are untrusted; resolveGoal validates them. Needs ANTHROPIC_API_KEY (or an `ant auth login` profile).
 */
const EXAMPLES = [
  "Reduce my NVDA exposure to 20%, put the difference into SPY, and keep 10% in USDG.",
  "Move half of my AAPL overweight into QQQ but do not hit the market if the external spread is above 40 bps.",
  "Join tonight's AI Stocks Circle round. Cross as much as possible. TWAP any residual over two hours.",
];
const interpret = claudeInterpreter();
const results = [];
for (const instruction of EXAMPLES) {
  const spec = await interpret(instruction, { heldSymbols: ["NVDA", "AAPL", "SPY", "QQQ"], circles: ["AI Stocks Circle"] });
  results.push({ instruction, spec });
  console.log(instruction, "\n", JSON.stringify(spec), "\n");
}
await mkdir("evidence/agent", { recursive: true });
await writeFile("evidence/agent/interpreter-examples.json", `${canonicalJson({ model: INTERPRETER_MODEL, capturedAt: new Date().toISOString(), results }, 2)}\n`);
