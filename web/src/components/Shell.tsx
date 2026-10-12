import { ArrowUpRight, Landmark, Scale, Radio, RefreshCw } from "lucide-react";
import { useApp } from "../context";
import { AddressView, Notice, WalletControl } from "./ui";
import type { ReactNode } from "react";
export function Shell({
  route,
  children,
}: {
  route: string;
  children: ReactNode;
}) {
  const app = useApp();
  return (
    <>
      <a
        className="skip-link"
        href="#main-content"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById("main-content")?.focus();
        }}
      >
        Skip to content
      </a>
      <div className="top-rule" />
      <header className="site-header wrap">
        <a className="brand" href="#markets" aria-label="The Tribunal home">
          <Scale size={32} strokeWidth={1.3} aria-hidden="true" />
          <span>
            The Tribunal<small>Judged by the swarm</small>
          </span>
        </a>
        <nav aria-label="Main navigation">
          <a
            href="#markets"
            aria-current={
              route === "markets" || route.startsWith("market/")
                ? "page"
                : undefined
            }
          >
            Markets
          </a>
          <a
            href="#trade"
            aria-current={route === "trade" ? "page" : undefined}
          >
            Get VERDICT
          </a>
          <a href="#how" aria-current={route === "how" ? "page" : undefined}>
            How it works
          </a>
        </nav>
        <WalletControl />
      </header>
      <div className="network-bar">
        <div className="wrap network-inner">
          <span>
            <span className={`status-dot ${app.readError ? "offline" : ""}`} />
            {app.runtime?.deployment.network.name ?? "Loading deployment"}
            <span className="network-separator">/</span>Prediction markets
          </span>
          <a href="#protocol">
            Onchain protocol <ArrowUpRight size={13} aria-hidden="true" />
          </a>
        </div>
      </div>
      <main id="main-content" tabIndex={-1} className="wrap">
        {app.configError && (
          <Notice tone="error" title="Deployment could not be verified">
            <p>{app.configError}</p>
            <button
              className="button outline small"
              onClick={() => location.reload()}
            >
              Reload deployment
            </button>
          </Notice>
        )}
        {app.walletError && <Notice tone="error">{app.walletError}</Notice>}
        {app.account && app.walletChain !== app.runtime?.deployment.chainId && (
          <Notice title="Wallet is on a different network">
            <p>
              Switch to {app.runtime?.deployment.network.name} to use Tribunal.
              Contract actions are disabled on other chains.
            </p>
          </Notice>
        )}
        {app.readError && (
          <Notice tone="error" title="Live contract data is unavailable">
            <p>
              {app.readError}{" "}
              {app.state
                ? "The values below are from the last successful read."
                : "Market counts, balances, and odds will appear when a connection succeeds."}
            </p>
            <button
              type="button"
              className="button outline small"
              disabled={app.refreshing}
              onClick={() => void app.refresh()}
            >
              <RefreshCw size={14} aria-hidden="true" />
              {app.refreshing ? "Retrying…" : "Retry connection"}
            </button>
          </Notice>
        )}
        {children}
      </main>
      <footer className="site-footer wrap">
        <div className="footer-top">
          <a className="brand" href="#markets">
            <Scale size={25} aria-hidden="true" />
            <span>The Tribunal</span>
          </a>
          <p>Evidence in. Verdict out.</p>
          <a href="#protocol">
            Inspect the contracts <ArrowUpRight size={14} aria-hidden="true" />
          </a>
        </div>
        <div className="footer-bottom">
          <span>
            <Radio size={13} aria-hidden="true" />
            {app.state
              ? `Read at block ${app.state.block.toLocaleString()} · ${app.readError ? "connection interrupted" : "refreshes every 15s"}`
              : app.readError
                ? "RPC connection unavailable"
                : "Connecting to the public network…"}
            <button
              className="icon-button"
              type="button"
              aria-label="Refresh live data"
              disabled={app.refreshing}
              onClick={() => void app.refresh()}
            >
              <RefreshCw
                size={14}
                className={app.refreshing ? "spin" : ""}
                aria-hidden="true"
              />
            </button>
          </span>
          <span>Onchain on Ethereum · Powered by IMD</span>
        </div>
        <p className="fine-print">
          Positions can lose their full stake. Outcomes depend on the oracle’s
          evidence, signer, and Intake. USD pricing is unavailable; all values
          use token units.
        </p>
      </footer>
    </>
  );
}
export function CourtSeal() {
  return (
    <div className="court-seal" aria-hidden="true">
      <div className="seal-inner">
        <span className="seal-top">Evidence above influence</span>
        <Landmark size={72} strokeWidth={0.75} />
        <div className="seal-stars">✦ &nbsp; ✦ &nbsp; ✦ &nbsp; ✦ &nbsp; ✦</div>
        <span className="seal-bottom">The IMD agent jury</span>
      </div>
      <span className="seal-side">V</span>
    </div>
  );
}
