# PROJECT_CONTEXT — philsanjaya.com

What this project is and how it works, as of **2026-11-06** (written during the
PHI-121 read-only audit against `main` at `dc88124`; updated for PHI-159, which
removed the Notes and Log sections). Refresh it when a milestone closes.

## What it is, and for whom

Phil Sanjaya's public portfolio, live at <https://philsanjaya.com>. Readers are
graduate recruiters and hiring managers, mostly on desktop, some on phones. The
site has to load, read correctly, and be truthful: it follows an
**honest-metrics rule** (every number needs a source; unknown values render as
an em-dash, never a guess). The specification is [docs/PRD.md](docs/PRD.md);
architecture decisions are in [docs/adr/](docs/adr/) (0001–0007).

The design is a **fixed-viewport, no-scroll shell**: three top-level panels
(01 Home, 02 Projects, 03 About) slide sideways instead of the page
scrolling. Notes and Log were removed in PHI-159 (Nov 2026) so the site reads
as a portfolio, not a learning journal; their markdown is kept, unbuilt, in
`archive/` (see `archive/README.md`), and `public/_redirects` sends their old
URLs to `/` with a 301. A small canvas of autonomous "steering agents" (Phil's COS30002
wander/align/flee maths, ported to TypeScript) runs behind the home hero.

## Stack

| Piece | What | Where |
| --- | --- | --- |
| Framework | **Astro 6** (`astro@6.4.8` installed, `^6.4.6` declared), static output, `<ClientRouter />` view transitions | `package.json`, `astro.config.mjs` |
| Styling | Tailwind CSS v4 via `@tailwindcss/vite`; colour tokens as CSS custom properties mapped with `@theme inline` | `src/styles/global.css`, `src/styles/tokens.css` |
| Fonts | Self-hosted `@fontsource` (Archivo 500, Instrument Sans 400/500, IBM Plex Mono 400); three latin woff2 subsets preloaded | `src/layouts/Shell.astro:7-34` |
| Client JS | Vanilla TypeScript only (no client framework, ADR 0003) | `src/islands/agents/`, inline `<script>`s in pages |
| Content | Astro content collection with a zod schema (`projects`), markdown files. Former `notes`/`buildlog` markdown sits in `archive/`, outside the build | `src/content.config.ts`, `src/content/projects/**`, `archive/` |
| OG images | Built at build time with satori → resvg, one per project + default | `src/pages/og/[...route].png.ts` |
| SEO | `@astrojs/sitemap`, generated `robots.txt`, per-page canonical/OG/Twitter tags, JSON-LD `Person` on home | `Shell.astro:21-50`, `src/pages/robots.txt.ts`, `src/pages/index.astro:8-27` |
| Tests | Vitest: 29 tests on the steering maths, 4 on the panel sequence | `src/islands/agents/behaviours.test.ts`, `src/lib/panels.test.ts` |
| Node | CI uses Node 22; `.node-version` = 22; `engines` `>=22.12.0`. Local machine: Node 24.16.0, npm 11.13.0 at `C:\Program Files\nodejs` (on PATH, no prelude needed) | |

> Doc drift: `README.md:15` still says "Astro 5"; the code and ADR 0006 say Astro 6.

## Components and data flow

```
src/content/*.md  ──(zod schema, build fails on bad frontmatter)──┐
                                                                  ▼
src/pages/*.astro ── Shell.astro (head, rail nav, ClientRouter) ── astro build ──► dist/  (static HTML/CSS/JS, OG PNGs, sitemap)
src/islands/agents/*.ts ── bundled by Vite ───────────────────────┘                  │
public/ (_headers, _redirects, resume.pdf, media/, favicon) ─ as-is ────────────────────┘
                                                                                     ▼
                                       GitHub Actions `deploy` job ── wrangler pages deploy ──► Cloudflare Pages project `philsanjaya-dev`
                                                                                                    ├─ philsanjaya.com (production, custom domain)
                                                                                                    └─ philsanjaya-dev.pages.dev (same build)
```

**Routes (9 HTML pages + OG images + robots/sitemap):** `/`, `/projects`,
`/projects/<slug>` (5 published studies: ctf-arena, aegisx, market-sentiment,
power-forecasting, this-website), `/about`, `/404`, `/og/<slug>.png`,
`/robots.txt`, `/sitemap-index.xml`, `/resume.pdf`. Old `/notes…` and `/log…`
URLs 301 to `/` via `public/_redirects` (Cloudflare only; `astro preview`
ignores the file).

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
- `src/components/NotePane.astro` — the contained-scroll reading pane that
  notes/log entries used, with a small inline script that toggles the bottom
  fade. **Unused since PHI-159**; kept so Notes or Log can be restored.
- `src/islands/agents/engine.ts` / `behaviours.ts` / `readout.ts` — the
  canvas island: pure steering functions (tested) plus the canvas loop,
  route-keyed behaviour, reduced-motion static frame, `d` debug overlay.
- `src/content.config.ts` — the honest-metrics rule is mechanical here:
  `metric.source` is `z.string().min(1)` (`:16-20`).

## Trust boundaries and external services

| Boundary | Notes |
| --- | --- |
| Content → HTML | All content is Phil's own markdown in the repo, rendered at build time. No user input, no forms, no server runtime. |
| Browser | Static files only. CSP from `public/_headers`: `script-src 'self'` + two sha256 hashes pinning the two inline scripts (theme snippet; reading-pane mask). Since PHI-159 no built page carries the reading-pane script, so its hash is unused but left in place for a restore. JSON-LD is a data block, not covered by script-src. |
| GitHub (`Twinheaded/philsanjaya-dev`, **public**) | One collaborator. `main` is protected by **ruleset 26697168** (PHI-155): the `build-and-test` check is required, force pushes and deletion are blocked, and the bypass list is empty, so nobody can push past it. To get past it, switch the ruleset off in Settings. Workflow token is read-only (`permissions: contents: read`; repo default `read`). Dependabot security updates are on (10 open dependency PRs). |
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

**CI** (`.github/workflows/ci.yml`, hardened in PHI-155):
- `build-and-test` runs on every push to any branch, and on every PR.
  - It runs `npm ci → check → build → test`, holds no secrets, and uploads
    `dist/` as the `dist` artifact.
- `deploy` runs only for pushes to `main`, after `build-and-test`.
  - It installs with `npm ci --ignore-scripts`, so no dependency install
    script runs.
  - It downloads that `dist` artifact and publishes it without rebuilding.
  - It runs wrangler **4.158.0** (an exact devDependency in the lockfile)
    from `node_modules/.bin`: `wrangler pages deploy dist
    --project-name=philsanjaya-dev --branch=main`.
  - Only its final step can read `CLOUDFLARE_API_TOKEN`. If the secret is
    missing, the deploy fails rather than skipping.
- Every `uses:` is pinned to a full commit SHA, with the tag as a comment.

**Push routine** (the ruleset enforces it):
1. Commit on a branch and push the branch.
2. Wait for `build-and-test` to go green on that commit.
3. Fast-forward `main` to the same commit with `git push origin main`. CI then
   deploys.

A direct push of an unchecked commit to `main` is refused with
`GH013 … Required status check "build-and-test" is expected`. One quirk: a
commit whose files exactly match an already-green commit counts as passed, so
an empty commit gets through. Any real change has new files and gets checked.

**Rollback:** `git revert` on a branch, then the push routine above (preferred).
A direct push of the revert to `main` is refused. Emergency path: Cloudflare
dashboard → Workers & Pages → `philsanjaya-dev` → Deployments → Rollback
(README).

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

**PHI-159 (2026-11-06):** Notes and Log removed; three panels; routes, content,
tests, CSP and `NotePane` notes updated above.

**PHI-121 (2026-11-05):** first version of this file (none existed before). Facts that were
stale elsewhere and are corrected here: the stack is Astro 6, not Astro 5;
`main` already has a `verify` script; Node is installed system-wide.
