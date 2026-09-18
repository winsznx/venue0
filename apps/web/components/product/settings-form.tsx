"use client";

import { useDynamicContext, useWalletDelegation } from "@dynamic-labs/sdk-react-core";
import { useState, useTransition } from "react";
import { api } from "@/lib/json";
import { addressUrl } from "@/lib/format";
import type { AgentMode, ResidualPreference, User } from "@/lib/server/users";
import p from "./product.module.css";

const PREF_WORDS: Record<ResidualPreference, string> = { ECONOMIC: "Follow Venue0's cost-based suggestion", CARRY_FORWARD: "Always carry leftovers forward", ASK_ME: "Always ask me" };

export function SettingsForm({ user, agentAvailable, settlementContract }: { user: User; agentAvailable: boolean; settlementContract: string | null }) {
  const { primaryWallet, handleLogOut } = useDynamicContext();
  const delegation = useWalletDelegation();
  const [agentMode, setAgentMode] = useState<AgentMode>(user.agentMode);
  const [pref, setPref] = useState<ResidualPreference>(user.residualPreference);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const statuses = delegation.getWalletsDelegatedStatus();
  const mine = statuses.find((w) => w.address.toLowerCase() === user.address.toLowerCase());

  const save = () => start(async () => {
    setError(null);
    try {
      await api("/api/me/settings", { body: { agentMode, residualPreference: pref } });
      setSaved(true);
    } catch (e) {
      setError((e as Error).message);
    }
  });

  return (
    <div className={p.split}>
      <div className={p.stack}>
        <section className={p.panel} aria-labelledby="wallet-title">
          <h2 id="wallet-title" className="h3">Wallet</h2>
          <dl className="kv">
            <div><dt>Address</dt><dd><a className="link" href={addressUrl(user.address)} target="_blank" rel="noreferrer">{user.address.slice(0, 10)}…{user.address.slice(-6)} ↗</a></dd></div>
            <div><dt>Kind</dt><dd>{primaryWallet?.connector?.name ?? user.walletKind ?? "unknown"}</dd></div>
            <div><dt>Network</dt><dd>Robinhood Chain · 4663</dd></div>
            {user.email && <div><dt>Email</dt><dd>{user.email}</dd></div>}
            {settlementContract && <div><dt>Settlement contract</dt><dd><a className="link" href={addressUrl(settlementContract)} target="_blank" rel="noreferrer">{settlementContract.slice(0, 10)}… ↗</a></dd></div>}
          </dl>
          <div className={p.actions}><button type="button" className="btn btn-secondary btn-sm" onClick={() => void handleLogOut()}>Disconnect wallet</button></div>
        </section>

        <section className={p.panel} aria-labelledby="pref-title">
          <h2 id="pref-title" className="h3">Preferences</h2>
          <label className={p.field}>How you set targets
            <select value={agentMode} onChange={(e) => { setAgentMode(e.target.value as AgentMode); setSaved(false); }}>
              <option value="NATURAL_LANGUAGE">Describe it in words{agentAvailable ? "" : " (agent not configured on this server)"}</option>
              <option value="STRUCTURED">Set weights directly</option>
            </select>
          </label>
          <label className={p.field}>Leftovers after a round
            <select value={pref} onChange={(e) => { setPref(e.target.value as ResidualPreference); setSaved(false); }}>
              {(Object.keys(PREF_WORDS) as ResidualPreference[]).map((k) => <option key={k} value={k}>{PREF_WORDS[k]}</option>)}
            </select>
          </label>
          <p className="faint" style={{ fontSize: 13 }}>Whatever you pick, leftover trades still need your wallet signature. Venue0 never trades for you.</p>
          {error && <p className={p.error} role="alert">{error}</p>}
          <div className={p.actions}><button type="button" className="btn btn-primary btn-sm" disabled={pending} onClick={save}>Save preferences</button>{saved && <span className="badge badge-verified">Saved</span>}</div>
        </section>
      </div>

      <section className={p.soft} aria-labelledby="del-title">
        <h2 id="del-title" className="h3">Delegated access</h2>
        <dl className="kv">
          <div><dt>Enabled for this environment</dt><dd>{delegation.delegatedAccessEnabled ? "Yes" : "No"}</dd></div>
          <div><dt>This wallet</dt><dd>{mine ? mine.status : primaryWallet?.connector?.isEmbeddedWallet ? "not delegated" : "external wallet, not eligible"}</dd></div>
        </dl>
        <p className="muted" style={{ fontSize: 14 }}>Delegation would let a Venue0 agent sign rounds for you within limits you set. It isn't offered yet: it needs Dynamic's delegated-access feature enabled for this environment and a public webhook to receive the encrypted key share, and Venue0 doesn't run an agent that signs for users. Every step today is signed by you.</p>
      </section>
    </div>
  );
}
