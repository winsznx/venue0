import { openUser } from "./session.ts";
import { residualAndReceipt } from "./steps.ts";
const [dir, label, roundId] = process.argv.slice(2) as [string, "A", string];
const u = await openUser(label, dir);
try { await residualAndReceipt(u, roundId, dir); } finally { await u.context.close(); }
