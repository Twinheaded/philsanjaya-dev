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

Run `npm run verify` before committing. Every push to `main` runs CI
(check → build → test) and deploys to Cloudflare Pages on green.

**Roll back a deploy:** preferred — `git revert` the offending commit and push (CI
redeploys; history stays honest). Emergency — Cloudflare dashboard → Workers & Pages →
`philsanjaya-dev` → Deployments → previous production deployment → Rollback.

**Domain:** `philsanjaya.com`, registered 2026-07-04 — **renewal due 2027-07-04**. DNS
and registration on Cloudflare; `www` → apex is a zone Redirect Rule; security headers
ship from `public/_headers` (the CSP pins the single inline theme script by hash — if
that script changes, recompute the hash per the comment in that file).
