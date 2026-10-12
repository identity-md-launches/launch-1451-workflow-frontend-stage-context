# Frontend review revision

Complete for the stated revision scope. All four reviewer reports reproduced and were fixed. `.imd-responses.json` contains the per-finding responses. Contract source, ABIs, deployment/network inputs and transaction logic were preserved.

This report supersedes the initial delivery's export totals and browser results. The initial record remains in `VALIDATION.md`. All paths below are relative to this repository; revision evidence is under `docs/frontend/evidence/revision/`.

## Reproduction and fixes

The supplied `design-critic/scripts/taste.mjs` was not present in this attempt's read inputs. Equivalent direct Chromium measurements used the actual `dist/` served at `/preview/`, configured live public RPC, no connected wallet and `scrollY = 0`. The browser connector could not find its expected installation; the installed `/opt/ms-playwright/chromium-1246/chrome-linux64/chrome` ran successfully with writable XDG configuration/cache directories under `/tmp`. Its reported version is **154.0.8037.0**, rather than the reviewer's Chromium 155. Fonts therefore need not have identical metrics. No connector screenshots or unavailable taste checks are claimed.

| Finding | Reproduction | Correction and recheck |
| --- | --- | --- |
| `2c27a26d…` — first-screen docket | Original export at 390 × 844: Create a market y=485.31, docket heading y=909.31, empty-state heading y=1222.86. At 1440 × 900 the docket heading was y=885.64. | `web/src/components/Markets.tsx:86` shortens the hero, removes its eyebrow/secondary link, moves statistics after the docket, and labels it Markets. `web/src/styles.css:1605` reduces mobile spacing; `web/src/components/ui.tsx:405` removes the empty-state marker. Final mobile action y=418.75, Markets y=527.94, filters y=579.13 and empty-state heading y=714.52–795.70. Desktop Markets y=697.94 and empty-state heading y=847.94–888.53. The actual product state and primary Create action are now visible without scrolling. |
| `41e54599…` — missing share image | Original static HTML had no `og:image`; the seven-asset export had no raster share image. | `web/index.html:18` declares the local 1200 × 630 PNG, dimensions/type/alt text and Twitter large card. `web/scripts/share-image.ts` renders the existing CourtSeal/palette/identity into `web/public/share.png`; Vite copies it and the manifest hashes it. A real HTTP request returned 200/image/png; browser decoding confirmed 1200 × 630. Publication URL handling is documented in `web/README.md`. |
| `00933605…` — inconsistent type sizes | Original computed text sizes included 28.8px section headings, 28px empty heading, 26.4px statistics and 24px principle heading; mobile and desktop had more than eight sizes. | `web/src/styles.css:37` and shared chrome/market rules use six roles: 12, 14, 16, 24, 28px and the existing responsive hero display size. Removed overlapping mobile overrides. Rendered direct text-node inspection finds six sizes at 320, 390, 820, 1024 and 1440px. The 1024px check caught seal lettering wrapping after enlargement; keeping its normal 256px diameter until the existing hide breakpoint fixed that side effect. Other page-specific display typography remains intact. |
| `8b3590bf…` — checkbox reset race | Running the original browser test against the original export passed six groups, then timed out awaiting enabled Approve VERDICT in the rejection group. | `web/tests/browser.ts:533` waits for the side-change acknowledgement reset, checks the box and awaits enabled approval. There is no fixed delay and no application transaction change. Repeated full-suite results below establish that the rejection/retry and remaining groups were reached. |

The baseline measurements count rendered elements containing their own text nodes (excluding `.sr-only`), not taste's recurrence algorithm: 14 sizes on mobile and 17 on desktop before the change, six after. The differing baseline totals do not change the reproduced inconsistent roles. `baseline/layout.json`, before screenshots and `baseline/browser-results.json` preserve the evidence rather than relying on the reviewer report.

## Checks on the worker

Node 24.9.0, npm 11.6.0. Installed the unchanged lockfile with `npm ci --cache /tmp/tribunal-npm-cache`; no vendored packages or cache files are delivered. npm reported three existing dependency advisories; dependency upgrades were outside this targeted revision. No credentials or real transaction signing were used.

| Command/check | Result | Evidence |
| --- | --- | --- |
| `npm --prefix web run typecheck` | PASS | `typecheck.log` |
| `npm --prefix web test` | PASS, 8 domain checks | `unit-tests.log` |
| `npm --prefix web run build` | PASS, including typecheck, pinned ABI verification and manifest generation | `build.log` |
| `npm --prefix web run verify` | PASS; exact handoff identifiers/contracts/ABI hashes, poolKey/network/walletAddChain, complete asset inventory and SHA-256 hashes | `manifest-check.log` |
| `npm --prefix web run format:check` | PASS | `format.log` |
| `npm --prefix web run test:browser` with `TRIBUNAL_CHROMIUM` and the two XDG directories configured | PASS, 27 groups on each of three consecutive runs | `browser-run-{1,2,3}.log`, `browser-results-{1,2,3}.json` |
| Actual HTTP `/preview/` with live RPC | PASS at 320 × 844, 390 × 844, 820 × 900, 1024 × 900 and 1440 × 900; no horizontal document overflow or console errors | `live/layout.json`, `live/{320,390,820,1024,1440}.png` |
| Live keyboard and share resource | Skip link → main → Create a market via keyboard; PNG HTTP 200 and successful decode | `live/interactions.json`, `live/focus-mobile.png` |

The first two 27-group runs preceded the final seal-size correction; the third uses the final export. The original 25-group suite also passed once immediately after fixing the reset race. Added regression groups assert that the primary Create link, Markets heading, filters and empty-state heading fit within the initial 390 × 844 / 1440 × 900 viewport, limit the empty homepage to six computed text sizes, and load/decode the declared preview image at a subpath.

The suite still exercises wallet missing/rejected/wrong-chain states, chain addition, failure handling, ABI tampering, live-state gating, exact approvals, YES/NO bets, jury requests, claims/refunds, attestation validation, create-market JSON and deposits, both trade directions and quote expiration, owner setup, keyboard/dialog behavior, 320/390/820px reflow on six routes and 200% root text enlargement. The RPC/wallet responses in these interactions are deterministic mocks; they are not proof of funded onchain behavior. Its asset routes serve the exact export bytes. The separate live inspection uses real HTTP and actual RPC without interception.

## Better Interface review of the changed result

The pinned guide's workflow and all six core domains were read and applied. Its existing dark courtroom direction and semantic palette remain.

| Domain | Coverage and findings |
| --- | --- |
| Accessibility — Checked | Real native links/buttons, labels and heading structure retained. Keyboard skip/Create path inspected; native dialog Escape/focus restoration and all six route axe scans passed with zero violations. Visible skip-link focus screenshot inspected. Screen-reader sessions, physical devices and exhaustive focus backgrounds were not tested. |
| Layout — Checked | Inspected final mobile/desktop screenshots plus 320/820/1024px layouts, empty and mocked populated states. Statistics now follow the actual docket; mobile controls wrap without overflow. Browser tests enforce first-screen visibility at the reported widths. Root text enlargement passed; native browser zoom and RTL variants were not tested. |
| Writing — Checked | Required hero wording retained; one concise description explains the product. Markets replaces the promotional heading. Create labels, empty-state guidance and recovery actions remain explicit. No contract-risk copy or stored terms were weakened. |
| Typography — Checked | Six-size homepage scale confirmed from rendered text; 16px inputs and existing serif/sans/mono families preserved. The increased seal metadata size required the diameter repair described above. Other application pages retain their established display sizes and pass reflow checks. System fallback font metrics vary by machine. |
| Colors — Checked | Existing semantic colors retained; agents uses the gold accent. Measured rendered text/background pairs include hero 15.75:1, gold emphasis/primary button 10.20:1, supporting copy 8.67:1, empty-state heading 14.67:1 and empty-state prose 8.08:1. `live/contrast.json` records actual colors/ratios. Decorative translucent seal and every possible control state were not exhaustively measured. |
| UI — Checked | Existing controls, loading/error states, wallet prerequisites and transaction locks retained. Compact empty state and six-size hierarchy reviewed in screenshots. Share image opened and inspected. Reduced-motion environment and automated accessibility passed; no new motion introduced. External wallet overlays and slowed animation inspection were not performed. |

`docs/DESIGN.md` documents the final tokens, components, share image and responsive arrangement. Its location follows the task's explicit write scope; the contradictory root DESIGN.md request does not authorize that path. The root `.imd-responses.json` is the separately explicit revision exception.

## Delivery and limitations

The static export totals **705,004 bytes** and has eight inventoried assets including both pinned ABI files and `share.png`; `imd-deployment.json` remains its runtime configuration and excludes itself from the inventory. Exact export byte count and hashes are recorded in `manifest-check.log`; submission size/scope results are in `submission-check.json` (approximately 2.90 MiB for the complete working-tree snapshot, below the 8 MiB limit). The submission checker handles removed obsolete hashed bundles and explicitly permits only the requested revision response file in addition to the existing write scope.

No public domain was provided. Social image paths stay relative for static gateway hosting; the publisher must resolve both social image URLs and rebuild the manifest before pinning. Actual social-crawler rendering, IPFS/named publication checks, real wallet extensions, funded creation/bets/approvals/swaps and actual oracle delivery remain untested. Live reads still show no filed cases; deterministic fixtures are confined to tests. No contracts were deployed or changed and no transactions were broadcast.

The mounted `.git` is read-only. Source, lockfile and export are present for the submission collector; this worker did not create a commit in that checkout. The size check uses a complete disposable working-tree Git snapshot under `/tmp`, without modifying repository metadata.
