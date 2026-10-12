import { useEffect, useState } from "react";
import { ArrowLeft, Clock, Gavel } from "lucide-react";
import { hexToString, isHex, zeroHash, type Hex } from "viem";
import { useApp } from "../context";
import { readMarket, tokenInfo } from "../chain";
import {
  amountOf,
  claimEstimate,
  dateText,
  decodeBody,
  eq,
  errorText,
  finalState,
  marketStatus,
  poolShare,
  units,
} from "../domain";
import type { Market, Token } from "../types";
import { AddressView, Field, Notice, TxAction, EmptyState } from "./ui";
import { ApprovalAction } from "./Approval";
export function OracleTerms({
  market,
  full = false,
}: {
  market: Market;
  full?: boolean;
}) {
  const body = decodeBody(market.oracleBody);
  return (
    <div className="oracle-terms">
      <p className="eyebrow">The exact question for the jury</p>
      {body ? (
        <>
          <blockquote dir="auto">{body.question}</blockquote>
          {Object.entries(body.definitions).map(([key, value]) => (
            <p className="definition" key={key}>
              <strong>{key}</strong>
              <span dir="auto">{String(value)}</span>
            </p>
          ))}
          <p className="hint">
            Evidence window:{" "}
            {body.window?.hours
              ? `${body.window.hours} hours at oracle processing time`
              : JSON.stringify(body.window)}
            . The observation definition fixes the event being judged; the
            resolution time alone does not.
          </p>
        </>
      ) : (
        <Notice tone="error">
          The stored oracle body could not be decoded. Betting is disabled;
          inspect the contract directly.
        </Notice>
      )}
      <div className="terms-mini">
        <span>{market.panelSize} agents</span>
        <span>{market.quorum} must agree</span>
        <span>Boolean verdict</span>
      </div>
      {full && (
        <>
          <dl className="terms-list">
            <div>
              <dt>Creator</dt>
              <dd>
                <AddressView address={market.creator} compact />
              </dd>
            </div>
            <div>
              <dt>Stored Intake</dt>
              <dd>
                <AddressView address={market.oracle.intake} compact />
              </dd>
            </div>
            <div>
              <dt>Stored signer</dt>
              <dd>
                <AddressView address={market.signer} compact />
              </dd>
            </div>
            <div>
              <dt>Fee asset</dt>
              <dd>
                <AddressView address={market.oracle.asset} compact />
              </dd>
            </div>
            <div>
              <dt>Oracle action</dt>
              <dd className="mono break">
                {hexToString(market.oracle.action, { size: 32 }).replace(
                  /\0/g,
                  "",
                )}
              </dd>
            </div>
          </dl>
          <details>
            <summary>Inspect the stored oracle JSON</summary>
            <pre>
              {body
                ? JSON.stringify(
                    JSON.parse(hexToString(market.oracleBody)),
                    null,
                    2,
                  )
                : market.oracleBody}
            </pre>
          </details>
        </>
      )}
    </div>
  );
}
export function MarketDetail({ id }: { id: bigint }) {
  const app = useApp();
  const [market, setMarket] = useState<Market>();
  const [error, setError] = useState("");
  const [side, setSide] = useState<"yes" | "no">("yes");
  const [amount, setAmount] = useState("100");
  const [readTerms, setReadTerms] = useState(false);
  const [payment, setPayment] = useState<Token>();
  useEffect(() => {
    let live = true;
    if (!app.client || !app.runtime) return;
    readMarket(app.client, app.runtime, id, app.account)
      .then(async (fresh) => {
        if (live) {
          setMarket(fresh);
          setError("");
        }
        const info = await tokenInfo(app.client!, fresh.oracle.asset);
        if (live) setPayment(info);
      })
      .catch((error) => {
        if (live) setError(errorText(error));
      });
    return () => {
      live = false;
    };
  }, [app.client, app.runtime, id, app.account, app.state?.block]);
  useEffect(() => {
    setReadTerms(false);
  }, [id, side, amount, app.account]);
  useEffect(() => {
    setMarket(undefined);
    setError("");
  }, [id, app.account]);
  if (!market)
    return (
      <>
        <a className="back-link" href="#markets">
          <ArrowLeft size={16} aria-hidden="true" />
          All markets
        </a>
        {error ? (
          <Notice tone="error" title="Unable to load this case">
            {error}
          </Notice>
        ) : (
          <EmptyState title="Opening the case file">
            Reading the original question and current stakes from Tribunal.
          </EmptyState>
        )}
      </>
    );
  const { state, runtime, now } = app;
  const status = marketStatus(market, now);
  let amountValue = 0n;
  let amountError = "";
  try {
    amountValue = amountOf(amount, state?.token.decimals ?? 18);
    if (state && amountValue < state.minBet)
      amountError = `Minimum ${units(state.minBet, state.token.decimals)} VERDICT.`;
  } catch (error) {
    amountError = errorText(error);
  }
  const canBet = market.state === 1 && now < Number(market.closeTime);
  const yes = poolShare(market);
  const position = market.position ?? { yes: 0n, no: 0n, claimed: false };
  const participant =
    !!app.account &&
    (position.yes > 0n || position.no > 0n || eq(app.account, market.creator));
  const estimate =
    app.account && state
      ? claimEstimate(market, position, app.account, state.bond)
      : { payout: 0n, refund: 0n };
  const betReason = !canBet
    ? "Betting is closed for this case."
    : !decodeBody(market.oracleBody)
      ? "The oracle terms could not be decoded."
      : error ||
        amountError ||
        (!readTerms
          ? "Read the question and acknowledge the terms below."
          : state?.balance !== undefined && amountValue > state.balance
            ? "Insufficient VERDICT balance. Get VERDICT before betting."
            : undefined);
  return (
    <section className="page-section">
      <a className="back-link" href="#markets">
        <ArrowLeft size={16} aria-hidden="true" />
        All markets
      </a>
      <div className="case-heading">
        <p className="eyebrow">
          Case {String(id).padStart(3, "0")} · The public record
        </p>
        <span className={`badge ${canBet ? "open" : ""}`}>{status}</span>
        <h1>{market.title}</h1>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="detail-grid">
        <div className="case-file">
          <section className="panel">
            <OracleTerms market={market} full />
            <Notice>
              Check the stored Intake, signer, question, and evidence before
              betting. Existing markets retain these dependencies even after
              owner configuration changes.
            </Notice>
          </section>
          <section className="panel">
            <h2>The timeline</h2>
            <ol className="timeline">
              <li>
                <span className="timeline-marker">1</span>
                <div>
                  <strong>Betting closes</strong>
                  <p>{dateText(market.closeTime)}</p>
                </div>
              </li>
              <li>
                <span className="timeline-marker">2</span>
                <div>
                  <strong>Jury can be summoned</strong>
                  <p>{dateText(market.resolveAfter)}</p>
                </div>
              </li>
              <li>
                <span className="timeline-marker">3</span>
                <div>
                  <strong>
                    {market.state === 2
                      ? "Answer deadline"
                      : "Current timeout deadline"}
                  </strong>
                  <p>{dateText(market.deadline)}</p>
                  <p className="hint">
                    An accepted two-sided request starts a new seven-day answer
                    deadline. A timeout requires a transaction to void the case.
                  </p>
                </div>
              </li>
            </ol>
            {market.requestedAt > 0n && (
              <div className="hint break">
                Intake request ID: <code>{market.requestId}</code>
              </div>
            )}
            {market.failureReason !== zeroHash && (
              <p className="hint break">
                Void reason:{" "}
                {(() => {
                  try {
                    return hexToString(market.failureReason).replace(/\0/g, "");
                  } catch {
                    return market.failureReason;
                  }
                })()}
              </p>
            )}
          </section>
          <AttestationForm market={market} />
        </div>
        <aside className="position-panel">
          <section className="panel bet-panel">
            <p className="eyebrow">Take a position</p>
            <h2>Put conviction at stake.</h2>
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
            <div className="odds-bar">
              <span style={{ width: `${yes ?? 0}%` }} />
            </div>
            <p className="hint">
              {units(market.yesPool + market.noPool, state?.token.decimals)}{" "}
              VERDICT staked. Percentages reflect stakes, not probabilities.
            </p>
            <div className="side-selector" role="group" aria-label="Bet side">
              <button
                type="button"
                className="yes-choice"
                aria-pressed={side === "yes"}
                onClick={() => setSide("yes")}
              >
                Bet YES
              </button>
              <button
                type="button"
                className="no-choice"
                aria-pressed={side === "no"}
                onClick={() => setSide("no")}
              >
                Bet NO
              </button>
            </div>
            <Field
              label="Stake in VERDICT"
              error={amount && amountError ? amountError : undefined}
              hint={
                state?.balance !== undefined
                  ? `Available: ${units(state.balance, state.token.decimals)} VERDICT`
                  : "Minimum 100 VERDICT per bet."
              }
            >
              {(inputId, desc) => (
                <input
                  id={inputId}
                  aria-describedby={desc}
                  aria-invalid={!!amountError}
                  inputMode="decimal"
                  autoComplete="off"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              )}
            </Field>
            <label className="check-row">
              <input
                type="checkbox"
                checked={readTerms}
                onChange={(e) => setReadTerms(e.target.checked)}
              />
              I have read the exact oracle question, observation time, and
              stored trust dependencies.
            </label>
            {state && runtime ? (
              <ApprovalAction
                actionKey={`bet-${id}-${side}`}
                label={`Place ${side.toUpperCase()} bet`}
                needs={[
                  {
                    token: state.token,
                    spender: runtime.contracts.Tribunal.address,
                    amount: amountValue,
                    name: "Tribunal",
                  },
                ]}
                disabledReason={betReason}
                description={
                  <>
                    <p>
                      Deposit{" "}
                      <strong>
                        {units(
                          amountValue,
                          state.token.decimals,
                          state.token.decimals,
                        )}{" "}
                        VERDICT
                      </strong>{" "}
                      on <strong>{side.toUpperCase()}</strong> for “
                      {market.title}”. Bets cannot be withdrawn early. You may
                      lose the full stake.
                    </p>
                    <OracleTerms market={market} />
                    <p className="hint">
                      The losing pool pays a 2% settlement charge, split equally
                      between the creator and burn sink. Payouts change as
                      others bet.
                    </p>
                  </>
                }
                prepare={() => ({
                  ...runtime.contracts.Tribunal,
                  functionName: side === "yes" ? "betYes" : "betNo",
                  args: [id, amountValue],
                })}
              />
            ) : (
              <p className="hint">
                Verified contract state is required to bet.
              </p>
            )}
            <a href="#trade" className="text-link">
              Get VERDICT{" "}
              <ArrowLeft className="rotate" size={14} aria-hidden="true" />
            </a>
          </section>
          <section className="panel">
            <h2>Bring the case to a verdict.</h2>
            <p className="hint">
              Anyone can summon the jury after the resolution time. Empty or
              one-sided cases are voided with full deposit refunds; the jury fee
              remains unspent.
            </p>
            {runtime && (
              <>
                <TxAction
                  actionKey={`resolve-${id}`}
                  label="Summon the jury"
                  primary={false}
                  disabledReason={
                    error ||
                    (market.state !== 1
                      ? "The jury can only be summoned once for an open case."
                      : now < Number(market.resolveAfter)
                        ? `Available ${dateText(market.resolveAfter)}.`
                        : now >= Number(market.deadline)
                          ? "The request deadline has passed. Void the case below."
                          : undefined)
                  }
                  description={
                    <>
                      <p>
                        Request the verdict for “{market.title}”.{" "}
                        {market.yesPool && market.noPool
                          ? "The contract spends the creator’s escrowed jury fee. You pay the ETH transaction fee."
                          : "This one-sided or empty market will become VOID. No jury fee is spent."}
                      </p>
                      <p>
                        The requested verdict must arrive within seven days, or
                        anyone can void the case.
                      </p>
                    </>
                  }
                  prepare={() => ({
                    ...runtime.contracts.Tribunal,
                    functionName: "requestResolution",
                    args: [id],
                  })}
                />
                <TxAction
                  actionKey={`void-${id}`}
                  label="Void timed-out market"
                  primary={false}
                  disabledReason={
                    error ||
                    (![1, 2].includes(market.state)
                      ? "Only an unresolved case can time out."
                      : now < Number(market.deadline)
                        ? `Available ${dateText(market.deadline)}.`
                        : undefined)
                  }
                  description={
                    <p>
                      Mark “{market.title}” VOID after its deadline. Bettors and
                      the creator can then claim their deposits. A jury fee
                      already spent cannot be refunded.
                    </p>
                  }
                  prepare={() => ({
                    ...runtime.contracts.Tribunal,
                    functionName: "voidMarket",
                    args: [id],
                  })}
                />
              </>
            )}
          </section>
          <section className="panel">
            <h2>Your position</h2>
            {app.account ? (
              <>
                <dl className="terms-list">
                  <div>
                    <dt>YES stakes</dt>
                    <dd>
                      {units(position.yes, state?.token.decimals)} VERDICT
                    </dd>
                  </div>
                  <div>
                    <dt>NO stakes</dt>
                    <dd>{units(position.no, state?.token.decimals)} VERDICT</dd>
                  </div>
                  <div>
                    <dt>Claim status</dt>
                    <dd>
                      {position.claimed
                        ? "Claimed"
                        : finalState(market)
                          ? "Finalized"
                          : "Awaiting verdict"}
                    </dd>
                  </div>
                  {finalState(market) && !position.claimed && participant && (
                    <>
                      <div>
                        <dt>Estimated claim</dt>
                        <dd>
                          {units(estimate.payout, state?.token.decimals)}{" "}
                          VERDICT
                        </dd>
                      </div>
                      {estimate.refund > 0n && (
                        <div>
                          <dt>Unspent jury fee refund</dt>
                          <dd>
                            {payment
                              ? `${units(estimate.refund, payment.decimals)} ${payment.symbol}`
                              : "Reading fee asset…"}
                          </dd>
                        </div>
                      )}
                    </>
                  )}
                </dl>
                {runtime && (
                  <TxAction
                    actionKey={`claim-${id}`}
                    label="Claim payout or refund"
                    disabledReason={
                      error ||
                      (!finalState(market)
                        ? "Claims open after a final verdict or VOID."
                        : position.claimed
                          ? "This wallet has already claimed."
                          : !participant
                            ? "This wallet has no position or creator bond here."
                            : undefined)
                    }
                    description={
                      <>
                        <p>
                          Claim your final entitlement for “{market.title}”.
                          Estimated amount:{" "}
                          <strong>
                            {units(
                              estimate.payout,
                              state?.token.decimals,
                              state?.token.decimals,
                            )}{" "}
                            VERDICT
                          </strong>
                          {estimate.refund > 0n && payment
                            ? ` plus ${units(estimate.refund, payment.decimals)} ${payment.symbol} in unspent jury fees`
                            : ""}
                          .
                        </p>
                        <p>
                          Any creator bond and fee share are included. Each
                          wallet can claim once; a losing position may pay zero.
                          Final minor-unit rounding is determined onchain.
                        </p>
                      </>
                    }
                    prepare={() => ({
                      ...runtime.contracts.Tribunal,
                      functionName: "claim",
                      args: [id],
                    })}
                  />
                )}
              </>
            ) : (
              <p className="hint">
                Connect your wallet to see stakes and claim eligibility.
              </p>
            )}
          </section>
        </aside>
      </div>
    </section>
  );
}
function AttestationForm({ market }: { market: Market }) {
  const { runtime, client, now } = useApp();
  const [payload, setPayload] = useState("");
  const [signature, setSignature] = useState("");
  if (!runtime) return null;
  return (
    <details className="panel advanced">
      <summary>
        <Gavel size={17} aria-hidden="true" />
        Retry a delivered attestation
      </summary>
      <p>
        For a deferred callback only. Paste the exact 15-field attestation and
        signature from the oracle’s callback transaction. A new or unrelated
        signature cannot settle this case. No signature is requested from your
        wallet.
      </p>
      <Field
        label="Attestation JSON"
        hint="Use the canonical object: requestId, chainId, questionHash, answerType, answer, figure, fromBlock, toBlock, blockHash, panelJobId, panelSize, quorum, agreed, issuedAt, expiresAt. Encode large integers as decimal strings."
      >
        {(id, desc) => (
          <textarea
            id={id}
            aria-describedby={desc}
            value={payload}
            onChange={(e) => setPayload(e.target.value)}
            rows={7}
            spellCheck={false}
          />
        )}
      </Field>
      <Field
        label="Oracle signature"
        hint="Paste the delivered signature as 0x-prefixed bytes."
      >
        {(id, desc) => (
          <textarea
            id={id}
            aria-describedby={desc}
            value={signature}
            onChange={(e) => setSignature(e.target.value.trim())}
            rows={2}
            spellCheck={false}
          />
        )}
      </Field>
      <TxAction
        actionKey={`attestation-${market.id}`}
        label="Submit bound attestation"
        primary={false}
        disabledReason={
          market.state !== 2 || market.boundDigest === zeroHash
            ? "No deferred, bound attestation is available for this market."
            : now >= Number(market.deadline)
              ? "The answer deadline has passed; use the timeout path."
              : undefined
        }
        description={
          <>
            <p>
              Retry verification of the already-bound oracle payload for case{" "}
              {String(market.id)}. The contract checks the signer, quorum,
              answer, expiry and replay protection.
            </p>
            <p className="hint break">Required digest: {market.boundDigest}</p>
          </>
        }
        prepare={async () => {
          if (!client) throw Error("Connect to the network first.");
          let data: Record<string, string | number>;
          try {
            data = JSON.parse(payload);
          } catch {
            throw Error("Enter a valid JSON attestation object.");
          }
          if (!data || Array.isArray(data) || typeof data !== "object")
            throw Error("Enter an attestation object.");
          const fields = [
            "requestId",
            "chainId",
            "questionHash",
            "answerType",
            "answer",
            "figure",
            "fromBlock",
            "toBlock",
            "blockHash",
            "panelJobId",
            "panelSize",
            "quorum",
            "agreed",
            "issuedAt",
            "expiresAt",
          ];
          if (
            fields.some((field) => data[field] === undefined) ||
            Object.keys(data).some((field) => !fields.includes(field))
          )
            throw Error("Supply exactly the 15 canonical attestation fields.");
          const parsed = Object.fromEntries(
            fields.map((field) => {
              if (
                [
                  "requestId",
                  "questionHash",
                  "answer",
                  "blockHash",
                  "panelJobId",
                ].includes(field)
              ) {
                if (
                  !isHex(data[field]) ||
                  (data[field] as string).length !== 66
                )
                  throw Error(`${field} must be 32-byte hexadecimal data.`);
                return [field, data[field]];
              }
              if (
                !/^\d+$/.test(String(data[field])) ||
                (typeof data[field] === "number" &&
                  !Number.isSafeInteger(data[field]))
              )
                throw Error(
                  `${field} must be a nonnegative integer; use strings for large values.`,
                );
              return [
                field,
                ["answerType", "panelSize", "quorum", "agreed"].includes(field)
                  ? Number(data[field])
                  : BigInt(data[field]),
              ];
            }),
          );
          if (
            !isHex(signature) ||
            signature.length <= 2 ||
            signature.length % 2 !== 0
          )
            throw Error("Enter a nonempty, even-length hex signature.");
          const digest = await client.readContract({
            ...runtime.contracts.Tribunal,
            functionName: "attestationDigest",
            args: [parsed],
          });
          if (digest !== market.boundDigest)
            throw Error(
              "The attestation digest is different from the one bound by the Intake callback.",
            );
          return {
            ...runtime.contracts.Tribunal,
            functionName: "submitAttestation",
            args: [market.id, parsed, signature as Hex],
          };
        }}
      />
    </details>
  );
}
