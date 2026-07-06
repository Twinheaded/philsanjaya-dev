---
title: This website
slug: this-website
order: 5
tags: [meta, web]
stack: [Astro 6, TypeScript, Tailwind v4, Cloudflare Pages]
period: '2026'
summary: The no-scroll site you are reading, built in public
question: Can a fixed-viewport, no-scroll shell stay usable for real content?
status: published
metrics:
  - label: Agent island JS
    value: 2.9 KB gz
    source: gzip of the dist engine + readout bundles at launch, 2026-07-06 (budget ≤12 KB)
  - label: Steering maths tests
    value: '29'
    source: vitest run at launch — behaviours.test.ts (wander, align, flee, clamps, determinism)
  - label: Lighthouse score
    value: 100 · 100 · 100 · 100
    source: 'home, production, real throttled Chrome — PHI-45 audit + launch re-run (hero case study: 99–100 perf across runs)'
links:
  - { label: Source on GitHub, url: 'https://github.com/Twinheaded/philsanjaya-dev' }
---

## Problem

Portfolio sites collapse into templates: a scrolling page, a wall of cards, numbers
nobody can check. The brief for this one was different — a fixed viewport where panels
slide instead of scrolling, a live simulation of steering agents as the signature
element, and a standing rule that no metric appears anywhere without a source.

## Approach

Content is data: every project, note, and build-log entry is a markdown file with a
schema-checked frontmatter, so adding one is a commit, never a code change. The shell
is Astro with view transitions; the agents are a vanilla-TypeScript canvas island
ported from my COS30002 steering coursework. The honest-numbers rule is enforced
mechanically — a metric without a `source` field fails the build.

## Architecture

A 200px rail and a `100dvh` stage; five panel routes joined by directional slide
transitions. One island owns the canvas: pure steering maths over an injected seeded
RNG, an engine for the loop and DPR-aware sizing, and a readout that displays only
live-measured values. CI runs type-check, build, and the steering tests on every push,
then deploys to Cloudflare Pages.

## Results

The metrics above are the build's own receipts: the island's gzipped size, the test
count, and a Lighthouse card that stayed an em-dash until the M4 audit actually ran —
and was re-measured, on the production domain, the day the site launched.

## Reflection

The constraint is the design. No-scroll forces every panel to fit the viewport, which
forces editing; the source-required schema forces every claim to carry its receipt.
The build log on this site records the decisions as they happened, commit by commit.
