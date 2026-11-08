# philsanjaya.com

Personal portfolio of Philipus Sanjaya — a fixed-viewport, no-scroll site where panels slide
instead of scrolling, with a live canvas of autonomous steering agents as the signature
element. Built in public, milestone by milestone.

**Live:** <https://philsanjaya.com> (Cloudflare Pages project `philsanjaya-dev`; the
`philsanjaya-dev.pages.dev` deploy origin serves the same build)

The full specification lives in [docs/PRD.md](docs/PRD.md). Work is tracked in the Linear
project "Portfolio Website" (PHI-27 … PHI-49); every commit references its issue.

## Stack

- [Astro 5](https://astro.build) (static output), content collections, view transitions
- [Tailwind CSS v4](https://tailwindcss.com), design tokens as CSS custom properties
- TypeScript (strict); the agent island is vanilla TS — no client framework

## Commands

| Command           | Action                                    |
| :---------------- | :---------------------------------------- |
| `npm install`     | Install dependencies                      |
| `npm run dev`     | Start the dev server at `localhost:4321`  |
| `npm run build`   | Build the production site to `./dist/`    |
| `npm run preview` | Preview the production build locally      |
| `npm run verify`  | The local gate: check + build + test      |

## Maintenance

**Add a project** — one markdown file, never a code change:

- Project: `src/content/projects/<slug>.md`, copying an existing study's frontmatter
  shape. Every `metrics[]` entry needs a `source` or the build fails (FR-22); a value of
  `pending` renders as an honest em-dash card. `status: draft` keeps it unpublished;
  `## ` headings become chapters.

The Notes and Log sections were removed in PHI-159. Their markdown is kept,
unbuilt, in `archive/`; `archive/README.md` says how to bring them back.
`public/_redirects` sends their old URLs to the home page.

Run `npm run verify` before committing. Every branch push runs CI (check → build →
test). `main` only takes commits that already passed, so the routine is: push the
branch, wait for green, then fast-forward `main` with `git push origin main`. CI then
deploys that tested build to Cloudflare Pages.

**Roll back a deploy:** preferred — `git revert` the offending commit on a branch, then
use the same routine (history stays honest). A direct push to `main` is refused (GH013),
so don't push the revert straight there. Emergency — Cloudflare dashboard → Workers &
Pages → `philsanjaya-dev` → Deployments → previous production deployment → Rollback.

**Domain:** `philsanjaya.com`, registered 2026-07-04 — **renewal due 2027-07-04**. DNS
and registration on Cloudflare; `www` → apex is a zone Redirect Rule; security headers
ship from `public/_headers` (the CSP pins each inline script by hash — if one changes,
`npm run verify` fails in `src/csp-hashes.test.ts`, naming each page and the new hash to
add to `script-src`).
