/**
 * Agent island engine (FR-10..FR-13): canvas lifecycle, DPR-aware sizing,
 * the animation loop, the route-keyed behaviour FSM, cursor/touch
 * interaction, and live measurement for the readout. Rendering and the
 * physics integration stay separate from the pure behaviour maths in
 * behaviours.ts.
 */

import {
  alignForce,
  fleeForce,
  mulberry32,
  step,
  wanderForce,
  type Agent,
  type Bounds,
  type WanderParams,
} from './behaviours';

export type Behaviour = 'wander' | 'align' | 'flee';

export interface ReadoutData {
  count: number;
  behaviour: Behaviour;
  /** Frames per second sampled over the last ~1s window; null until measured. */
  fps: number | null;
}

export interface IslandOptions {
  /** Base steering behaviour for this route (§10). Defaults to wander. */
  behaviour?: Behaviour;
  /** Render opacity for the active state; defaults per §10 (0.55 / align 0.25). */
  opacity?: number;
  /** Agent count range [min, max]; defaults [18, 24], align uses [10, 12]. */
  count?: [number, number];
  /** 404 state: agents flee continuously from the screen centre. */
  fleeFromCenter?: boolean;
  /** Start hidden + paused; the case study activates align on its architecture chapter. */
  startActive?: boolean;
}

export interface IslandController {
  /** Tear down: stop the loop and remove all listeners/observers. */
  destroy(): void;
  /** Fade the field in/out over ~1s (FR-12); pauses the loop when fully hidden. */
  setActive(active: boolean): void;
}

/** Production steering parameters — exported so the unit tests pin the shipped values. */
export const PARAMS: WanderParams = {
  circleDistance: 60,
  circleRadius: 24,
  jitter: 0.25,
  maxSpeed: 38,
  maxForce: 30,
};

const OPACITY = 0.55; // §10: default active state
const REDUCED_OPACITY = 0.35; // §10: reduced-motion static frame
export const MARGIN = 16;
const MAX_DT = 0.05; // clamp integration after tab-hidden gaps

const ALIGN_RADIUS = 90; // neighbourhood for heading averaging
const CURSOR_RADIUS = 80; // FR-13: agents flee within ~80px of the pointer (desktop)
const TAP_RADIUS = 140; // touch tap impulse reach
const TAP_DURATION = 0.6; // seconds the one-shot tap impulse lasts
const BLEND = 1.0; // seconds for the active fade (FR-12, ~1s)

function makeAgents(
  width: number,
  height: number,
  rng: () => number,
  min: number,
  max: number
): Agent[] {
  // Count scales with stage area, clamped to the §10 range for this state.
  const count = Math.min(max, Math.max(min, Math.round((width * height) / 55_000)));
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
  color: string,
  alpha: number
): void {
  ctx.clearRect(0, 0, bounds.width, bounds.height);
  if (alpha <= 0) return;
  ctx.globalAlpha = alpha;
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
 * Mount the island on a canvas. Returns a controller. Under
 * prefers-reduced-motion a single static frame is drawn at the dimmed
 * §10 opacity and no loop runs (FR-17); cursor/tap interaction is off.
 */
export function mountAgents(
  canvas: HTMLCanvasElement,
  onReadout: (data: ReadoutData) => void,
  options: IslandOptions = {}
): IslandController {
  const context = canvas.getContext('2d');
  if (!context) return { destroy() {}, setActive() {} };
  // Re-bind with the narrowed type: narrowing does not flow into the
  // hoisted closures below.
  const ctx: CanvasRenderingContext2D = context;

  const behaviour: Behaviour = options.behaviour ?? 'wander';
  const targetOpacity = options.opacity ?? OPACITY;
  const [minCount, maxCount] = options.count ?? [18, 24];

  const rng = mulberry32((performance.timeOrigin + performance.now()) >>> 0);
  const bounds: Bounds = { width: 0, height: 0, margin: MARGIN };
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let agents: Agent[] = [];
  let color = signalColor(canvas);
  let rafId = 0;
  let running = false;

  // Active-state fade (FR-12): `weight` lerps toward `target` over ~1s.
  let target = options.startActive === false ? 0 : 1;
  let weight = target; // start settled so the first frame is correct

  // Pointer/tap repulsion state (FR-13). Disabled entirely under reduced motion.
  let pointer: { x: number; y: number } | null = null;
  let tap: { x: number; y: number; t: number } | null = null;

  function resize(): void {
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return; // hidden/unlaid-out: keep prior state
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    bounds.width = rect.width;
    bounds.height = rect.height;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (agents.length === 0) agents = makeAgents(bounds.width, bounds.height, rng, minCount, maxCount);
  }

  const observer = new ResizeObserver(() => {
    resize();
    draw(ctx, agents, bounds, color, targetOpacity * weight);
  });
  observer.observe(canvas);
  resize();

  // ---- Reduced motion: one static frame, no loop, no interaction (FR-17).
  if (reduced) {
    const render = (): void => draw(ctx, agents, bounds, color, targetOpacity * weight);
    render();
    onReadout({ count: agents.length, behaviour, fps: null });
    const themeObserver = new MutationObserver(() => {
      color = signalColor(canvas);
      render();
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return {
      destroy() {
        observer.disconnect();
        themeObserver.disconnect();
      },
      setActive(active: boolean) {
        weight = active ? 1 : 0;
        target = weight;
        render();
      },
    };
  }

  // ---- Animated path.
  onReadout({ count: agents.length, behaviour, fps: null });

  let last = performance.now();
  let windowStart = last;
  let frames = 0;

  /** The agent's base steering force for this route's behaviour. */
  function baseForce(a: Agent): [number, number] {
    if (behaviour === 'flee' || options.fleeFromCenter) {
      return fleeForce(a, bounds.width / 2, bounds.height / 2, PARAMS);
    }
    if (behaviour === 'align') {
      const [ax, ay] = alignForce(a, agents, PARAMS, ALIGN_RADIUS);
      const [wx, wy] = wanderForce(a, PARAMS, rng); // keeps lone agents drifting
      if (ax === 0 && ay === 0) return [wx, wy];
      return [ax + wx * 0.2, ay + wy * 0.2];
    }
    return wanderForce(a, PARAMS, rng);
  }

  /** Repulsion strength + origin from pointer/tap for this agent (0 = none). */
  function repel(a: Agent, now: number): { s: number; x: number; y: number } {
    let s = 0;
    let x = 0;
    let y = 0;
    if (pointer) {
      const d = Math.hypot(a.x - pointer.x, a.y - pointer.y);
      if (d < CURSOR_RADIUS) {
        s = 1 - d / CURSOR_RADIUS;
        x = pointer.x;
        y = pointer.y;
      }
    }
    if (tap) {
      const age = (now - tap.t) / 1000;
      if (age < TAP_DURATION) {
        const d = Math.hypot(a.x - tap.x, a.y - tap.y);
        if (d < TAP_RADIUS) {
          const ts = (1 - d / TAP_RADIUS) * (1 - age / TAP_DURATION);
          if (ts > s) {
            s = ts;
            x = tap.x;
            y = tap.y;
          }
        }
      }
    }
    return { s, x, y };
  }

  function frame(now: number): void {
    if (!canvas.isConnected) {
      running = false;
      return; // panel swapped away; stop silently
    }
    const dt = Math.min((now - last) / 1000, MAX_DT);
    last = now;

    // Ease the active weight toward its target (FR-12 ~1s fade).
    if (weight !== target) {
      const stepw = dt / BLEND;
      weight = target > weight ? Math.min(target, weight + stepw) : Math.max(target, weight - stepw);
    }

    for (const a of agents) {
      let [fx, fy] = baseForce(a);
      const r = repel(a, now);
      if (r.s > 0) {
        const [px, py] = fleeForce(a, r.x, r.y, PARAMS);
        fx = fx * (1 - r.s) + px * r.s;
        fy = fy * (1 - r.s) + py * r.s;
      }
      step(a, fx, fy, PARAMS, bounds, dt);
    }
    draw(ctx, agents, bounds, color, targetOpacity * weight);

    frames += 1;
    const elapsed = now - windowStart;
    if (elapsed >= 1000) {
      const fps = Math.round((frames * 1000) / elapsed);
      frames = 0;
      windowStart = now;
      color = signalColor(canvas);
      onReadout({ count: agents.length, behaviour, fps });
    }

    // Fully faded out and not coming back: stop to cost no fps (FR-16 spirit).
    if (target === 0 && weight <= 0) {
      running = false;
      draw(ctx, agents, bounds, color, 0);
      return;
    }
    rafId = requestAnimationFrame(frame);
  }

  function startLoop(): void {
    if (running) return;
    running = true;
    last = performance.now();
    windowStart = last;
    frames = 0;
    rafId = requestAnimationFrame(frame);
  }

  if (target > 0) startLoop();

  // rAF already pauses while hidden; reset timers on return so neither
  // physics nor the fps sample sees the gap.
  const onVisible = (): void => {
    if (!document.hidden && running) {
      last = performance.now();
      windowStart = last;
      frames = 0;
    }
  };
  document.addEventListener('visibilitychange', onVisible);

  // Cursor flee (desktop, fine pointer only): FR-13.
  const onPointerMove = (e: PointerEvent): void => {
    if (e.pointerType === 'touch') return;
    const rect = canvas.getBoundingClientRect();
    pointer = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };
  const onPointerLeave = (): void => {
    pointer = null;
  };
  // Touch tap → one-shot flee impulse from the tap point.
  const onTouchStart = (e: TouchEvent): void => {
    const t = e.touches?.[0];
    if (!t) return;
    const rect = canvas.getBoundingClientRect();
    tap = { x: t.clientX - rect.left, y: t.clientY - rect.top, t: performance.now() };
  };
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  window.addEventListener('pointerleave', onPointerLeave, { passive: true });
  window.addEventListener('touchstart', onTouchStart, { passive: true });

  return {
    destroy() {
      cancelAnimationFrame(rafId);
      running = false;
      observer.disconnect();
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerleave', onPointerLeave);
      window.removeEventListener('touchstart', onTouchStart);
    },
    setActive(active: boolean) {
      target = active ? 1 : 0;
      if (active) startLoop();
    },
  };
}
