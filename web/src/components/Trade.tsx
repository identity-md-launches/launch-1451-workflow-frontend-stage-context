import { useEffect, useRef, useState } from "react";
import { ArrowDownUp, ArrowLeft, RefreshCw } from "lucide-react";
import {
  encodeAbiParameters,
  keccak256,
  zeroAddress,
  type Address,
  type Hex,
} from "viem";
import { useApp } from "../context";
import {
  erc20Abi,
  permit2Abi,
  quoterAbi,
  routerAbi,
  stateViewAbi,
} from "../config";
import { tokenInfo } from "../chain";
import {
  amountOf,
  eq,
  errorText,
  poolKeyParams,
  slippageMinimum,
  swapEncoding,
  units,
} from "../domain";
import { AddressView, Field, Notice, TransactionStatus, TxAction } from "./ui";
import type { Token } from "../types";
type Quote = {
  amountIn: bigint;
  amountOut: bigint;
  minimum: bigint;
  input: Address;
  output: Address;
  createdAt: number;
  account: Address;
  gasEstimate: bigint;
};
export function Trade() {
  const app = useApp();
  const { runtime, client, state, account, ready, now } = app;
  const [buy, setBuy] = useState(true);
  const [amount, setAmount] = useState("");
  const [slippage, setSlippage] = useState("0.5");
  const [pair, setPair] = useState<Token>();
  const [pairBalance, setPairBalance] = useState<bigint>();
  const [quote, setQuote] = useState<Quote>();
  const [quoting, setQuoting] = useState(false);
  const [quoteError, setQuoteError] = useState("");
  const [allowance, setAllowance] = useState<bigint>();
  const [permit, setPermit] = useState<readonly [bigint, number, number]>();
  const [pool, setPool] = useState<{ liquidity: bigint; sqrtPrice: bigint }>();
  const quoteEpoch = useRef(0);
  const key = runtime?.deployment.poolKey;
  const uni = runtime?.deployment.network.uniswapV4;
  const token = state?.token;
  const pairAddress =
    key && runtime
      ? eq(key.currency0, runtime.contracts.LaunchToken.address)
        ? key.currency1
        : eq(key.currency1, runtime.contracts.LaunchToken.address)
          ? key.currency0
          : undefined
      : undefined;
  const input = buy ? pair : token;
  const output = buy ? token : pair;
  const native = input && eq(input.address, zeroAddress);
  const balance = buy ? pairBalance : state?.balance;
  useEffect(() => {
    quoteEpoch.current++;
    setQuote(undefined);
    setQuoteError("");
    setAllowance(undefined);
    setPermit(undefined);
  }, [amount, slippage, buy, account, app.walletChain]);
  useEffect(() => {
    let live = true;
    if (!client || !runtime || !pairAddress || !key || !uni) return;
    (async () => {
      const info = eq(pairAddress, zeroAddress)
        ? { address: zeroAddress, ...runtime.deployment.network.nativeCurrency }
        : await tokenInfo(client, pairAddress);
      const poolId = keccak256(encodeAbiParameters(poolKeyParams, [key]));
      const [slot, liquidity, balance] = await Promise.all([
        client.readContract({
          address: uni.stateView,
          abi: stateViewAbi,
          functionName: "getSlot0",
          args: [poolId],
        }),
        client.readContract({
          address: uni.stateView,
          abi: stateViewAbi,
          functionName: "getLiquidity",
          args: [poolId],
        }),
        account
          ? eq(info.address, zeroAddress)
            ? client.getBalance({ address: account })
            : client.readContract({
                address: info.address,
                abi: erc20Abi,
                functionName: "balanceOf",
                args: [account],
              })
          : undefined,
      ]);
      if (live) {
        setPair(info);
        setPool({ liquidity, sqrtPrice: slot[0] });
        setPairBalance(balance);
      }
    })().catch((error) => {
      if (live) {
        setPool(undefined);
        setQuoteError(errorText(error));
      }
    });
    return () => {
      live = false;
    };
  }, [client, runtime, pairAddress, account, state?.block]);
  const refreshAllowances = async (source: Token) => {
    if (!client || !account || !uni || eq(source.address, zeroAddress)) return;
    const [allowance, permit] = await Promise.all([
      client.readContract({
        address: source.address,
        abi: erc20Abi,
        functionName: "allowance",
        args: [account, uni.permit2],
      }),
      client.readContract({
        address: uni.permit2,
        abi: permit2Abi,
        functionName: "allowance",
        args: [account, source.address, uni.universalRouter],
      }),
    ]);
    setAllowance(allowance);
    setPermit(permit);
  };
  useEffect(() => {
    if (input && ready)
      void refreshAllowances(input).catch((error) =>
        setQuoteError(errorText(error)),
      );
  }, [input?.address, ready, state?.block, account]);
  const requestQuote = async () => {
    if (
      !client ||
      !account ||
      !runtime ||
      !input ||
      !output ||
      !key ||
      !uni ||
      !ready ||
      quoting
    )
      return;
    const version = ++quoteEpoch.current;
    setQuoting(true);
    setQuoteError("");
    setQuote(undefined);
    try {
      const amountIn = amountOf(amount, input.decimals, (1n << 128n) - 1n);
      if (!pool?.liquidity || !pool.sqrtPrice)
        throw Error(
          "The deployed pool has no active liquidity. A swap is not available.",
        );
      if (balance === undefined || amountIn > balance)
        throw Error(`Insufficient ${input.symbol} balance for this amount.`);
      const codes = await Promise.all(
        [
          uni.quoter,
          uni.universalRouter,
          uni.permit2,
          uni.poolManager,
          key.hooks,
        ]
          .filter((address) => !eq(address, zeroAddress))
          .map((address) => client.getCode({ address })),
      );
      if (codes.some((code) => !code || code === "0x"))
        throw Error(
          "A pool or routing contract has no code. Swaps are disabled.",
        );
      const { result } = await client.simulateContract({
        address: uni.quoter,
        abi: quoterAbi,
        functionName: "quoteExactInputSingle",
        args: [
          {
            poolKey: key,
            zeroForOne: eq(input.address, key.currency0),
            exactAmount: amountIn,
            hookData: "0x",
          },
        ],
        account,
      });
      const minimum = slippageMinimum(result[0], slippage);
      await refreshAllowances(input);
      if (version === quoteEpoch.current)
        setQuote({
          amountIn,
          amountOut: result[0],
          minimum,
          input: input.address,
          output: output.address,
          account,
          createdAt: Date.now(),
          gasEstimate: result[1],
        });
    } catch (error) {
      if (version === quoteEpoch.current) setQuoteError(errorText(error));
    } finally {
      setQuoting(false);
    }
  };
  const stale = !quote || Date.now() - quote.createdAt > 60000;
  const needsToken =
    !native &&
    !!quote &&
    (allowance === undefined || allowance < quote.amountIn);
  const needsPermit =
    !native &&
    !!quote &&
    (!permit || permit[0] < quote.amountIn || permit[1] < now + 600);
  const guardQuote = () => {
    if (
      !quote ||
      Date.now() - quote.createdAt > 60000 ||
      !eq(account, quote.account) ||
      !input ||
      !eq(input.address, quote.input) ||
      !ready
    )
      throw Error(
        "The quote expired or the wallet changed. Get a fresh quote and review it.",
      );
    return quote;
  };
  return (
    <section className="page-section">
      <a className="back-link" href="#markets">
        <ArrowLeft size={16} aria-hidden="true" />
        All markets
      </a>
      <div className="page-heading">
        <p className="eyebrow">The currency of conviction</p>
        <h1>
          Get <em>VERDICT.</em>
        </h1>
        <p>
          Trade in the deployed Uniswap v4 pool, then use VERDICT to open cases
          and take positions.
        </p>
      </div>
      <div className="trade-grid">
        <section className="panel trade-panel">
          <div className="section-heading">
            <h2>{buy ? "Buy VERDICT" : "Sell VERDICT"}</h2>
            <button
              type="button"
              className="button outline small"
              aria-label="Reverse trade direction"
              onClick={() => setBuy(!buy)}
              disabled={app.busy}
            >
              <ArrowDownUp size={17} aria-hidden="true" />
              Reverse
            </button>
          </div>
          {pool && (!pool.liquidity || !pool.sqrtPrice) && (
            <Notice title="No active pool liquidity">
              The deployed pool cannot execute a swap at its current price.
              Trading will be available when liquidity is active.
            </Notice>
          )}
          {!key || !uni || !pairAddress ? (
            <Notice>
              Trading is unavailable: no vetted pool configuration exists for
              this launch.
            </Notice>
          ) : (
            <>
              <Field
                label={`You pay · ${input?.symbol ?? (buy ? "Pair token" : "VERDICT")}`}
                hint={
                  balance !== undefined && input
                    ? `Balance: ${units(balance, input.decimals)} ${input.symbol}`
                    : "Connect to read your available balance."
                }
              >
                {(id, desc) => (
                  <input
                    className="amount-input"
                    id={id}
                    aria-describedby={desc}
                    inputMode="decimal"
                    autoComplete="off"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    disabled={app.busy}
                  />
                )}
              </Field>
              <div className="swap-divider">
                <ArrowDownUp size={18} aria-hidden="true" />
              </div>
              <div className="quote-output">
                <span>
                  You receive ·{" "}
                  {output?.symbol ?? (buy ? "VERDICT" : "Pair token")}
                </span>
                <strong>
                  {quote && output
                    ? units(quote.amountOut, output.decimals, 6)
                    : "—"}
                </strong>
                <small>Estimated output</small>
              </div>
              <Field
                label="Slippage tolerance (%)"
                hint="Allowed range: 0.1–5%. A swap reverts below the minimum output."
              >
                {(id, desc) => (
                  <input
                    id={id}
                    aria-describedby={desc}
                    inputMode="decimal"
                    value={slippage}
                    onChange={(e) => setSlippage(e.target.value)}
                    disabled={app.busy}
                  />
                )}
              </Field>
              {Number(slippage) > 1 && (
                <Notice>
                  High slippage increases the amount you can lose to price
                  movement and transaction ordering.
                </Notice>
              )}
              <button
                type="button"
                className={`button ${quote ? "outline" : "primary"} full`}
                disabled={
                  quoting ||
                  app.busy ||
                  (!!pool && (!pool.liquidity || !pool.sqrtPrice)) ||
                  (!!account &&
                    app.walletChain === runtime?.deployment.chainId &&
                    !ready)
                }
                onClick={() => {
                  if (!account) void app.connect();
                  else if (app.walletChain !== runtime?.deployment.chainId)
                    void app.switchChain();
                  else void requestQuote();
                }}
              >
                <RefreshCw
                  size={16}
                  className={quoting ? "spin" : ""}
                  aria-hidden="true"
                />
                {!account
                  ? "Connect wallet for a quote"
                  : app.walletChain !== runtime?.deployment.chainId
                    ? `Switch to ${runtime?.deployment.network.name}`
                    : quoting
                      ? "Getting live quote…"
                      : quote
                        ? "Refresh quote"
                        : "Get a live quote"}
              </button>
              {quoteError && (
                <p className="field-error" role="alert">
                  {quoteError}
                </p>
              )}
              {quote && input && output && uni && (
                <>
                  <dl className="terms-list">
                    <div>
                      <dt>Minimum received</dt>
                      <dd>
                        {units(quote.minimum, output.decimals, output.decimals)}{" "}
                        {output.symbol}
                      </dd>
                    </div>
                    <div>
                      <dt>Exchange rate</dt>
                      <dd>
                        1 {input.symbol} ≈{" "}
                        {units(
                          (quote.amountOut * 10n ** BigInt(input.decimals)) /
                            quote.amountIn,
                          output.decimals,
                          6,
                        )}{" "}
                        {output.symbol}
                      </dd>
                    </div>
                    <div>
                      <dt>Quote validity</dt>
                      <dd>
                        {stale
                          ? "Expired · refresh required"
                          : `${Math.max(0, 60 - Math.floor((Date.now() - quote.createdAt) / 1000))} seconds`}
                      </dd>
                    </div>
                  </dl>
                  {needsToken ? (
                    <>
                      <p className="step-label">Step 1 · Token permission</p>
                      <TxAction
                        actionKey="swap-token-approval"
                        label={`Approve ${input.symbol} to Permit2`}
                        disabledReason={
                          stale
                            ? "Refresh the quote before approving."
                            : undefined
                        }
                        description={
                          <>
                            <p>
                              Allow Permit2 to spend exactly{" "}
                              {units(
                                quote.amountIn,
                                input.decimals,
                                input.decimals,
                              )}{" "}
                              {input.symbol}.
                            </p>
                            <AddressView address={uni.permit2} />
                            <p>
                              A separate router permission follows. No swap
                              occurs during approval.
                            </p>
                          </>
                        }
                        prepare={() => {
                          const q = guardQuote();
                          return {
                            address: input.address,
                            abi: eq(
                              input.address,
                              runtime!.contracts.LaunchToken.address,
                            )
                              ? runtime!.contracts.LaunchToken.abi
                              : erc20Abi,
                            functionName: "approve",
                            args: [uni.permit2, q.amountIn],
                          };
                        }}
                        onSuccess={() => refreshAllowances(input)}
                      />
                    </>
                  ) : needsPermit ? (
                    <>
                      <p className="step-label">Step 2 · Router permission</p>
                      <TxAction
                        actionKey="swap-router-approval"
                        label="Authorize Universal Router"
                        disabledReason={
                          stale
                            ? "Refresh the quote before approving."
                            : undefined
                        }
                        description={
                          <>
                            <p>
                              Permit2 will authorize the deployed Universal
                              Router for exactly{" "}
                              {units(
                                quote.amountIn,
                                input.decimals,
                                input.decimals,
                              )}{" "}
                              {input.symbol}, expiring in 30 minutes.
                            </p>
                            <AddressView address={uni.universalRouter} />
                          </>
                        }
                        prepare={() => {
                          const q = guardQuote();
                          return {
                            address: uni.permit2,
                            abi: permit2Abi,
                            functionName: "approve",
                            args: [
                              input.address,
                              uni.universalRouter,
                              q.amountIn,
                              now + 1800,
                            ],
                          };
                        }}
                        onSuccess={() => refreshAllowances(input)}
                      />
                    </>
                  ) : (
                    <>
                      <p className="step-label">
                        {native ? "Ready to swap" : "Step 3 · Swap"}
                      </p>
                      <TxAction
                        actionKey="swap"
                        label={`Swap ${input.symbol} for ${output.symbol}`}
                        disabledReason={
                          stale
                            ? "This quote has expired. Refresh it before swapping."
                            : !pool?.liquidity
                              ? "No active pool liquidity."
                              : undefined
                        }
                        description={
                          <>
                            <p>
                              Spend{" "}
                              <strong>
                                {units(
                                  quote.amountIn,
                                  input.decimals,
                                  input.decimals,
                                )}{" "}
                                {input.symbol}
                              </strong>{" "}
                              for at least{" "}
                              <strong>
                                {units(
                                  quote.minimum,
                                  output.decimals,
                                  output.decimals,
                                )}{" "}
                                {output.symbol}
                              </strong>
                              .
                            </p>
                            <p>
                              Slippage: {slippage}%. Transaction deadline: 10
                              minutes.{" "}
                              {native
                                ? "ETH is sent as transaction value."
                                : "No native ETH is sent as swap value; ETH is still needed for gas."}
                            </p>
                          </>
                        }
                        prepare={async () => {
                          const q = guardQuote();
                          if (!client || !account)
                            throw Error("Connect first.");
                          // Read fresh allowances before encoding the exact, reviewed quote. Simulation remains mandatory.
                          if (!native) {
                            const a = await client.readContract({
                              address: input.address,
                              abi: erc20Abi,
                              functionName: "allowance",
                              args: [account, uni.permit2],
                            });
                            const p = await client.readContract({
                              address: uni.permit2,
                              abi: permit2Abi,
                              functionName: "allowance",
                              args: [
                                account,
                                input.address,
                                uni.universalRouter,
                              ],
                            });
                            if (
                              a < q.amountIn ||
                              p[0] < q.amountIn ||
                              p[1] < now + 600
                            ) {
                              await refreshAllowances(input);
                              throw Error(
                                "An approval is missing or expired. Complete the displayed permission step.",
                              );
                            }
                          }
                          const encoded = swapEncoding(
                            key,
                            input.address,
                            q.amountIn,
                            q.minimum,
                            BigInt(now + 600),
                            !!uni.extendedSwapParams,
                          );
                          return {
                            address: uni.universalRouter,
                            abi: routerAbi,
                            functionName: "execute",
                            args: [
                              encoded.commands,
                              encoded.inputs,
                              encoded.deadline,
                            ],
                            value: encoded.value,
                            validUntil: q.createdAt + 60000,
                          };
                        }}
                        onSuccess={() => {
                          setQuote(undefined);
                          setAmount("");
                        }}
                      />
                    </>
                  )}
                </>
              )}
              <p className="hint">
                Quotes are simulated reads and never wallet transactions. Prices
                can change before a swap is included. USD context is
                unavailable.
              </p>
            </>
          )}
        </section>
        <aside className="trade-notes">
          <h2>One pool. Clear permissions.</h2>
          <ol className="numbered-list">
            <li>
              <strong>Get a quote</strong>
              <p>
                Read the deployed pool using the configured Uniswap quoter.
                Review the output and slippage limit.
              </p>
            </li>
            <li>
              <strong>Approve only what you spend</strong>
              <p>
                For tokens, approve Permit2, then authorize the router. Each
                step is a separate transaction, shown only when needed.
              </p>
            </li>
            <li>
              <strong>Review and swap</strong>
              <p>
                The router call is simulated before you sign. The output must
                meet the minimum you reviewed.
              </p>
            </li>
          </ol>
          {key && (
            <div className="panel pool-info">
              <p className="eyebrow">Deployed pool</p>
              <dl className="terms-list">
                <div>
                  <dt>Trading fee</dt>
                  <dd>{key.fee / 10000}%</dd>
                </div>
                <div>
                  <dt>Tick spacing</dt>
                  <dd>{key.tickSpacing}</dd>
                </div>
                <div>
                  <dt>Active liquidity</dt>
                  <dd>
                    {pool
                      ? pool.liquidity > 0n
                        ? "Available"
                        : "None"
                      : "Checking…"}
                  </dd>
                </div>
                <div>
                  <dt>Hook</dt>
                  <dd>
                    <AddressView address={key.hooks} compact />
                  </dd>
                </div>
              </dl>
              <p className="hint">
                The pool fee is separate from Tribunal’s 2% settlement charge on
                losing stakes.
              </p>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
