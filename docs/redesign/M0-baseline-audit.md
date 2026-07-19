# M0 — Baseline Audit

**Milestone:** M0 (PHI-61) · **Branch:** `redesign/inventors-workbench` (base
`c4f7725`) · **Date:** 2026-07-19

Snapshot of the site as it stands **before** the Inventor's Workbench redesign.
Purpose: an honest "before" reference, a keep/replace map grounded in real
files, and a risk list for the milestones ahead. Spec references are to the
*INVENTOR'S WORKBENCH — Redesign Handoff Spec* (2026-07-19).

## Environment (verified this session)

| | |
| --- | --- |
| Framework | Astro **6.4.6**, static output |
| Styling | Tailwind CSS v4 (`@tailwindcss/vite`), one `global.css` + `tokens.css` |
| Fonts (current) | Archivo (display), Instrument Sans (body), IBM Plex Mono (mono) — all `@fontsource`, preloaded |
| Content | `astro:content` collections + `glob` loader; markdown is the source of truth |
| SEO | `@astrojs/sitemap`, dynamic `robots.txt`, per-page canonical/OG, satori OG images |
| Node / PM | portable Node ≥22.12 (v24.16.0), npm; `verify` = `astro check && astro build && vitest run` |
| Deploy | Cloudflare Pages (`philsanjaya-dev`), CI auto-deploy on push to `main` |
| Host | `site: https://philsanjaya.com` (astro.config.mjs) |

Build is **green**: 18 pages in ~14.5 s, exit 0.

## Route inventory (all preserved — spec §2, §4)

| Route | File | Zone (spec §4) | Sheet |
| --- | --- | --- | --- |
| `/` | `src/pages/index.astro` | Home (desk center) | 01 |
| `/projects` | `src/pages/projects.astro` | Experiments | 02 |
| `/projects/<slug>` | `src/pages/projects/[slug].astro` | Open document | — |
| `/notes` + `/notes/N` | `src/pages/notes/[...page].astro` | Notes | 03 |
| `/notes/<slug>` | `src/pages/notes/[slug].astro` | Open document | — |
| `/log` + `/log/N` | `src/pages/log/[...page].astro` | Log | 04 |
| `/log/<slug>` | `src/pages/log/[slug].astro` | Open document | — |
| `/about` | `src/pages/about.astro` | Workshop | 05 |
| `/404` | `src/pages/404.astro` | — | — |
| `/og/<route>.png` | `src/pages/og/[...route].png.ts` | (OG images — keep) | — |
| `/robots.txt` | `src/pages/robots.txt.ts` | (keep) | — |
| `/resume.pdf` | `public/resume.pdf` | resume object on Home | — |

**Nav label changes only (routes unchanged):** the title block (spec §9) renames
`02 Projects → EXPERIMENTS` and `05 About → WORKSHOP`. `src/lib/panels.ts`
(`PANELS`) is the single place the labels/sequence live — update there in M2.

## Component & module inventory

| Path | Role | Redesign disposition |
| --- | --- | --- |
| `src/layouts/Shell.astro` | HTML head, rail nav, `<ClientRouter />`, theme toggle, directional-slide + arrow/swipe/keycap JS | **Rebuild** as the 3-layer shell (§3): keep `<ClientRouter/>`, `transition:persist` layers, replace rail with title block, hide theme toggle |
| `src/lib/panels.ts` | Panel sequence + `panelIndex()` | **Keep/extend** — becomes the zone/pose table (§4) |
| `src/lib/site.ts` | `SITE.repoUrl` | Keep |
| `src/components/Panel.astro` | Panel wrapper | Review in M2 (superseded by zone/document layout) |
| `src/components/NotePane.astro` | Contained-scroll reading view | Reuse pattern for open documents (internal scroll, §2) |
| `src/components/MetricCard.astro` | Honest-metric card | **Keep/restyle** for §10 metric tables |
| `src/islands/agents/engine.ts` | Steering-agent sim engine (~2.8 KB gz) | **Re-host** on transparent canvas above desk, camera-driven (§12) |
| `src/islands/agents/behaviours.ts` | Wander/align/flee FSM (+ `behaviours.test.ts`) | Keep; recolor trails graphite (M7) |
| `src/islands/agents/readout.ts` | Live perf readout | Keep/relocate |
| `src/styles/tokens.css` | Original palette + dark mode | **Replace contents** with §5 tokens (M1); retain dark blocks as future seed |
| `src/styles/global.css` | Global styles incl. `.panel-scroll` utility | Rework for the desk; keep `.panel-scroll` (open-document scroll) |

## Content collections (`src/content.config.ts`)

Three collections via `glob` loader; `_`-prefixed files/dirs are WIP.

- **projects** — `title, slug, order, tags[], stack[], period, summary(≤120),
  question?, metrics[], status(draft|published), links[], hero?, heroPoster?`.
  `metric = {label, value, source(required)}` (ADR 0004, honest-metrics).
- **notes** — `title, date, summary?(≤160), tags[]`.
- **buildlog** — `title, entry, date, milestone, commits[]`.

**Existing 5 experiments → EXP numbering (spec §4/§10):**

The existing `order` field already matches the spec's EXP sequence exactly
(verified), so EXP number = `order`:

| Slug | EXP | `order` | `status` |
| --- | --- | --- | --- |
| `ctf-arena` | EXP.001 | 1 | published |
| `aegisx` | EXP.002 | 2 | published |
| `market-sentiment` | EXP.003 | 3 | published |
| `power-forecasting` | EXP.004 | 4 | published |
| `this-website` | EXP.005 | 5 | published |

**M6 schema reconciliation (flag):** spec §10 asks to add `expNo, status, stack[]
(exists), problem, idea, result, metrics[], diagram`. Two clashes to resolve in
M6, not now:
1. `status` already exists as `draft|published`; spec wants a live/status dot.
   Keep both meanings distinct (publish-gate vs display status) or add a new
   field — do not overload.
2. Spec's metric shape is `{label, value, note}`; ours is `{label, value,
   source}` and `source` is **required** by ADR 0004. Keep `source`; treat any
   `note` as additive. Honest-metrics discipline wins.

## Styling baseline

- `tokens.css` currently defines `--bg/--surface/--ink/--mist/--line/--signal/
  --signal-text/--debug` with explicit + system dark-mode blocks. The redesign's
  §5 tokens (`--desk/--paper/--copper/--status/…`) replace these in M1.
- Tailwind v4 is configured via the Vite plugin (no `tailwind.config`); tokens
  are consumed as CSS variables. M1 must decide how the new tokens surface to
  Tailwind utilities (e.g. `@theme` mapping) vs raw `var()` — note for M1.
- `global.css` holds the sanctioned `.panel-scroll` contained-scroll utility and
  the view-transition clip fixes from the 2026-07-17 UI audit (PHI-59). Preserve
  those patterns; they map directly to open-document internal scroll.

## Bundle baseline (measured this session, gzip)

| Asset | Raw | Gzip |
| --- | --- | --- |
| Client JS (8 files, `_astro/*.js`) | 30,045 B | **12,513 B (~12.2 KB)** |
| — `router` (view-transitions) | 12,018 | 4,240 |
| — `engine` (agent sim) | 6,408 | 2,808 |
| — `ClientRouter` | 3,921 | 1,756 |
| — `_slug_` (case study) | 3,840 | 1,609 |
| — `Shell` | 2,983 | 1,287 |
| — others (readout, index, 404) | ~875 | ~813 |
| CSS (`Shell.*.css`) | 25,983 B | **6,082 B (~6.0 KB)** |
| Total `dist/` | — | **33 MB** (dominated by `media/ctf-arena-demo.webm`, OG PNGs, `resume.pdf`) |

Headroom vs spec §14 budgets: initial route JS ≤ 90 KB gz (now ~12 KB), and
`three` ≤ 160 KB gz loaded post-idle. Plenty of room; the redesign's DOM-plane /
camera-store logic must stay lean to preserve it.

## Lighthouse baseline

Last real throttled runs (PHI-45, recorded in project memory): **100 / 100 /
100 / 100** on home, a case study, and a note. Not re-measured this session
(the site is about to be fully replaced; the number's value is as a before/after
reference). A fresh confirmatory run can be done on request. Post-redesign
targets (spec §14): a11y ≥ 95 all routes, LCP < 2.0 s Fast-3G, CLS < 0.02,
INP < 200 ms.

## Risks & watch-items for the milestones ahead

1. **Tailwind v4 ↔ tokens.** New CSS-variable tokens must feed Tailwind
   utilities cleanly; decide the `@theme` strategy in M1. (M1)
2. **Font swap.** Archivo/Instrument/IBM Plex Mono → Geist/Geist Mono/Caveat.
   Update the three `Shell.astro` preloads and remove unused `@fontsource`
   deps; keep no-FOIT (`font-display: swap` + preload two weights). (M1)
3. **`vite@^7` pin is load-bearing** — do not let font/tooling churn upgrade it.
4. **`ClientRouter` is the camera foundation**, not a throwaway — M3 intercepts
   `astro:before-preparation` and drives the store; the existing directional-
   slide JS in `Shell.astro` is the pattern to evolve, not delete blindly.
5. **Theme toggle / `settings`** must be *hidden but stubbed* (§2), not removed.
6. **Agent island re-host** (§12) must stay camera-driven and idle-pausing to
   protect the perf budget (§8).
7. **Metric schema** reconciliation (above) — keep `source` required. (M6)
8. **No new heavy deps** beyond `three`; camera tween is hand-rolled. (§3)
