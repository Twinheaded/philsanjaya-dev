# philsanjaya.dev

Personal portfolio of Phil Sanjaya — a fixed-viewport, no-scroll site where panels slide
instead of scrolling, with a live canvas of autonomous steering agents as the signature
element. Built in public, milestone by milestone.

**Live:** <https://philsanjaya-dev.pages.dev> (Cloudflare Pages; the production domain
philsanjaya.dev arrives at milestone M5)

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
