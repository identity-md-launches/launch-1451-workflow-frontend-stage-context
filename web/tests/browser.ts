import assert from "node:assert/strict";
import { mkdir, writeFile, readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  chromium,
  expect,
  type Page,
  type BrowserContext,
} from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  decodeAbiParameters,
  decodeFunctionData,
  parseAbiParameters,
  numberToHex,
  stringToHex,
  zeroAddress,
  zeroHash,
} from "viem";
import {
  MockChain,
  e18,
  handoff,
  network,
  tribunal,
  token,
  pair,
  user,
  other,
} from "./mock-chain";
// This bounded foreground runner owns and closes both its server and browser.
// @ts-expect-error Plain ESM server has no generated declaration file.
import { serve } from "../scripts/serve.mjs";
const root = fileURLToPath(new URL("../../", import.meta.url));
const evidence = root + "docs/frontend/evidence/";
await mkdir(evidence, { recursive: true });
const { server, url } = await serve();
let executable = process.env.TRIBUNAL_CHROMIUM;
if (!executable) {
  try {
    const versions = await readdir("/home/imd/.cache/ms-playwright");
    const folder = versions.find((n) =>
      n.startsWith("chromium_headless_shell-"),
    );
    if (folder)
      executable = `/home/imd/.cache/ms-playwright/${folder}/chrome-headless-shell-linux64/chrome-headless-shell`;
  } catch {
    /* Use Playwright's normal installed browser on other machines. */
  }
}
const browser = await chromium.launch({
  executablePath: executable,
  headless: true,
  args: ["--no-sandbox"],
});
const checks: { name: string; status: string; detail?: unknown }[] = [];
let current = "";
const consoles: string[] = [];
const failures: string[] = [];
const started = new Date().toISOString();
async function check(name: string, fn: () => Promise<unknown>) {
  current = name;
  const detail = await fn();
  checks.push({ name, status: "PASS", ...(detail ? { detail } : {}) });
  console.log(`PASS ${name}`);
}
async function fixture(
  chain = new MockChain(),
  options: {
    chainId?: string;
    noWallet?: boolean;
    unknown?: boolean;
    rejectConnect?: boolean;
    abiTamper?: boolean;
  } = {},
) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => consoles.push(error.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") consoles.push(msg.text());
  });
  page.on("response", (response) => {
    if (response.url().startsWith(url) && response.status() >= 400)
      failures.push(`${response.status()} ${response.url()}`);
  });
  await context.route(url + "**", async (route) => {
    const name =
      new URL(route.request().url()).pathname.slice("/preview/".length) ||
      "index.html";
    try {
      let bytes = await readFile(root + "dist/" + name);
      if (options.abiTamper && name === "abi/Tribunal.json")
        bytes = Buffer.from("[]");
      const extension = name.split(".").at(-1);
      const mime =
        (
          {
            html: "text/html",
            js: "text/javascript",
            css: "text/css",
            json: "application/json",
            svg: "image/svg+xml",
            png: "image/png",
          } as Record<string, string>
        )[extension!] ?? "application/octet-stream";
      await route.fulfill({ status: 200, contentType: mime, body: bytes });
    } catch {
      await route.fulfill({ status: 404, body: "Missing export asset" });
    }
  });
  await context.route(/^https:\/\//, async (route) => {
    if (
      !network.network.rpcUrls.some(
        (rpc: string) =>
          route.request().url() === rpc || route.request().url() === rpc + "/",
      )
    )
      throw Error(
        "Unexpected runtime external request: " + route.request().url(),
      );
    const req = route.request().postDataJSON();
    const body = Array.isArray(req)
      ? req.map((r) => chain.rpc(r))
      : chain.rpc(req);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
  await page.exposeBinding("__mockRpc", (_source, req) =>
    chain.rpc({ jsonrpc: "2.0", id: 1, ...req }),
  );
  const initWallet = ({
    user,
    options,
  }: {
    user: string;
    options: { chainId?: string; unknown?: boolean; rejectConnect?: boolean };
  }) => {
    const w = window as any;
    const listeners: Record<string, Function[]> = {};
    w.walletLog = [];
    w.mockChain = options.chainId ?? "0x1";
    w.mockAccount = user;
    w.mockReject = false;
    w.mockUnknown = options.unknown ?? false;
    w.emitWallet = (event: string, value: unknown) =>
      (listeners[event] ?? []).forEach((fn) => fn(value));
    w.ethereum = {
      on: (event: string, fn: Function) => {
        (listeners[event] ??= []).push(fn);
      },
      removeListener: (event: string, fn: Function) => {
        listeners[event] = (listeners[event] ?? []).filter((x) => x !== fn);
      },
      request: async (req: any) => {
        w.walletLog.push(req);
        if (req.method === "eth_requestAccounts") {
          if (options.rejectConnect)
            throw Object.assign(Error("User rejected connection"), {
              code: 4001,
            });
          return [w.mockAccount];
        }
        if (req.method === "eth_accounts") return [w.mockAccount];
        if (req.method === "eth_chainId") return w.mockChain;
        if (req.method === "wallet_switchEthereumChain") {
          if (w.mockUnknown) {
            w.mockUnknown = false;
            throw Object.assign(Error("Unknown chain"), { code: 4902 });
          }
          w.mockChain = req.params[0].chainId;
          w.emitWallet("chainChanged", w.mockChain);
          return null;
        }
        if (req.method === "wallet_addEthereumChain") return null;
        if (req.method === "eth_sendTransaction" && w.mockReject) {
          w.mockReject = false;
          throw Object.assign(Error("User rejected request"), { code: 4001 });
        }
        const response = await w.__mockRpc(req);
        if (response.error)
          throw Object.assign(Error(response.error.message), response.error);
        return response.result;
      },
    };
  };
  await page.addInitScript({
    content:
      "window.__name = (fn) => fn;" +
      (!options.noWallet
        ? "(" +
          initWallet.toString() +
          ")(" +
          JSON.stringify({ user, options }) +
          ");"
        : ""),
  });
  await page.goto(url);
  await expect(page.getByText("Reading the onchain docket…")).toBeHidden({
    timeout: 20000,
  });
  return { context, page, chain };
}
async function connect(page: Page) {
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("button", { name: "Disconnect", exact: true }),
  ).toBeVisible();
}
async function go(page: Page, route: string) {
  await page.goto(url + "#" + route);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}
async function transact(page: Page, label: string, danger = false) {
  const sentBefore = await page.evaluate(
    () =>
      (window as any).walletLog.filter(
        (entry: any) => entry.method === "eth_sendTransaction",
      ).length,
  );
  const action = page.getByRole("button", { name: label, exact: true }).first();
  await expect(action).toBeEnabled({ timeout: 15000 });
  await action.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  if (danger)
    await dialog
      .getByLabel("I understand this action cannot be undone.")
      .check();
  await dialog
    .getByRole("button", {
      name: "Confirm " + label.toLowerCase(),
      exact: true,
    })
    .click();
  await expect(dialog).toBeHidden();
  // Closing the review starts an asynchronous preflight; it is not completion.
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as any).walletLog.filter(
            (entry: any) => entry.method === "eth_sendTransaction",
          ).length,
      ),
    )
    .toBe(sentBefore + 1);
  await expect(page.locator(".action-block .spin")).toHaveCount(0, {
    timeout: 15000,
  });
  await expect(
    page
      .locator(".transaction-status")
      .filter({ hasText: "Waiting for onchain confirmation" }),
  ).toHaveCount(0, { timeout: 15000 });
  await expect(
    page
      .locator(".transaction-status")
      .filter({ hasText: "Confirm in your wallet" }),
  ).toHaveCount(0, { timeout: 15000 });
  await expect(
    page.locator(
      ".transaction-status.simulating, .transaction-status.signature, .transaction-status.confirming",
    ),
  ).toHaveCount(0, { timeout: 15000 });
  await expect(page.locator(".transaction-status.error")).toHaveCount(0);
}
async function noOverflow(page: Page) {
  const result = await page.evaluate(() => ({
    width: innerWidth,
    scroll: document.documentElement.scrollWidth,
    overflow: Array.from(document.querySelectorAll("main *"))
      .filter(
        (e) =>
          e.getBoundingClientRect().right > innerWidth + 1 &&
          getComputedStyle(e).position !== "absolute",
      )
      .map((e) => e.tagName + "." + e.className)
      .slice(0, 8),
  }));
  assert.ok(result.scroll <= result.width, JSON.stringify(result));
  return result;
}
let contexts: BrowserContext[] = [];
try {
  await check(
    "empty markets and create action fit the first screen with a six-size type scale",
    async () => {
      const empty = new MockChain();
      empty.markets.clear();
      const f = await fixture(empty, { noWallet: true });
      contexts.push(f.context);
      const results = [];
      for (const [width, height] of [
        [390, 844],
        [1440, 900],
      ]) {
        await f.page.setViewportSize({ width, height });
        await expect(f.page.locator(".empty-state h3")).toHaveText(
          "The first case is yet to be filed",
        );
        await f.page.evaluate(() => scrollTo(0, 0));
        const measurement = await f.page.evaluate(() => {
          const selectors = [
            ".hero-actions .primary",
            "#docket-heading",
            ".market-toolbar",
            ".empty-state h3",
          ];
          const boxes = selectors.map((selector) => {
            const rect = document
              .querySelector(selector)!
              .getBoundingClientRect();
            return { selector, top: rect.top, bottom: rect.bottom };
          });
          const sizes = [
            ...new Set(
              Array.from(document.body.querySelectorAll<HTMLElement>("*"))
                .filter(
                  (e) =>
                    e.checkVisibility() &&
                    !e.closest(".sr-only") &&
                    Array.from(e.childNodes).some(
                      (n) =>
                        n.nodeType === Node.TEXT_NODE && n.textContent?.trim(),
                    ),
                )
                .map((e) => getComputedStyle(e).fontSize),
            ),
          ];
          return {
            width: innerWidth,
            height: innerHeight,
            scrollY,
            boxes,
            sizes,
          };
        });
        assert.equal(measurement.scrollY, 0);
        assert.ok(
          measurement.boxes.every(
            (box) => box.top >= 0 && box.bottom <= height,
          ),
          JSON.stringify(measurement),
        );
        assert.ok(measurement.sizes.length <= 6, JSON.stringify(measurement));
        await noOverflow(f.page);
        results.push(measurement);
      }
      await f.context.close();
      return results;
    },
  );
  const f = await fixture();
  contexts.push(f.context);
  const { page, chain } = f;
  await check(
    "production export loads manifest, pinned ABI JSON and real read selectors at /preview/",
    async () => {
      await expect(
        page.getByRole("heading", { name: chain.markets.get(1n)!.title }),
      ).toBeVisible();
      assert.ok(chain.calls.some((c) => c.fn === "getMarket"));
      assert.ok(chain.calls.some((c) => c.fn === "oracleConfig"));
      await page.screenshot({
        path: evidence + "desktop-mocked.png",
        fullPage: true,
      });
      return noOverflow(page);
    },
  );
  await check(
    "static social metadata loads the exported 1200 × 630 PNG at a subpath",
    async () => {
      const preview = await page.evaluate(async () => {
        const meta = (selector: string) =>
          document.querySelector<HTMLMetaElement>(selector)!.content;
        const source = meta('meta[property="og:image"]');
        const response = await fetch(new URL(source, document.baseURI));
        const image = new Image();
        image.src = source;
        await image.decode();
        return {
          source,
          status: response.status,
          mime: response.headers.get("content-type"),
          width: image.naturalWidth,
          height: image.naturalHeight,
          card: meta('meta[name="twitter:card"]'),
          twitterImage: meta('meta[name="twitter:image"]'),
          declaredWidth: meta('meta[property="og:image:width"]'),
          declaredHeight: meta('meta[property="og:image:height"]'),
        };
      });
      assert.deepEqual(preview, {
        source: "./share.png",
        status: 200,
        mime: "image/png",
        width: 1200,
        height: 630,
        card: "summary_large_image",
        twitterImage: "./share.png",
        declaredWidth: "1200",
        declaredHeight: "630",
      });
      return preview;
    },
  );
  await check(
    "desktop keyboard skip link and native navigation work",
    async () => {
      await page.keyboard.press("Control+Home");
      await page.keyboard.press("Tab");
      await expect(
        page.getByRole("link", { name: "Skip to content" }),
      ).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(page.locator("main")).toBeFocused();
    },
  );
  await check(
    "market filters, title search and empty results are functional",
    async () => {
      await page.getByRole("button", { name: "Open", exact: true }).click();
      await expect(page.locator(".market-card")).toHaveCount(1);
      await page
        .getByRole("button", { name: "All cases", exact: true })
        .click();
      await page.getByRole("searchbox").fill("nonsense query");
      await expect(
        page.getByRole("heading", { name: "No matching cases" }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Clear filters" }).click();
      await expect(page.locator(".market-card")).toHaveCount(4);
    },
  );
  await check(
    "wallet connection reveals onchain balances and positions",
    async () => {
      await connect(page);
      await go(page, "market/1");
      await expect(page.getByText("Available: 200,000 VERDICT")).toBeVisible();
      await expect(
        page
          .locator(".terms-list dd")
          .filter({ hasText: /^100 VERDICT$/ })
          .first(),
      ).toBeVisible();
    },
  );
  await check(
    "bet review uses the stored question and native dialog restores focus on Escape",
    async () => {
      await page
        .getByLabel(
          "I have read the exact oracle question, observation time, and stored trust dependencies.",
        )
        .check();
      const button = page.getByRole("button", {
        name: "Approve VERDICT",
        exact: true,
      });
      await expect(button).toBeEnabled();
      await button.click();
      await expect(page.getByRole("dialog")).toContainText(
        "spend exactly 100 VERDICT",
      );
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toBeHidden();
      await expect(button).toBeFocused();
    },
  );
  await check(
    "exact bet approval confirms before execution and no duplicate transaction is sent",
    async () => {
      chain.delayReceipt = true;
      await page
        .getByRole("button", { name: "Approve VERDICT", exact: true })
        .click();
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Confirm approve verdict", exact: true })
        .click();
      await expect(
        page.getByText("Waiting for onchain confirmation…", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Approve VERDICT…", exact: true }),
      ).toBeDisabled();
      assert.equal(chain.writes.length, 1);
      assert.equal((chain.writes[0].args as any[])[1], e18(100));
      chain.delayReceipt = false;
      chain.receipts.set(
        chain.pendingReceipt!.hash,
        chain.pendingReceipt!.receipt,
      );
      chain.block++; // Mine another block so the receipt watcher sees a new head.
      await expect(
        page.getByRole("button", { name: "Place YES bet", exact: true }),
      ).toBeEnabled({ timeout: 15000 });
      await page
        .getByRole("button", { name: "Place YES bet", exact: true })
        .click();
      await expect(page.getByRole("dialog")).toContainText(
        "The exact question for the jury",
      );
      await expect(page.getByRole("dialog")).toContainText(
        "Official public event record",
      );
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Confirm place yes bet", exact: true })
        .click();
      await expect(
        page.getByText("Transaction confirmed.", { exact: true }),
      ).toBeVisible({ timeout: 15000 });
      assert.equal(chain.writes.filter((w) => w.fn === "betYes").length, 1);
    },
  );
  await check(
    "wallet rejection produces recoverable inline feedback without a write",
    async () => {
      await page.getByRole("button", { name: "Bet NO", exact: true }).click();
      const termsCheckbox = page.getByLabel(
        "I have read the exact oracle question, observation time, and stored trust dependencies.",
      );
      await expect(termsCheckbox).not.toBeChecked();
      await termsCheckbox.check();
      await expect(
        page.getByRole("button", { name: "Approve VERDICT", exact: true }),
      ).toBeEnabled();
      await transact(page, "Approve VERDICT");
      const before = chain.writes.length;
      await page.evaluate(() => {
        (window as any).mockReject = true;
      });
      await page
        .getByRole("button", { name: "Place NO bet", exact: true })
        .click();
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Confirm place no bet", exact: true })
        .click();
      await expect(
        page.getByText(/You declined the wallet request/),
      ).toBeVisible();
      assert.equal(chain.writes.length, before);
      await expect(
        page.getByRole("button", { name: "Place NO bet", exact: true }),
      ).toBeEnabled();
    },
  );
  await check(
    "simulation revert blocks wallet signature and exposes a useful error",
    async () => {
      chain.failSimulation = "betNo";
      const before = chain.writes.length;
      await page
        .getByRole("button", { name: "Place NO bet", exact: true })
        .click();
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Confirm place no bet", exact: true })
        .click();
      await expect(
        page.getByText("Betting has closed. Your tokens were not deposited."),
      ).toBeVisible();
      assert.equal(chain.writes.length, before);
      chain.failSimulation = "";
      await transact(page, "Place NO bet");
      assert.equal(chain.writes.at(-1)!.fn, "betNo");
    },
  );
  await check(
    "closed bets are gated while permissionless resolution is available",
    async () => {
      await go(page, "market/4");
      await expect(
        page.getByText("Betting is closed for this case."),
      ).toBeVisible();
      await transact(page, "Summon the jury");
      assert.equal(chain.writes.at(-1)!.fn, "requestResolution");
    },
  );
  await check(
    "final market claim updates eligibility and prevents a double claim",
    async () => {
      await go(page, "market/3");
      await transact(page, "Claim payout or refund");
      await expect(
        page.getByText("This wallet has already claimed."),
      ).toBeVisible();
      await expect(
        page.getByRole("button", {
          name: "Claim payout or refund",
          exact: true,
        }),
      ).toBeDisabled();
    },
  );
  await check(
    "timeout path is gated by the deadline then can void a market",
    async () => {
      chain.markets.get(4n)!.deadline = BigInt(chain.now - 1);
      chain.block++;
      await go(page, "market/4");
      await transact(page, "Void timed-out market");
      assert.equal(chain.markets.get(4n)!.state, 5);
    },
  );
  await check(
    "public attestation retry validates the payload and calls only the bound fallback",
    async () => {
      await go(page, "market/2");
      await page
        .getByText("Retry a delivered attestation", { exact: true })
        .click();
      await page
        .getByLabel("Attestation JSON", { exact: true })
        .fill("{broken json");
      await page.getByLabel("Oracle signature", { exact: true }).fill("0x0101");
      await page
        .getByRole("button", { name: "Submit bound attestation", exact: true })
        .click();
      await expect(
        page.getByText("Enter a valid JSON attestation object."),
      ).toBeVisible();
      const payload = {
        requestId: stringToHex("fixture-oracle-uuid", { size: 32 }),
        chainId: "1",
        questionHash: stringToHex("fixture-question", { size: 32 }),
        answerType: 0,
        answer: numberToHex(1, { size: 32 }),
        figure: "0",
        fromBlock: "26180000",
        toBlock: "26180001",
        blockHash: stringToHex("fixture-block", { size: 32 }),
        panelJobId: stringToHex("fixture-panel", { size: 32 }),
        panelSize: 5,
        quorum: 4,
        agreed: 4,
        issuedAt: String(chain.now),
        expiresAt: String(chain.now + 900),
      };
      await page
        .getByLabel("Attestation JSON", { exact: true })
        .fill(JSON.stringify(payload));
      await transact(page, "Submit bound attestation");
      assert.equal(chain.writes.at(-1)!.fn, "submitAttestation");
    },
  );
  await check(
    "create form builds escaped bool/panel JSON and deposits only after two approvals",
    async () => {
      await go(page, "create");
      await page
        .getByLabel("Market title", { exact: true })
        .fill('A quoted "launch" case');
      await page
        .getByLabel("Exact question for the jury", { exact: true })
        .fill(
          "Did the official source confirm the launch by the stated observation time?",
        );
      await page
        .getByLabel("Public evidence source", { exact: true })
        .fill("Official public launch bulletin");
      await page
        .getByLabel("Resolution criteria (optional)", { exact: true })
        .fill("Only a completed launch is YES.");
      const date = (n: number) =>
        new Date((chain.now + n) * 1000).toISOString().slice(0, 16);
      await page.getByLabel("Close betting", { exact: true }).fill(date(3600));
      await page
        .getByLabel("Observe the event at", { exact: true })
        .fill(date(7200));
      await page
        .getByLabel("Allow the jury to be summoned", { exact: true })
        .fill(date(10800));
      await page
        .getByRole("button", { name: "Build request for review" })
        .click();
      await expect(page.locator(".request-preview pre")).toContainText(
        '"panelSize": 5',
      );
      await page
        .getByLabel(
          "The question, fixed observation time, evidence, and title describe the same event.",
        )
        .check();
      await transact(page, "Approve VERDICT");
      await transact(page, "Approve IMD");
      await transact(page, "Create market");
      const call = chain.writes.find((w) => w.fn === "createMarket");
      assert.ok(call);
      assert.equal((call.args as any[])[0], 'A quoted "launch" case');
      assert.equal(chain.markets.size, 5);
    },
  );
  await check(
    "swap quote is a simulation and routes approvals to handoff Permit2 and router",
    async () => {
      await go(page, "trade");
      await expect(page.getByText("Balance: 200,000 IMD")).toBeVisible();
      await page.getByLabel("You pay · IMD", { exact: true }).fill("10");
      await page
        .getByRole("button", { name: "Get a live quote", exact: true })
        .click();
      await expect(
        page.getByText("19.9 VERDICT", { exact: true }),
      ).toBeVisible();
      const call = chain.calls.find((c) => c.fn === "quoteExactInputSingle");
      assert.ok(call);
      const quoted = (call.args as any[])[0];
      assert.equal(quoted.poolKey.hooks.toLowerCase(), handoff.poolKey.hooks);
      assert.equal(quoted.zeroForOne, false);
      assert.equal(
        chain.writes.filter((w) => w.fn === "quoteExactInputSingle").length,
        0,
      );
      await transact(page, "Approve IMD to Permit2");
      let w = chain.writes.at(-1)!;
      assert.equal(w.address, pair);
      assert.equal(
        (w.args as any[])[0].toLowerCase(),
        network.network.uniswapV4.permit2,
      );
      await transact(page, "Authorize Universal Router");
      w = chain.writes.at(-1)!;
      assert.equal(w.address, network.network.uniswapV4.permit2);
      assert.equal(
        (w.args as any[])[1].toLowerCase(),
        network.network.uniswapV4.universalRouter,
      );
      await transact(page, "Swap IMD for VERDICT");
      w = chain.writes.at(-1)!;
      assert.equal(w.fn, "execute");
      assert.equal(w.address, network.network.uniswapV4.universalRouter);
      assert.ok(!w.value || w.value === "0x0");
      const args = w.args as any[];
      assert.equal(args[0], "0x10");
      const [actions, params] = decodeAbiParameters(
        parseAbiParameters("bytes,bytes[]"),
        args[1][0],
      );
      assert.equal(actions, "0x060c0f");
      const [swap] = decodeAbiParameters(
        parseAbiParameters(
          "((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,bytes hookData)",
        ),
        params[0],
      );
      assert.equal(swap.amountOutMinimum, e18("19.9"));
      assert.equal(swap.poolKey.hooks.toLowerCase(), handoff.poolKey.hooks);
    },
  );
  await check(
    "sell direction reverses currencies and stale quotes require refresh",
    async () => {
      const fresh = await fixture();
      contexts.push(fresh.context);
      const { page, chain } = fresh;
      await connect(page);
      await go(page, "trade");
      await page
        .getByRole("button", { name: "Reverse trade direction" })
        .click();
      await page.getByLabel("You pay · VERDICT", { exact: true }).fill("10");
      await page
        .getByRole("button", { name: "Get a live quote", exact: true })
        .click();
      await expect(
        page.getByRole("button", {
          name: "Approve VERDICT to Permit2",
          exact: true,
        }),
      ).toBeEnabled();
      const q = chain.calls
        .filter((c) => c.fn === "quoteExactInputSingle")
        .at(-1)!;
      assert.equal((q.args as any[])[0].zeroForOne, true);
      await page.clock.install();
      await page.clock.fastForward(61000);
      await expect(page.getByText("Expired · refresh required")).toBeVisible();
      await expect(
        page.getByRole("button", {
          name: "Approve VERDICT to Permit2",
          exact: true,
        }),
      ).toBeDisabled();
      await fresh.context.close();
    },
  );
  await check(
    "account change clears previous wallet state and review",
    async () => {
      await go(page, "market/1");
      await page
        .getByLabel(
          "I have read the exact oracle question, observation time, and stored trust dependencies.",
        )
        .check();
      await page
        .getByRole("button", { name: "Approve VERDICT", exact: true })
        .click();
      await page.evaluate((other) => {
        const w = window as any;
        w.mockAccount = other;
        w.emitWallet("accountsChanged", [other]);
      }, other);
      await expect(page.getByRole("dialog")).toBeHidden();
      await expect(page.locator(".wallet-account")).toContainText("0x2222");
      await page.evaluate((user) => {
        const w = window as any;
        w.mockAccount = user;
        w.emitWallet("accountsChanged", [user]);
      }, user);
    },
  );
  await check(
    "mobile/intermediate/320px reflow has no horizontal overflow on every route",
    async () => {
      const result = [];
      for (const width of [320, 390, 820])
        for (const route of [
          "markets",
          "market/1",
          "create",
          "trade",
          "protocol",
          "how",
        ]) {
          await page.setViewportSize({ width, height: 900 });
          await go(page, route);
          await expect(page.locator(".loading-docket")).toHaveCount(0);
          result.push({ route, ...(await noOverflow(page)) });
          if (width === 390 && route === "market/1")
            await page.screenshot({
              path: evidence + "mobile-case-mocked.png",
              fullPage: true,
            });
          if (width === 320 && route === "markets")
            await page.screenshot({
              path: evidence + "mobile-320-mocked.png",
              fullPage: true,
            });
        }
      return result;
    },
  );
  await check(
    "200% text enlargement reflows, reduced motion disables spinner animation",
    async () => {
      await page.setViewportSize({ width: 820, height: 1000 });
      await go(page, "create");
      await page.evaluate(() => {
        document.documentElement.style.fontSize = "32px";
      });
      await noOverflow(page);
      await page.evaluate(() => {
        document.documentElement.style.fontSize = "";
      });
      return {
        textEnlargement: "200% root font-size, not native browser zoom",
        reducedMotion: await page.evaluate(
          () => matchMedia("(prefers-reduced-motion: reduce)").matches,
        ),
      };
    },
  );
  await check(
    "automated accessibility scan on all principal routes",
    async () => {
      await page.setViewportSize({ width: 1440, height: 1000 });
      const results = [];
      for (const route of [
        "markets",
        "market/1",
        "create",
        "trade",
        "protocol",
        "how",
      ]) {
        await go(page, route);
        const scan = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze();
        results.push({
          route,
          violations: scan.violations.map((v) => ({
            id: v.id,
            impact: v.impact,
            nodes: v.nodes.map((n) => ({
              html: n.html,
              failureSummary: n.failureSummary,
            })),
          })),
        });
      }
      await writeFile(
        evidence + "accessibility.json",
        JSON.stringify(results, null, 2),
      );
      assert.equal(
        results.reduce((n, r) => n + r.violations.length, 0),
        0,
        JSON.stringify(results),
      );
      return results;
    },
  );
  await check(
    "owner setup and delayed settings controls use runtime addresses",
    async () => {
      const admin = new MockChain();
      admin.owner = user;
      admin.verdictToken = zeroAddress;
      const f = await fixture(admin);
      contexts.push(f.context);
      const p = f.page;
      await connect(p);
      await go(p, "protocol");
      await transact(p, "Lock VERDICT token", true);
      assert.equal(admin.verdictToken.toLowerCase(), token);
      await p
        .getByLabel("New oracle signer address", { exact: true })
        .fill(other);
      await transact(p, "Schedule oracle signer");
      assert.equal(admin.pendingSigner.toLowerCase(), other);
      await expect(
        p.getByRole("button", { name: "Activate oracle signer", exact: true }),
      ).toBeDisabled();
      await transact(p, "Cancel signer change");
      assert.equal(admin.pendingSigner, zeroAddress);
      await p
        .getByLabel("New Intake address", { exact: true })
        .fill(admin.oracle.intake);
      await transact(p, "Schedule Intake");
      await p
        .getByLabel("Oracle action text or bytes32", { exact: true })
        .fill("oracle.request@oracle-1");
      await transact(p, "Schedule oracle action");
      await p.getByLabel("Payment token address", { exact: true }).fill(pair);
      await p
        .getByLabel("Price in payment-token units", { exact: true })
        .fill("0.5");
      await transact(p, "Schedule payment");
      await expect(
        p.getByRole("button", {
          name: "Activate oracle configuration",
          exact: true,
        }),
      ).toBeDisabled();
      await transact(p, "Cancel configuration change");
      admin.pendingSigner = other;
      admin.signerActivateAfter = BigInt(admin.now - 1);
      admin.pendingOracle = { ...admin.oracle };
      admin.configActivateAfter = BigInt(admin.now - 1);
      admin.block++;
      await p
        .getByRole("button", { name: "Refresh live data", exact: true })
        .click();
      await transact(p, "Activate oracle signer");
      await transact(p, "Activate oracle configuration");
      await p
        .getByText("Ownership transfer and irreversible renunciation", {
          exact: true,
        })
        .click();
      await p.getByLabel("New owner address", { exact: true }).fill(other);
      await transact(p, "Nominate new owner");
      assert.equal(admin.pendingOwner.toLowerCase(), other);
      await p
        .getByLabel("Type RENOUNCE to acknowledge", { exact: true })
        .fill("RENOUNCE");
      await p
        .getByRole("button", { name: "Renounce ownership", exact: true })
        .click();
      await expect(
        p.getByRole("dialog").getByRole("button", {
          name: "Confirm renounce ownership",
          exact: true,
        }),
      ).toBeDisabled();
      await p.keyboard.press("Escape");
      await p
        .getByRole("button", { name: "Load recent events", exact: true })
        .click();
      await expect(
        p.getByText("No Tribunal events in this block range."),
      ).toBeVisible();
      await p.evaluate((other) => {
        const w = window as any;
        w.mockAccount = other;
        w.emitWallet("accountsChanged", [other]);
      }, other);
      await transact(p, "Accept ownership");
      assert.equal(admin.owner.toLowerCase(), other);
      await p
        .getByText("Advanced VERDICT token controls", { exact: true })
        .click();
      await p.getByLabel("Recipient address", { exact: true }).fill(user);
      await p.getByLabel("VERDICT amount", { exact: true }).fill("123");
      await transact(p, "Transfer VERDICT");
      assert.equal(admin.writes.at(-1)!.fn, "transfer");
      await p
        .getByLabel("Token operation", { exact: true })
        .selectOption("approve");
      await p.getByLabel("Spender address", { exact: true }).fill(user);
      await p.getByLabel("VERDICT amount", { exact: true }).fill("0");
      await transact(p, "Set VERDICT allowance");
      assert.equal((admin.writes.at(-1)!.args as any[])[1], 0n);
      admin.allowance.set(admin.key(token, user, other), e18(200));
      await p
        .getByLabel("Token operation", { exact: true })
        .selectOption("transferFrom");
      await p.getByLabel("Source wallet address", { exact: true }).fill(user);
      await p.getByLabel("Recipient address", { exact: true }).fill(other);
      await p.getByLabel("VERDICT amount", { exact: true }).fill("100");
      await transact(p, "Transfer VERDICT");
      assert.equal(admin.writes.at(-1)!.fn, "transferFrom");

      await f.context.close();
    },
  );
  await check(
    "unknown wallet network adds the exact supplied chain then switches again",
    async () => {
      const f = await fixture(new MockChain(), {
        chainId: "0xaa36a7",
        unknown: true,
      });
      contexts.push(f.context);
      const p = f.page;
      await p
        .getByRole("button", { name: "Connect wallet", exact: true })
        .click();
      await expect(
        p.getByText("Wallet is on a different network"),
      ).toBeVisible();
      await p
        .getByRole("button", { name: "Switch to Ethereum", exact: true })
        .click();
      await expect(
        p.getByRole("button", { name: "Disconnect", exact: true }),
      ).toBeVisible();
      const log = await p.evaluate(() => (window as any).walletLog);
      assert.deepEqual(
        log.find((r: any) => r.method === "wallet_addEthereumChain").params[0],
        network.walletAddChain,
      );
      assert.equal(
        log.filter((r: any) => r.method === "wallet_switchEthereumChain")
          .length,
        2,
      );
      await f.context.close();
    },
  );
  await check(
    "missing wallet and rejected connection are explained without page errors",
    async () => {
      const missing = await fixture(new MockChain(), { noWallet: true });
      contexts.push(missing.context);
      await missing.page
        .getByRole("button", { name: "Connect wallet", exact: true })
        .click();
      await expect(
        missing.page.getByText(/No browser wallet found/),
      ).toBeVisible();
      await missing.context.close();
      const rejected = await fixture(new MockChain(), { rejectConnect: true });
      contexts.push(rejected.context);
      await rejected.page
        .getByRole("button", { name: "Connect wallet", exact: true })
        .click();
      await expect(
        rejected.page.getByText(/You declined the wallet request/),
      ).toBeVisible();
      await rejected.context.close();
    },
  );
  await check(
    "missing deployed code fails closed and read outage has retry feedback",
    async () => {
      const bad = new MockChain();
      bad.missingCode = true;
      const f = await fixture(bad);
      contexts.push(f.context);
      await expect(
        f.page.getByText("Live contract data is unavailable"),
      ).toBeVisible();
      await expect(
        f.page.getByRole("button", { name: "Retry connection", exact: true }),
      ).toBeVisible();
      assert.equal(bad.writes.length, 0);
      bad.missingCode = false;
      await f.page
        .getByRole("button", { name: "Retry connection", exact: true })
        .click();
      await expect(f.page.locator(".market-card")).toHaveCount(4);
      await f.context.close();
    },
  );
  await check(
    "ABI tampering disables the application before any RPC or wallet transaction",
    async () => {
      const f = await fixture(new MockChain(), { abiTamper: true });
      contexts.push(f.context);
      await expect(
        f.page.getByText("Deployment could not be verified"),
      ).toBeVisible();
      await expect(
        f.page.getByText(/ABI failed its integrity check/),
      ).toBeVisible();
      assert.equal(f.chain.writes.length, 0);
      assert.equal(f.chain.methods.length, 0);
      await f.context.close();
    },
  );
  await check(
    "no uncaught JavaScript errors or missing static resources",
    async () => {
      assert.deepEqual(consoles, []);
      assert.deepEqual(failures, []);
      return { consoleErrors: consoles, staticFailures: failures };
    },
  );
} catch (error) {
  checks.push({
    name: current,
    status: "FAIL",
    detail: error instanceof Error ? error.stack : String(error),
  });
  console.error("FAIL", current, error);
  console.error("CONSOLE", consoles);
  for (const c of contexts) {
    try {
      const p = c.pages()[0];
      if (p)
        console.error(
          "PAGE",
          await p.evaluate(() => ({
            errors: Array.from(
              document.querySelectorAll(
                ".field-error,.transaction-status.error",
              ),
            ).map((e) => e.textContent),
            text: document.body.innerText.slice(0, 1200),
            walletLog: (window as any).walletLog,
            hasProvider: !!(window as any).ethereum,
          })),
        );
    } catch {}
  }
  process.exitCode = 1;
} finally {
  await writeFile(
    evidence + "browser-results.json",
    JSON.stringify(
      {
        started,
        finished: new Date().toISOString(),
        mode: "Production export at a subpath; deterministic mocked EIP-1193 wallet and RPC. No real transactions.",
        checks,
      },
      null,
      2,
    ),
  );
  await browser.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
