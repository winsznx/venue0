import Link from "next/link";

/** V0 mark: two strokes that cross before they reach the edge, the product in one glyph. */
export function Mark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden="true">
      <rect width="28" height="28" rx="9" fill="#000" />
      <path d="M7 8 L14 20 L21 8" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="14" cy="13.2" r="2.3" fill="var(--cross)" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <Link href="/" className="wordmark" aria-label="Venue0 home">
      <Mark />
      <span>Venue0</span>
    </Link>
  );
}

export function Sparkle({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 1v14M1 8h14M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function LiveChip() {
  return (
    <span className="chip">
      <span className="status status-live"><span className="status-dot" /></span>
      LIVE · ROBINHOOD CHAIN
    </span>
  );
}

export function Disclosure() {
  return (
    <p className="disclosure">
      Stock Tokens are tokenised debt securities issued by Robinhood Assets (Jersey) Limited. They give economic exposure to the underlying securities and no legal or beneficial rights in them. They are not offered to U.S. persons and are restricted in other jurisdictions. Venue0 is software, not investment advice, and does not decide whether you may trade a given Stock Token.
    </p>
  );
}
