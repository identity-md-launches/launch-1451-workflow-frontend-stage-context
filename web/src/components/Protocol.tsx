import { useState } from "react";
import { ArrowLeft, Shield, ScrollText } from "lucide-react";
import {
  getAddress,
  isAddress,
  isHex,
  stringToHex,
  zeroAddress,
  type Address,
  type Hex,
} from "viem";
import { useApp } from "../context";
import { erc20Abi, intakeAbi } from "../config";
import { tokenInfo } from "../chain";
import { amountOf, dateText, eq, errorText, units } from "../domain";
import { AddressView, Field, Notice, TxAction } from "./ui";
const validAddress = (value: string) => {
  const trimmed = value.trim();
  if (!isAddress(trimmed, { strict: true }) || eq(trimmed, zeroAddress))
    throw Error(
      "Enter a nonzero Ethereum address. Mixed-case addresses must have a valid checksum.",
    );
  return getAddress(trimmed);
};
export function Protocol() {
  const app = useApp();
  const { runtime, state, client, account, now } = app;
  const [signer, setSigner] = useState("");
  const [intake, setIntake] = useState("");
  const [action, setAction] = useState("");
  const [asset, setAsset] = useState("");
  const [price, setPrice] = useState("");
  const [paymentPreview, setPaymentPreview] = useState<{
    symbol: string;
    decimals: number;
    amount: bigint;
  }>();
  const [newOwner, setNewOwner] = useState("");
  const [renounce, setRenounce] = useState("");
  const [activity, setActivity] =
    useState<{ block: bigint; name: string; hash: Hex }[]>();
  const [activityError, setActivityError] = useState("");
  const [loadingActivity, setLoadingActivity] = useState(false);
  const isOwner = !!state && eq(account, state.owner);
  const isPendingOwner =
    !!state &&
    eq(account, state.pendingOwner) &&
    !eq(state.pendingOwner, zeroAddress);
  if (!runtime)
    return (
      <section className="page-section">
        <h1>Loading the protocol…</h1>
      </section>
    );
  const tribunal = runtime.contracts.Tribunal;
  return (
    <section className="page-section">
      <a className="back-link" href="#markets">
        <ArrowLeft size={16} aria-hidden="true" />
        All markets
      </a>
      <div className="page-heading">
        <p className="eyebrow">The public record</p>
        <h1>
          Verify the <em>rules.</em>
        </h1>
        <p>
          Contract state, deployed addresses, and configuration changes. The
          owner has no withdrawal or market-resolution power.
        </p>
      </div>
      <div className="protocol-grid">
        <section className="panel">
          <Shield size={25} aria-hidden="true" />
          <h2>Deployed contracts</h2>
          {runtime.deployment.contracts.map((c) => (
            <div className="contract-row" key={c.name}>
              <h3>
                {c.name === "LaunchToken" ? "VERDICT · LaunchToken" : c.name}
              </h3>
              <AddressView address={c.address} label={c.name} />
              <details>
                <summary>ABI and source verification</summary>
                <p className="hint break">
                  Canonical ABI Keccak: <code>{c.abiHash}</code>
                </p>
                <a className="text-link" href={`./${c.abiPath}`} download>
                  Download implementation ABI
                </a>
              </details>
            </div>
          ))}
          <p className="hint break">
            Deployed source: <code>{runtime.deployment.sourceCommit}</code>
          </p>
          <p className="hint break">
            Attestation: <code>{runtime.deployment.attestationHash}</code>
          </p>
          <p className="hint">
            The app verifies the ABI hashes, chain ID, and nonempty deployed
            code before enabling transactions. Code presence alone is not a
            bytecode audit.
          </p>
          <a href="./imd-deployment.json" className="text-link">
            View deployment manifest
          </a>
        </section>
        <section className="panel">
          <h2>Current protocol state</h2>
          {state ? (
            <>
              <dl className="terms-list">
                <div>
                  <dt>Owner</dt>
                  <dd>
                    <AddressView address={state.owner} compact />
                  </dd>
                </div>
                <div>
                  <dt>VERDICT token</dt>
                  <dd>
                    {eq(state.verdictToken, zeroAddress) ? (
                      "Not configured"
                    ) : (
                      <AddressView address={state.verdictToken} compact />
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Oracle signer</dt>
                  <dd>
                    <AddressView address={state.signer} compact />
                  </dd>
                </div>
                <div>
                  <dt>Intake</dt>
                  <dd>
                    <AddressView address={state.oracle.intake} compact />
                  </dd>
                </div>
                <div>
                  <dt>Payment asset</dt>
                  <dd>
                    <AddressView address={state.oracle.asset} compact />
                  </dd>
                </div>
                <div>
                  <dt>Jury price</dt>
                  <dd>
                    {units(state.oracle.price, state.payment.decimals)}{" "}
                    {state.payment.symbol}
                  </dd>
                </div>
                <div>
                  <dt>VERDICT liability</dt>
                  <dd>
                    {units(state.liability, state.token.decimals)} VERDICT
                  </dd>
                </div>
                <div>
                  <dt>Oracle fee escrow</dt>
                  <dd>
                    {units(state.escrow, state.payment.decimals)}{" "}
                    {state.payment.symbol}
                  </dd>
                </div>
                <div>
                  <dt>Read at block</dt>
                  <dd>{state.block.toLocaleString()}</dd>
                </div>
              </dl>
              <details>
                <summary>Current oracle action</summary>
                <code className="break">{state.oracle.action}</code>
              </details>
            </>
          ) : (
            <p>
              Waiting for verified live state. The page does not infer setup
              from deployment.
            </p>
          )}
        </section>
      </div>
      {state && (
        <>
          <section className="panel scheduled-panel">
            <h2>Scheduled changes</h2>
            <p>
              Each schedule takes at least 48 hours and requires an activation
              transaction. Existing markets retain their original signer and
              oracle terms. Old-key markets cannot use a new signer’s answer;
              they may need to time out.
            </p>
            <div className="two-columns">
              <div>
                <h3>Oracle signer</h3>
                {state.signerActivateAfter > 0n ? (
                  <>
                    <AddressView address={state.pendingSigner} />
                    <p>Eligible {dateText(state.signerActivateAfter)}</p>
                    <TxAction
                      actionKey="activate-signer"
                      label="Activate oracle signer"
                      primary={false}
                      disabledReason={
                        now < Number(state.signerActivateAfter)
                          ? "The 48-hour signer delay has not elapsed."
                          : undefined
                      }
                      description={
                        <>
                          <p>
                            Activate the scheduled signer for markets created
                            from this point forward. Existing markets keep their
                            snapshotted signer.
                          </p>
                          <AddressView address={state.pendingSigner} />
                        </>
                      }
                      prepare={() => ({
                        ...tribunal,
                        functionName: "activateOracleSigner",
                      })}
                    />
                    {isOwner && (
                      <TxAction
                        actionKey="cancel-signer"
                        label="Cancel signer change"
                        primary={false}
                        description={
                          <p>
                            Discard the pending signer change. The current
                            signer stays active.
                          </p>
                        }
                        prepare={() => ({
                          ...tribunal,
                          functionName: "cancelSignerChange",
                        })}
                      />
                    )}
                  </>
                ) : (
                  <p className="hint">No pending signer change.</p>
                )}
              </div>
              <div>
                <h3>Oracle configuration</h3>
                {state.configActivateAfter > 0n ? (
                  <>
                    <dl className="terms-list">
                      <div>
                        <dt>Pending Intake</dt>
                        <dd>
                          <AddressView
                            address={state.pendingOracle.intake}
                            compact
                          />
                        </dd>
                      </div>
                      <div>
                        <dt>Pending asset</dt>
                        <dd>
                          <AddressView
                            address={state.pendingOracle.asset}
                            compact
                          />
                        </dd>
                      </div>
                      <div>
                        <dt>Price (minor units)</dt>
                        <dd className="break">
                          {String(state.pendingOracle.price)}
                        </dd>
                      </div>
                      <div>
                        <dt>Action</dt>
                        <dd className="mono break">
                          {state.pendingOracle.action}
                        </dd>
                      </div>
                    </dl>
                    <p>Eligible {dateText(state.configActivateAfter)}</p>
                    <TxAction
                      actionKey="activate-config"
                      label="Activate oracle configuration"
                      primary={false}
                      disabledReason={
                        now < Number(state.configActivateAfter)
                          ? "The 48-hour configuration delay has not elapsed."
                          : undefined
                      }
                      description={
                        <p>
                          Activate the entire pending Intake, action, and
                          payment configuration for future markets. Existing
                          markets keep their original terms.
                        </p>
                      }
                      prepare={() => ({
                        ...tribunal,
                        functionName: "activateOracleConfig",
                      })}
                    />
                    {isOwner && (
                      <TxAction
                        actionKey="cancel-config"
                        label="Cancel configuration change"
                        primary={false}
                        description={
                          <p>
                            Discard the entire pending oracle configuration. All
                            current settings remain active.
                          </p>
                        }
                        prepare={() => ({
                          ...tribunal,
                          functionName: "cancelOracleConfigChange",
                        })}
                      />
                    )}
                  </>
                ) : (
                  <p className="hint">No pending oracle configuration.</p>
                )}
              </div>
            </div>
          </section>
          {isPendingOwner && (
            <section className="panel">
              <h2>Accept ownership</h2>
              <Notice>
                You are the nominated next owner. Accepting transfers
                configuration authority to this wallet; it grants no access to
                user funds.
              </Notice>
              <TxAction
                actionKey="accept-owner"
                label="Accept ownership"
                description={
                  <p>
                    Accept the pending two-step ownership transfer to your
                    connected wallet.
                  </p>
                }
                prepare={() => ({
                  ...tribunal,
                  functionName: "acceptOwnership",
                })}
              />
            </section>
          )}
          <section className="panel owner-panel">
            <p className="eyebrow">Configuration authority</p>
            <h2>Owner setup</h2>
            {!isOwner ? (
              <p className="hint">
                Connect the current owner wallet to see setup controls. Visitors
                can inspect the settings and activate matured changes above.
              </p>
            ) : (
              <>
                {eq(state.verdictToken, zeroAddress) && (
                  <div className="setup-block">
                    <h3>Lock the deployed VERDICT token</h3>
                    <p>
                      This one-time step enables market creation. The target
                      comes from the verified deployment manifest and cannot be
                      edited here.
                    </p>
                    <AddressView
                      address={runtime.contracts.LaunchToken.address}
                    />
                    <TxAction
                      actionKey="setup-token"
                      label="Lock VERDICT token"
                      danger
                      description={
                        <>
                          <p>
                            Permanently set Tribunal’s token to the attested
                            LaunchToken address. There is no correction setter.
                          </p>
                          <AddressView
                            address={runtime.contracts.LaunchToken.address}
                          />
                          <p>
                            Name: {state.token.name} · Symbol:{" "}
                            {state.token.symbol} · Decimals:{" "}
                            {state.token.decimals}
                          </p>
                        </>
                      }
                      prepare={async () => {
                        if (!client)
                          throw Error("Wait for a verified connection.");
                        const [info, supply] = await Promise.all([
                          tokenInfo(
                            client,
                            runtime.contracts.LaunchToken.address,
                          ),
                          client.readContract({
                            ...runtime.contracts.LaunchToken,
                            functionName: "totalSupply",
                          }) as Promise<bigint>,
                        ]);
                        if (
                          info.name !== "Verdict" ||
                          info.symbol !== "VERDICT" ||
                          info.decimals !== 18 ||
                          supply !== 1_000_000_000n * 10n ** 18n
                        )
                          throw Error(
                            "The deployed token metadata or supply is unexpected. Do not lock it.",
                          );
                        return {
                          ...tribunal,
                          functionName: "setVerdictToken",
                          args: [runtime.contracts.LaunchToken.address],
                        };
                      }}
                    />
                  </div>
                )}
                <Notice>
                  Schedules affect future markets after activation. Editing
                  Intake, action, or payment restarts the shared 48-hour delay.
                  Verify published protocol values before scheduling.
                </Notice>
                <div className="two-columns owner-fields">
                  <div>
                    <h3>Schedule signer</h3>
                    <Field
                      label="New oracle signer address"
                      hint="Use the published signer’s Ethereum address. ENS input is not supported in this static configuration."
                    >
                      {(id, desc) => (
                        <input
                          id={id}
                          aria-describedby={desc}
                          value={signer}
                          onChange={(e) => setSigner(e.target.value)}
                          autoComplete="off"
                          spellCheck={false}
                        />
                      )}
                    </Field>
                    <TxAction
                      actionKey="set-signer"
                      label="Schedule oracle signer"
                      primary={false}
                      description={
                        <p>
                          Stage signer <bdi className="break">{signer}</bdi> for
                          activation after 48 hours. This restarts any pending
                          signer delay.
                        </p>
                      }
                      prepare={() => ({
                        ...tribunal,
                        functionName: "setOracleSigner",
                        args: [validAddress(signer)],
                      })}
                    />
                  </div>
                  <div>
                    <h3>Schedule Intake</h3>
                    <Field
                      label="New Intake address"
                      hint="Use a published v2 Intake supporting this oracle body and attestation."
                    >
                      {(id, desc) => (
                        <input
                          id={id}
                          aria-describedby={desc}
                          value={intake}
                          onChange={(e) => setIntake(e.target.value)}
                          autoComplete="off"
                          spellCheck={false}
                        />
                      )}
                    </Field>
                    <TxAction
                      actionKey="set-intake"
                      label="Schedule Intake"
                      primary={false}
                      description={
                        <p>
                          Stage <bdi className="break">{intake}</bdi> as the
                          Intake for future markets, subject to the 48-hour
                          configuration delay.
                        </p>
                      }
                      prepare={async () => {
                        const address = validAddress(intake);
                        if (
                          !client ||
                          !(await client.getCode({ address })) ||
                          (await client.getCode({ address })) === "0x"
                        )
                          throw Error(
                            "The proposed Intake must have deployed code.",
                          );
                        return {
                          ...tribunal,
                          functionName: "setIntake",
                          args: [address],
                        };
                      }}
                    />
                  </div>
                  <div>
                    <h3>Schedule action</h3>
                    <Field
                      label="Oracle action text or bytes32"
                      hint="Plain text is UTF-8 encoded and right-padded to 32 bytes; it is never hashed."
                    >
                      {(id, desc) => (
                        <input
                          id={id}
                          aria-describedby={desc}
                          value={action}
                          onChange={(e) => setAction(e.target.value)}
                          spellCheck={false}
                          autoComplete="off"
                        />
                      )}
                    </Field>
                    <TxAction
                      actionKey="set-action"
                      label="Schedule oracle action"
                      primary={false}
                      description={
                        <p>
                          Stage the action “{action}” for future markets. The
                          action must accept boolean panel evidence and the
                          current attestation format.
                        </p>
                      }
                      prepare={() => {
                        const value = action.trim();
                        if (
                          !value ||
                          (new TextEncoder().encode(value).length > 32 &&
                            !isHex(value))
                        )
                          throw Error(
                            "Use 1–32 UTF-8 bytes or a 32-byte hexadecimal action.",
                          );
                        const encoded = value.startsWith("0x")
                          ? value
                          : stringToHex(value, { size: 32 });
                        if (
                          !/^0x[0-9a-fA-F]{64}$/.test(encoded) ||
                          BigInt(encoded) === 0n
                        )
                          throw Error("Use a nonzero 32-byte action.");
                        return {
                          ...tribunal,
                          functionName: "setAction",
                          args: [encoded],
                        };
                      }}
                    />
                  </div>
                  <div>
                    <h3>Schedule payment</h3>
                    <Field
                      label="Payment token address"
                      hint="ERC-20 only. Decimals and symbol are read from this address before review."
                    >
                      {(id, desc) => (
                        <input
                          id={id}
                          aria-describedby={desc}
                          value={asset}
                          onChange={(e) => setAsset(e.target.value)}
                          spellCheck={false}
                          autoComplete="off"
                        />
                      )}
                    </Field>
                    <Field
                      label="Price in payment-token units"
                      hint="Enter the published whole-token amount, not minor units."
                    >
                      {(id, desc) => (
                        <input
                          id={id}
                          aria-describedby={desc}
                          value={price}
                          onChange={(e) => setPrice(e.target.value)}
                          inputMode="decimal"
                          autoComplete="off"
                        />
                      )}
                    </Field>
                    <TxAction
                      actionKey="set-payment"
                      label="Schedule payment"
                      primary={false}
                      description={
                        <p>
                          Stage{" "}
                          {paymentPreview
                            ? `${units(paymentPreview.amount, paymentPreview.decimals, paymentPreview.decimals)} ${paymentPreview.symbol}`
                            : price + " token units"}{" "}
                          of <bdi className="break">{asset}</bdi> as the future
                          jury payment.{" "}
                          {paymentPreview
                            ? `This token uses ${paymentPreview.decimals} decimals.`
                            : "Token metadata is read before review."}{" "}
                          This restarts the shared 48-hour delay.
                        </p>
                      }
                      prepare={async () => {
                        if (!client)
                          throw Error("Wait for a verified connection.");
                        const address = validAddress(asset);
                        const info = await tokenInfo(client, address);
                        const amount = amountOf(price, info.decimals);
                        const proposed = state.configActivateAfter
                          ? state.pendingOracle
                          : state.oracle;
                        const published = await client.readContract({
                          address: proposed.intake,
                          abi: intakeAbi,
                          functionName: "priceOf",
                          args: [proposed.action, address],
                        });
                        if (published !== amount)
                          throw Error(
                            `The proposed Intake currently quotes ${units(published, info.decimals)} ${info.symbol}, not this amount. Verify the protocol settings.`,
                          );
                        setPaymentPreview({
                          symbol: info.symbol,
                          decimals: info.decimals,
                          amount,
                        });
                        return {
                          ...tribunal,
                          functionName: "setPayment",
                          args: [address, amount],
                        };
                      }}
                    />
                  </div>
                </div>
                <details className="advanced ownership">
                  <summary>
                    Ownership transfer and irreversible renunciation
                  </summary>
                  <p>
                    Ownership can update future oracle settings but cannot touch
                    user funds or resolve markets. Retain ownership for future
                    price and protocol maintenance.
                  </p>
                  <Field
                    label="New owner address"
                    hint="The nominated wallet must call Accept ownership. This step alone does not transfer control."
                  >
                    {(id, desc) => (
                      <input
                        id={id}
                        aria-describedby={desc}
                        value={newOwner}
                        onChange={(e) => setNewOwner(e.target.value)}
                        autoComplete="off"
                        spellCheck={false}
                      />
                    )}
                  </Field>
                  {!eq(state.pendingOwner, zeroAddress) && (
                    <p>
                      Pending owner:{" "}
                      <AddressView address={state.pendingOwner} />
                    </p>
                  )}
                  <TxAction
                    actionKey="transfer-owner"
                    label="Nominate new owner"
                    primary={false}
                    description={
                      <p>
                        Nominate <bdi className="break">{newOwner}</bdi> to
                        receive ownership. The recipient must accept in a
                        separate transaction.
                      </p>
                    }
                    prepare={() => ({
                      ...tribunal,
                      functionName: "transferOwnership",
                      args: [validAddress(newOwner)],
                    })}
                  />
                  <Notice tone="error" title="Renunciation is irreversible">
                    You will permanently lose the ability to adapt oracle
                    prices, Intake, and signer settings. Future creation can
                    become unusable. Existing scheduled changes remain
                    activatable. Renouncing before token setup permanently
                    disables market creation.
                  </Notice>
                  <Field
                    label="Type RENOUNCE to acknowledge"
                    hint="This is not a routine setup step."
                  >
                    {(id, desc) => (
                      <input
                        id={id}
                        aria-describedby={desc}
                        value={renounce}
                        onChange={(e) => setRenounce(e.target.value)}
                        autoComplete="off"
                      />
                    )}
                  </Field>
                  <TxAction
                    actionKey="renounce"
                    label="Renounce ownership"
                    primary={false}
                    danger
                    disabledReason={
                      renounce !== "RENOUNCE"
                        ? "Type the acknowledgement to enable renunciation."
                        : eq(state.verdictToken, zeroAddress)
                          ? "Complete token setup first. Renunciation would permanently disable creation."
                          : undefined
                    }
                    description={
                      <p>
                        Permanently remove the owner’s configuration authority.
                        This cannot be reversed. Existing pending schedules
                        remain activatable and can no longer be cancelled.
                      </p>
                    }
                    prepare={() => ({
                      ...tribunal,
                      functionName: "renounceOwnership",
                    })}
                  />
                </details>
              </>
            )}
          </section>
        </>
      )}
      <section className="panel activity-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Observability</p>
            <h2>Recent Tribunal events</h2>
          </div>
          <button
            className="button outline small"
            disabled={!client || !state || loadingActivity}
            onClick={async () => {
              if (!client || !state) return;
              setLoadingActivity(true);
              setActivityError("");
              try {
                const logs = await client.getContractEvents({
                  ...tribunal,
                  fromBlock: state.block > 499n ? state.block - 499n : 0n,
                  toBlock: state.block,
                });
                setActivity(
                  logs
                    .slice(-30)
                    .reverse()
                    .map((log) => ({
                      block: log.blockNumber!,
                      name: log.eventName ?? "Contract event",
                      hash: log.transactionHash!,
                    })),
                );
              } catch (error) {
                setActivityError(errorText(error));
              } finally {
                setLoadingActivity(false);
              }
            }}
          >
            {loadingActivity ? "Reading events…" : "Load recent events"}
          </button>
        </div>
        <p className="hint">
          Reads the latest 500 blocks and shows up to 30 events. Deferred
          attestations are pending, not final verdicts. This list is not a
          complete historical index.
        </p>
        {activityError && <Notice tone="error">{activityError}</Notice>}
        {activity?.length === 0 && (
          <p>No Tribunal events in this block range.</p>
        )}
        {activity?.map((event, i) => (
          <div className="event-row" key={`${event.hash}-${i}`}>
            <span>{event.name}</span>
            <span>Block {String(event.block)}</span>
            <a
              href={`${runtime.deployment.network.explorer}/tx/${event.hash}`}
              target="_blank"
              rel="noreferrer"
            >
              View transaction
            </a>
          </div>
        ))}
      </section>
      <TokenTools />
    </section>
  );
}
function TokenTools() {
  const { runtime, state, account, client } = useApp();
  const [operation, setOperation] = useState<
    "transfer" | "approve" | "transferFrom"
  >("transfer");
  const [recipient, setRecipient] = useState("");
  const [from, setFrom] = useState("");
  const [amount, setAmount] = useState("");
  if (!runtime || !state) return null;
  return (
    <details className="panel advanced">
      <summary>
        <ScrollText size={17} aria-hidden="true" />
        Advanced VERDICT token controls
      </summary>
      <p>
        Direct ERC-20 operations. Market and swap approvals are handled in their
        own flows. Verify any recipient or spender carefully.
      </p>
      <Field label="Token operation">
        {(id) => (
          <select
            id={id}
            value={operation}
            onChange={(e) => setOperation(e.target.value as typeof operation)}
          >
            <option value="transfer">Send VERDICT</option>
            <option value="approve">Set or revoke an allowance</option>
            <option value="transferFrom">
              Transfer from an approved wallet
            </option>
          </select>
        )}
      </Field>
      {operation === "transferFrom" && (
        <Field label="Source wallet address">
          {(id) => (
            <input
              id={id}
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              spellCheck={false}
            />
          )}
        </Field>
      )}
      <Field
        label={
          operation === "approve" ? "Spender address" : "Recipient address"
        }
      >
        {(id) => (
          <input
            id={id}
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            spellCheck={false}
          />
        )}
      </Field>
      <Field
        label="VERDICT amount"
        hint={
          operation === "approve"
            ? "Use 0 to revoke an existing allowance. Approvals replace the current value."
            : `Your balance: ${state.balance === undefined ? "connect wallet" : units(state.balance, state.token.decimals) + " VERDICT"}`
        }
      >
        {(id, desc) => (
          <input
            id={id}
            aria-describedby={desc}
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        )}
      </Field>
      <TxAction
        actionKey={`token-${operation}`}
        label={
          operation === "approve" ? "Set VERDICT allowance" : "Transfer VERDICT"
        }
        primary={false}
        description={
          <p>
            {operation === "approve" ? "Allow spender" : "Send to"}{" "}
            <bdi className="break">{recipient}</bdi>: {amount} VERDICT
            {operation === "transferFrom" ? ` from ${from}` : ""}.{" "}
            {operation === "approve"
              ? "The spender may transfer tokens up to this allowance."
              : "Token transfers cannot be reversed."}
          </p>
        }
        prepare={async () => {
          const address = validAddress(recipient);
          const value =
            operation === "approve" && /^0(\.0+)?$/.test(amount)
              ? 0n
              : amountOf(amount, state.token.decimals);
          if (operation === "transferFrom") {
            const source = validAddress(from);
            if (!client || !account) throw Error("Connect your wallet first.");
            const allowed = await client.readContract({
              address: state.token.address,
              abi: erc20Abi,
              functionName: "allowance",
              args: [source, account],
            });
            if (allowed < value)
              throw Error(
                "The source wallet has not approved your wallet for this amount.",
              );
            return {
              ...runtime.contracts.LaunchToken,
              functionName: operation,
              args: [source, address, value],
            };
          }
          return {
            ...runtime.contracts.LaunchToken,
            functionName: operation,
            args: [address, value],
          };
        }}
      />
    </details>
  );
}
