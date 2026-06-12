---
title: 'Foundation'
entry: 1
date: 2026-06-13
milestone: M1
commits: [42a59af, b9e6089, 9e8830a, ea11e45, 3f93647, 420834e]
---

M1's job was the skeleton: a deployed no-scroll shell with agents wandering behind the
hero, gated by CI. Three decisions did the heavy lifting.

**View transitions over an SPA.** The shell's slides could have been client-side
routing; instead every panel is a real Astro page joined by `<ClientRouter />`
(`b9e6089`). The trade-off bought the safety net the PRD demands (FR-74): with
JavaScript off, the site is ordinary readable pages. The slide is presentation, never
load-bearing.

**Pure maths under the canvas.** The agent island (`9e8830a`) split into behaviours —
pure functions over plain data with an injected seeded RNG — and an engine owning the
canvas and clock. That split is why the steering maths could be unit-tested in
isolation (`ea11e45`): jitter bounds, speed clamps, edge wrap, and bit-identical
trajectories from SEED=42. The readout above the agents obeys the same honesty rule as
the content: count, behaviour, and fps are measured live, and an unmeasured fps renders
as an em-dash.

**Review as adversary, not formality.** A multi-agent review pass over the finished
milestone confirmed eighteen findings (`420834e`). The two that stung: Astro's router
silently killed the reduced-motion fade with an `!important` it injects itself, and the
signal teal failed WCAG AA as text on light backgrounds — fixed with a dedicated
`--signal-text` token. The sharpest catch came from mutation testing: the original
clamp tests could not fail, because from cruise speed the clamps never bind. Deleting
the clamps left the suite green. Two tests now start an agent past the speed limit and
assert the clamp binds exactly.

The milestone closed with the stack itself moving under us: the PRD adopted Astro 6,
recorded as ADR 0006 superseding the Astro 5 decision (`3f93647` seeded that log) —
the first real use of the supersede-never-edit rule. Workflow throughout: Phil
directs and reviews, Claude architects, Claude Code builds — and the commits above are
the receipts.
