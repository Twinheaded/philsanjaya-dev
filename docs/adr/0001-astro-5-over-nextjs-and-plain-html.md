# 0001 — Astro 5 over Next.js and plain HTML

Date: 2026-06-12 · Elaborates PRD §11.1–11.2

## Status

Accepted

## Context

The site is content-as-data: projects, notes, and build-log entries are markdown
files, and adding one must never require a code change (G3). The performance
budgets are strict — Lighthouse ≥ 95 in every category and ≤ 50 KB of client
JavaScript site-wide (§8) — and the only meaningfully interactive element is a
single canvas island. Three candidates were considered: Next.js, plain
hand-written HTML, and Astro 5.

## Decision

Build on **Astro 5** with static output. Next.js ships a React runtime and
hydration cost that buys nothing for a static portfolio and works against the
JS budget. Plain HTML has no content-collection story: every new project would
mean hand-editing index pages, and frontmatter would be unchecked. Astro's
content collections with zod schemas are purpose-built for the
markdown-per-project model, its default is zero client JS, and `<ClientRouter />`
view transitions give app-feel panel slides while keeping real, deep-linkable
routes (FR-04/06).

## Consequences

- The §8 budgets are achievable rather than aspirational; client JS exists only
  where islands are deliberately added.
- Content collections enforce schema validity at build time (enables ADR 0004).
- The version is pinned to Astro 5.x per the PRD while Astro 6 is current
  upstream; moving to 6 is a real decision that would supersede this ADR rather
  than arrive silently through a dependency bump.
