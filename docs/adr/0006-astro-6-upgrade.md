# 0006 — Astro 6 upgrade

Date: 2026-06-13 · Supersedes [0001](0001-astro-5-over-nextjs-and-plain-html.md) · Elaborates PRD §11.1 (v1.2)

## Status

Accepted

## Context

ADR 0001 pinned the project to Astro 5 per PRD v1.0 and noted that moving to 6
would be "a real decision that would supersede this ADR rather than arrive
silently through a dependency bump." That decision arrived: two security
advisories against astro ≤ 6.1.9 (a `define:vars` XSS, moderate; a
server-island replay, low) are fixed only in Astro 6, Dependabot opened a bump
PR within minutes of being enabled, and the current `create-astro` scaffolds
Astro 6 by default. Phil amended the PRD (v1.2) to target the latest Astro 6.

## Decision

Upgrade to **Astro 6** (6.4.6 at the time of writing) and track 6.x. The
framework choice itself — Astro over Next.js and plain HTML — is unchanged
from ADR 0001; only the major version pin moves. Node floor rises to 22.12
(`engines`, `.node-version`). One toolchain consequence: Astro 6 drives the
build with Vite 7 while Vitest 4 can hoist Vite 8, and `@tailwindcss/vite`
resolves whatever is hoisted — so the repo pins a root `vite@^7` dev
dependency to keep the whole tree on one Vite until Astro and Vitest converge
again.

## Consequences

- Both open Dependabot security alerts clear; `npm audit --omit=dev` is clean.
- All M1 behaviour carried over unchanged: type-check, build, and the 18
  steering-maths tests pass; the FR-07 reduced-motion override still beats the
  ClientRouter's injected `animation: none !important` in the built bundle.
- The root `vite` pin is deliberate coupling that should be removed once the
  ecosystem settles on one Vite major; revisit at M4 (PHI-45 budget pass).
