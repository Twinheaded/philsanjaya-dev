---
title: CTF Arena
slug: ctf-arena
order: 1
expNo: 1
diagram: ctf-arena
tags: [ai-for-games, simulation]
stack: [Python, pyglet, GOAP, 'A*', FSM, steering]
period: '2026'
summary: Autonomous 3v3 capture-the-flag teams testing coordination against greed
question: Does centralised coordination beat individually-greedy agents at capture the flag?
status: published
metrics:
  - label: Win rate, coordinated (decisive)
    value: '0.985'
    source: experiments/results/summary.md — 134/136, Wilson 95% CI 0.957–1.000
  - label: Matches in committed study
    value: '600'
    source: study_raw.csv row count; design_document.md study spec
  - label: Respawns with influence map
    value: 31 → 8 per match
    source: summary.md secondary study — Mann-Whitney p = 4.05e-50
hero: /media/ctf-arena-demo.webm
heroPoster: /media/ctf-arena-poster.webp
---

<!-- TODO(phil-voice) — §10 restructure notes (M6, agent-scaffolded; copy untouched):
     · Problem is ~4 sentences — within §10's 2–4 range; bless or trim to taste.
     · "Approach" + "Architecture" now scaffold the Idea section (heading-only
       change) — smooth the seam if it reads stitched.
     · Reflection is not a §10 section — fold into Result, keep, or cut. -->

## Problem

The COS30002 brief asks for four families of game AI — architecture, graph search,
steering, and goal planning — combined into one working system. CTF Arena makes them
compete: two fully autonomous teams of three agents play capture the flag with identical
AI stacks, and the only experimental variable is how a team decides. The research
question, from the project PRD: to what extent does centralised team coordination improve
competitive performance over independent, individually-greedy agents? The hypothesis
predicted a higher win rate and faster captures, with the largest gains on
chokepoint-heavy maps.

## Idea

A clean ablation. Both conditions run the same FSM, planner, pathfinding, and steering;
the Coordinated team adds a coordinator that assigns roles, while the Independent
controller is a drop-in sibling that writes an empty role table — every agent falls back
to a three-branch greedy policy. The committed study is 600 matches: 50 per condition per
map across three symmetric maps of varying chokepoint density, all reproducible from one
master seed through a headless harness that runs at roughly 90× real time. The codebase
carries 135 pytest tests — including same-seed replay tests that pin determinism — and 53
functional requirements tracked through 18 Linear issues.

### Architecture

Each tick runs a fixed pipeline: sense → coordinate → plan → path → steer → resolve. A
six-state FSM executes *how* an agent acts; a STRIPS-style GOAP planner decides *what* it
pursues; A* with an influence map plans *where* — path cost rises in dangerous cells; a
blended steering layer (seek, arrive, flee, pursuit, evade, separation, obstacle
avoidance, wander, and a carrier blend) produces the actual motion. The coordinator
evaluates team state, picks a posture from Attack, Balanced, Defend, or Retrieve, expands
it to a role template, and assigns roles to the nearest agents through a shared
blackboard. The wander behaviour drifting behind this site's home page is the same maths,
ported to TypeScript.

## Result

Across 150 head-to-head matches the coordinated team won 134, lost 2, and drew 14 — a
0.985 win rate over decisive matches (Wilson 95% CI 0.957–1.000, binomial p = 1.07e-37)
and 0.893 over all matches. The hypothesis held, but one part was refuted: the advantage
was *smallest* on the chokepoint map (0.760) and largest on open ground (0.960), the
opposite of the prediction — reported as found. The mechanism was the second surprise:
in symmetric play the coordinated team scores *fewer* captures (0.7 vs 1.6 per match) —
but that cut pits each team against a different opponent, so it measures the enemy's
defence. Head-to-head, where the two styles actually meet, coordination outscores the
greedy baseline 2.35 to 0.37 captures per match while starving it: it wins by denial
*and* offence. The strongest single result belongs to the influence
map, which cut agent respawns from 31.07 to 8.03 per match (p = 4.05e-50).

## Reflection

The first coordinator made the team worse: it lost the pilot roughly 12–2 to the greedy
baseline because its postures were too defensive, and a role-template rebalance —
persistent defender, two attackers — reversed the result. Determinism nearly broke the
study from the other side: with fixed spawns, different-seed matches played out almost
identically, so trial variance had to be reintroduced through seeded random spawn
positions. The discipline that made the project work — verify before commit, one issue at
a time, numbers only with receipts — is the same workflow that built the site you are
reading. Fog of war is scaffolded but unfinished; partial observability is the natural
next experiment.
