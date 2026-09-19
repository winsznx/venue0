import Link from "next/link";
import { Disclosure, LiveChip, Sparkle, Wordmark } from "@/components/brand";
import { HeroCycle } from "@/components/hero-cycle";
import { HowItWorks } from "@/components/how-it-works";
import { campaignHeadline } from "@/lib/campaign";
import { getRound, HERO_ROUND_KEY } from "@/lib/data";
import { ratio } from "@/lib/format";
import styles from "./landing.module.css";

export default function Landing() {
  const round = getRound(HERO_ROUND_KEY);
  if (!round) throw new Error("hero round evidence missing; run pnpm web:data");
  const c = campaignHeadline();
  return (
    <div className={styles.frame}>
      <div className={styles.page}>
        <header className={styles.nav}>
          <Wordmark />
          <nav aria-label="Main" className={styles.links}>
            <a href="#how">How it works</a>
            <a href="#circles">Circles</a>
            <a href="#rails">Rails</a>
            <Link href="/proof">Proof</Link>
          </nav>
          <div className={styles.navActions}>
            <Link href="/proof" className={styles.quietLink}>View live proof</Link>
            <a href="/enter" className="btn btn-primary btn-sm">Enter Venue0</a>
          </div>
        </header>

        <section className={styles.hero} aria-labelledby="hero-title">
          <LiveChip />
          <h1 id="hero-title" className="display h1">
            The market before
            <br />
            the market.
          </h1>
          <p className={`lede ${styles.heroLede}`}>
            Portfolio agents cross complementary Stock Token rebalances with each other before sending only the residual to public liquidity.
          </p>
          <div className={styles.ctas}>
            <a href="/enter" className="btn btn-primary">Enter Venue0</a>
            <Link href="/demo" className="btn btn-secondary">Watch a live round</Link>
          </div>
        </section>

        <section id="problem" className={styles.section} aria-labelledby="problem-title">
          <div className={styles.sectionHead}>
            <div>
              <span className="chip"><Sparkle /> The problem</span>
              <h2 id="problem-title" className="display h2">Every rebalance pays the market alone.</h2>
            </div>
            <p className="lede">When you trim NVDA and someone else is adding NVDA the same afternoon, you both cross the spread, pay fees and move the price against yourselves. Neither of you ever sees the other.</p>
          </div>
          <div className={styles.cards}>
            <article className={styles.card}><p className={styles.cardTitle}>Wallet by wallet</p><p className="muted">Each portfolio sends its own orders to public liquidity, even when another portfolio needs the exact opposite trade.</p></article>
            <article className={styles.card}><p className={styles.cardTitle}>Costs stack up</p><p className="muted">Spread, fees, gas and price impact are paid on every leg of every rebalance, twice when two people trade against the pool in opposite directions.</p></article>
            <article className={styles.card}><p className={styles.cardTitle}>Pairs aren't enough</p><p className="muted">Offsetting trades often form rings: A wants what B has, B wants C's, C wants A's. No two of them match, so a pairwise venue crosses nothing.</p></article>
          </div>
        </section>

        <section className={`${styles.stagePanel} ${styles.stageGap}`} aria-label="Verified three-way cycle on Robinhood Chain">
          <HeroCycle round={round} />
        </section>

        <section id="how" className={styles.section} aria-labelledby="how-title">
          <div className={styles.sectionHead}>
            <div>
              <span className="chip"><Sparkle /> How it works</span>
              <h2 id="how-title" className="display h2">Target, Circle, Cross, Residual.</h2>
            </div>
            <p className="lede">Venue0 looks across portfolios first. Changes that complement each other settle directly between wallets; only what is left reaches an exchange, and only if it's worth paying for.</p>
          </div>
          <HowItWorks round={round} />
        </section>

        <section id="value" className={styles.section} aria-labelledby="value-title">
          <div className={styles.sectionHead}>
            <div>
              <span className="chip"><Sparkle /> What you get</span>
              <h2 id="value-title" className="display h2">Less market, same portfolio.</h2>
            </div>
            <p className="lede">You end up where you wanted to be. The part that crossed never touched a pool.</p>
          </div>
          <div className={styles.cards}>
            <article className={styles.card}><p className={styles.cardTitle}>Fewer external orders</p><p className="muted">Crossed legs settle at the round's snapshot price with no spread and no pool. In the frozen campaign, {ratio(c.fewerOrders, 0)} fewer orders reached the market.</p></article>
            <article className={styles.card}><p className={styles.cardTitle}>Your keys, your signatures</p><p className="muted">You sign your intent and then the exact settlement plan. The contract can move only those amounts, only to those wallets, only until the plan expires.</p></article>
            <article className={styles.card}><p className={styles.cardTitle}>A receipt you can check</p><p className="muted">Every settlement is re-verified from chain data alone: receipt, calldata, logs and balance changes, on a separate RPC.</p></article>
          </div>
        </section>

        <section id="circles" className={styles.section} aria-labelledby="circles-title">
          <div className={styles.split}>
            <div className={styles.splitText}>
              <span className="chip"><Sparkle /> Circles</span>
              <h2 id="circles-title" className="display h2">Cross with people who trade what you trade.</h2>
              <p className="lede">A Circle is a group rebalancing the same Stock Tokens on a schedule. Anyone can start one: public, invite-only or private, daily or on demand, with a minimum number of people per round.</p>
            </div>
            <ul className={styles.facts}>
              <li><span className={styles.factKey}>Rounds</span><span>Collect signed intents, freeze, solve, settle in one transaction</span></li>
              <li><span className={styles.factKey}>Privacy</span><span>You see your own legs. Everyone else is &quot;Member 2&quot;, never an address</span></li>
              <li><span className={styles.factKey}>Invites</span><span>Single-use links; only a hash is stored</span></li>
              <li><span className={styles.factKey}>Leftovers</span><span>Carry into the next round of the same Circle, or trade them</span></li>
            </ul>
          </div>
        </section>

        <section id="agent" className={styles.section} aria-labelledby="agent-title">
          <div className={styles.split}>
            <div className={styles.splitText}>
              <span className="chip"><Sparkle /> Portfolio agent</span>
              <h2 id="agent-title" className="display h2">Say where you want to be.</h2>
              <p className="lede">Type it the way you'd say it. A language model only reads your words into operations; code resolves every ticker against the Robinhood registry and computes every amount from your live balances. Prefer numbers? Set weights directly and the same checks apply.</p>
            </div>
            <div className={styles.agentDemo} aria-label="Example of how an instruction is read">
              <p className={styles.agentSay}>&ldquo;Reduce NVDA to 20% and move the difference into SPY. Don&apos;t pay more than half a percent on leftovers.&rdquo;</p>
              <div className={styles.agentOps}>
                <span className="badge badge-neutral">SET_WEIGHT NVDA 20%</span>
                <span className="badge badge-neutral">remainder → SPY</span>
                <span className="badge badge-neutral">max external cost 50 bps</span>
              </div>
              <p className="faint" style={{ fontSize: 14 }}>Then: registry lookup, live balances, Chainlink prices, hard limits. Nothing the model says becomes an address or an amount.</p>
            </div>
          </div>
        </section>

        <section id="rails" className={styles.section} aria-labelledby="rails-title">
          <div className={styles.sectionHead}>
            <div>
              <span className="chip"><Sparkle /> Built on real market rails</span>
              <h2 id="rails-title" className="display h2">Each rail does one job.</h2>
            </div>
            <p className="lede">Nothing here is simulated. Every rail below ran against Robinhood Chain mainnet during the proof run.</p>
          </div>
          <div className={styles.rails}>
            <article className={styles.rail}><p className={styles.railName}>Robinhood Chain</p><p className={styles.railRole}>Settlement and assets</p><p className="muted">Stock Tokens live here, priced by Chainlink feeds. Venue0&apos;s settlement contract moves every crossed leg in one atomic transaction.</p></article>
            <article className={styles.rail}><p className={styles.railName}>Dynamic</p><p className={styles.railRole}>Wallets and signing</p><p className="muted">Sign in with email and get an embedded wallet, or connect your own. Every intent, approval and transaction is signed in your wallet.</p></article>
            <article className={styles.rail}><p className={styles.railName}>Uniswap</p><p className={styles.railRole}>Market residuals</p><p className="muted">When a leftover is worth trading now, the Trading API quotes and routes it, and the swap is checked against balances after it lands.</p></article>
            <article className={styles.rail}><p className={styles.railName}>Definitive</p><p className={styles.railRole}>Limit and TWAP residuals</p><p className="muted">Flash gives leftovers limit and time-sliced routes. The residual engine compares their all-in cost against Uniswap before choosing.</p></article>
          </div>
        </section>

        <section id="evidence" className={styles.section} aria-labelledby="evidence-title">
          <div className={styles.sectionHead}>
            <div>
              <span className="chip"><Sparkle /> Campaign data</span>
              <h2 id="evidence-title" className="display h2">{c.scenarios} frozen scenarios.</h2>
            </div>
            <p className="lede">Synthetic portfolios, not users. Methodology, seed and inputs were committed before the run; every arm saw identical intents and prices.</p>
          </div>
          <div className={styles.stats}>
            <article className={styles.stat}>
              <p className={styles.statValue}>{ratio(c.fewerOrders, 0)}</p>
              <p className={styles.statLabel}>fewer external orders vs market-only</p>
              <p className={styles.statFoot}><span className="num">{c.marketOrders.toLocaleString()}</span> to <span className="num">{c.crossingOrders.toLocaleString()}</span> orders</p>
            </article>
            <article className={styles.stat}>
              <p className={styles.statValue}>{ratio(c.upliftRelative)}</p>
              <p className={styles.statLabel}>more crossed notional: relative uplift vs optimal bilateral-only matcher</p>
              <p className={styles.statFoot}>+<span className="num">{(c.upliftAbsolutePts * 100).toFixed(1)}</span> points of requested notional in absolute terms</p>
            </article>
            <article className={styles.stat}>
              <p className={styles.statValue}>{ratio(c.crossRate)}</p>
              <p className={styles.statLabel}>requested notional crossed internally overall</p>
              <p className={styles.statFoot}>median scenario <span className="num">{ratio(c.crossRateMedian)}</span></p>
            </article>
            <article className={styles.stat}>
              <p className={styles.statValue}>{c.parityPass} / {c.scenarios}</p>
              <p className={styles.statLabel}>reference matcher parity</p>
              <p className={styles.statFoot}><span className="num">{c.parityFail}</span> disagreements</p>
            </article>
          </div>
          <details className={styles.details}>
            <summary>What these numbers do and don&apos;t say</summary>
            <ul>
              <li>The {ratio(c.upliftRelative)} uplift is relative to what an optimal pairwise matcher crossed. In absolute terms multi-party matching added about {(c.upliftAbsolutePts * 100).toFixed(1)} points of requested notional.</li>
              <li>In the natural and randomized cohorts only, Venue0 crossed {ratio(c.naturalCrossRate)} pooled, with a {ratio(c.naturalUpliftRelative)} relative uplift.</li>
              <li>Constructed-positive cohorts are reported separately and are not presented as typical behaviour.</li>
              <li>Seed <span className="num">{c.seed}</span>.</li>
            </ul>
            <Link href="/proof#campaign" className="link">See methodology</Link>
          </details>
          <div className={styles.ctas} style={{ justifyContent: "flex-start", marginTop: 24 }}>
            <Link href="/proof" className="btn btn-secondary">Open the proof</Link>
            <Link href="/demo" className="btn btn-quiet">Replay a verified round</Link>
          </div>
        </section>

        <section className={styles.final} aria-labelledby="cta-title">
          <h2 id="cta-title" className="display h2">Put your portfolio into Venue0.</h2>
          <p className="lede">Connect a wallet, set a target, join a Circle. Your first round takes a few minutes.</p>
          <div className={styles.ctas}><a href="/enter" className="btn btn-primary">Enter Venue0</a></div>
        </section>

        <footer className={styles.footer}>
          <div className={styles.footerRow}>
            <Wordmark />
            <span className="faint">Powered by Robinhood Chain</span>
          </div>
          <Disclosure />
        </footer>
      </div>
    </div>
  );
}
