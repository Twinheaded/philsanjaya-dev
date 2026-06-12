# Architecture decision records

One file per decision, numbered in order, MADR-lite format: **Status / Context /
Decision / Consequences**, at most one page each. Every ADR cites the PRD section
it elaborates.

Rules (PRD §14, v1.1):

- Significant new architecture decisions get an ADR **before** implementation.
- Accepted ADRs are immutable — to change course, write a new ADR that supersedes
  the old one and mark the old one `Superseded by NNNN`. Never edit an accepted ADR.

| # | Title | Status |
|---|-------|--------|
| [0001](0001-astro-5-over-nextjs-and-plain-html.md) | Astro 5 over Next.js and plain HTML | Superseded by 0006 |
| [0002](0002-no-scroll-shell-with-no-js-fallback.md) | No-scroll shell with no-JS fallback | Accepted |
| [0003](0003-vanilla-ts-agent-island-no-client-framework.md) | Vanilla TS agent island, no client framework | Accepted |
| [0004](0004-source-required-metrics-schema.md) | Source-required metrics schema | Accepted |
| [0005](0005-cloudflare-pages-hosting.md) | Cloudflare Pages hosting | Accepted |
| [0006](0006-astro-6-upgrade.md) | Astro 6 upgrade | Accepted |
| [0007](0007-ci-driven-pages-deploys.md) | CI-driven Pages deploys over dashboard git integration | Accepted |
