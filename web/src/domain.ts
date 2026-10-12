import {
  formatUnits,
  parseUnits,
  hexToString,
  encodeAbiParameters,
  parseAbiParameters,
  zeroAddress,
  type Address,
  type Hex,
} from "viem";
import type { Market, PoolKey, Position } from "./types";
export const eq = (a?: string, b?: string) =>
  !!a && !!b && a.toLowerCase() === b.toLowerCase();
export const short = (address: string) =>
  `${address.slice(0, 6)}…${address.slice(-4)}`;
export const units = (value: bigint, decimals = 18, digits = 4) => {
  const [whole, frac] = formatUnits(value, decimals).split(".");
  return `${BigInt(whole).toLocaleString("en-US")}${frac && Number(frac) ? "." + frac.slice(0, digits).replace(/0+$/, "") : ""}`.replace(
    /\.$/,
    "",
  );
};
export function amountOf(
  text: string,
  decimals: number,
  max = (1n << 256n) - 1n,
) {
  if (
    !/^\d+(\.\d+)?$/.test(text.trim()) ||
    (text.split(".")[1]?.length ?? 0) > decimals
  )
    throw Error(
      `Enter a positive amount with up to ${decimals} decimal places.`,
    );
  const amount = parseUnits(text.trim(), decimals);
  if (amount <= 0n || amount > max)
    throw Error("Amount is outside the supported range.");
  return amount;
}
export const dateText = (seconds: bigint | number) =>
  new Date(Number(seconds) * 1000).toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }) + " UTC";
export function marketStatus(market: Market, now: number) {
  if (market.state === 1)
    return now < Number(market.closeTime)
      ? "Open"
      : now >= Number(market.deadline)
        ? "Timed out"
        : "Awaiting jury";
  if (market.state === 2)
    return now >= Number(market.deadline) ? "Timed out" : "Jury deliberating";
  return (
    (
      { 3: "Resolved YES", 4: "Resolved NO", 5: "Void · refundable" } as Record<
        number,
        string
      >
    )[market.state] ?? "Unknown"
  );
}
export const finalState = (m: Market) => m.state >= 3 && m.state <= 5;
export function poolShare(m: Market) {
  const total = m.yesPool + m.noPool;
  return total === 0n ? null : Number((m.yesPool * 1000n) / total) / 10;
}
export function claimEstimate(
  m: Market,
  p: Position,
  account: Address,
  bond: bigint,
) {
  let payout = 0n;
  let fee = 0n;
  if (p.claimed || !finalState(m)) return { payout: 0n, refund: 0n };
  if (m.state === 5 || !m.yesPool || !m.noPool) payout = p.yes + p.no;
  else {
    const winning = m.state === 3 ? m.yesPool : m.noPool;
    const losing = m.state === 3 ? m.noPool : m.yesPool;
    const stake = m.state === 3 ? p.yes : p.no;
    fee = losing / 100n;
    const profit = losing - 2n * fee;
    if (stake)
      payout =
        stake +
        (stake === winning - m.claimedWinnerStake
          ? profit - m.paidProfit
          : (profit * stake) / winning);
  }
  const creator = eq(m.creator, account);
  return {
    payout: payout + (creator ? bond + fee : 0n),
    refund: creator && !m.oracleSpent ? m.oracle.price : 0n,
  };
}
export function decodeBody(body: Hex):
  | {
      question: string;
      definitions: Record<string, string>;
      window: Record<string, unknown>;
      panelSize: number;
      quorum: number;
    }
  | undefined {
  try {
    const value = JSON.parse(hexToString(body));
    if (typeof value.question !== "string") return undefined;
    return {
      question: value.question,
      definitions: value.definitions ?? {},
      window: value.window,
      panelSize: value.panelSize,
      quorum: value.quorum,
    };
  } catch {
    return undefined;
  }
}
export type CreateFields = {
  title: string;
  question: string;
  observation: string;
  evidence: string;
  definitions: string;
  close: string;
  resolve: string;
};
export function buildMarket(
  fields: CreateFields,
  chainId: number,
  now: number,
) {
  const title = fields.title.trim();
  if (
    !title ||
    new TextEncoder().encode(title).length > 200 ||
    /[\u0000-\u001f\u007f]/.test(title)
  )
    throw Error("Use a title of 1–200 UTF-8 bytes without control characters.");
  const question = fields.question.trim();
  if (!question || [...question].length > 1800)
    throw Error("Use a question of 1–1,800 characters.");
  if (
    !fields.observation ||
    !fields.evidence.trim() ||
    [...fields.evidence].length > 512 ||
    [...fields.definitions].length > 512
  )
    throw Error(
      "Set an observation time and evidence source. Each definition may contain at most 512 characters.",
    );
  const closeTime = Math.floor(Date.parse(fields.close) / 1000);
  const resolveAfter = Math.floor(Date.parse(fields.resolve) / 1000);
  const observation = Math.floor(Date.parse(fields.observation) / 1000);
  if (
    ![closeTime, resolveAfter, observation].every(Number.isFinite) ||
    closeTime <= now ||
    resolveAfter < closeTime ||
    observation > resolveAfter ||
    observation < closeTime
  )
    throw Error(
      "Close betting in the future, observe the event at or after close, and summon the jury at or after observation.",
    );
  const oracle = {
    v: 1,
    question,
    chainId,
    window: { hours: 24 },
    answerType: "bool",
    evidence: "panel",
    panelSize: 5,
    quorum: 4,
    validForSeconds: 900,
    definitions: {
      observation: new Date(observation * 1000).toISOString(),
      evidence: fields.evidence.trim(),
      ...(fields.definitions.trim()
        ? { criteria: fields.definitions.trim() }
        : {}),
    },
  };
  const body = JSON.stringify(oracle);
  if (new TextEncoder().encode(body).length > 16384)
    throw Error(
      "Oracle request exceeds 16 KiB. Shorten the question or definitions.",
    );
  return {
    title,
    body,
    closeTime: BigInt(closeTime),
    resolveAfter: BigInt(resolveAfter),
  };
}
export const poolKeyParams = parseAbiParameters(
  "(address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks)",
);
export function swapEncoding(
  key: PoolKey,
  input: Address,
  amountIn: bigint,
  minimum: bigint,
  deadline: bigint,
  extended = false,
) {
  if (!eq(input, key.currency0) && !eq(input, key.currency1))
    throw Error("Input token is not in the deployed pool.");
  const zeroForOne = eq(input, key.currency0);
  const output = zeroForOne ? key.currency1 : key.currency0;
  const tuple = extended
    ? parseAbiParameters(
        "((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,uint256 minHopPriceX36,bytes hookData)",
      )
    : parseAbiParameters(
        "((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,bytes hookData)",
      );
  const params = [
    encodeAbiParameters(tuple, [
      {
        poolKey: key,
        zeroForOne,
        amountIn,
        amountOutMinimum: minimum,
        ...(extended ? { minHopPriceX36: 0n } : {}),
        hookData: "0x",
      },
    ] as never),
    encodeAbiParameters(parseAbiParameters("address,uint256"), [
      input,
      amountIn,
    ]),
    encodeAbiParameters(parseAbiParameters("address,uint256"), [
      output,
      minimum,
    ]),
  ];
  return {
    commands: "0x10" as Hex,
    inputs: [
      encodeAbiParameters(parseAbiParameters("bytes,bytes[]"), [
        "0x060c0f",
        params,
      ]),
    ],
    deadline,
    value: eq(input, zeroAddress) ? amountIn : 0n,
  };
}
export function slippageMinimum(output: bigint, percent: string) {
  if (!/^\d+(\.\d{1,2})?$/.test(percent))
    throw Error("Use a slippage percentage with at most two decimals.");
  const bps = Math.round(Number(percent) * 100);
  if (bps < 10 || bps > 500)
    throw Error("Choose slippage between 0.1% and 5%.");
  const minimum = (output * BigInt(10000 - bps)) / 10000n;
  if (minimum === 0n || minimum >= 1n << 128n)
    throw Error("Quote is outside the router’s supported output range.");
  return minimum;
}
const errors: Record<string, string> = {
  NotConfigured:
    "Market creation is not configured yet. The owner must finish setup.",
  InvalidConfiguration:
    "Oracle settings or price have changed. Refresh and check setup.",
  TokenAlreadySet: "The token is already locked. Refresh the setup panel.",
  InvalidTimes:
    "The market times are invalid or in the past. Choose future times.",
  UnknownMarket: "This market does not exist. Return to the market list.",
  WrongState: "This market has changed. Refresh before continuing.",
  BettingClosed: "Betting has closed. Your tokens were not deposited.",
  BetTooSmall: "Increase the stake to the minimum bet.",
  TooEarly: "The deadline has not arrived. Check the displayed UTC time.",
  DeadlinePassed: "The deadline has passed. Refresh to view the refund path.",
  AlreadyClaimed: "This wallet has already claimed. Refresh your position.",
  NoPosition: "This wallet has no claim in this market.",
  UnboundAttestation:
    "This payload was not bound by the Intake callback. Use the exact delivered payload.",
  PanelTooWeak: "The attestation does not meet the market’s panel or quorum.",
  InvalidAttestation:
    "Attestation metadata does not match the market. Check the delivered payload.",
  BadSignature: "The signature is not valid for this market’s signer.",
  AttestationExpired:
    "The signed attestation has expired. A new payload cannot replace a bound one; the timeout path remains available.",
  AttestationNotYetValid:
    "The attestation is not valid yet. Check its issue time.",
  AlreadyConsumed: "This oracle request has already been consumed.",
  UnexpectedTokenAmount:
    "The transfer did not deliver the exact required amount. The token may be unsupported.",
  SignerDelayPending: "The signer’s 48-hour delay has not elapsed.",
  ConfigDelayPending: "The configuration’s 48-hour delay has not elapsed.",
  NoPendingSigner: "There is no pending signer change. Refresh settings.",
  NoPendingConfig: "There is no pending configuration. Refresh settings.",
  OwnableUnauthorizedAccount:
    "This wallet is not authorized for this owner action.",
  ERC20InsufficientBalance:
    "Your token balance is too low. Reduce the amount or acquire tokens.",
  ERC20InsufficientAllowance:
    "The token allowance is too low. Refresh and approve the required amount.",
};
export function errorText(error: unknown): string {
  const err = error as {
    code?: number;
    shortMessage?: string;
    message?: string;
    cause?: unknown;
    data?: { errorName?: string };
  };
  if (
    err?.code === 4001 ||
    /user rejected|user denied/i.test(err?.message ?? "")
  )
    return "You declined the wallet request. No new transaction was submitted; you can try again.";
  if (err?.data?.errorName && errors[err.data.errorName])
    return errors[err.data.errorName];
  for (const [key, value] of Object.entries(errors))
    if ((err?.message ?? "").includes(key)) return value;
  if (err?.cause) return errorText(err.cause);
  if (/insufficient funds/i.test(err?.message ?? ""))
    return "Insufficient ETH for network fees. Add ETH before trying again.";
  if (/fetch|network|HTTP|timeout|Failed to fetch/i.test(err?.message ?? ""))
    return "The network could not complete this request. Check your connection, refresh, and try again.";
  const message = err?.shortMessage || err?.message;
  return message && message.length < 350
    ? message
    : "The contract could not complete this action. Refresh the onchain state and check your balance and allowances before retrying.";
}
