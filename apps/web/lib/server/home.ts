import "server-only";
import type { Address } from "viem";
import { listMyCircles } from "./circles";
import { db } from "./db/client";
import { loadPortfolio } from "./portfolio";
import { roundsForCircle, TERMINAL } from "./rounds";
import { getTarget, key, listActivity } from "./users";

export type Drift = { symbol: string; currentPct: number; targetPct: number; driftPct: number; valueUsd: number };

/** The signed-in user's home: live portfolio, drift from their saved target, their circles' live rounds and open residuals. */
export async function homeData(address: Address) {
  const [portfolio, target, circles, activity] = await Promise.all([loadPortfolio(address), getTarget(address), listMyCircles(address), listActivity(address, 8)]);
  const drift: Drift[] = [];
  if (portfolio.ok && target && portfolio.totalUsd > 0) {
    const symbols = new Set([...portfolio.positions.map((x) => x.symbol), ...target.weights.map((w) => w.symbol)]);
    for (const symbol of symbols) {
      const valueUsd = portfolio.positions.find((x) => x.symbol === symbol)?.valueUsd ?? 0;
      const currentPct = (valueUsd / portfolio.totalUsd) * 100;
      const targetPct = (target.weights.find((w) => w.symbol === symbol)?.weightBps ?? 0) / 100;
      drift.push({ symbol, currentPct, targetPct, driftPct: currentPct - targetPct, valueUsd });
    }
    drift.sort((a, b) => Math.abs(b.driftPct) - Math.abs(a.driftPct));
  }
  const rounds = (
    await Promise.all(
      circles.map(async (c) => {
        const [latest] = await roundsForCircle(c.id);
        return { circle: c, round: latest ?? null };
      }),
    )
  ).filter((x) => x.round && !TERMINAL.has(x.round.state));
  const residuals = await (await db()).query<{ round_id: string; asset_uid: string; side: string; user_choice: string; circle_id: string; name: string }>(
    "select d.round_id, d.asset_uid, d.side, d.user_choice, r.circle_id, c.name from residual_decisions d join rounds r on r.id = d.round_id join circles c on c.id = r.circle_id where d.owner = $1 and d.user_choice = 'CARRY_FORWARD' and d.consumed_round_id is null",
    [key(address)],
  );
  const totalDrift = drift.reduce((s, d) => s + Math.abs(d.driftPct), 0) / 2;
  return { portfolio, target, drift, totalDrift, circles, liveRounds: rounds, carried: residuals, activity };
}
