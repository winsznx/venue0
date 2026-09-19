"use client";

import p from "@/components/product/product.module.css";

/** Server-rendered product pages that fail land here. Production hides the server message, so the likely causes are named. */
export default function ProductError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className={p.empty} role="alert">
      <h3>This page couldn&apos;t load</h3>
      <p className="muted">Venue0 couldn&apos;t reach one of its dependencies while building this page: its database, the Robinhood Chain RPC, or the Robinhood asset registry. Nothing was changed.</p>
      {error.digest && <p className="faint num" style={{ fontSize: 13 }}>Reference {error.digest}</p>}
      <button type="button" className="btn btn-primary btn-sm" onClick={reset}>Try again</button>
    </div>
  );
}
