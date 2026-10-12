# Frontend validation — The Tribunal

> This is the initial accepted delivery record. The subsequent review fixes, final export totals and rerun evidence are documented in [REVISION.md](REVISION.md). The root `evidence/` browser outputs have been refreshed; baseline revision reproductions are retained in `evidence/revision/`.

Worker validation performed on 2026-10-12. This is evidence of the checks described here, not independent certification, publication verification, or a contract audit. No real transaction was broadcast; contracts and protected repository files were not changed.

## Delivered artifacts and provenance

- React, TypeScript and Vite source, dependency manifest/lockfile, configuration, reproducible checks and test fixtures: `web/`.
- Static export: `dist/index.html`, local JS/CSS/favicon, two implementation ABI arrays, and `dist/imd-deployment.json`.
- Design specification: `docs/DESIGN.md`. The explicit allowed-path budget forbids root writes, so it takes precedence over the contradictory root `DESIGN.md` location requirement.
- Launch `926f36b9-9c40-444e-b751-3dd95b634226`; Ethereum chain 1; deployed source `1d54cbd46a8850a58b36fa7af28a0b1f875310d5`.
- Attestation hash `d306304c9c0a04973c3695874eb0695d3352a556fee88a8f8111a010daa65a2a`.

The exact handoff contract set is LaunchToken at `0x7558cfdfac2d310ff740206ec6e13529b82f2a9b` and Tribunal at `0xbebdcf6eb35b1bd004a6c123b21254d3d5b483b5`. The exporter retrieves the ABI arrays from `docs/abi/<Contract>.json` at the pinned source commit. Recursive object-key sorting, preserved array order, compact JSON and Keccak-256 produce these expected hashes:

| ABI | Canonical Keccak-256, without prefix |
| --- | --- |
| LaunchToken | `38880b8e56d42ce900f744a7908c7139632a49f1c3f33385c64ceaed29d37bee` |
| Tribunal | `aec0c2b57aa6df969139950880017c12167dcabd92aa10ea71cf861014344c9f` |

`web/scripts/verify.mjs` verifies the exact schema, identifiers, addresses, ABI bytes/hashes, unchanged pool key, unchanged network and wallet-add-chain objects, and the complete relative-path SHA-256 inventory. The browser loads this same manifest and these ABI files; build-only handoff copies are not a second runtime configuration. The final export contains **7 inventoried assets, 642,335 bytes including the manifest**. This leaves ample room for both publication copies within the HTTP response budget. No source maps, dependency archives, remote fonts or unused export files are included.

## Commands and results

Commands run from the repository root, with output under `docs/frontend/evidence/`:

| Command | Result | Evidence |
| --- | --- | --- |
| `npm --prefix web ci --cache /tmp/tribunal-npm-cache --no-audit --no-fund` | PASS, clean install from the delivered lockfile; package cache outside the submission | `install.log`, `web/package-lock.json` |
| `npm --prefix web run typecheck` | PASS | `typecheck.log` |
| `npm --prefix web test` | PASS, 8 tests | `unit-tests.log` |
| `npm --prefix web run build` | PASS, including typecheck and manifest verification | `build.log` |
| `npm --prefix web run verify` | PASS, all assets and both ABI hashes | `manifest-check.log` |
| `npm --prefix web run test:browser` | PASS, 25 interaction/check groups; final run 18:53:27–18:54:03 UTC | `browser-results.json`, `browser-run.log` |
| `npm --prefix web run format:check` | PASS | `format.log` |
| `node web/scripts/check-submission.mjs` | Scope, cache/submodule exclusion and complete working-tree snapshot bundle budget checked | `submission-check.json` |

Vite reported one nonfatal size advisory: the main minified JS chunk is about 562 kB (172 kB gzip). The complete uncompressed export is approximately 627 KiB; dependencies remain bundled locally and no functionality was removed to suppress the advisory. Build/typecheck and behavior checks completed after the final application source changes. Later changes were test synchronization, packaging checks and documentation, which do not enter the Vite bundle.

A final clean `npm ci` and production rebuild reproduced the exact browser-tested manifest and every asset hash. `rebuild-check.json` records manifest SHA-256 `9ad39371cd082343be3d1f5ede7c0499a3624500ac3f74594c2b13cd9f47e624`. npm emitted an informational install-script approval warning for esbuild; the production build completed successfully with the installed binary.

Git metadata in this worker is mounted read-only. Local staging failed with `.git/index.lock: Read-only file system`, so this worker could not create the requested commit. Files are present for the submission collector. The packaging script uses an isolated, disposable `/tmp` Git repository to measure a complete working-tree snapshot bundle; it does not write the mounted `.git`, include historical objects, or claim that this temporary size measurement is a source delivery commit. The subsequent publisher-generated bundle remains the authoritative upload-size check. Root configuration, Solidity, existing implementation ABI files, libraries and workflow files are unchanged. The only new ignore file is the explicitly budgeted `web/.gitignore`; it excludes dependency/cache directories at every nesting level under `web/`.

The full snapshot, including unchanged tracked repository files and new source/export/evidence, is approximately 3.9 MB of raw files and 1.9 MB as a Git snapshot bundle, below the 8,388,608-byte limit. Exact measured counts are in `submission-check.json`; its small report file is regenerated after packaging changes.

## What the behavior checks establish

The eight unit tests cover canonical ABI binding; exact decimal parsing and range rejection; betting/settlement timing states; VOID and one-sided refunds; two separately rounded losing-pool fees and the final winner's remainder; escaped oracle JSON with a fixed UTC observation, five-agent panel and quorum four; integer slippage; and router encoding for either currency direction, native value and the network's optional extended tuple.

The 25 browser groups use the actual production bundle, manifest and ABI files. A deterministic test-only JSON-RPC model ABI-decodes calls, supplies encoded contract tuples, applies allowances and state changes, and returns transaction receipts. A mock injected EIP-1193 wallet records requests and emits account/chain changes. Test fixture addresses, signatures and market data are confined to `web/tests/`; the production export never displays invented markets or balances.

The suite exercises:

- Public loading, market filters/search, an empty result, wallet connection, real ABI read selectors, balances and positions.
- The exact stored oracle question and trust dependencies in the betting review, keyboard skip navigation, native dialog Escape and focus restoration.
- Exact approvals, confirmation before the dependent write, a deliberately delayed receipt, disabled duplicate actions, wallet rejection, simulation reverts and retry.
- YES/NO bets, closed betting, permissionless resolution, timeout-to-VOID, claims and prevention of another claim; public attestation retry rejects malformed/unbound payloads and sends the bound fallback call.
- Create-market JSON, fixed observation/evidence criteria and two explicit deposit approvals; default panel settings and deposited amounts.
- Quoter simulation without a transaction; exact token→Permit2 and Permit2→listed-router destinations; decoded `execute` command/action bytes, full pool key, currency ordering, minimum output, deadline and zero native value for the IMD pair. Sell direction and 60-second quote expiration are also checked.
- Wallet account changes clearing stale state and closing reviews; unknown chain 4902 followed by the exact supplied add-chain parameters and another switch; missing/rejected wallets; failed reads and missing deployed code; ABI tampering rejected before RPC or signing.
- Owner token lock, signer and oracle configuration scheduling/cancellation, 48-hour activation gates and matured activation, nomination/acceptance, irreversible-renunciation acknowledgement, and advanced ERC-20 transfer/approve/revocation/transferFrom. The test opens but does not execute renunciation.
- All six routes at 320, 390 and 820 CSS pixels with no horizontal document overflow; desktop at 1440; 200% root text enlargement at 820px; a reduced-motion environment; and zero uncaught JS errors or missing static resources.

The test helper originally raced asynchronous preflight when a review closed; it now observes the wallet request and waits for the preparation/transaction spinner and receipt state to finish. The delayed-receipt fixture also now advances a block when releasing the receipt, matching the receipt watcher's block-driven behavior. These were test harness repairs; the final run passes both scenarios.

The worker's shell-launched Chromium cannot directly navigate loopback (`ERR_ACCESS_DENIED`). The automated runner therefore fulfills `/preview/` requests with the exact exported file bytes and intercepts only the supplied public RPC endpoints. This still executes the shipped JS and real controls, but it is not a real HTTP-hosting check. Separately, the assigned browser tool successfully opened the real HTTP server at `/preview/`, loaded the export and actual public RPC, and was inspected at desktop and mobile widths. Both modes are recorded rather than conflated.

## Six-domain Better Interface review

The pinned Better Interface workflow, all six core domains, relevant supporting sections, and the implemented-design documentation method were read and applied while building. The review was consolidated by this worker; no additional agents were commissioned. The pinned Ethereum frontend UX reference was also applied for wallet/approval stages, chain handling, units, addresses, errors and transaction states. Licenses are preserved beside this report.

| Domain | Source review and rendered coverage | Findings fixed / remaining limits |
| --- | --- | --- |
| Accessibility | Native links/buttons/inputs/dialog, labels and hint association, heading/landmark structure, visible focus, skip link, dynamic error/status semantics, focus restoration, color-independent status, reduced-motion CSS and forced-colors override. Keyboard actions and axe on markets, case, create, trade, protocol and how pages. | Removed invalid/redundant ARIA from the decorative odds bar. Final axe scans report zero violations. Screen-reader sessions, physical touch and OS forced-colors rendering remain unperformed. |
| Layout | Shared leading edges, grouped forms, responsive grids, inset controls/dialog, wrapping hashes and questions. Rendered screenshots plus overflow assertions on six routes at 320/390/820px and desktop. | Fixed a mobile explanatory strip that squeezed its text between columns; fixed search icon/input overlap. No horizontal overflow in checked states. Native browser zoom and unusually long externally created oracle bodies were not exhaustively rendered. |
| Writing | Explicit verbs, fixed UTC review times, exact question alongside title, approval spender/amount, local recovery instructions, honest empty/setup states and units. | Clarified that YES/NO bars are deposited-stake shares; exposed current setup/liquidity gates. No fabricated USD rate, ENS result, live fixture, or publisher URL. The requested hero is followed by an explanation of the actual oracle/owner trust model. English only. |
| Typography | System stacks, role-based serif/sans/mono use, limited hierarchy, readable measures, numeric alignment, selectable/wrapping text, inputs at least 16px. | Raised substantive small labels to 12px and adjusted narrow multiline hero leading. Text enlargement reflow checked at 200% root size; this is not native browser zoom or a claim that a named system font exists on every machine. |
| Colors | Semantic/primitives palette, gold action hierarchy, labeled green/rose states, control edges, opaque surfaces. Rendered computed foreground/background sampling and axe contrast checks. | Sampled ratios: text/page 15.75:1; muted/page 8.67:1; notice/raised 13.30:1; hint/surface 8.08:1. These are the recorded pairs, not a universal contrast certification. Disabled/OS/native-control variants were not exhaustively measured. |
| UI | Consistent radii and icons, flat surfaces with dialog-only elevation, restrained hover transitions, no autoplay, pending/rejected/confirmed feedback and locked transaction sequences. | Fixed preparation locking and wallet-change review invalidation; account-scoped refreshes cannot overwrite another account's state. Motion is enabled only under `no-preference`; the suite checks a reduced-motion environment while the animation rule itself was reviewed in source. Actual wallet overlays and all replacement/reorg paths remain untested. |

Concrete findings and final source locations:

| Severity | Finding and repair | Final location / recheck |
| --- | --- | --- |
| Major | An odds-bar `aria-label` on a generic decorative element triggered axe. Removed the redundant label and hid the bar; visible YES/NO text retains the information. | `web/src/components/Markets.tsx:52`; axe zero violations on six routes. |
| Major | Search text could overlap the icon after generic input rules. Added the final specific padding rule. | `web/src/styles.css:1850`; desktop/mobile screenshot and overflow review. |
| Major | Mobile explanatory text had an excessively narrow column. Switched to fixed icon/flexible copy and a separate link row. | `web/src/styles.css:1882`; live mobile and 320px screenshots. |
| Minor | Supporting labels were too small and a three-line hero was cramped. Increased label floors and narrow heading leading. | `web/src/styles.css:1817`, `:1854`; mobile visual review and text enlargement. |
| Major | A reviewed action could survive wallet context changes or preparation could be invoked twice. Added review-version invalidation, preparation lock and disabled state. | `web/src/components/ui.tsx:229`, `:247`, `:382`; account-change and delayed-approval checks. |
| Major | Asynchronous reads and quotes could outlive their account/quote context. Added epoch/account checks, cleared case terms, and quote expiry checks before and after simulation. | `web/src/context.tsx:282`, `:351`, `:375`; `web/src/components/MarketDetail.tsx:146`; `web/src/components/Trade.tsx:241`; account-change/stale-quote checks. |

No unresolved critical or major finding remains in the tested frontend scope. The boundaries below remain explicit; neither source review nor axe replaces those tests.

## Live observations and unperformed checks

The assigned browser read `eth_chainId = 0x1` from the first configured public RPC and nonempty code at both handoff contracts: LaunchToken 1,502 bytes, Tribunal 20,533 bytes. The observation is timestamped at 18:21:01 UTC in `live-rpc-browser.txt`. This establishes presence on that RPC, not bytecode equivalence or independent attestation authentication.

At the inspected blocks, `marketCount` was zero, the Tribunal's VERDICT token was not configured, the jury price was 0.5 IMD, and VERDICT liabilities/IMD fee escrow were zero. The pool view returned fee 1.25%, tick spacing 60, the exact handoff hook, and no active liquidity at the current price. `live-protocol-state.txt` and `live-pool-state.txt` retain these observations. The owner needs to finish the token lock, and the pool needs active liquidity, before the corresponding live flows become usable. Nothing in this task authorizes doing those onchain actions.

Live screenshots: `desktop-live.png`, `mobile-live.png`, `desktop-create-live.png`, `desktop-trade-live.png`. Deterministic populated-state screenshots: `desktop-mocked.png`, `mobile-case-mocked.png`, `mobile-320-mocked.png`. `live-console.txt` records zero console errors/warnings during the inspected browser session. Screenshots were opened and visually reviewed; test screenshots are explicitly distinguished from live data.

Unperformed: funded approvals/bets/creation/swaps, real signature recovery/oracle delivery, actual callback gas consumption and settlement, full contract-suite reexecution, third-party wallet extensions and WalletConnect, live write simulations needing usable setup/balances/liquidity, reorg/replacement/timeout end-to-end scenarios, exhaustive RPC outage/rate-limit behavior, screen readers and physical mobile devices, native browser zoom, actual IPFS/named hosting, immutable/named publication checks, and social metadata requiring a final domain. Existing contract tests were left intact; mock UI flows are not proof of oracle cryptography or contract correctness. These are worker frontend checks only; the publisher's later checks and hosting remain separate.

Reproduction instructions and configuration details are in `web/README.md`. The implemented visual system is in `docs/DESIGN.md`.
