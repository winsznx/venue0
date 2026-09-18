import Link from "next/link";

export default function NotFound() {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div className="card" style={{ padding: 40, maxWidth: 520, display: "grid", gap: 12 }}>
        <h1 className="h3">Nothing here</h1>
        <p className="muted">This round, circle or page does not exist. Rounds shown in Venue0 all come from verified evidence.</p>
        <Link href="/app" className="btn btn-primary" style={{ justifySelf: "start" }}>Go to overview</Link>
      </div>
    </main>
  );
}
