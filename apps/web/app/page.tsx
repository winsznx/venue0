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
            <a href="#evidence">Evidence</a>
            <Link href="/proof">Proof</Link>
          </nav>
          <div className={styles.navActions}>
            <Link href="/proof" className={styles.quietLink}>View live proof</Link>
            <Link href="/app" className="btn btn-primary btn-sm">Enter Venue0</Link>
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
            <Link href="/app" className="btn btn-primary">Enter Venue0</Link>
            <Link href="/proof" className="btn btn-secondary">View live proof</Link>
          </div>
        </section>

        <section className={styles.stagePanel} aria-label="Verified three-way cycle on Robinhood Chain">
          <HeroCycle round={round} />
        </section>

        <section id="how" className={styles.section} aria-labelledby="how-title">
          <div className={styles.sectionHead}>
            <div>
              <span className="chip"><Sparkle /> How it works</span>
              <h2 id="how-title" className="display h2">
                Most portfolio rebalances reach the market wallet by wallet.
              </h2>
            </div>
            <p className="lede">Venue0 looks across portfolios first. Changes that complement each other settle directly between wallets; only what is left reaches an exchange.</p>
          </div>
          <HowItWorks round={round} />
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
