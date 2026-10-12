import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
  ArrowUpRight,
  Check,
  Copy,
  LoaderCircle,
  X,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { getAddress, type Address } from "viem";
import { useApp, type TxSpec } from "../context";
import { errorText, short } from "../domain";
export function AddressView({
  address,
  label,
  compact = false,
}: {
  address: Address;
  label?: string;
  compact?: boolean;
}) {
  const { runtime } = useApp();
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const checksum = getAddress(address);
  return (
    <span className="address-group">
      <a
        className="address"
        href={`${runtime?.deployment.network.explorer}/address/${checksum}`}
        target="_blank"
        rel="noreferrer"
        title={checksum}
        aria-label={`${label ? label + ": " : ""}${checksum} on Etherscan`}
      >
        <bdi>{compact ? short(checksum) : checksum}</bdi>
        <ArrowUpRight size={14} aria-hidden="true" />
      </a>
      <button
        type="button"
        className="icon-button"
        aria-label={`Copy ${label ?? "address"}`}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(checksum);
            setCopied(true);
            setError("");
          } catch {
            setError("Copy unavailable. Select the full address to copy it.");
          }
        }}
      >
        {copied ? (
          <Check size={14} aria-hidden="true" />
        ) : (
          <Copy size={14} aria-hidden="true" />
        )}
      </button>
      <span className="sr-only" role="status">
        {copied ? "Address copied" : error}
      </span>
    </span>
  );
}
export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: ReactNode;
  error?: string;
  children: (id: string, description: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children(id, id + "-help")}
      <div id={id + "-help"} className={error ? "field-error" : "hint"}>
        {error || hint}
      </div>
    </div>
  );
}
export function Notice({
  children,
  tone = "info",
  title,
}: {
  children: ReactNode;
  tone?: "info" | "error" | "success";
  title?: string;
}) {
  return (
    <div
      className={`notice ${tone}`}
      role={tone === "error" ? "alert" : undefined}
    >
      {title && <strong>{title}</strong>}
      <div>{children}</div>
    </div>
  );
}
export function WalletControl({ compact = false }: { compact?: boolean }) {
  const app = useApp();
  const [selected, setSelected] = useState("");
  if (app.account)
    return (
      <div className="wallet-controls">
        {app.runtime && app.walletChain !== app.runtime.deployment.chainId ? (
          <button
            className="button primary"
            onClick={() => void app.switchChain()}
            disabled={app.connecting}
          >
            {app.connecting && (
              <LoaderCircle className="spin" size={16} aria-hidden="true" />
            )}
            Switch to {app.runtime.deployment.network.name}
          </button>
        ) : (
          <>
            <span className="wallet-account">
              <span className="status-dot" />
              {short(app.account)}
            </span>
            {!compact && (
              <button className="button quiet small" onClick={app.disconnect}>
                Disconnect
              </button>
            )}
          </>
        )}
      </div>
    );
  return (
    <div className="wallet-controls">
      {app.wallets.length > 1 && (
        <label className="wallet-select">
          <span className="sr-only">Choose wallet</span>
          <select
            value={selected || app.wallets[0]?.id}
            onChange={(e) => setSelected(e.target.value)}
          >
            {app.wallets.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <button
        className="button outline"
        onClick={() => void app.connect(selected)}
        disabled={app.connecting}
      >
        <Wallet size={16} aria-hidden="true" />
        {app.connecting ? "Connecting…" : "Connect wallet"}
      </button>
    </div>
  );
}
export function TransactionStatus({ actionKey }: { actionKey: string }) {
  const { statuses, runtime } = useApp();
  const status = statuses[actionKey];
  const text = !status
    ? ""
    : ((
        {
          simulating: "Checking the transaction…",
          signature: "Confirm in your wallet…",
          confirming: "Waiting for onchain confirmation…",
          confirmed: "Transaction confirmed.",
        } as Record<string, string>
      )[status.stage] ?? status.message);
  return (
    <div
      className={`transaction-status ${status?.stage ?? ""}`}
      role={status?.stage === "error" ? "alert" : "status"}
    >
      {status && (
        <>
          <span>{text}</span>
          {status.hash && (
            <a
              href={`${runtime?.deployment.network.explorer}/tx/${status.hash}`}
              target="_blank"
              rel="noreferrer"
            >
              View transaction <ArrowUpRight size={13} aria-hidden="true" />
            </a>
          )}
        </>
      )}
    </div>
  );
}
export function TxAction({
  actionKey,
  label,
  description,
  prepare,
  disabledReason,
  onSuccess,
  primary = true,
  danger = false,
}: {
  actionKey: string;
  label: string;
  description: ReactNode;
  prepare: () => TxSpec | Promise<TxSpec>;
  disabledReason?: string;
  onSuccess?: () => void | Promise<void>;
  primary?: boolean;
  danger?: boolean;
}) {
  const app = useApp();
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [error, setError] = useState("");
  const [preparing, setPreparing] = useState(false);
  const [spec, setSpec] = useState<TxSpec>();
  const [ack, setAck] = useState(false);
  const titleId = useId();
  const localLock = useRef(false);
  const reviewVersion = useRef(0);
  const status = app.statuses[actionKey];
  const pending =
    status && ["simulating", "signature", "confirming"].includes(status.stage);
  const unavailable =
    disabledReason ||
    (!app.ready &&
    app.account &&
    app.walletChain === app.runtime?.deployment.chainId
      ? "Verified, recent onchain state is required. Refresh the connection above."
      : undefined);
  const close = () => {
    dialog.current?.close();
    trigger.current?.focus();
    setAck(false);
  };
  useEffect(() => {
    reviewVersion.current++;
    if (dialog.current?.open) close();
    setSpec(undefined);
  }, [app.account, app.walletChain]); // A review cannot survive an account/network change.
  const open = async () => {
    if (localLock.current || app.busy) return;
    if (!app.account) {
      await app.connect();
      return;
    }
    if (app.walletChain !== app.runtime?.deployment.chainId) {
      await app.switchChain();
      return;
    }
    if (unavailable) return;
    localLock.current = true;
    setPreparing(true);
    setError("");
    const version = reviewVersion.current;
    try {
      const prepared = await prepare();
      if (version !== reviewVersion.current)
        throw Error(
          "The wallet changed while preparing this review. Review the action again.",
        );
      setSpec(prepared);
      dialog.current?.showModal();
    } catch (error) {
      setError(errorText(error));
    } finally {
      localLock.current = false;
      setPreparing(false);
    }
  };
  const buttonLabel = !app.account
    ? "Connect wallet"
    : app.walletChain !== app.runtime?.deployment.chainId
      ? `Switch to ${app.runtime?.deployment.network.name ?? "required network"}`
      : pending
        ? `${label}…`
        : label;
  return (
    <div className="action-block">
      <button
        ref={trigger}
        type="button"
        className={`button ${primary ? "primary" : "outline"} ${danger ? "danger" : ""} full`}
        disabled={
          app.busy ||
          preparing ||
          app.connecting ||
          (!!app.account &&
            app.walletChain === app.runtime?.deployment.chainId &&
            !!unavailable)
        }
        onClick={() => void open()}
      >
        {(pending || preparing) && (
          <LoaderCircle className="spin" size={16} aria-hidden="true" />
        )}
        {preparing && !pending ? "Checking request…" : buttonLabel}
      </button>
      {unavailable && <p className="hint">{unavailable}</p>}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <TransactionStatus actionKey={actionKey} />
      <dialog
        ref={dialog}
        aria-labelledby={titleId}
        className="review-dialog"
        onCancel={() => {
          setAck(false);
          trigger.current?.focus();
        }}
      >
        <div className="dialog-heading">
          <span className="eyebrow">Transaction review</span>
          <button
            type="button"
            className="icon-button"
            aria-label="Close transaction review"
            onClick={close}
          >
            <X aria-hidden="true" />
          </button>
        </div>
        <h2 id={titleId}>{label}</h2>
        <div className="review-content">{description}</div>
        <dl className="review-meta">
          <div>
            <dt>Network</dt>
            <dd>{app.runtime?.deployment.network.name}</dd>
          </div>
          <div>
            <dt>From</dt>
            <dd>
              {app.account && <AddressView address={app.account} compact />}
            </dd>
          </div>
          <div>
            <dt>Contract</dt>
            <dd>{spec && <AddressView address={spec.address} compact />}</dd>
          </div>
          <div>
            <dt>Network fee</dt>
            <dd>ETH · calculated by your wallet</dd>
          </div>
        </dl>
        <p className="hint">
          <ShieldCheck size={15} aria-hidden="true" /> The call is simulated
          before your wallet opens. A successful simulation does not guarantee
          inclusion.
        </p>
        {danger && (
          <label className="check-row">
            <input
              type="checkbox"
              checked={ack}
              onChange={(e) => setAck(e.target.checked)}
            />
            I understand this action cannot be undone.
          </label>
        )}
        <div className="button-row">
          <button type="button" className="button outline" onClick={close}>
            Cancel
          </button>
          <button
            type="button"
            className={`button primary ${danger ? "danger" : ""}`}
            disabled={!spec || app.busy || preparing || (danger && !ack)}
            onClick={async () => {
              if (!spec || localLock.current) return;
              localLock.current = true;
              setPreparing(true);
              close();
              try {
                const freshSpec = await prepare();
                const success = await app.send(actionKey, label, freshSpec);
                if (success) await onSuccess?.();
              } catch (error) {
                setError(errorText(error));
              } finally {
                localLock.current = false;
                setPreparing(false);
              }
            }}
          >
            Confirm {label.toLowerCase()}
          </button>
        </div>
      </dialog>
    </div>
  );
}
export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}
