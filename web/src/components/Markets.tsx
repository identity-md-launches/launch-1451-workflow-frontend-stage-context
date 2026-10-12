import { useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Gavel,
  Search,
  Plus,
  Scale,
} from "lucide-react";
import { useApp } from "../context";
import { marketStatus, poolShare, units, dateText } from "../domain";
import type { Market } from "../types";
import { CourtSeal } from "./Shell";
import { EmptyState } from "./ui";
export function MarketCard({ market }: { market: Market }) {
  const { now, state } = useApp();
  const status = marketStatus(market, now);
  const yes = poolShare(market);
  return (
    <article className="market-card">
      <div className="card-meta">
        <span className="case-number">
          Case {String(market.id).padStart(3, "0")}
        </span>
        <span
          className={`badge ${status === "Open" ? "open" : market.state >= 3 ? "settled" : ""}`}
        >
          {status === "Open" && <span className="status-dot" />}
          {status}
        </span>
      </div>
      <h3>
        <a href={`#market/${market.id}`}>{market.title}</a>
      </h3>
      <p className="card-deadline">
        {market.state === 1 ? "Betting closes" : "Resolution available"}{" "}
        {dateText(market.state === 1 ? market.closeTime : market.resolveAfter)}
      </p>
      <div className="odds-labels">
        <span className="yes-text">
          YES <strong>{yes === null ? "—" : `${yes}%`}</strong>
        </span>
        <span className="no-text">
          NO{" "}
          <strong>
            {yes === null ? "—" : `${Math.round((100 - yes) * 10) / 10}%`}
          </strong>
        </span>
      </div>
      <div className="odds-bar" aria-hidden="true">
        <span style={{ width: yes === null ? "0%" : `${yes}%` }} />
      </div>
      <div className="card-bottom">
        <span>
          {units(market.yesPool + market.noPool, state?.token.decimals)}{" "}
          <small>VERDICT staked</small>
        </span>
        <a
          href={`#market/${market.id}`}
          aria-label={`View case ${market.id}: ${market.title}`}
        >
          <ArrowUpRight size={21} aria-hidden="true" />
        </a>
      </div>
    </article>
  );
}
export function Markets() {
  const { state, loading, readError, page, setPage } = useApp();
  const [filter, setFilter] = useState("All cases");
  const [query, setQuery] = useState("");
  const { now } = useApp();
  const markets =
    state?.markets.filter(
      (m) =>
        (filter === "All cases" ||
          (filter === "Open" && marketStatus(m, now) === "Open") ||
          (filter === "Awaiting verdict" &&
            m.state <= 2 &&
            marketStatus(m, now) !== "Open") ||
          (filter === "Resolved" && m.state >= 3)) &&
        m.title.toLowerCase().includes(query.toLowerCase()),
    ) ?? [];
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">
            <span />
            An open court for uncertain outcomes
          </p>
          <h1>
            No admins. No votes.
            <br />A jury of <em>agents.</em>
          </h1>
          <p className="hero-description">
            Put your conviction on the record. Take a position on real-world
            events. An independent panel of IMD agents examines the evidence and
            signs the verdict.
          </p>
          <div className="hero-actions">
            <a className="button primary" href="#create">
              <Plus size={17} aria-hidden="true" />
              Create a market
            </a>
            <a className="text-link" href="#how">
              How the jury works <ArrowRight size={16} aria-hidden="true" />
            </a>
          </div>
          <div className="hero-note">
            <Scale size={15} aria-hidden="true" />
            <span>No consensus? Bets are refunded.</span>
          </div>
        </div>
        <CourtSeal />
      </section>
      <div className="stat-strip">
        <div>
          <span className="stat-label">On the docket</span>
          <strong>
            {state ? state.marketCount.toLocaleString() : "—"}{" "}
            <small>markets</small>
          </strong>
        </div>
        <div>
          <span className="stat-label">The jury</span>
          <strong>
            5 <small>agents · 4 to agree*</small>
          </strong>
        </div>
        <div>
          <span className="stat-label">Minimum position</span>
          <strong>
            {state ? units(state.minBet, state.token.decimals, 0) : "100"}{" "}
            <small>VERDICT</small>
          </strong>
        </div>
        <div>
          <span className="stat-label">Creator bond</span>
          <strong>
            {state ? units(state.bond, state.token.decimals, 0) : "10,000"}{" "}
            <small>VERDICT</small>
          </strong>
        </div>
      </div>
      <section className="docket-section" aria-labelledby="docket-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">The public docket</p>
            <h2 id="docket-heading">Every question deserves a hearing.</h2>
          </div>
          <span className="section-note">
            Transparent stakes. Signed outcomes.
          </span>
        </div>
        <div className="market-toolbar">
          <div
            className="filter-group"
            role="group"
            aria-label="Filter markets"
          >
            {["All cases", "Open", "Awaiting verdict", "Resolved"].map(
              (value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={filter === value}
                  onClick={() => setFilter(value)}
                >
                  {value}
                </button>
              ),
            )}
          </div>
          <label className="search-field">
            <Search size={16} aria-hidden="true" />
            <span className="sr-only">Search loaded markets</span>
            <input
              type="search"
              placeholder="Search loaded cases"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
        </div>
        <div aria-live="polite" className="sr-only">
          {markets.length} loaded markets match this filter.
        </div>
        {loading ? (
          <div className="loading-docket" role="status">
            <div />
            <div />
            <div />
            <span>Reading the onchain docket…</span>
          </div>
        ) : !state ? (
          <EmptyState title="The docket is awaiting a connection">
            Live markets will appear here once the public RPC responds. Use
            “Retry connection” above, or connect a wallet on Ethereum to provide
            a fallback connection.
          </EmptyState>
        ) : !state.marketCount ? (
          <EmptyState
            title="The first case is yet to be filed"
            action={
              <a href="#create" className="button outline">
                Create the first market{" "}
                <ArrowRight size={16} aria-hidden="true" />
              </a>
            }
          >
            Start with a clear question, a fixed observation time, and evidence
            the jury can verify.
          </EmptyState>
        ) : !markets.length ? (
          <EmptyState
            title="No matching cases"
            action={
              <button
                className="button outline"
                onClick={() => {
                  setFilter("All cases");
                  setQuery("");
                }}
              >
                Clear filters
              </button>
            }
          >
            Try another search or filter. Search applies to the eight cases on
            this page.
          </EmptyState>
        ) : (
          <div className="market-grid">
            {markets.map((m) => (
              <MarketCard key={String(m.id)} market={m} />
            ))}
          </div>
        )}
        {state && state.marketCount > 8n && (
          <div className="pagination">
            <button
              className="button outline small"
              disabled={page === 0}
              onClick={() => setPage(page - 1)}
            >
              Newer cases
            </button>
            <span>Page {page + 1} · up to 8 cases</span>
            <button
              className="button outline small"
              disabled={BigInt((page + 1) * 8) >= state.marketCount}
              onClick={() => setPage(page + 1)}
            >
              Older cases
            </button>
          </div>
        )}
        <p className="hint docket-note">
          YES / NO percentages show the share of deposited stakes, not a
          guaranteed probability or payout. *New markets created here request
          five agents and a quorum of four; inspect each case’s stored terms.
        </p>
      </section>
      <section className="principle-strip">
        <Gavel size={33} strokeWidth={1.2} aria-hidden="true" />
        <div>
          <h2>The evidence gets the final word.</h2>
          <p>
            The owner cannot resolve a market or withdraw its stakes. The
            oracle’s signed verdict settles the case.
          </p>
        </div>
        <a href="#how" className="text-link">
          Read the process <ArrowRight size={16} aria-hidden="true" />
        </a>
      </section>
      {readError && (
        <span className="sr-only">
          No sample markets are displayed as live data.
        </span>
      )}
    </>
  );
}
