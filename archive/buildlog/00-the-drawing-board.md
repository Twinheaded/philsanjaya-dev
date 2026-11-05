---
title: 'The drawing board'
entry: 0
date: 2026-06-12
milestone: design
commits: []
---

Before the repository existed, the site was an argument about constraints.

The first decision was the shell: the document never scrolls. Panels fill the
viewport exactly and navigation slides between them (PRD §4.1). On a scroll-first
web this is the deliberate risk — it reads like a simulation instrument rather than
a template blog, and it forces every panel to fit, which forces editing. The safety
net is that without JavaScript the panels are still ordinary, readable pages
(FR-74); the slide is presentation, not load-bearing.

The second was the signature element. One thing done precisely beats ten effects:
a canvas of autonomous agents running the wander behaviour from my COS30002
coursework — the actual steering maths, not a lookalike (PRD §4.3, §10). Everything
around it stays quiet so the agents can be the brand.

The third was the rule that shapes all the others: honest numbers (PRD §4.2). No
metric appears anywhere on the site — content or chrome — unless it comes from a
real report, log, or live measurement. The enforcement is mechanical: a metric
without a `source` field fails the build, and unmeasured values render as an
em-dash, never a guess. Even the fps readout under the agents obeys it.

The stack followed from the constraints rather than the other way round: Astro for
content-as-data and near-zero default JavaScript, content collections for
schema-checked markdown (PRD §11.2), and Cloudflare Pages deploying `main` through
the CI gate (PRD §11.4, ADR 0007).

The meta-decision is the one you are reading: the site documents its own
construction. Designed in conversation with Claude, specified in a PRD, tracked in
Linear (PHI-27 through PHI-49), built by Claude Code milestone by milestone — and
it says so, openly. This log is the receipts.
