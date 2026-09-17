import { add, cmp, div, isZero, mul, rat, sub, ZERO, type Rational } from "./rational.ts";

export type LinearProgram = {
  /** maximize objective . x */
  objective: bigint[];
  /** rows: coefficients . x <= rhs, with rhs >= 0 so the origin is feasible */
  constraints: Array<{ coefficients: bigint[]; rhs: bigint }>;
};

export type SimplexResult = { optimum: Rational; x: Rational[]; pivots: number };

/**
 * Exact primal simplex over rationals with Bland's rule (no cycling). Intended for small reference problems only.
 */
export function solveLinearProgram(lp: LinearProgram, maxPivots = 100_000): SimplexResult {
  const n = lp.objective.length;
  const m = lp.constraints.length;
  for (const row of lp.constraints) {
    if (row.coefficients.length !== n) throw new Error("constraint width mismatch");
    if (row.rhs < 0n) throw new Error("reference simplex requires rhs >= 0");
  }

  const width = n + m;
  const tableau: Rational[][] = lp.constraints.map((row, i) => {
    const r: Rational[] = new Array<Rational>(width + 1).fill(ZERO);
    row.coefficients.forEach((c, j) => (r[j] = rat(c)));
    r[n + i] = rat(1n);
    r[width] = rat(row.rhs);
    return r;
  });
  const objective: Rational[] = new Array<Rational>(width + 1).fill(ZERO);
  lp.objective.forEach((c, j) => (objective[j] = rat(-c)));
  const basis = Array.from({ length: m }, (_, i) => n + i);

  let pivots = 0;
  for (;;) {
    const entering = objective.slice(0, width).findIndex((v) => v.n < 0n);
    if (entering === -1) break;
    if (++pivots > maxPivots) throw new Error("reference simplex exceeded pivot limit");

    let leaving = -1;
    let bestRatio: Rational | undefined;
    for (let i = 0; i < m; i++) {
      const a = (tableau[i] as Rational[])[entering] as Rational;
      if (a.n <= 0n) continue;
      const ratio = div((tableau[i] as Rational[])[width] as Rational, a);
      const order = bestRatio ? cmp(ratio, bestRatio) : -1;
      if (order < 0 || (order === 0 && (basis[i] as number) < (basis[leaving] as number))) {
        bestRatio = ratio;
        leaving = i;
      }
    }
    if (leaving === -1) throw new Error("reference LP is unbounded");

    const pivotRow = tableau[leaving] as Rational[];
    const pivot = pivotRow[entering] as Rational;
    for (let j = 0; j <= width; j++) pivotRow[j] = div(pivotRow[j] as Rational, pivot);
    const eliminate = (row: Rational[]) => {
      const factor = row[entering] as Rational;
      if (isZero(factor)) return;
      for (let j = 0; j <= width; j++) row[j] = sub(row[j] as Rational, mul(factor, pivotRow[j] as Rational));
    };
    tableau.forEach((row, i) => i !== leaving && eliminate(row));
    eliminate(objective);
    basis[leaving] = entering;
  }

  const x: Rational[] = new Array<Rational>(n).fill(ZERO);
  basis.forEach((variable, i) => {
    if (variable < n) x[variable] = (tableau[i] as Rational[])[width] as Rational;
  });
  const optimum = lp.objective.reduce((sum, c, j) => add(sum, mul(rat(c), x[j] as Rational)), ZERO);
  return { optimum, x, pivots };
}
