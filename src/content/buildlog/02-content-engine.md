---
title: 'Content engine'
entry: 2
date: 2026-06-13
milestone: M2
commits: [f8fc8c8, 8d4b647, cea3da3, feb1ae4, b1669e7, 58be36f]
---

M2 made content a file drop: three collections with zod schemas (`f8fc8c8`), a projects
grid (`8d4b647`), chaptered case studies (`cea3da3`), the one sanctioned scroll
(`feb1ae4`), and this log (`b1669e7`).

**The schema is the honesty mechanism.** Every project metric is `{label, value,
source}` with `source` required — a metric without a receipt fails the build by name.
The negative test proved it: a planted unsourced metric died with
`metrics.0.source: Required`. `value: pending` stays legal and renders as an em-dash
card, which M3 would put to real use.

**Chapters as progressive enhancement.** A case study is one markdown file; its `##`
headings become slides. The body renders once through Astro's full pipeline, then a
small script groups the DOM into chapters — so without JavaScript the study reads
top-to-bottom in a contained frame, and tabs are plain hash anchors that deep-link
either way.

**The review earned its keep again.** Sixteen confirmed findings (`58be36f`), two of
them genuine bugs: a chapterless body was silently destroyed by the grouping script,
and `history.replaceState(null)` poisoned the router's state so the browser Back
button swallowed a press. Both were fixed and re-verified live. Phil's own spam-testing
then found what the agents missed: inputs landing mid-animation were being dropped —
three separate fixes converged on one principle, *latest input wins*, including a
one-line `pointer-events: none` on the view-transition overlay that had been eating
rail clicks.

**The gate worked.** One fix commit landed incomplete — a file moved without its
rewrite — and CI went red and blocked the deploy. Production never served the broken
build. That is the pipeline doing exactly what PHI-48 built it to do, and it is the
kind of receipt this log exists to record.
