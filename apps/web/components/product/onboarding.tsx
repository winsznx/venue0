"use client";

import { useDynamicContext } from "@dynamic-labs/sdk-react-core";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Wordmark } from "@/components/brand";
import { useVenueSession } from "@/components/wallet/provider";
import { api } from "@/lib/json";
import { usd } from "@/lib/format";
import type { PortfolioResult } from "@/lib/server/portfolio";
import type { SavedTarget } from "@/lib/server/users";
import styles from "./onboarding.module.css";
import p from "./product.module.css";
import { TargetEditor } from "./target-editor";

const STEPS = ["Welcome", "Wallet", "Portfolio", "Target", "Ready"] as const;
type Step = (typeof STEPS)[number];

export function Onboarding({ agentAvailable, walletConfigured }: { agentAvailable: boolean; walletConfigured: boolean }) {
  const [step, setStep] = useState<Step>("Welcome");
  return (
    <div className={styles.frame}>
      <div className={styles.page}>
        <header className={styles.top}>
          <Wordmark />
          <ol className={p.steps} aria-label="Onboarding progress">
            {STEPS.map((s, i) => {
              const at = STEPS.indexOf(step);
              return <li key={s} className={`${p.step} ${i === at ? p.stepOn : i < at ? p.stepDone : ""}`} aria-current={i === at ? "step" : undefined}>{s}</li>;
            })}
          </ol>
        </header>
        <div className={styles.body}>
          <div className={styles.card}>
            {step === "Welcome" && <Welcome onNext={() => setStep("Wallet")} />}
            {step === "Wallet" && <Wallet configured={walletConfigured} onNext={() => setStep("Portfolio")} />}
            {step === "Portfolio" && <Discover onNext={() => setStep("Target")} onSkip={() => setStep("Ready")} />}
            {step === "Target" && <Target agentAvailable={agentAvailable} onNext={() => setStep("Ready")} />}
            {step === "Ready" && <Ready agentAvailable={agentAvailable} />}
          </div>
        </div>
      </div>
    </div>
  );
}

function Welcome({ onNext }: { onNext: () => void }) {
  return (
    <>
      <span className="chip">Welcome to Venue0</span>
      <h1>Rebalance with other portfolios before you touch the market.</h1>
      <p className="lede">You set where you want your Stock Token portfolio to be. Venue0 finds other people who need the opposite trade, settles the overlap wallet to wallet on Robinhood Chain, and only sends what's left to public liquidity.</p>
      <ol className={styles.points}>
        {["Connect or create a wallet. Your keys stay with you.", "Venue0 reads the Stock Tokens it holds.", "Say where you want to be, in words or weights.", "Join a Circle and cross with its next round."].map((t, i) => (
          <li key={t} className={styles.point}><span className={styles.pointNum}>{i + 1}</span><span style={{ paddingTop: 6 }}>{t}</span></li>
        ))}
      </ol>
      <div className={p.actions}><button type="button" className="btn btn-primary" onClick={onNext}>Get started</button><Link href="/" className="btn btn-quiet">Back to site</Link></div>
    </>
  );
}

function Wallet({ configured, onNext }: { configured: boolean; onNext: () => void }) {
  const { setShowAuthFlow, primaryWallet, sdkHasLoaded, user } = useDynamicContext();
  const session = useVenueSession();
  const ready = Boolean(session.address && primaryWallet && session.address.toLowerCase() === primaryWallet.address.toLowerCase());
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (sdkHasLoaded) return;
    const id = window.setTimeout(() => setSlow(true), 15_000);
    return () => window.clearTimeout(id);
  }, [sdkHasLoaded]);
  return (
    <>
      <h1>Connect a wallet.</h1>
      <p className="lede">Sign in with email to get a wallet created for you, or connect one you already use. Venue0 never holds your keys. Every trade is something you sign.</p>
      {!configured && <p className={p.error}>Wallet sign-in is not configured on this server.</p>}
      {ready ? (
        <div className={p.ok}>Signed in as <span className="num">{session.address}</span> on Robinhood Chain.</div>
      ) : user && !primaryWallet ? (
        <p className={p.note}>You're signed in but no EVM wallet is attached yet. Open the wallet menu to create or connect one.</p>
      ) : session.syncing ? (
        <p className="muted">Verifying your wallet…</p>
      ) : null}
      {session.error && <p className={p.error} role="alert">{session.error}</p>}
      {slow && !sdkHasLoaded && <p className={p.error} role="alert">The wallet sign-in service (Dynamic) isn't responding. Check your connection or try again in a few minutes; nothing has been created yet.</p>}
      <div className={p.actions}>
        {!ready && <button type="button" className="btn btn-primary" disabled={!configured || !sdkHasLoaded} onClick={() => setShowAuthFlow(true)}>{sdkHasLoaded ? "Sign in or create a wallet" : "Loading wallet…"}</button>}
        {ready && <button type="button" className="btn btn-primary" onClick={onNext}>Continue</button>}
      </div>
    </>
  );
}

function Discover({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  const [result, setResult] = useState<PortfolioResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const load = () =>
    start(async () => {
      setError(null);
      try {
        setResult(await api<PortfolioResult>("/api/me/portfolio"));
      } catch (e) {
        setError((e as Error).message);
      }
    });
  useEffect(load, []);

  return (
    <>
      <h1>Your portfolio.</h1>
      <p className="lede">Read live from Robinhood Chain: every canonical Stock Token this wallet holds, valued at its Chainlink price.</p>
      {pending && !result && <p className="muted">Reading balances…</p>}
      {error && <p className={p.error} role="alert">{error}</p>}
      {result && !result.ok && <p className={p.error}>Couldn't read this wallet: {result.detail}</p>}
      {result?.ok && result.positions.length === 0 && (
        <div className={p.empty}>
          <h3>No Stock Tokens in this wallet yet</h3>
          <p className="muted">Venue0 rebalances Stock Tokens you already hold, so there's nothing to cross from <span className="num">{result.address.slice(0, 10)}…</span> yet. Move some Stock Tokens to this address on Robinhood Chain, then check again. You can also finish setup and come back.</p>
          <div className={p.actions}><button type="button" className="btn btn-secondary btn-sm" onClick={load} disabled={pending}>Check again</button><button type="button" className="btn btn-quiet btn-sm" onClick={onSkip}>Finish setup without a target</button></div>
        </div>
      )}
      {result?.ok && result.positions.length > 0 && (
        <>
          <p className={p.big}>{usd(result.totalUsd)}</p>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Asset</th><th className="r">Value</th><th className="r">Weight</th></tr></thead>
              <tbody>{result.positions.map((x) => <tr key={x.uid}><td>{x.symbol} <span className="faint" style={{ fontSize: 13 }}>{x.name.replace(" • Robinhood Token", "")}</span></td><td className="r num">{usd(x.valueUsd)}</td><td className="r num">{((x.valueUsd / result.totalUsd) * 100).toFixed(1)}%</td></tr>)}</tbody>
            </table>
          </div>
          <div className={p.actions}><button type="button" className="btn btn-primary" onClick={onNext}>Set my target</button></div>
        </>
      )}
    </>
  );
}

function Target({ agentAvailable, onNext }: { agentAvailable: boolean; onNext: () => void }) {
  const [data, setData] = useState<{ portfolio: PortfolioResult; target: SavedTarget | null } | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    void Promise.all([api<PortfolioResult>("/api/me/portfolio"), api<{ target: SavedTarget | null }>("/api/me/target")]).then(([portfolio, t]) => setData({ portfolio, target: t.target }));
  }, []);
  return (
    <>
      <h1>Where do you want to be?</h1>
      <p className="lede">Describe it in plain words or set weights directly. Venue0 checks the target against your live balances before anything is saved.</p>
      {!data && <p className="muted">Loading your portfolio…</p>}
      {data?.portfolio.ok && <TargetEditor positions={data.portfolio.positions} totalUsd={data.portfolio.totalUsd} saved={data.target} agentAvailable={agentAvailable} defaultMode="NATURAL_LANGUAGE" onSaved={() => setSaved(true)} />}
      <div className={p.actions}>
        <button type="button" className="btn btn-primary" disabled={!saved && !data?.target} onClick={onNext}>Continue</button>
        <button type="button" className="btn btn-quiet" onClick={onNext}>Skip for now</button>
      </div>
    </>
  );
}

function Ready({ agentAvailable }: { agentAvailable: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  useEffect(() => {
    api("/api/me/onboarding", { body: { agentMode: agentAvailable ? "NATURAL_LANGUAGE" : "STRUCTURED" } }).then(() => setDone(true), (e: Error) => setError(e.message));
  }, [agentAvailable]);
  return (
    <>
      <h1>You're ready.</h1>
      <p className="lede">Crossing happens in Circles: groups whose members rebalance the same Stock Tokens on a schedule. Join one, or start your own and invite people.</p>
      {error && <p className={p.error} role="alert">{error}</p>}
      <div className={p.actions}>
        <button type="button" className="btn btn-primary" disabled={!done} onClick={() => router.push("/circles")}>Find a Circle</button>
        <button type="button" className="btn btn-secondary" disabled={!done} onClick={() => router.push("/circles/new")}>Create a Circle</button>
        <button type="button" className="btn btn-quiet" disabled={!done} onClick={() => router.push("/app")}>Go to my home</button>
      </div>
    </>
  );
}
