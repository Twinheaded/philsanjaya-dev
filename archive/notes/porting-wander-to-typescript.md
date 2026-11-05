---
title: Porting wander() from Python to TypeScript
date: 2026-06-13
summary: What survived the port from COS30002, and what the tests caught
tags: [steering, testing, typescript]
---

The agents drifting behind the home panel run the wander behaviour from my COS30002
coursework (Task 11): each tick, jitter a target point on a circle projected ahead of
the agent, steer toward it, clamp the speed. The Python original leaned on the
framework for vectors and randomness. The port keeps only the maths.

Two decisions made it testable. First, the behaviour functions are pure — plain
agent data in, a force vector out, no canvas, no clock, no globals. Second, the
randomness is injected: the engine passes a `mulberry32` generator, so the same seed
reproduces the same trajectory bit-for-bit. The unit tests pin four properties with
`SEED=42`: the per-tick wander-angle jitter stays within ±jitter, the steering force
never exceeds its clamp, speed never exceeds its clamp, and the agent never escapes
the toroidal wrap margin.

The embarrassing lesson came from a review pass with mutation testing: the first
version of the clamp tests could not fail. From the cruise-speed starting state, the
wander target is always close to the heading, so the unclamped force never came near
the limit — deleting the clamp entirely left the suite green. The fix was to start an
agent well above `maxSpeed` and assert the clamps bind exactly: the first integration
step must land on the speed limit, and the steering force must sit exactly on the
force circle. Deleting either clamp now fails the suite.

A property test that cannot fail is worse than no test — it documents a guarantee
nobody is checking. Seeded determinism made the difference: the same trajectory every
run means a regression is a diff, not a flake.
