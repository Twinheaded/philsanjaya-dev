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
  limit,
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
  /** Debug overlay on — the readout appends ` · debug` (FR-15). */
  debug: boolean;
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
  /** Start hidden + paused until setActive(true). NOTE: the chaptered case
   *  study that used this (align behind its architecture chapter) retired in
   *  M6 — `align` currently has no consumer; kept, with its tested maths, for
   *  a §11/M8 decision. */
  startActive?: boolean;
  /** Element id of a debug toggle button (kept in sync via aria-pressed, FR-15). */
  debugButtonId?: string;
  /**
   * Wire cursor/tap/debug listeners. Pass false for a decorative island with
   * no debug affordance — the global listeners would only do dormant work
   * (M4 review).
   */
  interactive?: boolean;
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

// §12: the field reads as graphite on the desk — --ink at low alpha. Ink is far
// darker than the accent this replaced, so the alpha drops to match.
const OPACITY = 0.22; // default active state
const REDUCED_OPACITY = 0.14; // reduced-motion static frame
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

/**
 * §12: agent trails are graphite — --ink at low alpha — not the copper accent.
 * The desk must read as organised pencil work, never as a coloured effect.
 */
function graphiteColor(canvas: HTMLCanvasElement): string {
  return getComputedStyle(canvas).getPropertyValue('--ink').trim() || '#232323';
}

function debugColor(canvas: HTMLCanvasElement): string {
  // §9.2: amber appears *only* in the debug overlay.
  return getComputedStyle(canvas).getPropertyValue('--debug').trim() || '#c97e12';
}

/**
 * Debug overlay (FR-15): the classic Reynolds visualisation — each agent's
 * velocity vector, its steering-force vector, and (for wander) the wander
 * circle projected ahead with the target point on its rim. Drawn at 1px in
 * instrument amber, full opacity. `forces` holds the [fx, fy] applied this
 * frame, indexed 2·i.
 */
function drawDebug(
  ctx: CanvasRenderingContext2D,
  agents: Agent[],
  forces: number[],
  showWanderCircle: boolean,
  color: string
): void {
  ctx.globalAlpha = 1;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1;
  for (let i = 0; i < agents.length; i++) {
    const a = agents[i];
    // Velocity vector (actual heading and speed, scaled to be legible).
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(a.x + a.vx * 0.5, a.y + a.vy * 0.5);
    ctx.stroke();
    // Steering force vector applied this frame (skip until the stash is
    // populated — the very first immediate redraw on toggle-on has none yet).
    const fx = forces[i * 2];
    const fy = forces[i * 2 + 1];
    if (Number.isFinite(fx) && Number.isFinite(fy)) {
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(a.x + fx * 0.6, a.y + fy * 0.6);
      ctx.stroke();
    }
    if (showWanderCircle) {
      const heading = Math.atan2(a.vy, a.vx);
      const cx = a.x + Math.cos(heading) * PARAMS.circleDistance;
      const cy = a.y + Math.sin(heading) * PARAMS.circleDistance;
      ctx.beginPath();
      ctx.arc(cx, cy, PARAMS.circleRadius, 0, Math.PI * 2);
      ctx.stroke();
      const tx = cx + Math.cos(heading + a.wanderAngle) * PARAMS.circleRadius;
      const ty = cy + Math.sin(heading + a.wanderAngle) * PARAMS.circleRadius;
      ctx.beginPath();
      ctx.arc(tx, ty, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
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
  // §10: the static reduced-motion frame dims to 0.35 (capped, so the already
  // fainter align island stays at 0.25 rather than brightening).
  const renderOpacity = reduced ? Math.min(targetOpacity, REDUCED_OPACITY) : targetOpacity;
  const interactive = options.interactive !== false;
  let agents: Agent[] = [];
  let color = graphiteColor(canvas);
  let rafId = 0;
  let running = false;

  // Active-state fade (FR-12): `weight` lerps toward `target` over ~1s.
  let target = options.startActive === false ? 0 : 1;
  let weight = target; // start settled so the first frame is correct

  // Pointer/tap repulsion state (FR-13). Disabled entirely under reduced motion.
  let pointer: { x: number; y: number } | null = null;
  let tap: { x: number; y: number; t: number } | null = null;

  // Debug overlay state (FR-15/16). Off by default; no cost when off.
  let debug = false;
  let dColor = debugColor(canvas);
  const dForce: number[] = [];
  const showWanderCircle = behaviour === 'wander' && !options.fleeFromCenter;
  const debugButton = options.debugButtonId
    ? document.getElementById(options.debugButtonId)
    : null;

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
    draw(ctx, agents, bounds, color, renderOpacity * weight);
  });
  observer.observe(canvas);
  resize();

  // ---- Reduced motion: one static frame, no loop, no interaction (FR-17).
  // The debug overlay is a motion/interaction feature, so it stays off here.
  if (reduced) {
    const render = (): void => draw(ctx, agents, bounds, color, renderOpacity * weight);
    render();
    onReadout({ count: agents.length, behaviour, fps: null, debug: false });
    const themeObserver = new MutationObserver(() => {
      color = graphiteColor(canvas);
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
  let lastFps: number | null = null;
  const emitReadout = (): void =>
    onReadout({ count: agents.length, behaviour, fps: lastFps, debug });
  emitReadout();

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
      // Re-clamp the blend so it keeps the maxForce invariant the rest of
      // the loop relies on.
      return limit(ax + wx * 0.2, ay + wy * 0.2, PARAMS.maxForce);
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

    for (let i = 0; i < agents.length; i++) {
      const a = agents[i];
      let [fx, fy] = baseForce(a);
      const r = repel(a, now);
      if (r.s > 0) {
        const [px, py] = fleeForce(a, r.x, r.y, PARAMS);
        fx = fx * (1 - r.s) + px * r.s;
        fy = fy * (1 - r.s) + py * r.s;
      }
      if (debug) {
        dForce[i * 2] = fx;
        dForce[i * 2 + 1] = fy;
      }
      step(a, fx, fy, PARAMS, bounds, dt);
    }
    draw(ctx, agents, bounds, color, renderOpacity * weight);
    // FR-15/16: the overlay only runs when on, so it costs nothing off.
    if (debug && weight > 0) drawDebug(ctx, agents, dForce, showWanderCircle, dColor);

    frames += 1;
    const elapsed = now - windowStart;
    if (elapsed >= 1000) {
      lastFps = Math.round((frames * 1000) / elapsed);
      frames = 0;
      windowStart = now;
      color = graphiteColor(canvas);
      if (debug) dColor = debugColor(canvas);
      emitReadout();
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
  // Debug toggle (FR-15): `d` key or the adjacent button. State is mirrored
  // on the button's aria-pressed and reflected in the readout immediately.
  function toggleDebug(): void {
    debug = !debug;
    dColor = debugColor(canvas);
    debugButton?.setAttribute('aria-pressed', String(debug));
    emitReadout();
    // Redraw at once so the overlay appears/clears even between fps samples.
    draw(ctx, agents, bounds, color, renderOpacity * weight);
    if (debug && weight > 0) drawDebug(ctx, agents, dForce, showWanderCircle, dColor);
  }

  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key !== 'd' && e.key !== 'D') return;
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    toggleDebug();
  };
  const onButtonClick = (): void => toggleDebug();

  // The case-study align island opts out (interactive: false): no cursor
  // flee, no tap, no debug toggle — it sits behind prose with no affordance.
  if (interactive) {
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerleave', onPointerLeave, { passive: true });
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('keydown', onKeyDown);
    debugButton?.addEventListener('click', onButtonClick);
  }

  return {
    destroy() {
      cancelAnimationFrame(rafId);
      running = false;
      observer.disconnect();
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerleave', onPointerLeave);
      window.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('keydown', onKeyDown);
      debugButton?.removeEventListener('click', onButtonClick);
    },
    setActive(active: boolean) {
      target = active ? 1 : 0;
      if (active) startLoop();
    },
  };
}
