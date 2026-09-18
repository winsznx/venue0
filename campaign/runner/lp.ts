import loadHighs from "highs";

export type Offer = { owner: string; asset: string; lots: number };

export type LpResult = { crossedLots: number; transfers: Array<{ from: string; to: string; asset: string; lots: number }>; ms: number };

type Highs = Awaited<ReturnType<typeof loadHighs>>;
let highs: Highs | undefined;

/**
 * Max crossed lots over direct transfers x[p,q,a] (p sells a, q buys a).
 * BILATERAL: every pair's exchange balances in value (sum p->q == sum q->p): simple two-wallet swaps only.
 * PORTFOLIO: each participant balances across all counterparties: Venue0's formulation, used as a large-n parity check.
 */
export async function maxCrossLp(sells: Offer[], buys: Offer[], balance: "BILATERAL" | "PORTFOLIO"): Promise<LpResult> {
  highs ??= await loadHighs();
  const started = performance.now();
  const vars: Array<{ name: string; from: string; to: string; asset: string }> = [];
  for (const s of sells) {
    for (const b of buys) {
      if (b.asset === s.asset && b.owner !== s.owner) vars.push({ name: `x${vars.length}`, from: s.owner, to: b.owner, asset: s.asset });
    }
  }
  if (vars.length === 0) return { crossedLots: 0, transfers: [], ms: 0 };

  const rows: string[] = [];
  const sum = (vs: typeof vars) => vs.map((v) => v.name).join(" + ");
  sells.forEach((s, i) => {
    const vs = vars.filter((v) => v.from === s.owner && v.asset === s.asset);
    if (vs.length) rows.push(`s${i}: ${sum(vs)} <= ${s.lots}`);
  });
  buys.forEach((b, i) => {
    const vs = vars.filter((v) => v.to === b.owner && v.asset === b.asset);
    if (vs.length) rows.push(`b${i}: ${sum(vs)} <= ${b.lots}`);
  });
  const owners = [...new Set([...sells, ...buys].map((o) => o.owner))];
  const balanceRow = (name: string, out: typeof vars, inn: typeof vars) => {
    if (!out.length && !inn.length) return;
    const terms = [...out.map((v) => `+ ${v.name}`), ...inn.map((v) => `- ${v.name}`)].join(" ");
    rows.push(`${name}: ${terms} = 0`);
  };
  if (balance === "PORTFOLIO") {
    owners.forEach((o, i) => balanceRow(`p${i}`, vars.filter((v) => v.from === o), vars.filter((v) => v.to === o)));
  } else {
    owners.forEach((p, i) => owners.forEach((q, j) => {
      if (j <= i) return;
      balanceRow(`q${i}_${j}`, vars.filter((v) => v.from === p && v.to === q), vars.filter((v) => v.from === q && v.to === p));
    }));
  }
  const lp = `Maximize\n obj: ${sum(vars)}\nSubject To\n ${rows.join("\n ")}\nEnd\n`;
  const solution = highs.solve(lp, { output_flag: false });
  if (solution.Status !== "Optimal") throw new Error(`LP ${balance} status ${solution.Status}`);
  const transfers = vars
    .map((v) => ({ from: v.from, to: v.to, asset: v.asset, lots: solution.Columns[v.name]?.Primal ?? 0 }))
    .filter((t) => t.lots > 1e-9);
  return { crossedLots: solution.ObjectiveValue, transfers, ms: performance.now() - started };
}
