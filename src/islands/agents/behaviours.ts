/**
 * Steering behaviours — a vanilla-TS port of the wander maths from
 * COS30002 Task 11: jitter a target point on a circle projected ahead
 * of the agent, steer toward it, clamp speed.
 *
 * Everything here is a pure function over plain data with an injected
 * RNG, so the maths is unit-testable in isolation (PHI-48) and M4 can
 * add behaviours (align, flee) without a rewrite (FR-11).
 */

export interface Agent {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Angle of the wander target on the wander circle, relative to heading. */
  wanderAngle: number;
}

export interface Bounds {
  width: number;
  height: number;
  /** Agents wrap once fully past an edge by this margin (px). */
  margin: number;
}

export interface WanderParams {
  /** Distance the wander circle is projected ahead of the agent (px). */
  circleDistance: number;
  /** Wander circle radius (px). */
  circleRadius: number;
  /** Maximum angular jitter applied to the wander angle per tick (radians). */
  jitter: number;
  /** Speed clamp (px/s). */
  maxSpeed: number;
  /** Steering force clamp (px/s²). */
  maxForce: number;
}

/** Uniform RNG in [0, 1). Injected so behaviour is deterministic under test. */
export type Rng = () => number;

/** Deterministic 32-bit RNG (mulberry32). */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Clamp the magnitude of a vector to `max`. */
export function limit(x: number, y: number, max: number): [number, number] {
  const m = Math.hypot(x, y);
  if (m <= max || m === 0) return [x, y];
  return [(x / m) * max, (y / m) * max];
}

/**
 * One wander tick: jitter the wander angle (bounded by ±params.jitter),
 * project the target on the circle ahead of the agent, and return the
 * steering force toward it (clamped to maxForce). Mutates only
 * `agent.wanderAngle`.
 */
export function wanderForce(agent: Agent, params: WanderParams, rng: Rng): [number, number] {
  agent.wanderAngle += (rng() * 2 - 1) * params.jitter;
  const heading = Math.atan2(agent.vy, agent.vx);
  // Circle centre, projected ahead along the heading.
  const cx = agent.x + Math.cos(heading) * params.circleDistance;
  const cy = agent.y + Math.sin(heading) * params.circleDistance;
  // Target on the circle rim.
  const tx = cx + Math.cos(heading + agent.wanderAngle) * params.circleRadius;
  const ty = cy + Math.sin(heading + agent.wanderAngle) * params.circleRadius;
  // Seek it: desired velocity at full speed, steering = desired − velocity.
  const dx = tx - agent.x;
  const dy = ty - agent.y;
  const d = Math.hypot(dx, dy) || 1;
  return limit(
    (dx / d) * params.maxSpeed - agent.vx,
    (dy / d) * params.maxSpeed - agent.vy,
    params.maxForce
  );
}

/** Integrate one step: apply force, clamp speed, move, wrap edges. */
export function step(
  agent: Agent,
  fx: number,
  fy: number,
  params: WanderParams,
  bounds: Bounds,
  dt: number
): void {
  agent.vx += fx * dt;
  agent.vy += fy * dt;
  [agent.vx, agent.vy] = limit(agent.vx, agent.vy, params.maxSpeed);
  agent.x += agent.vx * dt;
  agent.y += agent.vy * dt;
  wrap(agent, bounds);
}

/** Toroidal edge wrap with a margin so agents leave fully before re-entering. */
export function wrap(agent: Agent, b: Bounds): void {
  if (agent.x < -b.margin) agent.x = b.width + b.margin;
  else if (agent.x > b.width + b.margin) agent.x = -b.margin;
  if (agent.y < -b.margin) agent.y = b.height + b.margin;
  else if (agent.y > b.height + b.margin) agent.y = -b.margin;
}
