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
| M5  | PHI-66  | WebGL background scene with camera sync               | Done        |
| M6  | PHI-67  | Experiment document templates and content migration   | Done        |
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

### 2026-07-22 — M5 (PHI-66): WebGL background scene (Layer 0)

- **`src/scripts/desk-scene.ts`** — a persistent module that dynamically imports
  `three` after first idle and builds the §8 scene: a matte ground plane in
  `--desk`, five abstract slab volumes near the periphery (raised toward the
  camera so their sides foreshorten off-axis), warm ambient (0.55) + one
  directional light, and `THREE.Fog` toward `--desk-deep` for the edge vignette
  (no texture maps, no shadow maps). Colours are read from the CSS tokens.
- **Sync contract (§3).** The `PerspectiveCamera` (FOV 35°) is driven from the
  *same* store as the DOM plane via `cameraPose()`. It looks head-on at the
  ground, so the **scale locks to the plane** (distance
  `D = viewportHeight / (2·zoom·tan(FOV/2))` — same `zoom` the plane uses, so no
  swim); the x/y pan is scaled by **parallax 0.85** so the background drifts
  slightly less than the content — the depth cue. (three y is up, desk y is down,
  so y is negated.)
- **Layering:** the WebGL canvas is Layer 0 (`z-index:0`), the agent field 1, the
  plane 2, inside `.desk-behind` — so STACK blurs the scene with the rest, and the
  plane's opaque paper occludes it.
- **Loading / lights-on (§8):** first paint is rung 2 (the CSS ground); `three`
  loads post-idle (`requestIdleCallback`) and the canvas fades in over 600ms
  (`.is-lit`). The canvas `transition:persist`s, so three initialises **once** and
  survives ClientRouter swaps.
- **Budget (§8/§14 perf pass, budget miss).** `three` is correctly **lazy**
  (dynamic import; not in the initial route JS, which stays tiny). But the chunk
  is **~188KB gz, over the 160KB target by ~15%.** This is essentially three's
  floor: `WebGLRenderer` imports the monolithic `ShaderLib` (every built-in
  shader), so the material choice does not move the bundle — verified the raw size
  is identical with MeshStandard vs MeshLambert. Getting under 160KB would need a
  lighter WebGL library, a product decision for Phil. Mitigations: it is off the
  critical path (post-idle), so LCP / INP / initial-JS (the user-facing §14
  budgets) are unaffected. **Flagged for Phil.**
- **Perf loop (§8):** `setPixelRatio(min(dpr, 1.5))`; the render loop only draws
  when the camera pose changes, and **parks after 2s of no movement** and on
  `document.hidden`; resize via `ResizeObserver`. The desk runtime calls
  `wakeDeskScene()` when a navigation starts.
- **Failure (§8):** a failed dynamic import or init logs once, disposes, and stays
  on rung 2 — never a blank background.
- **Review fixes (two MEDIUM, both fixed before commit).** (1) *Dispose-on-fail was
  dead code:* `mount()`'s catch called `scene?.destroy()`, but `scene` is still
  null when `build()` throws (the assignment never completed), so a partial
  WebGL context + geometries leaked. `build()` now holds its allocations in
  tracking refs and disposes them itself before re-throwing. (2) *Scene parked
  mid-unfold:* the loop parks on `document.hidden` and after 2s idle, so during
  the two-beat swap-hold it could sleep through the Beat-2 zoom and then snap
  (swim). The runtime now re-wakes the scene each frame while
  `store.isAnimating`, so it tracks the whole Beat-2 push.
- **Verify:** `astro check` 0 errors · build 18 pages · `vitest` 80/80. The
  camera-sync scale-lock is deterministic (the projection formula); the *feel* of
  the scene — atmosphere, the light pool, whether it swims — is Phil's real-browser
  call (note 6), especially since the preview pane's rAF is intermittent here.

### 2026-07-23 — FIX A: phase-lock the reveal to push progress (Phil's frame data)

Phil's frames: travel ✓, settle ✓, zoom ✓ — but the document resolved in the
first ~30% of the push (the CSS transition/VT morph ran on their own clocks from
push start). §7.3 wants the final ~40%. The reveal is now a **pure function of
push progress**, driven from the same rAF tick as the camera, in BOTH open paths.

- **`revealAmount(p)`** (`nav.ts`, pure): 0 for p ≤ 0.6, linear to 1 at p = 1.
  **`CameraStore.progressAt(now)`**: the raw un-eased phase clock of the leg in
  flight (1 when idle/holding). The runtime writes `--unfold-t` every tick;
  `body[data-unfolding] .document` derives opacity/scale from it. The time-based
  `.document` transition and the same-zone card VT-morph tagging are **deleted**
  (the document keeps `view-transition-name: unfold` only for the close
  fold-out). Same-zone opens now stamp/hide/reveal exactly like cross-zone.
- **`revealTick(p, msSinceBegin)`** caps the driven amount with a 180ms time
  ramp — for an on-time swap the cap coincides with the push window (the reveal
  window IS 180ms of the 450ms zoom-only floor) so the reveal stays purely
  progress-locked; a swap landing after the push finished gets a full rAF-driven
  ramp instead of a single-frame pop (adversarial review).
- **Stack timing decoupled from the reveal** (review): `data-unfold` now has two
  flavours — `traveling` (pre-push: desk NOT stacked) and `pushing` (push
  running: blur/scrim ride `--t-stack` from push start, ending before settle;
  only the document stays hidden to 60%). The Beat-2 gate still keys on
  `traveling`, semantics unchanged.
- **Motion debug trace** (`lib/motion-trace.ts` + `?debug=motion` /
  `localStorage debug:motion=1`): one `console.table` per move — beat1
  start/arrive, settle end, gate open (+ released by swap or settle), push
  start, reveal start/end, settled; interrupted moves flush separately. Numbers
  instead of videos; tests assert phase ORDER **and TIMING**.
- Review also fixed: stale `wasAnimating` (settle detection now reads
  `store.isAnimating` pre-tick — a hide during the first tween frame no longer
  strands the desk at the pre-nav pose) and `pointer-events: none` during the
  ramp. **Accepted as shipped-parity limitations:** live reduced-motion toggle
  still needs a reload (boot-time const since M3); a paginated-away card falls
  back to a centre origin; interrupting mid-ramp pops the outgoing document to
  full opacity for the fetch window.
- **Verify:** 0 errors · 18 pages · vitest **104/104** (was 80): mapping, phase
  clock, 0.6 flip, catch-up ramp, and trace-asserted order+timing for both gate
  orderings and same-zone on-time/late/mid-ramp swaps.

### 2026-07-23 — M6 (PHI-67): experiment document templates + content migration

Every experiment now renders as a §10 physical document; the M2-era chaptered
case-study deck (tabs, hash slides, chapter script, align island, MetricCard
grid, hero autoplay) is **retired** — one scrolling paper, all motion owned by
the camera.

- **Template** (`projects/[slug].astro` + `src/components/document/`): §9-styled
  title block (`DocTitleBlock` — EXP.00N, status dot, title, mono stack chips,
  period) → abstract (frontmatter `summary` + `question`) → the body's Problem /
  Idea / Result sections → figure plates (`FigurePlate` — FIG.01 architecture is
  the reserved hatched plate until M8's §11 diagram; FIG.02 wraps the FR-38 lazy
  hero, click-to-play now) → **honest metrics as a ruled mono table**
  (`MetricsTable` — `source` always renders, `value: pending` stays an em-dash
  row per FR-22) → links. The whole document scrolls in the one sanctioned
  `.panel-scroll` (keyboard-operable) — an adversarial-review BLOCKER catch:
  the first cut dropped the inner scroller and the sheet's `overflow:hidden`
  clipped everything below the first screenful.
- **Schema:** `expNo` (required int — the STABLE document number, deliberately
  separate from `order`, which stays the desk sort), `diagram` (optional §11
  component ref, M8), metric `note` (optional; **`source` stays required** —
  ADR 0004 untouched). All three EXP-label renderers (Home card, Experiments
  card, title block) read `expNo` (review caught HomeZone still on `order`).
- **Documented deviation — `problem`/`idea`/`result` are body sections, not
  frontmatter fields.** §10 sketches them as frontmatter additions; they are
  implemented as canonical `##` sections in the markdown body instead, because
  Astro renders body markdown natively (links, emphasis, the AEGISX SVG) —
  multi-paragraph YAML strings would need a second markdown pipeline (a new
  dependency) or lose formatting, and FR-24's "content is a markdown file"
  reads better with prose in the body. The template still renders the §10
  order; the section set is enforced by the migration. Flagged to Phil.
- **Content migration (voice rule absolute):** prose byte-identical; only
  headings moved (`Approach`→`Idea`, `Architecture`→`###` under Idea,
  `Results`→`Result`, aegisx `Planned vs delivered`→`###` under Result) and
  `TODO(phil-voice)` comment blocks added — every gap flagged for Phil, nothing
  reworded, no invented claims. `Reflection` kept (not a §10 section — Phil
  rules on placement). AEGISX's inline SVG stays for M8's §11 redraw.
- **Simpler documents (§10):** notes = index card, log = notebook page — one
  mono micro meta row (`doc-cardhead`) over a ruled line; LOG.NN numbering;
  commit chips keep FR-23. Both migrated off legacy aliases, as were `prose-md`
  and the retired page. `MetricCard.astro` deleted. Aliases stay for the
  remaining consumers (scrollbars, agent island, AEGISX SVG, 404).
- **Verify:** 0 errors · 18 pages · 104/104 · in-pane: all five EXP documents
  render the full template (title block, sections, plates, table, links), scroll
  end-to-end, notes/log render their card/page variants; rung 4 throughout
  (server HTML, no runtime needed).

### 2026-07-23 — Budget ruling: `three` accepted at 188KB gz; §8/§14 ceiling → ≤200KB

Phil accepted the M5 budget flag: the `three` chunk ships at **~188KB gz** —
its measured floor, since `WebGLRenderer` imports the monolithic `ShaderLib`
(every built-in shader) and the material choice does not move the bundle.
Handoff §8 and §14 amended from ≤ ~160KB to **≤ 200KB gz, post-idle**, with the
floor documented. Rationale: the chunk is off the critical path (post-idle
dynamic import), so LCP/INP/initial-JS — the user-facing §14 budgets — are
unaffected; getting under 160 would require a different WebGL library for a
~28KB win on a lazy asset. No lighter-lib follow-up opened.

### 2026-07-23 — FIX B: luminance parity for lights-on (Phil's YAVG data)

Phil measured the lights-on fade at −5% whole-desk (YAVG 151.1 → 143.6),
concentrated in the periphery — the GL "pool" was tighter than the CSS pool.
Root causes found: **three's fog depth is the view-plane z, constant across a
head-on ground plane** — fog *cannot* produce a radial vignette here, so the M5
scene rendered one flat tone (no pool at all); and three's physically-based
diffuse divides the light sum by π, so the lit level sat at ~0.36× naive
expectation.

- **The vignette is now a camera-synced vertex grade.** The ground plane is
  subdivided (96×64) and `syncCamera` repaints per-vertex colors from the SAME
  radial profile the CSS ground uses (ellipse 145%×125% at 50%,38%; pool→desk
  at 46%→deep), projected through the live camera — the pool tracks the
  viewport exactly as the CSS pool does, at every pose and zoom. Tones via a
  1024-entry LUT (sRGB-mixed like CSS, then EOTF to linear); repaint costs
  **0.23ms** per moved frame. No texture maps (§8) — the grade is a geometry
  attribute. Fog is retired (inert for this geometry); §8's "fog vignette"
  intent is carried by the grade.
- **Lights are white and π-compensated** (`π/(0.55+0.85·cosθ)` over the §8
  ambient/key balance) so a white-albedo ground renders its grade tone exactly
  — the warmth lives in the token palette, and the fade is hue-neutral over the
  gradient it covers. `outputColorSpace`/`toneMapping` pinned explicitly.
- **Slabs keep the approved M5 look** (review): their albedos are premixed down
  by the old warm rig's lit factors (0.399/0.341/0.274 per channel) so the
  π-compensated rig doesn't blow them out to full token tone (a paper slab
  would have read as a foreground document card).
- **Lights-on gating (Phil point 4):** `is-lit` is added in a rAF after the
  first render — the fade never starts on a blank frame; hidden tabs defer the
  fade until visible. `requestIdleCallback` now carries `{timeout: 2000}` (a
  hidden tab gets no idle periods — init would never run there).
- **Measured** (1280×720, dpr 1.5, `?debug=scene` harness — render +
  `readPixels`, no rAF needed): home zoom 1: **ΔY +0.8…+1.2 at six points**
  (pool centre, mid-field, corners, edges), whole-desk **+0.38%** (was −5%);
  experiments zone 0.9 panned: ΔY 0…+1; notes zone 0.95: ground points
  +1.0/+1.2. The uniform ~+1 is the standard material's flat specular sheen —
  on the bright side, nothing dims. **Flag:** at slab-heavy poses (/notes) the
  whole-frame delta is dominated by slabs-as-content (M5-approved tones over a
  slab-free gradient) — identical to the approved M5 fade, not a calibration
  error; if slabs should sit closer to the ground, that is one constant.
- Review also fixed: stale `devicePixelRatio` (now re-read in `resize()`).
- **Verify:** 0 errors · 18 pages · vitest 104/104.

### 2026-07-22 — M4 tune fix: gate Beat 2 on swap AND arrival (Phil's frame data)

Phil's video frames showed the unfold beginning ~150–250ms into Beat 1 — the
document grew while the desk was still travelling, with no perceptible settle. The
mirror of the earlier race: the previous fix gated only the *reveal* on the
swapped-in document, but the camera's Beat-2 *zoom* still ran on the store's own
clock, so a fast fetch opened the document mid-slide.

- **The gate is a conjunction, arbitrated by the controller.** Beat 2 — the zoom
  push to 1.45 AND the reveal, together — now starts at
  `max(swap complete, travel leg + settle leg complete)`. Because that combines a
  store-internal event (travel+settle) with an external one (the swap), the store
  can't own it: the two-beat OPEN no longer uses `sequenceTo`. `desk.ts` runs
  Beat 1 as a plain `slideTo(parentPose)`, records `arrivedAt` when it settles,
  and `tickTwoBeat` fires Beat 2 (`slideTo(docPose)` + reveal) only once
  `beat2Gate(arrivedAt, now, SETTLE, swapReady)` holds. The camera *holds* at the
  parent pose until the gate opens — a slow fetch reads as a longer settle.
- **`beat2Gate` is a pure predicate** (`nav.ts`), tested in both orderings
  (fast-fetch: reveal deferred to arrival+settle; slow-fetch: held until the swap
  lands) plus the conjunction and the not-yet-arrived cases.
- The rAF loop stays alive while a two-beat is holding for its gate
  (`animating || field || (twoBeat && !fired)`); `after-swap`/`onPageLoad` no
  longer snap a held two-beat to the document pose (it must not jump to 1.45).
- **Interrupts** during Beat 1 or the hold reset `twoBeat = null` at the next
  `before-preparation` and retarget the store from the live pose — Esc/Back/number
  key/another card never stick. `sequenceTo` is retained for the two-beat CLOSE
  (fold + slide, no swap to coordinate). Reduced motion still snaps to the final
  pose (one ≤120ms cut). §7.3 of the handoff updated with the gate rule.
- **Robustness:** `after-swap` also stamps `data-unfold=traveling` on the live
  body (not just `before-swap` on the parsed incoming body), so the document stays
  hidden even on a swap path that skips the View Transition.
- **Adversarial review caught a BLOCKER I introduced:** `frame()` read the
  loop-continue flag from the `animating` captured *before* `tickTwoBeat` ran — so
  on the exact frame Beat 2 fires (which starts the zoom tween *and* clears the
  gate), the loop stopped and the zoom-to-1.45 never ticked, freezing the camera
  at the parent zoom on every cross-zone open. Fixed by re-reading
  `store.isAnimating` after `tickTwoBeat`. (This is why the rAF loop reschedule
  now uses the fresh state, not the stale const.)

### 2026-07-22 — M4 tune: two-beat cross-zone unfold (Phil's parity feedback)

Opening a document from a *different* zone flew the camera diagonally across the
desk in one move. Amended §7.3 of the handoff with a two-beat rule and implemented
it:

- **`CameraStore` gained a sequence primitive.** `sequenceTo(steps, now)` plays a
  plan of `{pose, settle}` legs — tween, wall-clock settle hold, tween — and
  retargets from the *live* pose at every phase (travelling or settling), so
  keys/Esc/Back/another-card never stick. `slideTo` is now `sequenceTo` of one
  leg; all 19 prior camera tests still pass. 6 new sequence tests cover the holds
  and interruptions (note 6).
- **`planCamera(fromPath, toPath, settle)`** (pure, in `nav.ts`, 7 tests): a
  cross-zone document open → `[parentZonePose (settle), docPose(1.45)]`; a
  cross-zone close → `[parentZonePose (settle), destPose]`; everything else a
  single tween. Settle token `--t-settle` (150ms; range 120–180).
- **The document is hidden during Beat 1.** `desk.ts` arms a two-beat open in
  `before-preparation`, and in `astro:before-swap` stamps
  `data-unfold="traveling"` on the *incoming* body (before it goes live, so the
  document is hidden from the first painted frame). Beat 1 therefore reads as a
  plain Slide to the parent zone. At Beat 2 (the rAF loop detects the plan leaving
  the settle) the runtime measures the parent zone's card, sets `--unfold-ox/oy`
  as the transform-origin, and removes the attribute — the document unfolds from
  that card (note 4). Focus is deferred to this moment so it coincides.
- **One navigation, one history entry** — the URL pushes straight to the document;
  the beats are camera-only (no visit to `/projects`).
- **Morph origin (note 4):** cross-zone opens are *not* tagged with the browser
  `view-transition-name` (that would morph from the card left behind on the old
  zone); they use the JS reveal from the parent card. Same-zone opens keep the
  browser FLIP morph.
- **Close (note 5):** Esc → single fold to the parent zone (focus its card);
  Back → `planCamera` yields the two-beat close (fold out, settle, slide),
  focus per note 8.
- **Reduced motion (note 7):** `before-preparation` snaps to the final pose (no
  sequence, no traveling state) → the M4 single ≤120ms root crossfade. Never two
  cuts. Unit-tested (`sequenceTo` under reduced snaps to the last leg).
- **Verification split (note 6):** the state machine is proven (`sequenceTo` +
  `planCamera`, 45 camera/nav tests); the choreography feel — the settle beat, the
  unfold origin, the retimed reveal — is Phil's real-browser call.
- **Adversarial review before commit** found two real defects (both invisible in
  the headless pane), fixed:
  1. **Reveal raced the fetch (high).** `maybeRevealUnfold` was gated on camera
     progress but not on the swap. On a slow/un-prefetched fetch the camera reached
     Beat 2 while still on the origin page, so the reveal fired against the
     outgoing DOM — clearing the arm flag so `before-swap` never hid the incoming
     document (it swapped in fully visible) and focus was lost. Fixed: the reveal
     now also requires the live body to be the stamped incoming document
     (`data-unfold === 'traveling'`), so a plan that reaches Beat 2 early simply
     waits for the swap.
  2. **Beat-1 hidden document stayed in the a11y tree (high).** `opacity:0` +
     `pointer-events:none` don't remove `<main class="document">` from the tab
     order or the screen-reader buffer, so during the ~600ms slide a keyboard/AT
     user could enter the invisible document. Fixed: the travelling document is
     `visibility:hidden`.

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
