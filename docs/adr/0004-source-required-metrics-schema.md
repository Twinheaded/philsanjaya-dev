# 0004 — Source-required metrics schema

Date: 2026-06-12 · Elaborates PRD §4.2, §7.3 (FR-22), §15

## Status

Accepted

## Context

Portfolio sites drift toward invented or unverifiable numbers, and the drift is
gradual enough that review alone does not catch it (§15 names
"fabricated-number drift over time" as a project risk). Honest numbers is a
guiding principle here (§4.2): no metric appears anywhere — content or UI
chrome — unless it comes from a real report, log, or live measurement.
Principles need mechanical enforcement to survive contact with deadlines.

## Decision

Every metric in the `projects` collection is `{ label, value, source }` with
**`source` schema-required** (zod, FR-22). A metric without a citation fails
the build — it cannot ship. `value: "pending"` is legal and renders as an
em-dash card with its label: visibly unfilled, never silently hidden, never
guessed. The same rule binds the UI chrome: the agent readout displays only
live-measured values and renders an em-dash until a measurement exists.

## Consequences

- The honest-numbers rule is enforced by the compiler, not by discipline; the
  launch audit (PHI-47) reduces to tracing sources rather than hunting fakes.
- Authoring slows down slightly: every number needs its receipt at writing
  time. This is accepted as the point, not a side effect.
- The schema itself lands with the content engine (M2, PHI-31); this ADR is
  deliberately written before that code exists.
