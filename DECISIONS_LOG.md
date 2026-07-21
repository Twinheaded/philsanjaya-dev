# DECISIONS_LOG

Chronological log of the decisions that shape this project — the "why", so
future work does not re-litigate settled questions. It complements, and does
not replace, the formal Architecture Decision Records in [`docs/adr/`](docs/adr/)
(0001–0007). ADRs capture the original build's architecture; this log tracks
the **Inventor's Workbench** redesign (2026-07) and any decisions taken during
its execution.

Newest entries at the bottom of each section.

---

## The Inventor's Workbench redesign — locked decisions

Source: *INVENTOR'S WORKBENCH — Redesign Handoff Spec* (2026-07-19), §1.
These are **locked**. Do not re-litigate them; if practice proves one wrong,
raise it with Phil and amend here with a dated note — do not silently diverge.

> **North star:** *A precision laboratory built on a human workbench.* The site
> is one continuous physical desk. Nothing "loads" — the camera moves, objects
> rearrange, documents unfold. Every animation maps to a physical verb.

1. **Total changeover.** All presentation is replaced. Routes, content
   collections, `/resume.pdf`, and OG image routes are preserved (spec §2).
2. **Zoned camera moves over a route skeleton.** Each zone is a real URL;
   navigation is a camera move between zones. Free-pan exploration is a
   *deferred enhancement*, not the foundation.
3. **Title-block index instead of a navbar.** A drafting-style title block
   (spec §9) is the primary navigation. No top bar, no hamburger, no sidebar.
4. **3D background, DOM content.** The environment is a real-perspective WebGL
   scene (Three.js). All readable content stays HTML on a synced 2D plane above
   it. Content is never rendered inside WebGL.
5. **Warm-signature synthesis.** The research system (spatial physics, editorial
   hierarchy, materials as light-and-shadow) with exactly three warmth
   signatures: two-tone stone-desk/paper ground, copper as the single accent,
   hand-drawn line quality in illustrations. No wood-grain textures, no literal
   skeuomorphism.
6. **Handwriting appears in diagram annotations only** (inside SVGs, Caveat).
   Never in UI chrome or body copy.
7. **Motion law: every animation maps to a physical verb** — Lift, Slide,
   Fold/Unfold, Stack (spec §7). No decorative motion. No bounce. If it can't be
   named with one of the four verbs, it doesn't ship.
8. **Blur is rationed to the Stack verb** (desk beneath an open document). Never
   decorative glass panels.
9. **Mobile is a single-axis vertical roll** — same verbs, one dimension, no
   free panning (spec §13).
10. **Deferred — do not build now:** free panning/zooming; "Rearrange"
    snap-on-resize; dark mode ("workshop at night"); agent-canvas graphite
    re-materialisation beyond M7 scope.

### Fallback ladder (progressive enhancement, spec §3)

Each rung must be fully usable on its own:
1. Full experience: WebGL + camera + verbs.
2. No WebGL: CSS two-tone ground; camera/verbs still work on the DOM plane.
3. `prefers-reduced-motion`: verbs become ≤120 ms crossfades; camera cuts
   instantly; scene static.
4. No JS: Astro's server-rendered pages display as plain, readable, posed
   documents; title block renders as ordinary links.

### Dependency policy (spec §3)

- Add only `three` (dynamically imported, post-idle).
- Camera tween is a hand-rolled rAF store, or Motion One if a dependency is
  preferred. **Do not add GSAP, React, or a state library.**

---

## Preserved constraints — must not break

Carried from the original build; the redesign is layered on top of these.

- **Keep every existing URL** (spec §2): `/`, `/projects`, `/projects/<slug>`,
  `/notes`, `/log`, `/about`, `/resume.pdf`, OG image routes, `/robots.txt`,
  `/sitemap-index.xml`. If any path must change, 301 it.
- **Keep** Astro 6, content collections as the source of truth, static output,
  Cloudflare Pages deployment, and `<ClientRouter />` (view transitions — the
  redesign builds camera navigation on top of it).
- **Keep** the source-required metrics schema (ADR 0004) and the honest-metrics
  discipline in all project copy. The agent scaffolds structure and preserves
  existing honest content verbatim; it never invents claims or numbers.
- **Toolchain pin (from [[windows-node-environment]] / M1 history):** the root
  `vite@^7` devDependency is **required** — a hoisted vite 8 breaks
  `@tailwindcss/vite` under Astro 6's vite-7 build. Do not remove it or let font
  / tooling work upgrade it.
- **Node/shell discipline:** portable Node is not on the harness PATH; prefix
  npm commands with the PATH prelude and `cmd /c` (see the project memory). CI
  auto-deploy to Cloudflare Pages is live again as of 2026-07-19 (PHI-60).
- **Production swap is gated on Phil's explicit confirmation** after he reviews
  staging (spec §15). Do not touch production DNS/deploy config without it.
  `TODO(phil-voice)` copy items are Phil's; ship staging with the flags visible.

---

## Milestone ledger

Each milestone maps to a Linear issue in the *Portfolio Website* project and a
single conventional commit. Branch: `redesign/inventors-workbench`.

| #   | Linear  | Milestone                                             | Status      |
| --- | ------- | ----------------------------------------------------- | ----------- |
| M0  | PHI-61  | Baseline audit and decision log                       | Done        |
| M1  | PHI-62  | Design tokens, typography, two-tone ground            | Done        |
| M2  | PHI-63  | Zoned desk layout and title-block navigation          | Done        |
| M3  | PHI-64  | Camera store and Slide verb                           | Done        |
| M4  | PHI-65  | Fold/Unfold and Stack (document transitions)          | Done        |
| M5  | PHI-66  | WebGL background scene with camera sync               | Not started |
| M6  | PHI-67  | Experiment document templates and content migration   | Not started |
| M7  | PHI-68  | Graphite agents and Lift polish                       | Not started |
| M8  | PHI-69  | Exploded architecture diagrams                        | Not started |
| M9  | PHI-70  | Mobile vertical roll                                  | Not started |
| M10 | PHI-71  | Accessibility and performance hardening               | Not started |
| M11 | PHI-72  | Staging deploy, cross-browser, sign-off               | Not started |

---

## Execution notes & amendments

Decisions taken while building — including any §4 pose/coordinate adjustments —
are logged here with dates, so the spec's intent and the code stay reconciled.

### 2026-07-19 — M0 (PHI-61)

- Created branch `redesign/inventors-workbench` from `main` at `c4f7725`.
- Audited current routes, components, content collections, styling, and the
  agent island; recorded in [`docs/redesign/M0-baseline-audit.md`](docs/redesign/M0-baseline-audit.md).
- **Decision:** the redesign's design tokens will *replace the contents* of the
  existing `src/styles/tokens.css` (which currently holds the original
  bg/surface/ink/signal palette with a dark-mode block), rather than adding a
  new file — the spec's "create tokens.css" is satisfied by rewriting the one
  that already exists, keeping a single token source.
- **Decision:** the current `theme-toggle` / `settings` control is hidden in v1
  (dark mode deferred, §1.10) but its code path is kept stubbed for later, per
  spec §2. The dark-mode blocks in `tokens.css` are retained as the seed for the
  future "workshop at night" project.
- Recorded on the branch as `chore(redesign): baseline audit and decision log`.

### 2026-07-20 — Handoff committed & branch pushed (Phil's decision)

- Per Phil, the handoff spec is now committed to the repo at
  [`INVENTORS_WORKBENCH_HANDOFF.md`](INVENTORS_WORKBENCH_HANDOFF.md) (repo root) —
  the source-of-truth the Linear issues cite. It is now part of the public repo,
  consistent with the "built in public" signature. Resolves M0 flag #1.
- Pushed `redesign/inventors-workbench` to `origin` at Phil's direction.
- Holding at the M0 boundary: **M1 (PHI-62) does not start without Phil's go.**

### 2026-07-20 — M1 (PHI-62): tokens, typography, two-tone ground

Per Phil's three M1 implementation notes:

- **One palette via `@theme` (note #1).** `tokens.css` now holds the §5 workbench
  palette as the single source of truth; `global.css` exposes it to Tailwind via
  `@theme inline` (keeping the `var()` indirection for a future dark theme). The
  raw `--fs-*` type-scale tokens are shared by base CSS and the `@theme` `--text-*`
  utilities so sizes have one source.
- **Legacy aliases keep every route rendering (note #2).** The original names
  (`--bg/--surface/--mist/--line/--signal/--signal-text`, plus their Tailwind
  utilities `bg-surface`/`text-mist`/`border-line`/…) are aliased onto the new
  palette in `tokens.css` + `@theme`. Verified in-browser: un-migrated components
  (Shell rail, project cards, `.prose-md`, `MetricCard`) render in the workbench
  system — paper cards (`#fafaf8`) with paper-edge borders (`#efede7`) on the
  desk ground, copper-deep active nav (`#8f5a26`), Geist throughout. Each alias
  retires when its component's milestone rebuilds it.
- **Fonts (note #3).** Self-hosted Geist (latin 400/500/700) + Geist Mono (400)
  via Fontsource. **Preloaded only Geist 400 + 500** — deliberately *not* 700:
  the current hero name (`index.astro`) is `font-medium` (500), so 400+500 are
  the weights that actually paint above the fold until M2 rebuilds the hero with
  the §6 700 display. Caveat is **not** installed/imported — deferred to M8
  (diagram-only, never preloaded). All three faces confirmed `document.fonts`
  loaded → no FOIT.
- **Two-tone ground (rung 2).** `body` carries a radial light pool
  (`--desk-pool #e1dcd3` → `--desk` → `--desk-deep` vignette); the desk still
  never scrolls (`overflow: hidden`). Focus ring switched to copper (§7.1).
- **OG images keep the legacy faces.** `src/pages/og/[...route].png.ts` still
  loads Archivo/Instrument/IBM Plex Mono for satori, so those `@fontsource`
  packages stay installed. OG cards render unchanged (§2 "OG images intact");
  restyling OG typography/colours is a later pass, not M1.
- **Dark-mode token blocks dropped** (superseding the M0 "retain as seed" note):
  the real seed is handoff §16, not the old palette's dark hexes. The theme
  toggle in Shell is now a visual no-op for one milestone; M2 hides it per §2.
- **Contrast (measured).** `--ink` passes AA on paper/desk/desk-deep (15.0 /
  10.4 / 8.7) — meets §14's requirement. Known transitional items, owned by M2's
  paper composition + the M10 audit: small *muted* text (`ink-soft`, 3.5:1) and
  *accent* text (`copper-deep`, 3.8:1) sitting directly on the bare desk fall
  below 4.5:1; by design these belong on paper (5.1 / 5.5), where the current
  hero/case-study transitional layout doesn't yet place them. `status` passes on
  desk (4.6); copper indicators are paper-scoped (3.6).
- **Verify:** `astro check` 0 errors · `astro build` 18 pages (OG incl.) ·
  `vitest` 29/29 · in-browser render confirmed on `/`, `/projects`,
  `/projects/aegisx`; console clean. `vite` still resolves 7.3.5 (pin held).
- Committed as `feat(tokens): design tokens, typography, two-tone ground`;
  pushed. Holding before M2 (PHI-63).

### 2026-07-20 — M2 (PHI-63): zoned desk layout and title-block navigation

Per Phil's seven M2 notes:

- **Poses are server-side CSS variables (note 1).** `src/lib/zones.ts` holds the §4
  zone map; `Desk.astro` emits `--cam-x/--cam-y/--cam-zoom` on `<body data-zone>`
  and `.desk-plane` derives its transform from them. Verified: on `/projects` the
  plane computes `matrix(0.9,0,0,0.9,-980,360)` and the current zone's centre lands
  exactly on the viewport centre. Rung 4 is therefore posed with **zero JS**, and
  M3's camera store animates these same variables — no second positioning system.
- **The desk is continuous.** Every route renders all five zones; the current one is
  the `<main>` landmark, the other four are `inert` + `content-visibility: auto`.
  This is what will let M3's Slide move the *plane* with neighbours leaving past the
  frame edges. **Consequence to weigh: near-duplicate body content across the five
  index routes.** Titles/descriptions/canonicals stay unique. Flagged for the M10/M11
  SEO check — it is inherent to the locked "one continuous desk" architecture.
- **No camera motion (note 2).** Navigation is a plain route swap; the old
  directional stage slides were removed and replaced with a short crossfade marked
  in `global.css` as an explicit placeholder. The Slide verb stays M3's.
- **Agent canvas re-hosted (note 3).** Home-anchored in `HomeZone`, composited above
  the ground and below the cards; `engine.ts` now reads `--ink` (graphite) instead of
  the accent, at a lower alpha (0.22/0.14) since ink is far darker than the colour it
  replaced. It mounts **only while Home is the posed zone**, so off-zone routes burn
  no frames (§8). Camera-store wiring waits for M3.
- **Contrast resolved by composition (note 4).** Rule now encoded in `global.css`:
  *text on the bare desk uses `--ink` only; muted and accent text lives on paper.*
  Zone content sits on paper objects (cards, notebook, about sheet) where `--ink-soft`
  is 5.1:1 and `--copper-deep` 5.5:1. Document routes render on a full-height paper
  stage, which lifts their prose from 3.5:1 to 5.1:1. Desk-level links stay ink +
  underline rather than taking the accent.
- **Alias retirement (note 5).** Grepped every legacy alias for remaining consumers:
  only `--bg` / `--color-bg` had none (the rebuilt shell owns the ground), so only that
  one was retired. `--surface/--mist/--line/--signal/--signal-text/--debug` all still
  have consumers (document templates, `MetricCard`, `NotePane`, the engine) and stay.
- **Small screens (note 6).** No M9 polish, but nothing trapped: zone width tracks the
  viewport, and each zone scrolls inside itself. A real defect was found and fixed here
  — reserving HUD space in the sheet's `max-block-size` was split by the centring, so the
  last line still slid under the fixed title block; the clearance is now padding *inside*
  the scroll container, which holds whether the zone scrolls or not.
- **Geist 700 preloaded (note 7).** The §6 display heading (Geist 700, 56px) now paints
  above the fold on Home, so M1's 400+500-only rationale expired; `BaseHead` preloads
  400/500/700. Caveat is still never preloaded (M8, diagram-only).
- **Settings control hidden (§2).** The old rail, theme toggle and mobile settings
  disclosure went with `Shell.astro`; the theme-apply script is kept as the stub.
- **Removed:** `src/layouts/Shell.astro` and `src/lib/panels.ts` (fully unreferenced).
- **Harness note:** the local preview pane renders with `document.hidden = true`, so
  `requestAnimationFrame` and `ResizeObserver` never fire there. The agent field's
  mount is therefore deliberately rAF-free. This also explains why screenshots could
  not be captured during M1/M2 verification.
- **Verify:** `astro check` 0 errors · build 18 pages · `vitest` 29/29; poses, keys 1-5,
  inert/content-visibility, the mobile clearance fix and the off-home mount guard all
  confirmed in-browser.

**Adversarial review before commit** (independent reviewers over correctness, a11y,
CSS and spec conformance, each finding then verified by a refuter). Nine real defects
were confirmed and fixed:

1. **CSP regression (blocker).** `public/_headers` still pinned the `script-src` hash of
   the *deleted* `Shell.astro` theme snippet. Rewriting it into `BaseHead.astro` changed
   the hashed body (comments and indentation count), so Cloudflare would have blocked the
   inline script on all 18 routes — `data-js` never set, every `.js-only` control
   permanently hidden, case-study chapter styles broken. **`npm run verify` cannot catch
   this**: `_headers` is only applied by Pages, never by `astro dev`/`preview`. Hash
   recomputed from the built output and re-pinned; both executable inline scripts now
   match with no stale pins. The header comment now carries that warning.
2. **Document routes starved their reading pane (high).** A fixed 12rem HUD reserve plus
   `block-size:100%; overflow:hidden` collapsed the `flex-1 min-h-0` pane to **0px** at
   640x360, making article bodies unreachable. The reserve is now viewport-relative
   (`min(--hud-space, 30dvh)`), the stage scrolls, and the sheet has a 22rem floor.
   Re-measured: pane 174px, full 709px article reachable.
3. **Colophon put copper on the bare desk (high)** — 3.81:1, breaking M2's own contrast
   rule. Now `desk-link` (ink + underline), measured 10.44:1.
4. **Scroll containers were not keyboard-operable (high).** `.zone__sheet` and `.document`
   now carry `tabindex="0"` (WCAG 2.1.1); off-zone sheets stay inert.
5. **Agent field bled 32px past its scroll container (medium)**, forcing horizontal scroll
   on the landing page. Field is now `inset: 0`; measured `scrollWidth === clientWidth`.
6. **`aria-current="page"` was claimed on document routes (medium)** for a page the user
   was not on. Active *styling* now keys off `data-active`; `aria-current="page"` is set
   only on an exact path match.
7. Skip-link target was not focusable (low) — `tabindex="-1"` added.
8. Stale comments pointing at the deleted `Shell.astro` / orphaned `Panel.astro` (low).
9. The `aria-live` route announcer is server-rendered static text and will not announce on
   its own (low) — left for M10, which owns the announcer.

**Recommended follow-up chore (not done here):** the CSP-hash class of bug is invisible to
`npm run verify`. A test that recomputes the hashes over `dist/**/*.html` and diffs them
against `public/_headers` would close it permanently — `verify` already builds before
`vitest`, so the artefact is available.

### 2026-07-21 — M4 (PHI-65): Fold/Unfold and Stack (documents on the desk)

The big architectural shift: **documents now render the real desk behind them**
(via a shared `DeskScene.astro`), so opening one is a camera push, not a page to
a separate stage. Per Phil's eight notes:

- **Documents on the desk (§7.3/§7.4).** `DeskScene.astro` (field + plane, wrapped
  in `.desk-behind`) is shared by both layouts. `Desk.astro` = zone routes
  (`data-view=zone`); `Sheet.astro` = document routes: the desk behind (posed at
  the parent zone), a `.stack-scrim`, and the open `<main class="document">` at
  elevation 3. A document renders the desk as an inert backdrop — no zone is the
  `<main>` landmark, the document is.
- **One tween = the camera push (note 2).** `src/lib/nav.ts` `resolvePose()`:
  documents resolve to the parent zone position at `DOC_ZOOM` (1.45), so opening a
  card is the M3 store Sliding/zooming in. **Every** navigation is now a camera
  move (zone↔zone, zone↔document, document↔document); the old "document = snap, no
  plane" special case is gone. Unit-tested (11 nav tests) incl. never-sticks
  across dive→Back→number-key and open/close spam (note 3).
- **The View Transition is scoped (note 1).** The whole-page root crossfade is
  **killed** — the camera carries the desk, kept out of the snapshot, so nothing
  animates twice (note 2). Only a named `unfold` element morphs: the clicked card
  is tagged `view-transition-name: unfold` on click and the document `<main>`
  carries it statically, so the card FLIP-morphs into the opening document (§7.3).
- **STACK (§7.4, note 4).** Exactly one filter layer: `.desk-behind` blurs
  (`blur(8px) saturate(0.96)`) on desktop; mobile / reduced-motion / fallback use a
  `--desk-deep` opacity scrim instead. **The blur is on the full-viewport
  `.desk-behind` wrapper, not the 0×0 plane** — blurring a zero-area box is
  unreliable; verified the wrapper is 1280×720 and the filter renders. Esc folds
  the document to its parent zone (verified end-state).
- **Hard-load lands open (note 5).** A document route server-renders
  `data-view=document` + pose 1.45, so the Stack + open document are present on
  first paint with zero fly-in, and the article is readable with JS off (rung 4);
  the inert backdrop zones are removed from the tab order and a11y tree.
- **Focus follows every navigation (note 8).** Dropped M3's "only if focus was in
  the departing zone" rule: every client nav moves focus — document heading on
  open, originating card on close, zone `h1` otherwise — while the initial hard
  load does not steal focus (a `pendingFocus` flag set only by
  `astro:before-preparation`). Fixes Phil's repro (press 3 → Tab hit the skip
  link). The skip link is now a paper chip with the copper focus ring.
- **Reduced motion (note 7).** Camera cuts instantly (store); unfold/fold collapse
  to a ≤120ms crossfade; the Stack scrim applies with no transition; focus still
  managed (on page-load).
- **Perf:** the agent field is not mounted behind an open document (hidden anyway),
  and the rAF loop stops on a settled document page.
- **Verification split (note 6).** Mechanics proven: 63 tests (added 13 nav);
  in-browser hard-load-lands-open+stacked, zone pages un-regressed (centred, not
  blurred), single `<main>`, inert backdrop, Esc→parent, blur renders on the
  full-size wrapper, console clean. **The choreography — the unfold morph, the
  camera push feel, focus landing after a live nav, the reduced crossfade — is
  Phil's real-browser call** (the preview pane runs `document.hidden=true`).
- **Adversarial review before commit** — three real defects found and fixed, all
  in the focus/routing paths the headless pane cannot exercise:
  1. **Back-button close focused the zone heading, not the originating card
     (high).** On popstate the browser has already moved `location` before
     `astro:before-preparation`, so `departedFrom = location.pathname` captured the
     *destination*. Now read the origin from the event (`ev.from`) — correct for
     links, Esc and popstate alike.
  2. **`focusEl` stamped `tabindex="-1"` on the originating card (an anchor),
     dropping it from the Tab order (WCAG 2.4.3).** Now only headings (not
     natively-focusable elements) get the programmatic-focus tabindex.
  3. **Asset links (`/resume.pdf`, OG images) were classified as document
     routes**, tagging them with the `unfold` name and driving a spurious camera
     move. `isDocumentRoute` now excludes any path with a file extension, and the
     nav handler ignores non-page routes (`isPageRoute`).
- **Verify:** `astro check` 0 errors · build 18 pages · `vitest` 63/63.

### 2026-07-20 — M3 (PHI-64): camera store and Slide verb

Per Phil's eight M3 notes:

- **One store, one system (note 1).** `src/lib/camera.ts` is a pure, DOM-free
  `CameraStore` (injectable clock). `src/scripts/desk.ts` is a module singleton
  that boots by adopting the server pose from `<body>`'s `--cam-*` and drives
  those same variables each rAF frame — no second positioning system, no
  first-frame jump.
- **SLIDE duration + easing** exactly per §7.2: `clamp(450, 300 + 0.12·d, 800)`
  ms over `--ease-physical` (a real cubic-bezier evaluator). Zoom-only moves
  (d=0) sit at the 450 ms floor (note 4).
- **Retarget-not-queue, incl. popstate (note 3).** `slideTo` always restarts
  from the live interpolated pose, so nav/back/forward spam produces one clean
  move. ClientRouter routes popstate through the same transition events, so no
  special-casing is needed. Unit-tested with a popstate-spam simulation.
- **Zone lifecycle (note 2).** On tween start `.desk-plane.is-sliding` releases
  `content-visibility` on every zone (no blank arrivals / no popping departures);
  it is removed at settle. The document swap is bridged by re-asserting the live
  pose in `astro:after-swap`, so the swap does not cut to the incoming server
  pose. On settle, if focus was inside the departing zone it moves to the
  arriving zone's heading — never stranded in an inert subtree.
- **Scope (note 5).** SLIDE is zone↔zone only; `isZoneRoute()` gates it, and
  document routes keep M2's crossfade (Fold is M4).
- **Agent field to desk space (note 7).** `src/scripts/desk-field.ts` simulates
  in desk coordinates over the ~5200×3400 desk and projects each mark through the
  camera every frame with the exact plane projection, on one viewport-fixed
  canvas beneath the plane (paper occludes it). Graphite `--ink` @ 0.22, density
  capped at 34, loop parked on `document.hidden` (§8). The field re-seeds per
  navigation (decorative; acceptable — noted for a future persist pass). The
  Home-anchored canvas was removed; 404 keeps its own `engine.ts` flee island.
- **Title block persists (`transition:persist`)** so keyboard focus survives a
  sheet jump; the active sheet is re-synced on `astro:page-load`.
- **Touch-ups (note 8).** (a) Mobile zone scroll bottom clearance bumped ~24px
  (`--hud-space + space·3`, divided by zoom because the plane scales the sheet).
  (b) Home intro confirmed `--ink` (computed `rgb(35,35,35)`); it was already ink
  — the muted look in the screenshot was the pre-M2 state.
- **Verification split (note 6).** The maths is unit-tested (19 camera tests:
  durations, easing symmetry + no-overshoot, exact end states, retarget-from-live
  including popstate spam, zoom-only floor, reduced-motion cut). Hard-load poses,
  the desk-field layer, title-block persist and the Home intro colour were
  confirmed in-browser. **Motion feel — the actual slide, retarget mid-flight,
  focus-on-settle, and the field sliding with the desk — is Phil's real-browser
  call:** the preview pane runs `document.hidden = true`, so rAF/ResizeObserver
  never tick there.
- **Adversarial review before commit** — reviewers over controller lifecycle,
  a11y/focus, field projection and store/CSS, each finding refuted independently.
  Four real defects found and fixed:
  1. **A Slide interrupted by diving into a document left the store stuck
     `animating`** (a document's before-preparation early-returns without touching
     the store), freezing the *next* zone arrival at a stale pose with
     `.is-sliding` stuck on. Fixed: a document arrival now snaps the store settled,
     and after-swap / onPageLoad adopt the destination pose when not mid-slide.
  2. **Focus restoration missed Home** (its heading is `.home__name`, not
     `.zone-title`) — the selector is now the landmark's `h1`.
  3. **Reduced motion never managed focus** (no tween → no settle) — focus is now
     moved on page-load under reduced motion.
  4. **The field projected against `dvh` while the plane uses `vh`**, drifting the
     marks vertically on mobile — the canvas is now `vh`.
- **Verify:** `astro check` 0 errors · build 18 pages · `vitest` 50/50 (incl. the
  CSP guard). Reduced motion is an instant cut throughout.

### 2026-07-20 — CSP hash guard (standalone chore) + SEO decision

- **`test/csp-headers.test.ts`** now closes the M2 blocker's class of bug. It hashes every
  *executable* inline script across `dist/**/*.html` (skipping `src=` externals and
  non-executing types like `application/ld+json`) and diffs the set against the
  `script-src` pins in `dist/_headers`. It fails on a **missing pin** (would be blocked in
  production) or a **stale pin** (dead config / drift — exactly the M2 symptom), and guards
  against a vacuous pass if the extractor ever finds zero scripts. Runs after `astro build`
  in both `verify` and CI, so `dist/` is fresh. Proven in both directions: green on the
  correct tree (31 tests), and it fails with an actionable message when a pin is corrupted.

- **SEO decision (near-duplicate zone content) — ACCEPTED.** The continuous-desk
  architecture (§1.2, §3–§4) requires every route to render all five zones, so the five
  index routes share near-duplicate body content. This is **inherent to the locked design**
  and is accepted: titles, descriptions and canonicals stay unique per route, and the
  copy is real content, not doorway spam. **Re-verify post-launch via Google Search
  Console at M11** (indexed pages, duplicate-content / canonical warnings); revisit only if
  Search Console flags a real problem. No pre-launch action.

### 2026-07-20 — CI branch previews (standalone chore, not a milestone)

Context: pushing a redesign branch previously did nothing in CI. `ci.yml`
triggered only on `push: [main]` + `pull_request`, and the deploy job was gated
to `refs/heads/main`; the Pages project is **direct-upload** (not Git-connected),
so no per-branch preview was ever built. Milestones were only reviewable by
running the site locally.

- **Verify now runs on `redesign/**` pushes** (and, as before, on every PR), so
  each milestone gets a red/green gate on the branch.
- **New `preview` job** deploys non-main refs to Cloudflare Pages as *preview*
  deployments — `wrangler pages deploy dist --project-name=philsanjaya-dev
  --branch="$PREVIEW_BRANCH"`. Because the project's production branch is `main`,
  any other `--branch` is a preview, so production is never touched. Reuses the
  existing `CLOUDFLARE_API_TOKEN` secret and the same secret-missing no-op guard
  as the production job.
- **The production `deploy` job is unchanged** — still `push` + `refs/heads/main`,
  still `--branch=main`.
- **Fork PRs can never deploy:** the job is guarded on
  `github.event.pull_request.head.repo.full_name == github.repository` (and
  secrets are unavailable to forks regardless).
- Branch name resolves via `${{ github.head_ref || github.ref_name }}` for both
  event types, passed through an env var and quoted at the call site — the
  branch contains a `/`, and this avoids expression injection into the shell.
- Job-level `concurrency: preview-<branch>, cancel-in-progress` so a push and its
  pull_request `synchronize` event don't deploy the same commit twice.
- A **draft PR** (`main...redesign/inventors-workbench`) keeps checks and the
  running diff in one place. It is **not for merge** — the production swap
  remains gated on Phil's sign-off after M11 staging review.
- Committed as `chore(ci): branch previews for redesign`.
