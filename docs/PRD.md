# Portfolio Website — Product Requirements Document

| | |
|---|---|
| **Product** | Personal portfolio website (working domain: philsanjaya.dev, TBC) |
| **Version** | 1.0 |
| **Date** | 12 June 2026 |
| **Owner / Director** | Phil Sanjaya |
| **Architect / Auditor** | Claude (web) |
| **Builder** | Claude Code |
| **Tracking** | Linear project "Portfolio Website" (PHI-27 … PHI-47) |
| **Repo location of this file** | `docs/PRD.md` |

---

## 1. Vision and background

A fixed-viewport, no-scroll personal portfolio. Every section fills the screen exactly; navigation slides between panels instead of scrolling. The signature element is a live canvas of autonomous steering agents — Phil's actual COS30002 behaviours (wander, alignment, flee) running as ambient design, with a debug overlay that draws the real steering mathematics on demand.

Content is data: projects, notes, and build-log entries are markdown files; adding one is a file commit, never a code change. Case studies are chaptered slides that open on an honest metrics dashboard. A build log tells the story of how this site itself was designed and built, entry by entry, with real commit hashes as receipts.

The site was designed in conversation between Phil and Claude, specified in this PRD, tracked in Linear, and built by Claude Code milestone by milestone. The site says so, openly.

## 2. Goals and success criteria

1. **G1 — Pass the 30-second recruiter test.** Within one viewport: who Phil is, what he builds, what he is looking for, and a route to the work.
2. **G2 — Reward the 3-minute engineer.** Case studies with architecture, trade-offs, and honest results; a debug toggle that shows real maths; a public repo with disciplined history.
3. **G3 — Be genuinely useful long-term.** Adding a project or post is one markdown file. The site outlives any single semester.
4. **G4 — Be memorably distinctive.** The no-scroll shell and the living agents are not replicable by template.
5. **G5 — Be verifiably fast and accessible.** Lighthouse ≥ 95 across all categories; WCAG AA; reduced motion respected.

Success at launch: live on the production domain, four case studies published, build log entries 00–04 published, all Lighthouse and accessibility gates passed, zero unsourced numbers on the site.

## 3. Audience

- **Primary:** recruiters and engineers screening for internships and graduate roles (software engineering, data science, ML).
- **Secondary:** peers, lecturers, and collaborators following Phil's work.
- **Tertiary:** future Phil, using the site as the durable index of his projects.

## 4. Guiding principles

1. **No scroll.** The document body never scrolls. Navigation is spatial: panels slide. One sanctioned exception exists (§7.5) and the UI explicitly owns it.
2. **Honest numbers.** No metric appears anywhere on the site — content or chrome — unless it comes from a real report, log, or live measurement. Unmeasured values render as pending; they are never invented and never silently hidden.
3. **The agents are the brand.** One signature element, executed precisely. Everything around it stays quiet and disciplined.
4. **Motion is deliberate and optional.** Every animation has a `prefers-reduced-motion` fallback. Less is more; scattered effects are cut.
5. **Story with receipts.** The build log narrates decisions and trade-offs, citing commits and Linear milestones. It is an engineering notebook, not a diary, and it is transparent about the AI-assisted workflow.
6. **Coursework caution.** Case studies publish writeups, diagrams, and footage — never full assignment source. Coursework repos remain private. The site repo itself is public.

## 5. Scope (MoSCoW)

**Must:** no-scroll shell with slide transitions and keyboard navigation; wander agent island with live readout; content collections (projects / notes / buildlog); projects index; chaptered case-study template with honest dashboard; notes reading pane (contained scroll); build-log route; four case studies; about + resume + contact; light/dark themes; reduced-motion support; deploy pipeline; SEO basics; WCAG AA.

**Should:** route-aware behaviour FSM; cursor/touch interaction; `d` debug overlay; keycap indicators; OG image generation; custom 404 with fleeing agents; Lighthouse ≥ 95 gate.

**Could:** build-time script that pulls commit messages from `git log` into build-log entries; behaviour easter eggs (e.g. `seek` toward hovered project card); RSS for notes.

**Won't (v1):** comments; CMS or admin UI; analytics beyond a privacy-respecting counter (decision in §17); blog search; i18n; client-side framework (React/Vue/etc.).

## 6. Information architecture

| # | Route | Panel | Content source |
|---|-------|-------|----------------|
| 01 | `/` | Home — hero, agent canvas, readout, primary actions | static + island |
| 02 | `/projects` | Projects index — card grid | `projects` collection |
| — | `/projects/[slug]` | Case study — chaptered slides | `projects` collection |
| 03 | `/notes` | Notes index | `notes` collection |
| — | `/notes/[slug]` | Note reading view (contained scroll) | `notes` collection |
| 04 | `/log` | Build log timeline | `buildlog` collection |
| — | `/log/[slug]` | Build-log entry (contained scroll) | `buildlog` collection |
| 05 | `/about` | About, contact, resume link | static |
| — | `/404` | Fleeing agents + route home | static + island |

Rail order is a true sequence (left → right matches panel order), which is why the numbered markers are earned rather than decorative.

## 7. Functional requirements

### 7.1 Shell and navigation

- **FR-01** The document body never scrolls at any breakpoint; the stage is `100dvh` and panels fit within it.
- **FR-02** Desktop (≥768px): persistent left rail with brand mark, numbered nav items (01–05), and a keyboard hint. Active item marked visually and with `aria-current="page"`.
- **FR-03** Mobile (<768px): rail collapses to a bottom tab bar; panels remain full-viewport.
- **FR-04** Panel routes are real Astro pages; transitions use Astro `<ClientRouter />` with directional slides — navigating right in the sequence slides left, and vice versa.
- **FR-05** Arrow keys (← →) move between top-level panels; on mobile, horizontal swipe does the same.
- **FR-06** Every panel is deep-linkable; a cold load of any route renders that panel directly with no intermediate animation.
- **FR-07** Reduced motion: slides are replaced with a ≤150ms opacity fade.
- **FR-08** A theme toggle (light / dark / system) lives in the rail; choice persists; no flash of incorrect theme on load.
- **FR-09** Keycap indicators `[←][→]` sit low in the stage and light for 150ms on actual keypress (Should, M4).

### 7.2 Agent island (signature element)

- **FR-10** A single vanilla-TypeScript canvas island renders 18–24 autonomous agents (dot + heading vector) behind the home hero. No framework, no physics library.
- **FR-11** Behaviours are ports of Phil's COS30002 steering maths: `wander` (heading jitter projected on a wander circle), `align` (neighbour-heading averaging at reduced count/opacity), `flee` (inverse seek from a point). M1 ships `wander` only; the module is structured for M4 to add states without rewrite.
- **FR-12** A behaviour FSM keys off the current route (state table in §10) and blends transitions over ~1s (Should, M4).
- **FR-13** Cursor interaction: agents flee within ~80px of the pointer; on touch, a tap emits a one-shot flee impulse (Should, M4).
- **FR-14** The readout (mono, low contrast) displays only live-measured values: agent count, active behaviour name, fps sampled at 1 Hz. No decorative or fabricated tokens — the honest-numbers rule applies to the chrome itself.
- **FR-15** Pressing `d` (or a small adjacent button, `aria-pressed`) toggles a debug overlay drawing each agent's velocity vector, steering force vector, and wander circle + target point at 1px in instrument amber (Should, M4).
- **FR-16** Debug overlay is off by default and costs no measurable fps when off.
- **FR-17** Reduced motion: the island renders one static frame, runs no loop, and ignores FR-12/13/15 motion. The canvas is `aria-hidden="true"` always.

### 7.3 Content engine

- **FR-20** Three Astro content collections with zod schemas: `projects`, `notes`, `buildlog`. Invalid frontmatter fails the build with a clear error.
- **FR-21** `projects` frontmatter: `title`, `slug`, `order`, `tags[]`, `stack[]`, `period`, `summary` (one line), `question` (optional), `metrics[]`, `status`, `links[]`, `hero` (optional media).
- **FR-22** Each metric is `{label, value, source}` with `source` **required** — the field that mechanically enforces the honest-numbers rule. `value: "pending"` is legal and renders as an em-dash card.
- **FR-23** `buildlog` frontmatter: `title`, `entry` (number), `date`, `milestone`, `commits[]` (short SHAs, may be empty for entry 00).
- **FR-24** Adding any content item requires zero code changes; indexes and pages are generated.

### 7.4 Projects and case studies

- **FR-30** Projects index renders cards (tag, title, one-line summary) from the collection, sorted by `order`, fitting the viewport with no scroll.
- **FR-31** Grid rules handle 3, 4, or 5+ entries gracefully (defined breaks, not hardcoded to four).
- **FR-32** Cards link to `/projects/[slug]` with hover and visible focus states per tokens.
- **FR-33** Card hover may bias nearby agents to `seek` the card (Could).
- **FR-34** A case study is one markdown file; `## ` headings split the body into chapters rendered as slides: Overview → Problem → Approach → Architecture → Results → Reflection. Chapters are optional per project.
- **FR-35** Chapter zero (Overview) is a generated dashboard: tags, title, research question, and metric cards from `metrics[]`.
- **FR-36** Navigation within a study: chapter tabs, an in-panel next action, and arrow keys; transitions reuse the shell motion spec; `/projects/[slug]#chapter` deep links work.
- **FR-37** Each chapter fits the viewport. Editorial guidance (§12) keeps chapters short; a contained-scroll fallback inside the chapter frame handles overflow rather than breaking the shell.
- **FR-38** Hero media (GIF/WebM) is lazy-loaded and counts against the page-weight budget (§8).
- **FR-39** Pending metrics render as em-dash cards with their label — visible, honest, unfilled.

### 7.5 Notes (the sanctioned exception)

- **FR-40** Notes index lists entries (date, title) within the viewport; the list paginates beyond six entries.
- **FR-41** The reading view keeps the shell fixed; only the prose pane scrolls internally.
- **FR-42** A CSS mask fades the bottom ~28px of the pane only while content remains below; the fade never reduces contrast of fully visible text.
- **FR-43** The pane has a thin custom scrollbar and is keyboard-scrollable when focused.

### 7.6 Build log (the story)

- **FR-50** `/log` renders entries newest-first as a timeline of cards within the viewport; entry pages reuse the contained-scroll pane.
- **FR-51** Commit SHAs render as monospace chips linking to the GitHub commit — the receipts.
- **FR-52** Entry 00 ("The drawing board") predates the repo and carries no commits; the template supports this.
- **FR-53** Every milestone's definition of done includes its build-log entry; entries are written alongside the work, not reconstructed after.
- **FR-54** (Could) A build-time script reads `git log` between tagged milestones and lists the real commit subjects beneath each entry.

### 7.7 About and contact

- **FR-60** About panel: short bio, current focus, what Phil is looking for, and contact actions (email, GitHub, LinkedIn) — within the viewport.
- **FR-61** Resume served as `/resume.pdf`, linked from About and Home; reviewed by Phil before publish.
- **FR-62** No placeholder copy ships anywhere on the site.

### 7.8 Accessibility and resilience

- **FR-70** WCAG 2.1 AA contrast in both themes.
- **FR-71** Full keyboard operation: shell, chapters, notes pane, toggles; visible focus rings; a skip link to the main panel.
- **FR-72** Decorative elements (agent canvas, keycaps) are `aria-hidden`; interactive controls have accessible names.
- **FR-73** `prefers-reduced-motion` honoured globally (FR-07, FR-17).
- **FR-74** The site is fully readable with JavaScript disabled: panels render as normal pages (browser default navigation; no slide); only the island and microinteractions are lost.
- **FR-75** Custom 404 with `flee` agents and a route home.
- **FR-76** Axe scan: zero critical issues at M4 gate.

### 7.9 SEO and meta

- **FR-80** Per-page titles, meta descriptions, and canonical URLs.
- **FR-81** Sitemap and robots.txt generated at build.
- **FR-82** OG/Twitter cards per project from a generated image template (Should, M4).
- **FR-83** Semantic HTML throughout (`nav`, `main`, `article`, heading order).
- **FR-84** Production domain in canonical/OG tags from M5.

## 8. Non-functional requirements

| Budget | Target |
|---|---|
| Lighthouse (perf / a11y / best practices / SEO) | ≥ 95 each, production build, throttled run |
| Total JavaScript, site-wide | ≤ 50 KB gzipped |
| Agent island bundle | ≤ 8 KB gz (M1), ≤ 12 KB gz with FSM + debug (M4) |
| Canvas frame rate | steady 60fps at 24 agents on mid-range hardware |
| Cumulative layout shift | 0 (fixed stage makes this achievable) |
| Largest contentful paint (home) | < 1.5s on simulated Fast 3G |
| Fonts | subset, `woff2`, preloaded; ≤ 90 KB total |

## 9. Design system

Derived from the subject's own world — simulation instruments and control panels — executed with minimal-precision restraint. The agents are the one place boldness is spent; everything else stays quiet.

### 9.1 Design tokens (colour)

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#F6F7F5` canvas | `#101312` graphite | page background |
| `--surface` | `#FFFFFF` | `#171B1A` | cards, panes |
| `--ink` | `#161B19` | `#E7EAE8` paper | primary text |
| `--mist` | `#67706C` | `#9AA39E` | secondary text, hints |
| `--line` | `rgba(22,27,25,.14)` | `rgba(231,234,232,.14)` | hairline borders |
| `--signal` | `#149E7C` | `#23B893` | accent, agents, active states, links |
| `--debug` | `#C97E12` | `#E09A2F` | debug overlay **only** |

Rules: amber never appears outside the debug overlay; signal teal is the only accent; semantic colour is not used decoratively. Avoid the generic AI-design defaults (cream + terracotta serif; black + acid green; broadsheet hairlines) — this palette is cool, instrument-like, and specific to the brief.

### 9.2 Typography

| Role | Face | Usage |
|---|---|---|
| Display | **Archivo** (500, slightly expanded width where supported) | name, panel titles, chapter titles |
| Body / UI | **Instrument Sans** (400 / 500) | prose, cards, controls |
| Utility | **IBM Plex Mono** (400) | kickers, readout, SHAs, dates, keycaps, debug labels |

Scale: 12px mono kicker (letter-spacing 0.08em) · 14px UI · 16px body (line-height 1.65) · 20px h3 · 28px h2 · `clamp(2.5rem, 6vw, 4rem)` display. Two weights only (400/500). Sentence case everywhere. The mono face carries the instrument personality; the display face is used with restraint.

### 9.3 Voice and copy

Plain verbs, sentence case, no filler. Controls say exactly what they do ("View projects", not "Explore"). Errors explain and direct; the 404 is allowed one joke (the agents are already fleeing). Numbers always carry units and context. Nothing sells; everything is specific.

### 9.4 Layout

Desktop: 200px rail + fluid stage; panel content on an 8px spacing grid with generous whitespace; case-study dashboard uses three metric cards per row. Mobile: bottom tab bar (5 items), panel padding 20px, dashboard cards stack 1-per-row. Hairline (1px `--line`) borders; 10px radius on cards; no shadows or gradients.

### 9.5 Motion

| Motion | Spec |
|---|---|
| Panel slide (shell) | 550ms `cubic-bezier(0.22, 0.61, 0.36, 1)`, directional |
| Chapter slide | 450ms, same curve |
| Micro (hover, keycaps, focus) | 150ms ease-out |
| Behaviour blend (FSM) | ~1000ms linear interpolation of steering weights |
| Reduced motion | slides → ≤150ms fade; island static; micro-motion off |

One orchestrated moment (the panel slide) rather than scattered effects.

## 10. Agent behaviour state table

| Route / context | Behaviour | Count | Opacity | Notes |
|---|---|---|---|---|
| `/` (home) | `wander` | 18–24 | 0.55 | default state; readout shows `wander()` |
| Case study — Architecture chapter | `align` | 10–12 | 0.25 | calm order behind structural content |
| Any reading pane (notes, log entry) | island absent | — | — | nothing competes with prose |
| `/404` | `flee` (from screen centre) | 18–24 | 0.55 | chaos as the joke |
| Pointer within 80px (any active state) | `flee` (local) | — | — | desktop only; touch = tap impulse |
| `d` pressed | active behaviour + debug overlay | — | — | amber vectors, wander circle |
| Reduced motion | static frame | — | 0.35 | no loop, no interaction |

Wander maths (reference, from COS30002 Task 11): each tick, jitter a target point on a circle of radius `r` projected `p` ahead of the agent; steer toward it; clamp speed. Implement deterministically enough to unit-test the maths in isolation.

## 11. Technical architecture

### 11.1 Stack

- **Astro 5** (static output), `<ClientRouter />` view transitions, content collections with zod.
- **Tailwind v4** for styling; design tokens as CSS custom properties consumed by Tailwind.
- **TypeScript strict** everywhere, including the island.
- **No client framework.** The agent island is vanilla TS; total client JS stays inside the §8 budget.
- **Fonts** self-hosted `woff2` subsets (Archivo, Instrument Sans, IBM Plex Mono).

### 11.2 Why these choices (recorded for the build log)

Astro's content collections are purpose-built for the markdown-per-project model (G3); near-zero default JS makes the performance budget achievable rather than aspirational (G5); view transitions give app-feel slides while keeping real, deep-linkable routes (FR-04/06). A no-scroll shell in a scroll-first web is the deliberate aesthetic risk; FR-74 (works without JS) is the safety net that keeps it defensible.

### 11.3 Repository structure

```
portfolio/
├── docs/
│   └── PRD.md                  ← this document
├── public/
│   ├── fonts/  resume.pdf  favicon.svg
├── src/
│   ├── content/
│   │   ├── projects/   *.md
│   │   ├── notes/      *.md
│   │   └── buildlog/   *.md
│   ├── content.config.ts       ← zod schemas (FR-20)
│   ├── layouts/Shell.astro     ← rail + stage + transitions
│   ├── pages/                  ← index, projects, notes, log, about, 404
│   ├── components/             ← MetricCard, ChapterNav, NotePane, LogEntry…
│   ├── islands/agents/         ← engine.ts  behaviours.ts  debug.ts  readout.ts
│   └── styles/tokens.css
├── astro.config.mjs  package.json  tsconfig.json  .gitignore
```

### 11.4 Hosting and pipeline

GitHub (public repo) → Cloudflare Pages, auto-deploy on `main`. Preview URL `*.pages.dev` until M5; then production domain, HTTPS enforced, `www` → apex, security headers (CSP, X-Content-Type-Options, Referrer-Policy).

## 12. Build log content guidelines

- Entries are 250–400 words: the decision, the options, the trade-off, the outcome. Notebook, not diary.
- Every claim has a receipt: a commit SHA, a Linear milestone, or a PRD section.
- The AI-assisted workflow is described plainly: Phil directs and reviews; Claude (web) architects and audits; Claude Code builds. No coyness, no overselling.
- The log is seasoning, not the main course — capped at one entry per milestone plus 00 and launch.
- Planned entries: 00 The drawing board · 01 Foundation · 02 Content engine · 03 Behaviours and polish · 04 Launch.

## 13. Milestones and Linear mapping

| Milestone | Target | Issues | Exit criteria |
|---|---|---|---|
| M1 Foundation | 21 Jun 2026 | PHI-27 scaffold · PHI-28 deploy · PHI-29 shell · PHI-30 wander island | Live URL; demonstrably no-scroll; agents wandering |
| M2 Content engine | 28 Jun 2026 | PHI-31 schemas · PHI-32 projects index · PHI-33 case-study template · PHI-34 notes pane · PHI-35 build-log route | One seeded example of every content type renders |
| M3 Content sprint | 12 Jul 2026 | PHI-36 CTF Arena · PHI-37 AEGISX · PHI-38 Market sentiment · PHI-39 Power forecasting · PHI-40 about/resume · PHI-41 log entries 00–02 | All content real; zero placeholders; numbers sourced |
| M4 Polish & behaviours | 19 Jul 2026 | PHI-42 behaviour FSM · PHI-43 debug overlay · PHI-44 a11y/microinteractions · PHI-45 SEO/Lighthouse | All §8 budgets met; Axe clean |
| M5 Launch | 26 Jul 2026 | PHI-46 domain/hardening · PHI-47 launch review | Public on production domain; Phil's explicit go |

Dates assume post-semester availability and are adjustable; sequence is not.

## 14. Execution environment and workflow (Claude Code)

**Machine:** Windows, NVIDIA RTX 4050. **Runtime:** Node.js ≥ 20 LTS, npm. This is a Node project — `phil_venv` rules do not apply unless a Python utility is introduced (then standard `phil_venv` rules apply).

1. **Shell discipline.** Prefix shell executions with `cmd /c` (e.g. `cmd /c npm run build`) so processes terminate cleanly. Avoid interactive/persistent shells.
2. **One issue at a time, in numeric order** (1.1 → 1.2 → …). Do not start a milestone until the previous one is reviewed by Phil.
3. **Verify before commit.** A task is done only when `cmd /c npm run build` passes **and** the behaviour is confirmed in the dev server. Never commit untested work.
4. **Stop on failure.** Surface the error and halt; never build the next step on a broken state.
5. **Commits.** Conventional Commits, imperative mood, subject < 72 chars, footer `Refs: PHI-xx`. One issue may span multiple commits; each commit is a runnable checkpoint.
6. **Paths** relative; no hardcoded absolute paths; configuration in files, not constants.
7. **Cleanup.** Remove caches and any ephemeral generator scripts before declaring a task complete.
8. **Pause for irreversibles.** Force-pushes, history rewrites, or mass deletions require Phil's explicit confirmation.
9. **No fabricated content.** If source material for a case study is missing, mark the section pending and flag it — do not invent.

## 15. Risks and mitigations

| Risk | Mitigation |
|---|---|
| No-scroll fights long content | Chaptered studies (FR-34), contained-scroll exception (§7.5), FR-37 fallback |
| Unusual UX confuses visitors | Persistent visible nav, keycap hints, FR-06 deep links, FR-74 no-JS fallback |
| Agent island bloats or janks | §8 bundle/fps budgets enforced per issue; island isolated in one module |
| Content sprint stalls (it is writing) | M3 is the longest window; case studies reuse existing reports/PRDs |
| Coursework publication issue | §4.6 rule; PHI-47 audit gate before launch |
| Fabricated-number drift over time | FR-22 `source` field is schema-required; PHI-47 audit |
| Scope creep on fun features | MoSCoW (§5); Could-items only after Must/Should complete |

## 16. Out of scope (v1)

CMS, comments, search, i18n, client frameworks, paid services beyond the domain, automated social posting, dark-pattern analytics.

## 17. Open decisions

| Decision | Default | Owner | Due |
|---|---|---|---|
| Domain name | `philsanjaya.dev` | Phil | before PHI-46 |
| Analytics | none (revisit post-launch; if any, privacy-respecting e.g. Plausible/umami) | Phil | PHI-45 |
| Resume final content | current resume, refreshed | Phil | PHI-40 |
| Public repo name | `philsanjaya.dev` or `portfolio` | Phil | PHI-27 |

---

## Appendix A — Claude Code kickoff prompt

Paste into Claude Code from the empty project folder:

> Read `docs/PRD.md` in full before doing anything — it is the source of truth for this project.
>
> You are the builder for my portfolio website. The Linear project "Portfolio Website" tracks the work: milestones M1–M5, issues PHI-27 through PHI-47, numbered 1.1 → 5.2. Execute **M1 only** for now, one issue at a time in numeric order, starting with PHI-27 (1.1 Scaffold).
>
> Non-negotiables from the PRD: Windows shell discipline (`cmd /c` prefix, §14.1); verify with `cmd /c npm run build` plus a manual dev-server check before any commit (§14.3); stop immediately on failure (§14.4); Conventional Commits with footer `Refs: PHI-xx` (§14.5); the honest-numbers rule applies to everything, including UI chrome (§4.2).
>
> When all four M1 issues are done and verified, stop and report back with: the live deploy URL, the commit list, and anything that deviated from the PRD. I will review before M2 begins.

## Appendix B — Case-study markdown skeleton

```markdown
---
title: CTF Arena
slug: ctf-arena
order: 1
tags: [ai-for-games, simulation]
stack: [Python, pyglet, FSM, steering]
period: 2026
summary: Autonomous capture-the-flag agents
question: Does centralised coordination beat greedy agents at capture the flag?
status: published
metrics:
  - label: Autonomous agents
    value: "6"
    source: CTF_Arena_PRD.md §3
  - label: Subsystems
    value: "9"
    source: CTF_Arena_PRD.md §5
  - label: Win rate, centralised
    value: pending
    source: tournament logs (post Portfolio 5)
links:
  - { label: Writeup PDF, url: "…" }
---

## Problem
…

## Approach
…

## Architecture
…

## Results
…

## Reflection
…
```

*End of PRD v1.0 — changes to this document are themselves Conventional Commits (`docs(prd): …`).*
