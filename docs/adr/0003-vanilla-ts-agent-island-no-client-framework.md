# 0003 — Vanilla TS agent island, no client framework

Date: 2026-06-12 · Elaborates PRD §5 (Won't), §7.2, §8, §11.1

## Status

Accepted

## Context

The signature element is a canvas of autonomous steering agents — a port of the
COS30002 wander/align/flee maths. It needs a per-frame animation loop, not a
component tree: there is no UI state to reconcile, and any client framework
would spend the JS budget (island ≤ 8 KB gzipped, site ≤ 50 KB, §8) on
hydration machinery the loop never uses. The maths itself is the brand and must
be testable in isolation (§10).

## Decision

One vanilla-TypeScript island, no framework anywhere on the client (§5 Won't).
The module splits along testability lines (§11.3): `behaviours.ts` holds pure
steering functions over plain data with an injected seeded RNG; `engine.ts`
owns the canvas, DPR sizing, and the rAF loop; `readout.ts` renders only
live-measured values. New behaviours register in a map keyed by name, so M4
adds `align` and `flee` without touching the loop.

## Consequences

- The M1 island measures 1,567 bytes gzipped against the 8 KB budget.
- The maths is deterministic under a fixed seed and unit-tested in isolation
  (PHI-48); the same functions can later drive the debug overlay (FR-15).
- Lifecycle around view-transition swaps is managed by hand (mount on
  `astro:page-load`, self-stop when the canvas leaves the DOM) — the cost of
  having no framework, accepted knowingly.
