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
| M1  | PHI-62  | Design tokens, typography, two-tone ground            | Not started |
| M2  | PHI-63  | Zoned desk layout and title-block navigation          | Not started |
| M3  | PHI-64  | Camera store and Slide verb                           | Not started |
| M4  | PHI-65  | Fold/Unfold and Stack (document transitions)          | Not started |
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
