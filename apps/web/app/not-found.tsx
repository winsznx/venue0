export default function NotFound() {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div className="card" style={{ padding: 40, maxWidth: 520, display: "grid", gap: 12 }}>
        <h1 className="h3">Nothing here</h1>
        <p className="muted">This round, circle or page does not exist. Rounds shown in Venue0 all come from verified evidence.</p>
        <a href="/enter" className="btn btn-primary" style={{ justifySelf: "start" }}>Enter Venue0</a>
      </div>
    </main>
  );
}
