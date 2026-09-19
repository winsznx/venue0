/** Every demo page says what it is: a replay of committed evidence, separate from any real account. */
export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="guide" role="note">
        <p><strong style={{ color: "#fff", fontWeight: 500 }}>Demo replay.</strong> A verified three-wallet round from Venue0's live proof run on Robinhood Chain, replayed from committed evidence. These are test wallets, not your account.</p>
        <a href="/enter" className="btn btn-sm">Use Venue0 with your wallet</a>
      </div>
      {children}
    </>
  );
}
