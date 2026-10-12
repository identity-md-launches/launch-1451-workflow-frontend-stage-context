// Render the existing courtroom seal and design tokens into a static share asset.
// Run with npm run share:image; no RPC or wallet requests are made.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { CourtSeal } from "../src/components/Shell";

const styles = await readFile(
  new URL("../src/styles.css", import.meta.url),
  "utf8",
);
const browser = await chromium.launch({
  executablePath: process.env.TRIBUNAL_CHROMIUM,
  headless: true,
  args: ["--no-sandbox"],
});
try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
  });
  await page.setContent(`<!doctype html><html lang="en"><head><meta charset="utf-8">
    <style>${styles}
      body { width: 1200px; height: 630px; border-top: 5px solid var(--accent); }
      .share { padding: 64px 72px; height: 100%; display: flex; align-items: center; gap: 68px; }
      .share-copy { flex: 1; }
      .share-brand { font: 400 38px/1.2 var(--serif); color: var(--accent); margin-bottom: 44px; }
      .share h1 { font: 400 62px/1.1 var(--serif); letter-spacing: -0.035em; margin-bottom: 28px; }
      .share em { color: var(--accent); }
      .share p { color: var(--muted); font-size: 22px; line-height: 1.6; max-width: 500px; }
      .share .court-seal { width: 292px; height: 292px; opacity: 1; }
      .share .seal-inner { gap: 25px; }
      .share .seal-top, .share .seal-bottom { font-size: 12px; }
      .share .seal-inner svg { width: 88px; height: 88px; }
    </style></head><body><main class="share"><div class="share-copy">
      <div class="share-brand">The Tribunal</div>
      <h1>No admins. No votes.<br>A jury of <em>agents.</em></h1>
      <p>Prediction markets judged by a jury of IMD agents.</p>
    </div>${renderToStaticMarkup(createElement(CourtSeal))}</main></body></html>`);
  await page.screenshot({
    path: fileURLToPath(new URL("../public/share.png", import.meta.url)),
    type: "png",
  });
  console.log("Rendered web/public/share.png (1200 × 630).");
} finally {
  await browser.close();
}
