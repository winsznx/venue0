export default function Loading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <div className="page-head"><div><h1>Your portfolio</h1><p className="muted">Reading balances from Robinhood Chain and prices from Chainlink…</p></div></div>
      <div style={{ display: "grid", gap: 10 }}>
        {[0, 1, 2].map((i) => <div key={i} className="tile" style={{ height: 52, opacity: 0.7 - i * 0.15 }} />)}
      </div>
    </div>
  );
}
