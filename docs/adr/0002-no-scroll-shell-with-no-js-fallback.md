# 0002 — No-scroll shell with no-JS fallback

Date: 2026-06-12 · Elaborates PRD §4.1, §7.1, §11.2 (FR-01–09, FR-74)

## Status

Accepted

## Context

The portfolio must be memorably distinctive (G4) without sacrificing usability
for recruiters on a 30-second pass (G1). A fixed-viewport shell where panels
slide instead of scrolling is the deliberate aesthetic risk: it reads as a
simulation instrument rather than a template blog. The known risks (§15) are
that unusual UX confuses visitors and that a no-scroll frame fights long
content.

## Decision

The document body never scrolls at any breakpoint. The stage is `100dvh`;
top-level routes are real Astro pages joined by directional slide transitions;
arrow keys and horizontal swipe move through the panel sequence. Long-form
content lives in chaptered case studies (FR-34) and one sanctioned
contained-scroll reading pane (§7.5) that the UI explicitly owns. **The safety
net is FR-74:** with JavaScript disabled the panels render as normal,
fully-readable pages with browser-default navigation — only the slides, the
island, and microinteractions are lost.

## Consequences

- Cumulative layout shift is structurally 0; deep links cold-load with no
  intermediate animation (FR-06).
- Every panel must fit the viewport at every breakpoint — a standing design
  constraint on all future content, enforced per issue before commit.
- Reduced motion replaces slides with a ≤150 ms fade (FR-07), so the shell
  never depends on motion to be usable.
