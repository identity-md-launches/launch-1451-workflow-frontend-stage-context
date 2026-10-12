# The Tribunal — implemented design

This file is under `docs/` because the assignment's explicit write budget overrides its conflicting request for a root `DESIGN.md`. It describes the delivered source, not a proposed redesign.

## Overview

The Tribunal is a prediction-market interface for readers, bettors, creators and the owner configuring future oracle dependencies. The requested dark courtroom direction is implemented with a near-black green neutral palette, restrained gold actions, serif headings, small editorial labels, and flat bordered case files. The main hierarchy is question → evidence and terms → action. Public browsing works without connecting a wallet; chain and wallet prerequisites remain explicit.

The home page has the commissioned hero, a decorative five-seat court seal, protocol terms and an onchain docket. Case, creation, trading and protocol pages reuse the same header, content edge, panel, field and review patterns. There is one intentional dark theme and no theme switch.

## Colors

The canonical tokens are in `web/src/styles.css:1`. Components use semantic roles that refer to named primitives.

| Role | Token | Implemented value | Usage |
| --- | --- | --- | --- |
| Page | `--bg` | `#111310` | Page and input backgrounds |
| Surface | `--surface` | `#181b16` | Cards, panels, review dialog |
| Raised | `--raised` | `#20241d` | Selected neutral filters, notice backgrounds |
| Structure | `--line` | `#2c3127` | Decorative dividers and card outlines |
| Control edge | `--control-border` | `#727869` | Interactive input/button boundaries |
| Primary text | `--text` | `#edece3` | Headings, values, primary content |
| Secondary text | `--muted` | `#adb3a3` | Hints, context and labels |
| Action | `--accent` | `#d9bc83` | Primary action fill, active navigation, identity accents |
| Hover/focus | `--accent-hover`, `--focus` | `#e6cea0` | Primary hover and 2px keyboard outline |
| Text on action | `--on-accent` | `#111310` | Filled-button text |
| YES / success | `--yes`, `--yes-bg` | `#b5d2b0`, `#233426` | YES option, open status, confirmation |
| NO / error | `--no`, `--no-bg` | `#e0aaa3`, `#3b2524` | NO option, persistent errors, destructive confirmation |

Gold is the product accent; green and rose distinguish outcomes and status. Text always labels these meanings, so color is not the sole cue. Measured rendered pairs include primary text/page 15.75:1, secondary text/page 8.67:1, hint/surface 8.08:1 and notice text/raised 13.30:1. The recorded measurements are in `docs/frontend/evidence/rendered-contrast.json`. Those measurements cover the specified opaque pairs, not every possible element or OS rendering mode.

## Typography

`--serif` is `'Iowan Old Style', 'Palatino Linotype', 'Book Antiqua', Georgia, serif`; `--sans` is `'Inter', 'Segoe UI', Arial, sans-serif`; `--mono` is `'SFMono-Regular', Consolas, monospace`. These are system stacks, with no downloaded font files or remote font requests. The browser chooses an installed fallback; the report does not claim Inter or Palatino is installed.

- Body: 16px root, unitless 1.6 line height. Body copy is usually 14–16px; long explanations cap at 66–74ch.
- Main hero: `clamp(2.65rem, 5.1vw, 4.7rem)`, regular serif, 1.1 line height, negative tracking. Narrowest layouts increase its line height to 1.4 when it wraps to three lines.
- Other page headings: `clamp(2.5rem, 4vw, 3.75rem)`, 1.15 line height. Case headings use 1.4 on mobile for long questions.
- The market homepage and shared chrome use six sizes: `--meta: 0.75rem` (12px metadata, strapline and seal), `--small: 0.875rem` (14px controls/supporting prose), `--body: 1rem` (16px body/inputs), `--subheading: 1.5rem` (24px statistics, brand, market cards and principle heading), `--h2: 1.75rem` (28px section/empty-state headings), and the responsive hero display size. These roles keep their size across breakpoints; narrower rules change layout instead.
- Other page-specific display headings retain their existing sizes; supporting headings outside the market view use 1.0625rem semibold sans. Supporting labels/hints generally use 12px.
- Inputs are 16px or larger at all widths. Balances, percentages and deadlines use tabular numerals. Addresses and hashes use the mono stack, isolate bidirectional text and wrap as needed.

Headings use balanced wrapping; paragraphs use pretty wrapping. Questions and evidence preserve whitespace and wrap arbitrary strings. Useful text remains selectable. No consequential question is line-clamped or replaced by a truncated title.

## Layout

`.wrap` aligns the site to a maximum 1220px content width, normally inset 48px on each side. Insets reduce to 32px and then 18px. Spacing uses an 8px-oriented rhythm with explicit optical values; related controls typically have 8–12px gaps and major groups 24–32px gaps. This is plain CSS, not a utility framework.

The homepage places its short hero and primary Create a market link before the Markets heading, filters/search and live docket. The statistics follow the docket. At `38rem`, hero padding is 16px, its heading margin is 0 0 16px, action/note top margins are 16px/12px, and docket top padding and heading/toolbar bottom margins are 16px/12px. Empty states use 16px 20px padding without a decorative marker. The hero keeps its required wording and gold italic agents emphasis.

The docket uses three columns at wide desktop sizes, two at `72rem`, and one at `38rem`. Case and creation pages begin as evidence/form plus action sidebar, then stack at `56rem`. Case action panels temporarily form two columns at intermediate widths and stack at `38rem`. Trading becomes a single column at `56rem`, capped at 600px. Protocol panels stack at `56rem`; owner-setting pairs stack at `38rem`. The how-it-works grid changes from four to two to one columns.

At `56rem` the navigation gets its own header row and the decorative seal disappears. At `22rem` the wallet control occupies its own row. Fields, controls, hashes and long questions can wrap; none require horizontal page scrolling. The mobile explanatory strip uses a fixed icon column and a flexible text column to avoid squeezing its copy between controls. Dialogs use a maximum `100dvh - 48px` height, scroll internally, and remain inset from viewport edges.

The final browser suite inspected all six routes at 320, 390 and 820 CSS pixels, plus desktop at 1440. It also checked root text enlargement to 200% at 820px. This is not evidence of native browser zoom or physical-device behavior.

## Elevation & Depth

Surfaces are intentionally flat and separated by a subtle border or tonal step. Only the transaction dialog is elevated: `0 24px 80px #0008`, a `#090b09d9` backdrop and a stronger control border. Native `dialog.showModal()` places it in the top layer and makes the background inert. There are no decorative background images or gradient-dependent text contrasts.

## Shapes

Panels use `--radius: 6px`; buttons and inputs use 4px; compact badges use 3px. Dialogs use 10px. Status dots, timeline markers and the decorative court seal are circular. Nested inset panels stay visually simple, with no multi-layer shadow system. Decorative icons come from Lucide at consistent outline weights; the favicon is a local SVG scale mark.

## Components

| Component / location | Reuse and behavior |
| --- | --- |
| `Shell`, `components/Shell.tsx` | Shared header/nav, wallet control, network/error notices, focusable main landmark, block/refresh footer. Hash route changes reset the scroll and focus the main content. |
| `Field`, `Notice`, `EmptyState`, `components/ui.tsx` | Bound labels/hints, persistent inline messages, and honest empty states with a next action. Native inputs retain keyboard behavior. |
| `AddressView`, `components/ui.tsx` | Checksummed address, external explorer link, full-value title/accessibility name, copy button and clipboard status. `compact` changes visible formatting only. |
| `WalletControl`, `components/ui.tsx` | EIP-6963/provider selection, connect, connected account, disconnect and wrong-chain switch states. |
| `TxAction`, `TransactionStatus`, `components/ui.tsx` | Review, simulation, signature, receipt, success/error. `primary`, `danger`, `disabledReason`, `prepare` and `onSuccess` cover variants. Disabled prerequisites have visible explanations. Native dialog supports Escape and restores focus; destructive reviews require an extra acknowledgement. Preparation cannot leave a review open across account/chain changes. |
| `ApprovalAction`, `components/Approval.tsx` | Fresh allowances choose one required approval or the final action. Exact amounts and spender identities are reviewed. Allowances are re-read before action preparation. |
| `MarketCard`, `components/Markets.tsx` | Linked case title, explicit status, close time, YES/NO stake labels, decorative proportion bar and total staked. |
| `OracleTerms`, `components/MarketDetail.tsx` | Verbatim question and evidence, original trust dependencies, panel terms and raw JSON disclosure. Reused in the bet review. |
| `CourtSeal`, `components/Shell.tsx` | Decorative only, hidden from assistive technology. Not a certification mark. |

All primary controls use native buttons or links. Keyboard focus is a visible 2px `--focus` outline with 4px offset; forced-colors mode uses the system Highlight color. The skip link becomes visible on focus. There is no autoplay or staged entrance. Color/border hover transitions last 150ms and spinners run only under `prefers-reduced-motion: no-preference`; the pending text remains in reduced-motion mode. Screen-reader sessions and native mobile wallet applications were not tested.

`web/public/share.png` is a 1200 × 630 social preview built from the same palette, system typography and `CourtSeal`. Regenerate it with `npm --prefix web run share:image`; the source is `web/scripts/share-image.ts`. It is copied to `dist/share.png`, declared in static Open Graph/Twitter metadata and hashed by the export manifest.

## Do's and Don'ts

- Start a new view inside `Shell` with `.page-section`, `.page-heading`, `.panel`, `Field` and `TxAction`. Use hash navigation and preserve the shared leading edge.
- Use a gold filled button for the main next action in a flow; use outlined controls for secondary maintenance steps. Keep YES/NO selection clearly labeled rather than applying outcome colors to unrelated actions.
- Read addresses and chain settings through `useApp().runtime`; read balances, configuration and eligibility from live contracts. Never create another deployment map or ship mock market data as live.
- Keep titles, exact oracle questions and evidence distinct. Show token units, UTC review dates, spender/recipient identity and final-state prerequisites before signing.
- Retain error recovery, stale-read gates, whole-transaction locks and wallet-change invalidation when adding controls. Do not shorten the chain/approval/review sequence into a blind write.
- Use the existing semantic colors and local SVG/icon approach. Do not add remote fonts, stock artwork, a theme switch, or unverified USD prices without an actual product requirement and data source.

Design guidance: Jakub Krehel's Better Interface, pinned commit `267330e1adfc66a718fb65fa6918c1f06d0a689e` (MIT). Documentation method adapted from Paul Bakaus's Impeccable, pinned commit `9d715cc4f5564a990ca8345abfdd5df6dc9b41c8` (Apache-2.0). The accompanying combined license is preserved in `docs/frontend/BETTER-INTERFACE-LICENSE.txt`. Ethereum UX guidance by Austin Griffith, pinned `06ea4efa0807`, is attributed in `docs/frontend/ETH-UX-LICENSE.txt`. This document extracts the implemented design and adds worker observations; it is not an upstream guide copy or an independent certification.
