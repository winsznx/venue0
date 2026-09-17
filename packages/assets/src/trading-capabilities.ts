/**
 * Robinhood documents two incompatible `tradingCapabilities` shapes (see docs/SPONSOR_FINDINGS.md):
 *   Shape A (stock-token-apis page): { fractionalTradability, allDayTradability, extendedHoursFractionalTradability }
 *   Shape B (stock-tokens page, and the live API on 2026-09-17): { market|extended|overnight: { whole, fractional } }
 * Anything we cannot positively read as tradable is UNKNOWN, and UNKNOWN is never treated as tradable.
 */

export type Session = "market" | "extended" | "overnight";
export type Lot = "whole" | "fractional";
export type Tradability = "TRADABLE" | "UNTRADABLE" | "CLOSING_ONLY" | "OPENING_ONLY" | "UNKNOWN";

export type SessionCapabilities = Record<Session, Record<Lot, Tradability>>;

export type TradingCapabilities = {
  shape: "SESSION_MAP" | "TRADABILITY_FIELDS" | "MISSING" | "UNRECOGNIZED";
  sessions: SessionCapabilities;
  raw: unknown;
};

const SESSIONS: readonly Session[] = ["market", "extended", "overnight"];

function unknownSessions(): SessionCapabilities {
  return {
    market: { whole: "UNKNOWN", fractional: "UNKNOWN" },
    extended: { whole: "UNKNOWN", fractional: "UNKNOWN" },
    overnight: { whole: "UNKNOWN", fractional: "UNKNOWN" },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fromEnum(value: unknown): Tradability {
  switch (value) {
    case "TRADING_STATUS_TRADABLE":
      return "TRADABLE";
    case "TRADING_STATUS_UNTRADABLE":
      return "UNTRADABLE";
    default:
      return "UNKNOWN";
  }
}

function fromLowercase(value: unknown): Tradability {
  switch (value) {
    case "tradable":
      return "TRADABLE";
    case "untradable":
      return "UNTRADABLE";
    case "position_closing_only":
      return "CLOSING_ONLY";
    case "position_opening_only":
      return "OPENING_ONLY";
    default:
      return "UNKNOWN";
  }
}

export function parseTradingCapabilities(raw: unknown): TradingCapabilities {
  if (raw === undefined || raw === null) return { shape: "MISSING", sessions: unknownSessions(), raw };
  if (!isRecord(raw)) return { shape: "UNRECOGNIZED", sessions: unknownSessions(), raw };

  if (SESSIONS.some((s) => isRecord(raw[s]))) {
    const sessions = unknownSessions();
    for (const session of SESSIONS) {
      const entry = raw[session];
      if (!isRecord(entry)) continue;
      sessions[session] = { whole: fromEnum(entry.whole), fractional: fromEnum(entry.fractional) };
    }
    return { shape: "SESSION_MAP", sessions, raw };
  }

  if ("fractionalTradability" in raw || "allDayTradability" in raw || "extendedHoursFractionalTradability" in raw) {
    // Shape A does not describe whole-share regular-session tradability explicitly; leave it UNKNOWN.
    const sessions = unknownSessions();
    const fractional = fromLowercase(raw.fractionalTradability);
    const allDay = fromLowercase(raw.allDayTradability);
    sessions.market.fractional = fractional;
    sessions.overnight = { whole: allDay, fractional: allDay === "TRADABLE" ? fractional : allDay };
    if (raw.extendedHoursFractionalTradability === true) sessions.extended.fractional = fractional;
    if (raw.extendedHoursFractionalTradability === false) sessions.extended.fractional = "UNTRADABLE";
    return { shape: "TRADABILITY_FIELDS", sessions, raw };
  }

  return { shape: "UNRECOGNIZED", sessions: unknownSessions(), raw };
}

export function canTrade(capabilities: TradingCapabilities, session: Session, lot: Lot): boolean {
  return capabilities.sessions[session][lot] === "TRADABLE";
}
