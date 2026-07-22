# INVENTOR'S WORKBENCH — Redesign Handoff Spec

| | |
|---|---|
| **Status** | Ready for implementation |
| **Date** | 2026-07-19 |
| **Owner** | Phil (approvals, copy voice, production swap) |
| **Executor** | Coding agent |
| **Target** | philsanjaya.com (Astro 6, Cloudflare) |
| **Inputs** | Branding doc ("The Inventor's Workshop"), Design-DNA research doc, motion reference video (characterized in §7.3), locked decisions (§1) |

> **North star:** *A precision laboratory built on a human workbench.*
> The site is one continuous physical desk. Nothing ever "loads" — the camera moves, objects rearrange, documents unfold. Every animation maps to a physical verb. The precision comes from Swiss editorial structure and drafting-culture details; the humanity comes from warm materials and hand-drawn line work.

If `PROJECT_CONTEXT.md` / `DECISIONS_LOG.md` exist in the repo, read them before starting. Log the decisions in §1 to `DECISIONS_LOG.md` as part of M0.

---

## 1. Locked decisions — do not re-litigate

1. **Total changeover.** All presentation is replaced. Routes, content collections, `/resume.pdf`, and OG images are preserved (§2).
2. **Zoned camera moves over a route skeleton.** The desk has zones; each zone is a real URL; navigation is a camera move between zones. Free-pan exploration is a **deferred enhancement**, not the foundation.
3. **Title-block index instead of a navbar.** A drafting-style title block (§9) is the primary navigation. No top bar, no hamburger, no sidebar.
4. **3D background, DOM content.** The environment is a real-perspective WebGL scene (Three.js). All readable content stays HTML on a synced 2D plane above it (§3, §8). Content is never rendered inside WebGL.
5. **Warm-signature synthesis.** The research doc's system (spatial physics, editorial hierarchy, materials as light-and-shadow) with exactly three warmth signatures: two-tone stone-desk/paper ground, copper as the single accent, hand-drawn line quality in illustrations. No wood-grain textures, no literal skeuomorphism.
6. **Handwriting appears in diagram annotations only** (inside SVGs, Caveat). Never in UI chrome or body copy.
7. **Motion law: every animation maps to a physical verb** — Lift, Slide, Fold/Unfold, Stack (§7). No decorative motion. No bounce. Anything that can't be named with one of the four verbs doesn't ship.
8. **Blur is rationed to the Stack verb** (desk beneath an open document). Never decorative glass panels.
9. **Mobile is a single-axis vertical roll** — same verbs, one dimension, no free panning (§13).
10. **Deferred (do not build now):** free panning/zooming, "Rearrange" snap-on-resize, dark mode ("workshop at night"), agent-canvas graphite re-materialization beyond M7 scope.

---

## 2. Keep / Replace

**Keep (must not break):**
- All existing URLs: `/`, `/projects`, `/projects/<slug>`, `/notes`, `/log`, `/about`, `/resume.pdf`, OG image routes. No redirects should be necessary; if any path must change, 301 it.
- Astro 6, content collections as the content source of truth, static output, Cloudflare deployment.
- `<ClientRouter />` (view transitions) — already enabled; we build on it.
- The steering-agent simulation code (re-hosted, §12).
- The honest-metrics discipline in all project copy.

**Replace:**
- The entire visual layer: layout, styles, typography, navigation, motion.
- The single-background no-scroll shell becomes the zoned desk (§3). The "no-scroll" identity survives at the desk level: the desk never scrolls — the camera moves. Open documents scroll internally.
- The `settings` control: hide in v1 (dark mode is deferred). Keep the code path stubbed for later.

---

## 3. Architecture

Three layers, back to front, all persistent across navigations (`transition:persist`):

```
Layer 0  WebGL scene (Three.js)   — desk plane, abstract volumes, lighting. Atmosphere only.
Layer 1  DOM content plane        — real HTML zones/cards/documents, positioned in desk units,
                                    transformed by the camera. All text lives here.
Layer 2  HUD                      — title block (fixed), skip link, route announcer.
```

**Single source of truth: the camera store.** One reactive store `{ x, y, zoom }` in desk units. Every animation frame derives BOTH transforms from it — never tween the two layers independently or they drift:

- DOM plane: `transform: translate3d(calc(50vw - x*zoom), calc(50vh - y*zoom), 0) scale(zoom)` (transform-origin 0 0; exact formula may be refactored, the invariant is: one store, one tween, two projections).
- WebGL camera: `PerspectiveCamera` positioned from the same `{x, y, zoom}` with a **parallax coefficient of 0.85** on x/y (background moves slightly less than content = depth cue) and height/FOV mapped from `zoom`.

**Routing integration (Astro):**
- Routes remain the skeleton. Intercept navigation (`astro:before-preparation` / programmatic `navigate()` from `astro:transitions/client`): run the camera tween to the target pose, morph content with the View Transition, keep layers 0–2 alive via `transition:persist`.
- URL updates at motion start, not motion end (pushState mid-flight keeps every state deep-linkable).
- Deep link / hard load: page renders server-side at the target pose instantly (no fly-in on first paint), then the scene fades in (§8 "lights on").
- Browser back/forward must replay the appropriate camera move (popstate → tween to pose).

**Fallback ladder (progressive enhancement — each rung fully usable):**
1. Full experience: WebGL + camera + verbs.
2. No WebGL (unavailable/failed init): CSS two-tone ground (radial-gradient light pool on `--desk`), all camera/verbs still work on the DOM plane.
3. `prefers-reduced-motion`: all verbs become ≤120ms crossfades; camera moves are instant cuts; scene is static.
4. No JS: Astro's server-rendered pages display as plain, readable, posed documents; title block renders as ordinary links. Content is never JS-gated.

**Dependency policy:** `three` (dynamically imported, §8). Camera tween: hand-rolled rAF + easing function, or `motion` (Motion One) if a dependency is preferred. Do **not** add GSAP, React, or a state library — a ~30-line store is enough.

---

## 4. Zone map & information architecture

Desk units: abstract px at zoom 1. Desk bounds ≈ 5200 × 3400, origin at center. Defaults below are adjustable; keep generous negative space between zones — the empty desk is part of the composition.

| Sheet | Zone | Route | Pose (x, y, zoom) | Contents |
|---|---|---|---|---|
| 01 | Home (desk center) | `/` | (0, 0, 1.0) | Name, one-line intro, resume object (paper card linking `/resume.pdf`), 2–3 featured experiment cards, title block in view |
| 02 | Experiments | `/projects` | (+1800, 0, 0.9) | Bento of 5 documents (§10): EXP.001 CTF Arena, EXP.002 AEGISX, EXP.003 Market Sentiment, EXP.004 Power Forecasting, EXP.005 This Website |
| 03 | Notes | `/notes` | (0, +1400, 0.95) | Index cards, slight scatter (±0.8° rotation, deterministic per slug — no RNG per render) |
| 04 | Log | `/log` | (−1800, 0, 0.95) | Lab-notebook object → chronological entries |
| 05 | Workshop | `/about` | (0, −1400, 0.95) | Pinned about sheet, tools/colophon, contact |
| — | Open document | `/projects/<slug>` etc. | card pose, zoom ≈ 1.45 → document view | Unfolded document (§7.2, §10) |

**Zone composition:** bento-style modular grid *within* each zone (12-col mental model), broken occasionally by physical placement — a slightly rotated card, an off-grid object. Primary content sits sharpest and highest (elevation, §5); secondary context sits deeper.

**Recruiter path — acceptance criterion:** from a cold load of `/`, reaching the AEGISX document takes **≤ 2 clicks and ≤ 4 seconds** including animation, and the resume object is visible without any interaction. Test this literally in M11.

**Off-zone content:** apply `content-visibility: auto` (with `contain-intrinsic-size`) to zones far from the camera; lazy-render heavy zone internals.

---

## 5. Design tokens

Create `src/styles/tokens.css`. Every color, shadow, duration, and easing in the codebase references these — no magic values in components.

```css
:root {
  /* Ground — the two-tone signature */
  --desk:        #D8D2C6;   /* warm stone workbench */
  --desk-deep:   #C7C0B2;   /* desk shading, vignette, scrim base */
  --paper:       #FAFAF8;   /* documents, cards */
  --paper-edge:  #EFEDE7;   /* card borders, dividers, ruled lines */

  /* Ink */
  --ink:         #232323;
  --ink-soft:    #6B6B6B;   /* secondary text, captions */

  /* Accent — copper only. Not terracotta, not orange. */
  --copper:      #B87333;   /* links, active sheet, focus, one highlight per diagram */
  --copper-deep: #8F5A26;   /* hover/pressed */

  /* Status — forest green, strictly for live/status markers ("built in public", EXP status dots) */
  --status:      #41604F;

  /* Glass — Stack verb only */
  --glass:       rgba(250, 250, 248, 0.62);
  --glass-blur:  8px;

  /* Warm shadows (the shadow tint is a warmth signature — never pure black) */
  --shadow-rgb:  42 34 22;
  --e1: 0 1px 2px rgb(var(--shadow-rgb) / 0.10), 0 2px 8px  rgb(var(--shadow-rgb) / 0.08);
  --e2: 0 2px 4px rgb(var(--shadow-rgb) / 0.12), 0 8px 24px rgb(var(--shadow-rgb) / 0.14);
  --e3: 0 4px 8px rgb(var(--shadow-rgb) / 0.14), 0 24px 64px rgb(var(--shadow-rgb) / 0.22);

  /* Motion */
  --ease-physical: cubic-bezier(0.65, 0, 0.35, 1);  /* Slide, Fold — symmetric, no overshoot */
  --ease-settle:   cubic-bezier(0.2, 0, 0, 1);      /* Lift in, small settles */
  --t-lift-in: 180ms;  --t-lift-out: 240ms;
  --t-stack:   300ms;

  /* Depth levels → paired shadow */
  /* 0 desk · 1 resting paper (--e1) · 2 lifted (--e2) · 3 open document (--e3) · 4 HUD (--e1) */

  /* Rhythm */
  --space: 8px;             /* base unit; spacing in multiples */
  --radius-paper: 2px;      /* paper is nearly square-cornered */
  --radius-glass: 12px;
}
```

Ruled lines and corner registration marks (drafting-sheet detail) use `--paper-edge` at 1px; use them structurally (section boundaries in documents, title block frame), never as decoration on every surface.

---

## 6. Typography

Swiss editorial hierarchy; type is the labeling system of a physical space. Self-host all fonts (Fontsource or vendored WOFF2, `font-display: swap`, preload the two primary weights).

| Role | Face | Notes |
|---|---|---|
| Display & body | **Geist** (fallback stack: Inter, system-ui, sans-serif) | Weights 400/500/700 only |
| Labels, numbers, data, title block | **Geist Mono** (fallback: IBM Plex Mono, monospace) | The web's stand-in for blueprint lettering; all sheet numbers, dates, stack chips, metric tables |
| Diagram annotations only | **Caveat** | Loaded lazily with diagram components; never referenced in UI CSS |

Scale (desktop → mobile), rem-based:

| Token | Size / line-height | Use |
|---|---|---|
| display | 56/1.05 → 36/1.1, weight 700, tracking −0.02em | Name on Home, document titles |
| h1 | 36/1.15 → 28 | Zone headings |
| h2 | 24/1.25 → 20 | Document sections (Problem / Idea / Result) |
| body | 17/1.65 → 16/1.6 | Reading text; measure 60–70ch inside documents |
| caption | 13/1.5, mono | Metadata, table cells |
| micro | 11/1.4, mono, uppercase, +0.08em tracking | Title block, sheet numbers, chips, "engraved" microcopy |

Microcopy register: plain verbs, sentence case in prose, uppercase mono for drafting labels. Buttons say what they do ("Open experiment", "Back to desk", "Download resume").

---

## 7. Motion spec — the four verbs

These four choreographies are the entire motion API. Implement them once (e.g. `src/motion/verbs.ts`) and compose everything from them. Global laws first:

- **Transform + opacity only.** Never animate layout properties, box-shadow (crossfade two shadow layers instead), or filter — except the single Stack blur.
- **No bounce, no overshoot, anywhere.** Paper doesn't bounce.
- **Retarget, never queue.** A new navigation mid-flight retargets the live tween from the current camera value.
- **Reduced motion:** every verb degrades to a ≤120ms opacity crossfade; camera cuts instantly. Test this path explicitly at every milestone.
- **The title block never animates** (except its active-sheet highlight, a 120ms color change).
- Nothing animates on scroll for decoration.

### 7.1 LIFT — hover/focus on an interactive object
- In: `--t-lift-in` `--ease-settle`; `translateY(-4px)`; shadow e1→e2 (crossfade a second shadow element's opacity); optional tilt ≤1.2° toward cursor on fine pointers only.
- Out: `--t-lift-out`. Focus-visible additionally gets a 2px `--copper` outline offset 3px. Touch devices: skip hover lift; keep the focus style.

### 7.2 SLIDE — camera move between zones
- Duration scaled by distance `d` (desk units): `clamp(450, 300 + 0.12·d, 800)` ms, `--ease-physical`.
- One tween drives the store; both layers project from it (§3). Neighbor objects exit past the frame edges naturally because the *plane* moves — never animate individual cards during a Slide.

### 7.3 FOLD / UNFOLD — card ↔ document (the video choreography)
Reference behavior (from the motion video): *the whole surface scales and translates so the chosen card fills the viewport — neighbors slide off past the frame edges — and in the final stretch the card's contents resolve into the full document layout. Reverse on close, faster.*

- **Unfold (open), ~720ms total, overlapping phases:**
  - t=0: `pushState` to the document URL; begin camera push (Slide tween to the card's pose at zoom ≈ 1.45), 0–550ms.
  - t≈420–720ms: content morph — View Transition with a shared element on the document title (`view-transition-name` per slug); card innards crossfade into the document layout, ease-out.
  - On settle: Stack engages (§7.4); document becomes internally scrollable; focus moves to the document heading.
- **Fold (close), ~420ms:** morph back first (0–180ms), camera pull-out 120–420ms; focus returns to the originating card.
- **Parity checklist (M4 verification):** plane moves, not the card · neighbors exit frame edges · content resolves only in the final ~40% · no opacity flash of the desk · reverse is symmetric and faster · 60fps in a Performance trace.

**Two-beat cross-zone unfold (amended post-M4, 2026-07-22).** When the document's
parent zone differs from the zone currently in view, a single unfold would fly
diagonally across the desk. Instead it plays in two beats, as one navigation with
one history entry (the URL pushes to the document at t=0; Beat 1 is choreography,
not a route visit):
- **Beat 1 — SLIDE** to the parent zone's §4 pose (the normal distance-scaled
  `clamp(450, 300+0.12·d, 800)`), with the document hidden so it reads as a plain
  zone Slide. Then a **settle hold** of `--t-settle` (default 150ms; token, tunable
  120–180ms).
- **Beat 2 — UNFOLD** from the parent zone's card (zoom to ≈1.45). The morph
  origin is the *parent zone's* card, not the featured card that triggered the
  open on another zone. Home→EXP.001 lands in roughly 1.1–1.5s total.
- **Beat 2 is gated on `max(swap complete, travel + settle complete)`.** The zoom
  push to 1.45 and the reveal fire *together*, and neither begins on the camera's
  own clock: a fast document fetch waits out the settle (so the document never
  opens mid-slide); a slow fetch holds at the settled parent pose — reading as a
  longer settle — and fires the instant the swap lands.
- **Same-zone opens keep the single unfold** (Beat 2 only).
- **Close:** Esc folds in place (stay at the parent zone, focus its card); Back
  folds then Slides retracing history, focus per §14/note-8.
- **Interruption:** every phase — travelling and settling — retargets from the
  live pose, so keys/Esc/Back/another-card never leave the camera stuck.
- **Reduced motion:** the whole sequence collapses to one ≤120ms crossfade —
  never two cuts.

### 7.4 STACK — depth while a document is open
- Desk plane (and WebGL scene) beneath: `blur(var(--glass-blur)) saturate(0.96)` + `scale(0.985)`, `--t-stack`; document at elevation 3.
- Exactly one `backdrop-filter`/`filter` layer at a time. On mobile and rung-2 fallback: replace blur with an opacity scrim (`--desk-deep` at 0.55) — cheaper, same hierarchy.

**Flourish (only one):** document/zone titles get an ink-reveal — an annotation underline drawing in via `stroke-dashoffset`, 500ms, once per session per zone. Skipped under reduced motion. No other flourishes.

---

## 8. WebGL background scene (Layer 0)

Purpose: real-perspective depth and light — the *room* the desk sits in. It must read as atmosphere, never compete with content.

- **Composition:** large matte ground plane in `--desk` tone; 3–5 abstract rectangular slab volumes near the desk periphery (paper/stone tones, low contrast — echoing the reference video's geometry); soft warm lighting: ambient (~0.55) + one broad directional creating a gentle light pool toward desk center. Subtle vignette toward `--desk-deep` at the far edges.
- **No texture maps, no wood grain** — flat materials + lighting only (`MeshStandardMaterial`, high roughness). **No shadow maps** — depth cues come from lighting, the parallax offset, and the DOM's CSS shadows. This is a deliberate perf + aesthetic call.
- **Camera:** `PerspectiveCamera`, FOV ~35°, pose derived from the store (§3) with parallax 0.85. FOV/height mapping from `zoom` should be tuned so DOM and scene feel locked (verify by toggling Layer 0 on/off — content must not appear to swim).
- **Loading — the "lights on" moment:** first paint is rung 2 (CSS ground) with content fully visible. `three` is dynamically imported after first idle; the scene fades in over ~600ms. The site is never blocked on WebGL.
- **Performance budget:** `three` import ≤ ~160KB gz, loaded post-idle · `setPixelRatio(min(devicePixelRatio, 1.5))` · render loop pauses when the camera has been idle > 2s and agents (§12) are idle, and on `document.hidden` · resize observed, not polled.
- **Failure:** any init error → dispose cleanly, remain on rung 2, log once. Never a blank background.

---

## 9. Title block — the navigation

A real drafting title block, fixed bottom-left (Layer 2), paper card at elevation 1, mono micro type, ruled internal lines:

```
PHILIPUS SANJAYA · INVENTOR'S WORKBENCH
SHEET INDEX
01 HOME   02 EXPERIMENTS   03 NOTES   04 LOG   05 WORKSHOP
REV <git short-sha> · <build date> · SCALE 1:1 · BUILT IN PUBLIC
```

- Semantics: `<nav aria-label="Sheet index">`, ordinary links (works at fallback rung 4); it is the skip-link target.
- Active sheet: `--copper` + underline. Hover: `--copper-deep`.
- Keyboard: `1`–`5` jump to sheets (ignored while focus is in an input); full tab order; visible focus per §7.1.
- The REV line is generated at build time (short SHA + date) — the "built in public" signature, automated.
- Mobile: collapses to a compact bottom strip (§13). The title block is the **only** persistent chrome on the site.

---

## 10. Document template (Experiments)

Every project is a physical document. On the desk: a paper card (elevation 1) with EXP number (mono micro), title, one-line summary, year, status dot (`--status`). Unfolded (per §7.3), the document layout:

1. **Title block header** (mirrors §9 styling): `EXP.00N`, title, date range, status, stack chips (mono).
2. **Problem** — 2–4 sentences. 3. **Idea** — what was built, with the architecture diagram (§11). 4. **Result** — what actually happened.
5. **Honest metrics** — a ruled mono table of real numbers, including the unflattering ones. Never marketing language.
6. **Links** — repo / demo / write-up.

Content collection frontmatter additions: `expNo`, `status`, `stack[]`, `problem`, `idea`, `result`, `metrics[]` (label/value/note), `diagram` (component ref). Migrate the 5 existing entries; where existing copy doesn't map cleanly, scaffold the structure with the current text and flag `TODO(phil-voice)` for Phil to rewrite — the agent does not invent claims or metrics.

Notes and Log entries are simpler documents (index card / notebook page) reusing the same open/close verbs.

---

## 11. Illustration style guide (SVG)

One exploded/isometric architecture diagram per experiment. Hand-drawn *quality*, digitally built:

- Inline SVG components. Stroke `--ink` 1.5px (1.25 mobile), round caps/joins, no fills except paper-tone panels.
- Wobble: one `feTurbulence` (baseFrequency 0.012–0.02) + `feDisplacementMap` (scale 1.5–2.5) filter applied per diagram group — subtle; lines look drawn, not wavy.
- Annotations: Caveat 14–16px + small hand-drawn arrows/leader lines (the **only** place handwriting exists).
- Exactly one `--copper` highlighted path per diagram (the critical flow).
- Isometric/exploded convention, generous spacing, labels in mono where they're *labels* and Caveat where they're *notes*.
- Accessibility: `role="img"` + `<title>`/`<desc>` per diagram.

---

## 12. Agent canvas

The steering-agent simulation persists — it is the site's "future being built, but human" element.

- **M2–M6 scope:** re-host the existing 2D sim on a transparent canvas layer composited above the desk ground, below cards. Recolor trails to graphite (`--ink` at low alpha). Its transform is driven by the same camera store (it lives on the desk).
- **M7 scope (re-materialization):** trails become charcoal strokes — width jitter, pressure-like alpha, slow smudge-fade over ~20s. Density capped; the desk must read as *organized*, not scribbled. Agents pause with the render loop (§8 budget).

---

## 13. Mobile (< 768px)

- The desk collapses to a **single-axis vertical roll**: zones stacked vertically; Slide operates on y only; swipe/scroll snaps between zones; no free 2D panning.
- Documents open full-screen; Stack uses the opacity scrim, not blur.
- WebGL: static camera with slight vertical parallax, DPR capped at 1; below rung-2 conditions (WebGL fail, Save-Data), CSS ground.
- Title block: compact bottom strip — name + `01–05` index; expands on tap.
- Lift on touch: none on hover (no hover); active-state press = scale 0.99 + e1.
- Type per §6 mobile column; document measure full-width minus 20px gutters.

---

## 14. Acceptance criteria (a11y, perf, SEO)

**Accessibility**
- Complete keyboard path: title block ↔ zone contents ↔ open documents; focus managed on every camera move (zone/document heading receives focus); `aria-live="polite"` route announcer in Layer 2.
- Reduced-motion path fully implemented (§7) and manually verified.
- Contrast: `--ink` on `--paper` and on `--desk` both pass AA; `--copper` used at ≥ 3:1 for UI indicators, never as the only signal (active sheet also underlined).
- Lighthouse accessibility ≥ 95 on all routes.

**Performance**
- First paint = rung 2 with full content (no WebGL on the critical path); LCP is DOM text/hero, < 2.0s on Fast 3G simulated; CLS < 0.02; INP < 200ms including verb interruptions.
- JS budgets: initial route JS (excl. `three`) ≤ 90KB gz; `three` chunk ≤ 160KB gz, post-idle.
- 60fps Performance-trace during Slide and Unfold on a mid-tier laptop profile; no long tasks > 120ms during transitions.

**SEO / resilience**
- Every route fully server-rendered and readable with JS disabled (rung 4); canonical URLs unchanged; existing OG images and `/resume.pdf` intact; view-transition fallback verified on current Safari and Firefox in M11.

---

## 15. Milestones

Workflow rules (non-negotiable): one milestone at a time · the project builds and runs at every milestone boundary · **verify before committing** · conventional commit per milestone · **stop on failure** and surface the error — never build the next milestone on a broken state. Windows shell: prefix commands with `cmd /c`. Use the repo's existing Node version and package manager; do not upgrade Astro or Node unprompted. Baseline verification for every milestone: `cmd /c npm run build` green, plus the milestone's own checks via `cmd /c npm run dev` / `cmd /c npm run preview`. If a test harness exists in the repo, run it; otherwise verify against the manual checklist and record results in the commit body. **Linear:** each milestone maps to an issue (Linear column below; sequenced with blocking relations in the Portfolio Website project). Move the issue to **In Progress** when starting, post verification evidence as a comment, and mark it **Done** only after the verified commit lands.

| # | Linear | Milestone | Key verification | Commit |
|---|---|---|---|---|
| M0 | PHI-61 | Branch `redesign/inventors-workbench`; audit components, content collections, current routes; record Lighthouse + bundle baseline; log §1 decisions to DECISIONS_LOG.md | Build green; baseline recorded in repo notes | `chore(redesign): baseline audit and decision log` |
| M1 | PHI-62 | `tokens.css`, font self-hosting, global type styles, static two-tone CSS ground (rung 2) | All routes render with new ground + type; fonts preloaded, no FOIT | `feat(tokens): design tokens, typography, two-tone ground` |
| M2 | PHI-63 | DOM plane + zone layout at §4 poses; title block HUD with working links + keys 1–5; server-rendered posed pages; `content-visibility` on far zones | Every route reachable via title block AND direct URL; rung-4 (JS off) readable | `feat(canvas): zoned desk layout and title-block navigation` |
| M3 | PHI-64 | Camera store + tween; SLIDE verb wired to routing (intercept, pushState at start, popstate replay); reduced-motion cuts; retarget-not-queue | Zone-to-zone nav smooth; back/forward correct; reduced-motion verified | `feat(motion): camera store and slide verb` |
| M4 | PHI-65 | UNFOLD/FOLD (FLIP + shared-element View Transition) + STACK; document scroll + focus management | §7.3 parity checklist passes; reverse path; deep-link to a document lands posed | `feat(motion): fold and stack verbs for documents` |
| M5 | PHI-66 | WebGL scene: lazy import, sync contract, lights-on fade, budgets, dispose-on-fail | Layer-0 toggle shows no content swim; fallback rung 2 forced-tested; fps trace | `feat(scene): webgl background with camera sync` |
| M6 | PHI-67 | Content restructure: frontmatter migration, EXP document template, honest-metrics tables, `TODO(phil-voice)` flags | 5 experiments render full template; no invented copy; Notes/Log documents | `feat(content): experiment document templates` |
| M7 | PHI-68 | Agent canvas graphite pass + LIFT polish + ink-reveal flourish | Agents idle-pause with render loop; desk reads organized; lift on all interactives | `feat(canvas): graphite agents and lift polish` |
| M8 | PHI-69 | Five architecture diagrams per §11 | Wobble filter subtle at 100% and 150% zoom; one copper path each; titles/descs | `feat(diagrams): exploded architecture illustrations` |
| M9 | PHI-70 | Mobile vertical roll, compact title block, scrim Stack, touch states | Physical-device or emulated pass of §13; no horizontal scroll traps | `feat(mobile): vertical roll and compact title block` |
| M10 | PHI-71 | A11y + perf hardening to §14; route announcer; contrast audit; budgets enforced | Lighthouse a11y ≥ 95 all routes; perf criteria met; keyboard-only full walkthrough | `chore(quality): accessibility and performance hardening` |
| M11 | PHI-72 | Staging deploy (Cloudflare); cross-browser pass (Chromium/Firefox/Safari incl. view-transition fallback); recruiter-path timing test (§4); Phil review | Staging URL live; §4 recruiter criterion measured; sign-off recorded | `chore(release): staging deploy and cross-browser pass` |

**Production swap is gated on Phil's explicit confirmation** after reviewing staging. Do not touch production DNS/deployment config without it. `TODO(phil-voice)` items are Phil's; ship staging with flags visible.

---

## 16. Assumptions & open items

- Geist / Geist Mono / Caveat are all OFL-licensed — self-hosting is fine.
- Dark mode ("workshop at night": warm near-black `#1A1815`, cream ink, copper lamplight) is designed later as its own project; the settings control stays hidden until then.
- Free panning, if added later, layers on top of M3's camera store (drag → store deltas) — the architecture anticipates it; do not pre-build it.
- Copy voice is Phil's. The agent scaffolds structure and preserves existing honest-metrics content verbatim where it maps.
- If any §4 pose/coordinate feels wrong in practice, adjust values, keep the invariants (routes, recruiter path, generous negative space), and note the change in the commit body.
