import { route } from "@/lib/server/api";
import { loadPortfolio } from "@/lib/server/portfolio";

export const GET = route(async ({ session }) => loadPortfolio(session.address));
