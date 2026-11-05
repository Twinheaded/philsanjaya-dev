---
title: 'Behaviours and polish'
entry: 3
date: 2026-06-27
milestone: M4
commits: [10daa09, 8ae1c92, cc9f16b, 276052f, 918c769, 5f204b1, c80e59c, e2b90d9]
---

M4 was where the agents stopped being decoration and started reading the room.

**Behaviours follow the route.** The island gained a small FSM: `wander` on home,
`flee` from the screen centre on a new custom 404, and `align` — calm, faint — behind a
case study's Architecture chapter (`10daa09`). The maths stayed pure functions over a
seeded RNG, so `align` and `flee` arrived with their own unit tests rather than an
eyeball check. Pressing `d` now draws the real velocity, steering-force, and wander-circle
vectors in instrument amber (`8ae1c92`) — the curtain-pull the brief always wanted. One
claim I had to scope honestly: the ~1s behaviour blend only holds for transitions inside
one mounted island; cross-route changes are fresh per-page mounts, so the PRD wording was
narrowed to match (`918c769`).

**A review finding reversed an earlier call.** In M2 I removed the focus ring on chapters
because it flashed a box on every arrow press — the right instinct, the wrong mechanism.
The M4 adversarial review showed the no-ring region was a real WCAG 2.4.7 (Focus Visible)
failure, a Must rather than a preference. The fix kept the instinct and addressed the
cause: chapter changes no longer steal focus at all, an `aria-live` region announces the
change, and a subtle inset bar marks the region only when a keyboard user genuinely tabs
onto it (`cc9f16b`, `276052f`). Accessibility and taste were never in conflict; the first
design had just confused them.

**Performance as a feature.** Per-project Open Graph cards now render at build from one
branded template, beside a sitemap, canonical URLs, and a domain-tracking robots.txt
(`5f204b1`). The receipt is the number: Lighthouse 100/100/100/100 on the home page, a
case study, and a note, with 11.8 KB of JavaScript site-wide against a 50 KB budget.

**The near-miss worth recording.** One SEO commit shipped a TypeScript error that
`astro build` waved through — it strips types — which only `astro check` caught, in CI
(`c80e59c`). The gate worked; the *local* gate had not. It now chains check, build, and
test behind a single exit code (`e2b90d9`), so verify-before-commit can no longer be
fooled by a truncated log.
