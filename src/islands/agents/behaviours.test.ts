/**
 * Steering-maths unit tests (PHI-48). The wander maths is tested in
 * isolation with a seeded RNG — deterministic by construction, per
 * PRD §10 ("implement deterministically enough to unit-test the maths
 * in isolation").
 */

import { describe, expect, it } from 'vitest';
import {
  alignForce,
  fleeForce,
  limit,
  mulberry32,
  step,
  wanderForce,
  wrap,
  type Agent,
  type Bounds,
} from './behaviours';
// The engine's shipped parameters, not a copy — so the pinned numbers are
// the numbers production runs with.
import { MARGIN, PARAMS } from './engine';

const SEED = 42;

const BOUNDS: Bounds = { width: 1080, height: 720, margin: MARGIN };

const DT = 1 / 60;

function makeAgent(): Agent {
  return { x: 100, y: 100, vx: 30, vy: 0, wanderAngle: 0 };
}

describe('mulberry32', () => {
  it('is deterministic for a given seed', () => {
    const a = mulberry32(SEED);
    const b = mulberry32(SEED);
    expect(Array.from({ length: 100 }, a)).toEqual(Array.from({ length: 100 }, b));
  });

  it('emits values in [0, 1)', () => {
    const rng = mulberry32(SEED);
    for (let i = 0; i < 10_000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('limit', () => {
  it('leaves vectors at or below the max untouched', () => {
    expect(limit(3, 4, 5)).toEqual([3, 4]);
    expect(limit(0, 0, 5)).toEqual([0, 0]);
  });

  it('scales longer vectors down to the max magnitude', () => {
    const [x, y] = limit(30, 40, 5);
    expect(Math.hypot(x, y)).toBeCloseTo(5, 10);
    expect(y / x).toBeCloseTo(40 / 30, 10);
  });
});

describe('wanderForce', () => {
  it('bounds the wander-angle jitter to ±jitter per tick', () => {
    const rng = mulberry32(SEED);
    const agent = makeAgent();
    for (let i = 0; i < 5_000; i++) {
      const before = agent.wanderAngle;
      wanderForce(agent, PARAMS, rng);
      expect(Math.abs(agent.wanderAngle - before)).toBeLessThanOrEqual(PARAMS.jitter);
    }
  });

  it('clamps the steering force to maxForce', () => {
    const rng = mulberry32(SEED);
    const agent = makeAgent();
    for (let i = 0; i < 5_000; i++) {
      const [fx, fy] = wanderForce(agent, PARAMS, rng);
      expect(Math.hypot(fx, fy)).toBeLessThanOrEqual(PARAMS.maxForce + 1e-9);
      step(agent, fx, fy, PARAMS, BOUNDS, DT);
    }
  });

  it('engages the force clamp when velocity far exceeds the desired speed', () => {
    // From the ambient cruise state the unclamped force never nears
    // maxForce, so this overspeed case exists to make the clamp bind:
    // |desired − v| ≥ |v| − maxSpeed = 62 px/s², so the returned force
    // must sit exactly on the maxForce circle. Deleting the clamp in
    // wanderForce fails this test.
    const rng = mulberry32(SEED);
    const agent = { ...makeAgent(), vx: 100, vy: 0 };
    const [fx, fy] = wanderForce(agent, PARAMS, rng);
    expect(Math.hypot(fx, fy)).toBeCloseTo(PARAMS.maxForce, 9);
  });
});

describe('step', () => {
  it('clamps an overspeed velocity on the first step', () => {
    // Direct mutation-killer for the speed clamp: from cruise speed the
    // integration can never exceed maxSpeed even without the clamp, so
    // start above it. Deleting the limit() in step fails this test.
    const agent = { ...makeAgent(), vx: 100, vy: 0 };
    step(agent, 0, 0, PARAMS, BOUNDS, DT);
    expect(Math.hypot(agent.vx, agent.vy)).toBeCloseTo(PARAMS.maxSpeed, 9);
  });

  it('clamps speed to maxSpeed over a long run', () => {
    const rng = mulberry32(SEED);
    const agent = makeAgent();
    for (let i = 0; i < 20_000; i++) {
      const [fx, fy] = wanderForce(agent, PARAMS, rng);
      step(agent, fx, fy, PARAMS, BOUNDS, DT);
      expect(Math.hypot(agent.vx, agent.vy)).toBeLessThanOrEqual(PARAMS.maxSpeed + 1e-9);
    }
  });

  it('keeps the agent within the wrap margin over a long run', () => {
    const rng = mulberry32(SEED);
    const agent = makeAgent();
    for (let i = 0; i < 20_000; i++) {
      const [fx, fy] = wanderForce(agent, PARAMS, rng);
      step(agent, fx, fy, PARAMS, BOUNDS, DT);
      expect(agent.x).toBeGreaterThanOrEqual(-BOUNDS.margin);
      expect(agent.x).toBeLessThanOrEqual(BOUNDS.width + BOUNDS.margin);
      expect(agent.y).toBeGreaterThanOrEqual(-BOUNDS.margin);
      expect(agent.y).toBeLessThanOrEqual(BOUNDS.height + BOUNDS.margin);
    }
  });

  it('actually wanders: the heading changes over time', () => {
    const rng = mulberry32(SEED);
    const agent = makeAgent();
    const initialHeading = Math.atan2(agent.vy, agent.vx);
    let maxHeadingDelta = 0;
    for (let i = 0; i < 2_000; i++) {
      const [fx, fy] = wanderForce(agent, PARAMS, rng);
      step(agent, fx, fy, PARAMS, BOUNDS, DT);
      const h = Math.atan2(agent.vy, agent.vx);
      maxHeadingDelta = Math.max(maxHeadingDelta, Math.abs(h - initialHeading));
    }
    expect(maxHeadingDelta).toBeGreaterThan(0.1);
  });
});

describe('alignForce', () => {
  const RADIUS = 80;

  it('returns no force when the agent has no neighbours', () => {
    const agent = { ...makeAgent(), vx: 0, vy: 0 };
    expect(alignForce(agent, [agent], PARAMS, RADIUS)).toEqual([0, 0]);
  });

  it('steers toward the neighbours’ average heading', () => {
    // A still agent surrounded by neighbours all cruising +x should be
    // pushed straight along +x at exactly maxForce (desired maxSpeed, v=0).
    const agent = { x: 0, y: 0, vx: 0, vy: 0, wanderAngle: 0 };
    const neighbours = [
      { x: 10, y: 0, vx: PARAMS.maxSpeed, vy: 0, wanderAngle: 0 },
      { x: 0, y: 10, vx: PARAMS.maxSpeed, vy: 0, wanderAngle: 0 },
    ];
    const [fx, fy] = alignForce(agent, [agent, ...neighbours], PARAMS, RADIUS);
    expect(fx).toBeCloseTo(PARAMS.maxForce, 9);
    expect(fy).toBeCloseTo(0, 9);
  });

  it('ignores neighbours outside the radius', () => {
    const agent = { x: 0, y: 0, vx: 0, vy: 0, wanderAngle: 0 };
    const far = { x: RADIUS + 1, y: 0, vx: PARAMS.maxSpeed, vy: 0, wanderAngle: 0 };
    expect(alignForce(agent, [agent, far], PARAMS, RADIUS)).toEqual([0, 0]);
  });

  it('never exceeds maxForce', () => {
    const agent = { x: 0, y: 0, vx: -PARAMS.maxSpeed, vy: 0, wanderAngle: 0 };
    const neighbours = Array.from({ length: 8 }, (_, i) => ({
      x: Math.cos(i) * 20,
      y: Math.sin(i) * 20,
      vx: PARAMS.maxSpeed,
      vy: 0,
      wanderAngle: 0,
    }));
    const [fx, fy] = alignForce(agent, [agent, ...neighbours], PARAMS, RADIUS);
    expect(Math.hypot(fx, fy)).toBeLessThanOrEqual(PARAMS.maxForce + 1e-9);
  });
});

describe('fleeForce', () => {
  it('steers directly away from the point', () => {
    // Agent at rest to the +x side of the point flees along +x at maxForce.
    const agent = { x: 10, y: 0, vx: 0, vy: 0, wanderAngle: 0 };
    const [fx, fy] = fleeForce(agent, 0, 0, PARAMS);
    expect(fx).toBeCloseTo(PARAMS.maxForce, 9);
    expect(fy).toBeCloseTo(0, 9);
  });

  it('points the desired velocity radially outward regardless of position', () => {
    for (const angle of [0.3, 1.1, 2.7, -2.0, Math.PI]) {
      const agent = {
        x: Math.cos(angle) * 50,
        y: Math.sin(angle) * 50,
        vx: 0,
        vy: 0,
        wanderAngle: 0,
      };
      const [fx, fy] = fleeForce(agent, 0, 0, PARAMS);
      // With v=0 the force equals the desired velocity, so its heading
      // must match the agent's bearing from the point.
      expect(Math.atan2(fy, fx)).toBeCloseTo(angle, 6);
    }
  });

  it('never exceeds maxForce even at high inbound speed', () => {
    const agent = { x: 5, y: 0, vx: -PARAMS.maxSpeed, vy: 0, wanderAngle: 0 };
    const [fx, fy] = fleeForce(agent, 0, 0, PARAMS);
    expect(Math.hypot(fx, fy)).toBeLessThanOrEqual(PARAMS.maxForce + 1e-9);
  });

  it('falls back to a stable direction when sitting exactly on the point', () => {
    const agent = { x: 0, y: 0, vx: 0, vy: 0, wanderAngle: 0 };
    const [fx, fy] = fleeForce(agent, 0, 0, PARAMS);
    expect(Number.isFinite(fx)).toBe(true);
    expect(Number.isFinite(fy)).toBe(true);
  });
});

describe('wrap', () => {
  it('wraps a left exit to the right edge', () => {
    const agent = { ...makeAgent(), x: -BOUNDS.margin - 1 };
    wrap(agent, BOUNDS);
    expect(agent.x).toBe(BOUNDS.width + BOUNDS.margin);
  });

  it('wraps a right exit to the left edge', () => {
    const agent = { ...makeAgent(), x: BOUNDS.width + BOUNDS.margin + 1 };
    wrap(agent, BOUNDS);
    expect(agent.x).toBe(-BOUNDS.margin);
  });

  it('wraps a top exit to the bottom edge', () => {
    const agent = { ...makeAgent(), y: -BOUNDS.margin - 1 };
    wrap(agent, BOUNDS);
    expect(agent.y).toBe(BOUNDS.height + BOUNDS.margin);
  });

  it('wraps a bottom exit to the top edge', () => {
    const agent = { ...makeAgent(), y: BOUNDS.height + BOUNDS.margin + 1 };
    wrap(agent, BOUNDS);
    expect(agent.y).toBe(-BOUNDS.margin);
  });

  it('leaves an agent inside the bounds untouched', () => {
    const agent = makeAgent();
    wrap(agent, BOUNDS);
    expect(agent.x).toBe(100);
    expect(agent.y).toBe(100);
  });
});

describe('determinism (SEED=42)', () => {
  function trajectory(seed: number, ticks: number): string {
    const rng = mulberry32(seed);
    const agent = makeAgent();
    const points: Array<[number, number]> = [];
    for (let i = 0; i < ticks; i++) {
      const [fx, fy] = wanderForce(agent, PARAMS, rng);
      step(agent, fx, fy, PARAMS, BOUNDS, DT);
      points.push([agent.x, agent.y]);
    }
    return JSON.stringify(points);
  }

  it('reproduces a bit-identical trajectory run-to-run', () => {
    expect(trajectory(SEED, 5_000)).toBe(trajectory(SEED, 5_000));
  });

  it('diverges under a different seed', () => {
    expect(trajectory(SEED, 5_000)).not.toBe(trajectory(7, 5_000));
  });
});
