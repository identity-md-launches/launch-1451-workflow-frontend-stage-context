import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  decodeAbiParameters,
  parseAbiParameters,
  parseUnits,
  zeroAddress,
  zeroHash,
  type Address,
} from "viem";
import {
  amountOf,
  buildMarket,
  claimEstimate,
  marketStatus,
  poolShare,
  slippageMinimum,
  swapEncoding,
} from "../src/domain";
import { canonicalHash } from "../src/config";
import type { Market, PoolKey } from "../src/types";
const handoff = JSON.parse(
  readFileSync(
    new URL("../config/deployment-handoff.json", import.meta.url),
    "utf8",
  ),
);
const creator = handoff.contracts[1].address as Address;
const wallet = handoff.contracts[0].address as Address;
const m = (changes: Partial<Market> = {}): Market => ({
  id: 1n,
  creator,
  state: 1,
  closeTime: 1000n,
  resolveAfter: 2000n,
  requestedAt: 0n,
  deadline: 606800n,
  panelSize: 5,
  quorum: 4,
  oracleSpent: false,
  burnPaid: false,
  signer: creator,
  oracle: { intake: creator, asset: wallet, action: zeroHash, price: 50n },
  requestId: zeroHash,
  boundDigest: zeroHash,
  failureReason: zeroHash,
  yesPool: 40000n,
  noPool: 100000n,
  claimedWinnerStake: 0n,
  paidProfit: 0n,
  title: "Test case",
  oracleBody: "0x",
  ...changes,
});
test("implementation-derived canonical ABI hashes match both handoff hashes", () => {
  for (const contract of handoff.contracts) {
    const abi = JSON.parse(
      readFileSync(
        new URL(`../../docs/abi/${contract.name}.json`, import.meta.url),
        "utf8",
      ),
    );
    assert.equal(canonicalHash(abi), contract.abiHash);
  }
});
test("amounts reject zero, negative, scientific notation, excess precision and overflow", () => {
  assert.equal(amountOf("1.234567", 6), 1234567n);
  for (const input of ["0", "-1", "1e3", "1.1234567", "NaN"])
    assert.throws(() => amountOf(input, 6));
  assert.throws(() => amountOf("256", 0, 255n));
});
test("closed open-enum markets are never represented as accepting bets", () => {
  assert.equal(marketStatus(m(), 999), "Open");
  assert.equal(marketStatus(m(), 1000), "Awaiting jury");
  assert.equal(marketStatus(m(), 606800), "Timed out");
  assert.equal(marketStatus(m({ state: 2 }), 606799), "Jury deliberating");
  assert.equal(poolShare(m({ yesPool: 0n, noPool: 0n })), null);
});
test("payout matches losing-pool fees, creator bond, void refund and last-winner rounding", () => {
  assert.deepEqual(
    claimEstimate(
      m({ state: 3, oracleSpent: true }),
      { yes: 10000n, no: 0n, claimed: false },
      wallet,
      1000000n,
    ),
    { payout: 34500n, refund: 0n },
  );
  assert.deepEqual(
    claimEstimate(
      m({ state: 3, oracleSpent: true }),
      { yes: 0n, no: 0n, claimed: false },
      creator,
      1000000n,
    ),
    { payout: 1001000n, refund: 0n },
  );
  assert.deepEqual(
    claimEstimate(
      m({ state: 5 }),
      { yes: 200n, no: 100n, claimed: false },
      creator,
      1000000n,
    ),
    { payout: 1000300n, refund: 50n },
  );
  assert.deepEqual(
    claimEstimate(
      m({ state: 5 }),
      { yes: 200n, no: 100n, claimed: true },
      creator,
      1000000n,
    ),
    { payout: 0n, refund: 0n },
  );
  const last = m({
    state: 3,
    yesPool: 3n,
    noPool: 10n,
    claimedWinnerStake: 2n,
    paidProfit: 6n,
  });
  assert.equal(
    claimEstimate(last, { yes: 1n, no: 0n, claimed: false }, wallet, 0n).payout,
    5n,
  );
  assert.equal(
    claimEstimate(
      m({ state: 4, yesPool: 0n }),
      { yes: 0n, no: 100n, claimed: false },
      wallet,
      0n,
    ).payout,
    100n,
  );
});
test("create JSON escapes user text and fixes five-seat bool/panel defaults and observation", () => {
  const result = buildMarket(
    {
      title: "A title",
      question: 'Does "quoted text" \\ count? <script>alert(1)</script>',
      evidence: "Official public source",
      definitions: 'Boundary: "YES"',
      observation: "2030-01-02T00:00:00Z",
      close: "2030-01-01T00:00:00Z",
      resolve: "2030-01-03T00:00:00Z",
    },
    handoff.chainId,
    1,
  );
  const body = JSON.parse(result.body);
  assert.equal(body.panelSize, 5);
  assert.equal(body.quorum, 4);
  assert.equal(body.window.hours, 24);
  assert.equal(body.answerType, "bool");
  assert.equal(body.evidence, "panel");
  assert.equal(body.chainId, handoff.chainId);
  assert.equal(body.definitions.observation, "2030-01-02T00:00:00.000Z");
  assert.equal(
    body.question,
    'Does "quoted text" \\ count? <script>alert(1)</script>',
  );
  assert.throws(() =>
    buildMarket(
      {
        title: "x".repeat(201),
        question: "q",
        evidence: "s",
        definitions: "",
        observation: "",
        close: "",
        resolve: "",
      },
      1,
      1,
    ),
  );
  assert.throws(() =>
    buildMarket(
      {
        title: "t",
        question: "q",
        evidence: "s",
        definitions: "",
        observation: "2020-01-01",
        close: "2030-01-01",
        resolve: "2030-01-02",
      },
      1,
      1,
    ),
  );
});
test("slippage uses integer rounding and rejects unbounded tolerances", () => {
  assert.equal(slippageMinimum(1001n, "0.5"), 995n);
  for (const invalid of ["0", "6", "-1", "0.001", "abc"])
    assert.throws(() => slippageMinimum(1000n, invalid));
});
test("swap routing preserves every attested pool field and derives both directions", () => {
  const key = handoff.poolKey as PoolKey;
  for (const [input, direction] of [
    [key.currency0, true],
    [key.currency1, false],
  ] as const) {
    const encoded = swapEncoding(key, input, 100n, 90n, 1000n);
    assert.equal(encoded.commands, "0x10");
    assert.equal(encoded.value, 0n);
    const [actions, params] = decodeAbiParameters(
      parseAbiParameters("bytes,bytes[]"),
      encoded.inputs[0],
    );
    assert.equal(actions, "0x060c0f");
    const [swap] = decodeAbiParameters(
      parseAbiParameters(
        "((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,bytes hookData)",
      ),
      params[0],
    );
    assert.equal(swap.zeroForOne, direction);
    assert.equal(swap.poolKey.hooks.toLowerCase(), key.hooks);
    assert.equal(swap.poolKey.fee, key.fee);
    assert.equal(swap.poolKey.tickSpacing, key.tickSpacing);
    assert.equal(swap.amountIn, 100n);
    assert.equal(swap.amountOutMinimum, 90n);
    assert.equal(
      decodeAbiParameters(
        parseAbiParameters("address,uint256"),
        params[1],
      )[0].toLowerCase(),
      input,
    );
    assert.equal(
      decodeAbiParameters(parseAbiParameters("address,uint256"), params[2])[1],
      90n,
    );
  }
});
test("extended swap tuple includes minHopPrice zero and native input sends value", () => {
  const key = { ...handoff.poolKey, currency0: zeroAddress } as PoolKey;
  const encoded = swapEncoding(key, zeroAddress, 100n, 90n, 1000n, true);
  assert.equal(encoded.value, 100n);
  const [, params] = decodeAbiParameters(
    parseAbiParameters("bytes,bytes[]"),
    encoded.inputs[0],
  );
  const [swap] = decodeAbiParameters(
    parseAbiParameters(
      "((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,uint256 minHopPriceX36,bytes hookData)",
    ),
    params[0],
  );
  assert.equal(swap.minHopPriceX36, 0n);
  assert.equal(swap.hookData, "0x");
});
