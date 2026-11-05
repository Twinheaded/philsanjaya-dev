# PROJECT_CONTEXT — philsanjaya.com

What this project is and how it works, as of **2026-11-05** (written during the
PHI-121 read-only audit; describes `main` at `dc88124`). Refresh it when a
milestone closes.

## What it is, and for whom

Phil Sanjaya's public portfolio, live at <https://philsanjaya.com>. Readers are
graduate recruiters and hiring managers, mostly on desktop, some on phones. The
site has to load, read correctly, and be truthful: it follows an
**honest-metrics rule** (every number needs a source; unknown values render as
an em-dash, never a guess). The specification is [docs/PRD.md](docs/PRD.md);
architecture decisions are in [docs/adr/](docs/adr/) (0001–0007).

The design is a **fixed-viewport, no-scroll shell**: five top-level panels
(Home, Projects, Notes, Log, About) slide sideways instead of the page
scrolling. A small canvas of autonomous "steering agents" (Phil's COS30002
wander/align/flee maths, ported to TypeScript) runs behind the home hero.

## Stack

| Piece | What | Where |
| --- | --- | --- |
| Framework | **Astro 6** (`astro@6.4.8` installed, `^6.4.6` declared), static output, `<ClientRouter />` view transitions | `package.json`, `astro.config.mjs` |
| Styling | Tailwind CSS v4 via `@tailwindcss/vite`; colour tokens as CSS custom properties mapped with `@theme inline` | `src/styles/global.css`, `src/styles/tokens.css` |
| Fonts | Self-hosted `@fontsource` (Archivo 500, Instrument Sans 400/500, IBM Plex Mono 400); three latin woff2 subsets preloaded | `src/layouts/Shell.astro:7-34` |
| Client JS | Vanilla TypeScript only (no client framework, ADR 0003) | `src/islands/agents/`, inline `<script>`s in pages |
| Content | Astro content collections with zod schemas (`projects`, `notes`, `buildlog`), markdown files | `src/content.config.ts`, `src/content/**` |
| OG images | Built at build time with satori → resvg, one per project + default | `src/pages/og/[...route].png.ts` |
| SEO | `@astrojs/sitemap`, generated `robots.txt`, per-page canonical/OG/Twitter tags, JSON-LD `Person` on home | `Shell.astro:21-50`, `src/pages/robots.txt.ts`, `src/pages/index.astro:8-27` |
| Tests | Vitest, 29 tests on the steering maths only | `src/islands/agents/behaviours.test.ts` |
| Node | CI uses Node 22; `.node-version` = 22; `engines` `>=22.12.0`. Local machine: Node 24.16.0, npm 11.13.0 at `C:\Program Files\nodejs` (on PATH, no prelude needed) | |

> Doc drift: `README.md:15` still says "Astro 5"; the code and ADR 0006 say Astro 6.

## Components and data flow

```
src/content/*.md  ──(zod schema, build fails on bad frontmatter)──┐
                                                                  ▼
src/pages/*.astro ── Shell.astro (head, rail nav, ClientRouter) ── astro build ──► dist/  (static HTML/CSS/JS, OG PNGs, sitemap)
src/islands/agents/*.ts ── bundled by Vite ───────────────────────┘                  │
public/ (_headers, resume.pdf, media/, favicon) ── copied as-is ────────────────────┘
                                                                                     ▼
                                       GitHub Actions `deploy` job ── wrangler pages deploy ──► Cloudflare Pages project `philsanjaya-dev`
                                                                                                    ├─ philsanjaya.com (production, custom domain)
                                                                                                    └─ philsanjaya-dev.pages.dev (same build)
```

**Routes (18 HTML pages + OG images + robots/sitemap):** `/`, `/projects`,
`/projects/<slug>` (5 published studies: ctf-arena, aegisx, market-sentiment,
power-forecasting, this-website), `/notes` (+ pagination), `/notes/<slug>` (1),
`/log` + `/log/2` (pagination), `/log/<slug>` (entries 00–04), `/about`,
`/404`, `/og/<slug>.png`, `/robots.txt`, `/sitemap-index.xml`, `/resume.pdf`.

**Key modules**

- `src/layouts/Shell.astro` — every page's `<head>` (meta, canonical, OG,
  preloads), the inline FR-08 theme script (sets `data-js` and the stored
  theme before paint), the rail / mobile tab bar, and the shell script:
  directional slides, ← → keys, touch swipe, theme toggle, mobile settings menu.
- `src/lib/panels.ts` — the panel sequence and `panelIndex()`; drives nav
  direction and `aria-current`.
- `src/pages/projects/[slug].astro` — chaptered case study: `## ` headings
  become chapters; with JS they are shown one at a time as slides, without JS
  they stack in one scrollable frame. Chapter 0 is a generated metric dashboard
  (`MetricCard.astro`).
- `src/components/NotePane.astro` — the contained-scroll reading pane for
  notes/log entries, with a small inline script that toggles the bottom fade.
- `src/islands/agents/engine.ts` / `behaviours.ts` / `readout.ts` — the
  canvas island: pure steering functions (tested) plus the canvas loop,
  route-keyed behaviour, reduced-motion static frame, `d` debug overlay.
- `src/content.config.ts` — the honest-metrics rule is mechanical here:
  `metric.source` is `z.string().min(1)` (`:16-20`).

## Trust boundaries and external services

| Boundary | Notes |
| --- | --- |
| Content → HTML | All content is Phil's own markdown in the repo, rendered at build time. No user input, no forms, no server runtime. |
| Browser | Static files only. CSP from `public/_headers`: `script-src 'self'` + two sha256 hashes pinning the two inline scripts (theme snippet; reading-pane mask). JSON-LD is a data block, not covered by script-src. |
| GitHub (`Twinheaded/philsanjaya-dev`, **public**) | One collaborator. `main` has **no branch protection**. Workflow token is read-only (`permissions: contents: read`; repo default `read`). Dependabot security updates are on (10 open dependency PRs). |
| GitHub Actions → Cloudflare | Repo secret `CLOUDFLARE_API_TOKEN` (last set 2026-07-19, PHI-60 rotation). Account ID is in `ci.yml` in clear (an identifier, not a secret). |
| Cloudflare zone | DNS + registrar for philsanjaya.com (renewal due 2027-07-04). `www` → apex and http → https are zone redirect rules. **Zone-level Email Obfuscation is on**: Cloudflare rewrites the About page's `mailto:` link and injects a decode script at the edge — that behaviour is not in the repo. |
| Private sources | `_inbox/` (gitignored) holds Phil's coursework reports, CV and poster that the case studies cite. Never committed. |

## Build, run, verify, deploy

```bash
npm ci              # lockfile install (works cleanly; does not modify tracked files)
npm run dev         # dev server, localhost:4321
npm run verify      # the local gate: astro check && astro build && vitest run
npm run preview     # serve dist/ at localhost:4322 (no _headers applied)
npm audit           # 17 known vulnerabilities, tracked in PHI-147
```

`.claude/launch.json` (gitignored) defines `astro-dev` (4321) and
`astro-preview` (4322) for the agent's preview pane.

**CI** (`.github/workflows/ci.yml`): on every push to `main` and every PR,
`build-and-test` runs `npm ci → check → build → test`. On push to `main` only,
the `deploy` job rebuilds and runs `npx wrangler pages deploy dist
--project-name=philsanjaya-dev --branch=main`. Wrangler is **not** in the
lockfile, so `npx` fetches the latest release at deploy time.

**Rollback:** `git revert` + push (preferred), or Cloudflare dashboard →
Workers & Pages → `philsanjaya-dev` → Deployments → Rollback (README).

**Line endings:** Phil's checkout uses `core.autocrlf=true`, so a local build
emits CRLF inside markdown-rendered HTML while CI (Linux) emits LF. Pages are
otherwise byte-identical to production (verified 2026-11-05).

## Branches

- `main` — production. Local `main` is 1 commit ahead of `origin/main`
  (`dc88124`, a PRD docs edit, not yet pushed; the site build is unaffected).
- `redesign/inventors-workbench` — the "Inventor's Workbench" total redesign
  (Three.js desk scene), 22 commits ahead of `main`, merge-base `c4f7725`. Its
  future is undecided since PHI-72 was canceled (2026-10-20). Its CI adds a
  `preview` job that deploys non-main branches to Cloudflare Pages preview
  aliases; the branch is currently live at
  `redesign-inventors-workbench.philsanjaya-dev.pages.dev` (served with
  `x-robots-tag: noindex`). It also carries `DECISIONS_LOG.md`,
  `INVENTORS_WORKBENCH_HANDOFF.md` and `docs/redesign/M0-baseline-audit.md`,
  none of which exist on `main`.

## Declared budgets (PRD §8)

Lighthouse ≥ 95 in all four categories; site-wide JS ≤ 50 KB gz; agent island
≤ 12 KB gz; CLS 0; home LCP < 1.5 s on simulated Fast 3G; fonts subset woff2,
preloaded, ≤ 90 KB; WCAG 2.1 AA contrast in both themes; full keyboard use;
reduced motion honoured; fully readable without JavaScript (FR-74).

## Changes in this refresh

First version of this file on `main` (none existed before). Facts that were
stale elsewhere and are corrected here: the stack is Astro 6, not Astro 5;
`main` already has a `verify` script; Node is installed system-wide.
