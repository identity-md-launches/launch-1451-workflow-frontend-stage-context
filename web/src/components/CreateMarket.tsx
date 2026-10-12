import { useState } from "react";
import { ArrowLeft, FileText, Scale, Clock } from "lucide-react";
import { stringToHex, zeroAddress } from "viem";
import { useApp } from "../context";
import { intakeAbi } from "../config";
import {
  buildMarket,
  dateText,
  eq,
  errorText,
  units,
  type CreateFields,
} from "../domain";
import { ApprovalAction } from "./Approval";
import { Field, Notice } from "./ui";
export function CreateMarket() {
  const app = useApp();
  const [fields, setFields] = useState<CreateFields>({
    title: "",
    question: "",
    observation: "",
    evidence: "",
    definitions: "",
    close: "",
    resolve: "",
  });
  const [reviewed, setReviewed] = useState(false);
  const [formError, setFormError] = useState("");
  const [draft, setDraft] = useState<ReturnType<typeof buildMarket>>();
  const set = (key: keyof CreateFields, value: string) => {
    setFields((old) => ({ ...old, [key]: value }));
    setDraft(undefined);
    setReviewed(false);
    setFormError("");
  };
  const { state, runtime, client } = app;
  const setupMissing = state && eq(state.verdictToken, zeroAddress);
  const reason = setupMissing
    ? "The owner must lock the deployed VERDICT token in Protocol setup before markets can be created."
    : !draft || !reviewed
      ? "Build and review the request below before continuing."
      : state?.balance !== undefined && state.balance < state.bond
        ? "You need the full creator bond in VERDICT."
        : state?.paymentBalance !== undefined &&
            state.paymentBalance < state.oracle.price
          ? `You need ${units(state.oracle.price, state.payment.decimals)} ${state.payment.symbol} for the jury fee.`
          : undefined;
  return (
    <section className="page-section">
      <a className="back-link" href="#markets">
        <ArrowLeft size={16} aria-hidden="true" />
        All markets
      </a>
      <div className="page-heading">
        <p className="eyebrow">File a new case</p>
        <h1>
          Ask a question.
          <br />
          <em>Put it on the record.</em>
        </h1>
        <p>
          A good case has one clear answer, a fixed moment of observation, and
          public evidence.
        </p>
      </div>
      {setupMissing && (
        <Notice title="Market creation is not configured yet">
          The deployed token has not been locked in Tribunal. The connected
          owner can complete the one-time step in{" "}
          <a href="#protocol">Protocol setup</a>.
        </Notice>
      )}
      {state &&
        (state.configActivateAfter > 0n || state.signerActivateAfter > 0n) && (
          <Notice title="A protocol change is scheduled">
            Review the pending settings in{" "}
            <a href="#protocol">Protocol setup</a>. Changes apply to future
            markets after activation. A matured activation can occur before your
            creation transaction.
          </Notice>
        )}
      <div className="create-grid">
        <form
          className="panel create-form"
          onSubmit={(e) => {
            e.preventDefault();
            try {
              if (!runtime)
                throw Error(
                  "Load the verified deployment before building a market request.",
                );
              setDraft(
                buildMarket(fields, runtime.deployment.chainId, app.now),
              );
              setFormError("");
              setReviewed(false);
            } catch (error) {
              setFormError(errorText(error));
            }
          }}
        >
          <div className="step-heading">
            <span>01</span>
            <h2>Define the question</h2>
          </div>
          <Field
            label="Market title"
            hint="A short label, up to 200 UTF-8 bytes. This does not replace the oracle question."
          >
            {(id, desc) => (
              <input
                id={id}
                aria-describedby={desc}
                required
                maxLength={200}
                value={fields.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder="Will the event happen by the deadline?"
              />
            )}
          </Field>
          <Field
            label="Exact question for the jury"
            hint="Phrase a YES / NO question. State the event precisely and refer to the fixed observation time below. Up to 1,800 characters."
          >
            {(id, desc) => (
              <textarea
                id={id}
                aria-describedby={desc}
                required
                maxLength={1800}
                value={fields.question}
                onChange={(e) => set("question", e.target.value)}
                rows={4}
                placeholder="Define the exact event the jury should decide."
              />
            )}
          </Field>
          <Field
            label="Public evidence source"
            hint="Name a verifiable source, URL, publication, or onchain record. Up to 512 characters."
          >
            {(id, desc) => (
              <textarea
                id={id}
                aria-describedby={desc}
                required
                maxLength={512}
                value={fields.evidence}
                onChange={(e) => set("evidence", e.target.value)}
                rows={2}
              />
            )}
          </Field>
          <Field
            label="Resolution criteria (optional)"
            hint="Define edge cases, thresholds, timezone, and what counts as YES. Up to 512 characters."
          >
            {(id, desc) => (
              <textarea
                id={id}
                aria-describedby={desc}
                maxLength={512}
                value={fields.definitions}
                onChange={(e) => set("definitions", e.target.value)}
                rows={3}
              />
            )}
          </Field>
          <div className="step-heading">
            <span>02</span>
            <h2>Set the timeline</h2>
          </div>
          <p className="hint">
            These inputs use your device’s local timezone (
            {Intl.DateTimeFormat().resolvedOptions().timeZone}). The review
            converts them to UTC. Betting closes before observation; resolution
            opens at or after observation.
          </p>
          <Field label="Close betting" hint="Must be in the future.">
            {(id, desc) => (
              <input
                type="datetime-local"
                id={id}
                aria-describedby={desc}
                required
                value={fields.close}
                onChange={(e) => set("close", e.target.value)}
              />
            )}
          </Field>
          <Field
            label="Observe the event at"
            hint="This exact timestamp becomes part of the stored evidence definitions."
          >
            {(id, desc) => (
              <input
                type="datetime-local"
                id={id}
                aria-describedby={desc}
                required
                value={fields.observation}
                onChange={(e) => set("observation", e.target.value)}
              />
            )}
          </Field>
          <Field
            label="Allow the jury to be summoned"
            hint="Anyone may request the verdict from this time until the unrequested timeout seven days later."
          >
            {(id, desc) => (
              <input
                type="datetime-local"
                id={id}
                aria-describedby={desc}
                required
                value={fields.resolve}
                onChange={(e) => set("resolve", e.target.value)}
              />
            )}
          </Field>
          {formError && (
            <p className="field-error" role="alert">
              {formError}
            </p>
          )}
          <button type="submit" className="button outline full">
            <FileText size={16} aria-hidden="true" />
            Build request for review
          </button>
          {draft && (
            <div className="request-preview">
              <h3>Review the exact oracle request</h3>
              <p>
                <strong>{draft.title}</strong>
              </p>
              <pre>{JSON.stringify(JSON.parse(draft.body), null, 2)}</pre>
              <p className="hint">
                Betting closes {dateText(draft.closeTime)}. Jury available{" "}
                {dateText(draft.resolveAfter)}.
              </p>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={reviewed}
                  onChange={(e) => setReviewed(e.target.checked)}
                />
                The question, fixed observation time, evidence, and title
                describe the same event.
              </label>
            </div>
          )}
        </form>
        <aside>
          <section className="panel creation-summary">
            <Scale size={28} strokeWidth={1.3} aria-hidden="true" />
            <h2>The terms of the case</h2>
            <dl className="terms-list">
              <div>
                <dt>Creator bond</dt>
                <dd>
                  {state
                    ? units(state.bond, state.token.decimals, 0)
                    : "10,000"}{" "}
                  VERDICT
                </dd>
              </div>
              <div>
                <dt>Jury fee</dt>
                <dd>
                  {state
                    ? `${units(state.oracle.price, state.payment.decimals)} ${state.payment.symbol}`
                    : "Read from the contract"}
                </dd>
              </div>
              <div>
                <dt>Panel / quorum</dt>
                <dd>5 agents / 4 agree</dd>
              </div>
              <div>
                <dt>Evidence window</dt>
                <dd>24 hours at processing</dd>
              </div>
              <div>
                <dt>Signed answer validity</dt>
                <dd>15 minutes</dd>
              </div>
            </dl>
            <p>
              The bond is returned in every final state. A two-sided request
              spends the jury fee, even if the oracle fails or times out.
            </p>
            <p className="hint">
              <Clock size={15} aria-hidden="true" /> The 24-hour window runs
              when the oracle processes the request. Your observation definition
              must fix the event independently of that window.
            </p>
            {state && runtime && draft ? (
              <ApprovalAction
                actionKey="create"
                label="Create market"
                needs={[
                  {
                    token: state.token,
                    spender: runtime.contracts.Tribunal.address,
                    amount: state.bond,
                    name: "Tribunal",
                  },
                  {
                    token: state.payment,
                    spender: runtime.contracts.Tribunal.address,
                    amount: state.oracle.price,
                    name: "Tribunal",
                  },
                ]}
                disabledReason={reason}
                description={
                  <>
                    <p>
                      Publish “{draft.title}” and deposit{" "}
                      <strong>
                        {units(state.bond, state.token.decimals)} VERDICT
                      </strong>{" "}
                      plus{" "}
                      <strong>
                        {units(state.oracle.price, state.payment.decimals)}{" "}
                        {state.payment.symbol}
                      </strong>
                      . The question and snapshotted terms cannot be edited.
                    </p>
                    <pre>{JSON.stringify(JSON.parse(draft.body), null, 2)}</pre>
                    <p>
                      Betting closes {dateText(draft.closeTime)}. Resolution
                      opens {dateText(draft.resolveAfter)}.
                    </p>
                  </>
                }
                prepare={async () => {
                  if (!client)
                    throw Error("Wait for a verified network connection.");
                  const rebuilt = buildMarket(
                    fields,
                    runtime.deployment.chainId,
                    app.now,
                  );
                  const latest = (await client.readContract({
                    ...runtime.contracts.Tribunal,
                    functionName: "oracleConfig",
                  })) as [string, string, string, bigint];
                  const signer = await client.readContract({
                    ...runtime.contracts.Tribunal,
                    functionName: "oracleSigner",
                  });
                  if (
                    !eq(latest[0], state.oracle.intake) ||
                    !eq(latest[1], state.oracle.asset) ||
                    latest[2] !== state.oracle.action ||
                    latest[3] !== state.oracle.price ||
                    !eq(signer as string, state.signer)
                  ) {
                    await app.refresh();
                    throw Error(
                      "The active oracle settings changed. Review the updated terms before creating.",
                    );
                  }
                  const price = await client.readContract({
                    address: state.oracle.intake,
                    abi: intakeAbi,
                    functionName: "priceOf",
                    args: [state.oracle.action, state.oracle.asset],
                  });
                  if (price !== state.oracle.price)
                    throw Error(
                      "The live Intake price differs from Tribunal. The owner must schedule and activate the matching payment settings.",
                    );
                  return {
                    ...runtime.contracts.Tribunal,
                    functionName: "createMarket",
                    args: [
                      rebuilt.title,
                      stringToHex(rebuilt.body),
                      rebuilt.closeTime,
                      rebuilt.resolveAfter,
                    ],
                  };
                }}
              />
            ) : (
              <p className="hint">
                {reason ||
                  "Load verified contract state and build the request to continue."}
              </p>
            )}
            <a className="text-link" href="#trade">
              Get VERDICT for the bond
            </a>
          </section>
          <p className="side-note">
            Creators receive 1% of the losing pool in a two-sided, resolved
            case. Another 1% goes to the burn sink. No settlement fee applies to
            void or one-sided cases.
          </p>
        </aside>
      </div>
    </section>
  );
}
