/**
 * Agent island engine (FR-10): canvas lifecycle, DPR-aware sizing, the
 * animation loop, and live measurement for the readout. Rendering and
 * physics stay separate from the behaviour maths in behaviours.ts.
 */

import {
  mulberry32,
  wanderForce,
  step,
  type Agent,
  type Bounds,
  type Rng,
  type WanderParams,
} from './behaviours';

export interface ReadoutData {
  count: number;
  behaviour: string;
  /** Frames per second sampled over the last ~1s window; null until measured. */
  fps: number | null;
}

/**
 * Behaviour registry — M4 adds `align` and `flee` here (FR-11) without
 * touching the engine loop.
 */
type ForceFn = (agent: Agent, env: { agents: Agent[]; rng: Rng; params: WanderParams }) => [
  number,
  number,
];

const BEHAVIOURS: Record<string, ForceFn> = {
  wander: (agent, env) => wanderForce(agent, env.params, env.rng),
};

const PARAMS: WanderParams = {
  circleDistance: 60,
  circleRadius: 24,
  jitter: 0.25,
  maxSpeed: 38,
  maxForce: 30,
};

const OPACITY = 0.55; // §10: default home-panel state
const MARGIN = 16;
const MAX_DT = 0.05; // clamp integration after tab-hidden gaps

function makeAgents(width: number, height: number, rng: Rng): Agent[] {
  // 18–24 agents, scaled by stage area (FR-10).
  const count = Math.min(24, Math.max(18, Math.round((width * height) / 55_000)));
  return Array.from({ length: count }, () => {
    const angle = rng() * Math.PI * 2;
    const speed = PARAMS.maxSpeed * (0.6 + rng() * 0.4);
    return {
      x: rng() * width,
      y: rng() * height,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      wanderAngle: 0,
    };
  });
}

function signalColor(canvas: HTMLCanvasElement): string {
  return getComputedStyle(canvas).getPropertyValue('--signal').trim() || '#149e7c';
}

function draw(
  ctx: CanvasRenderingContext2D,
  agents: Agent[],
  bounds: Bounds,
  color: string
): void {
  ctx.clearRect(0, 0, bounds.width, bounds.height);
  ctx.globalAlpha = OPACITY;
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  for (const a of agents) {
    ctx.beginPath();
    ctx.arc(a.x, a.y, 2, 0, Math.PI * 2);
    ctx.fill();
    const m = Math.hypot(a.vx, a.vy) || 1;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(a.x + (a.vx / m) * 10, a.y + (a.vy / m) * 10);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/**
 * Mount the island on a canvas. Returns a cleanup function. Under
 * prefers-reduced-motion a single static frame is drawn and no loop
 * runs (FR-17).
 */
export function mountAgents(
  canvas: HTMLCanvasElement,
  onReadout: (data: ReadoutData) => void
): () => void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};

  const rng = mulberry32((performance.timeOrigin + performance.now()) >>> 0);
  const behaviour = 'wander';
  const bounds: Bounds = { width: 0, height: 0, margin: MARGIN };
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let agents: Agent[] = [];
  let color = signalColor(canvas);
  let rafId = 0;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  function resize(): void {
    const rect = canvas.getBoundingClientRect();
    bounds.width = rect.width;
    bounds.height = rect.height;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (agents.length === 0) agents = makeAgents(bounds.width, bounds.height, rng);
  }

  const observer = new ResizeObserver(() => {
    resize();
    if (reduced) draw(ctx, agents, bounds, color);
  });
  observer.observe(canvas);
  resize();

  if (reduced) {
    draw(ctx, agents, bounds, color);
    onReadout({ count: agents.length, behaviour, fps: null });
    return () => observer.disconnect();
  }

  onReadout({ count: agents.length, behaviour, fps: null });

  let last = performance.now();
  let windowStart = last;
  let frames = 0;

  function frame(now: number): void {
    if (!canvas.isConnected) return; // panel swapped away; stop silently
    const dt = Math.min((now - last) / 1000, MAX_DT);
    last = now;

    const env = { agents, rng, params: PARAMS };
    const force = BEHAVIOURS[behaviour];
    for (const a of agents) {
      const [fx, fy] = force(a, env);
      step(a, fx, fy, PARAMS, bounds, dt);
    }
    draw(ctx, agents, bounds, color);

    // FR-14: fps is sampled at 1 Hz from real frame counts.
    frames += 1;
    const elapsed = now - windowStart;
    if (elapsed >= 1000) {
      const fps = Math.round((frames * 1000) / elapsed);
      frames = 0;
      windowStart = now;
      color = signalColor(canvas); // track theme changes cheaply
      onReadout({ count: agents.length, behaviour, fps });
    }
    rafId = requestAnimationFrame(frame);
  }
  rafId = requestAnimationFrame(frame);

  // rAF already pauses while hidden; reset timers on return so neither
  // physics nor the fps sample sees the gap.
  const onVisible = (): void => {
    if (!document.hidden) {
      last = performance.now();
      windowStart = last;
      frames = 0;
    }
  };
  document.addEventListener('visibilitychange', onVisible);

  return () => {
    cancelAnimationFrame(rafId);
    observer.disconnect();
    document.removeEventListener('visibilitychange', onVisible);
  };
}
