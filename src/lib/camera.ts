/**
 * The camera store (§3, §7.2) — the single source of truth for the desk view.
 *
 * One reactive `{ x, y, zoom }` in desk units. Every animation frame derives the
 * DOM-plane transform (and, from M5, the WebGL camera) from it. This module is
 * pure and DOM-free so the maths is unit-tested in isolation (M3 note 6): time
 * is injected, never read from `performance.now()`. The client controller
 * (`desk-nav.ts`) drives `tick()` from rAF and writes the pose to CSS vars.
 *
 * Interruption policy is retarget-not-queue (§7 global law): a new target mid
 * tween restarts the tween from the *live interpolated* pose, so nav/popstate
 * spam produces one clean move from wherever the camera currently is.
 */

export interface Pose {
  x: number;
  y: number;
  zoom: number;
}

/**
 * SLIDE duration (§7.2): `clamp(450, 300 + 0.12·d, 800)` ms, where d is the
 * desk-space translation distance. Zoom-only moves have d = 0 and therefore sit
 * at the 450 ms floor (M3 note 4).
 */
export function slideDuration(from: Pose, to: Pose): number {
  const d = Math.hypot(to.x - from.x, to.y - from.y);
  return Math.min(800, Math.max(450, 300 + 0.12 * d));
}

/**
 * A cubic-bezier easing evaluator: returns f(x) = y for the curve with control
 * points (0,0), (p1x,p1y), (p2x,p2y), (1,1). x is solved for the parameter t by
 * Newton-Raphson with a bisection fallback, then y(t) is returned — the same
 * method browsers use for `cubic-bezier()`.
 */
export function cubicBezier(
  p1x: number,
  p1y: number,
  p2x: number,
  p2y: number
): (x: number) => number {
  const cx = 3 * p1x;
  const bx = 3 * (p2x - p1x) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * p1y;
  const by = 3 * (p2y - p1y) - cy;
  const ay = 1 - cy - by;

  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t: number) => ((ay * t + by) * t + cy) * t;
  const slopeX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;

  const solveT = (x: number): number => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const err = sampleX(t) - x;
      if (Math.abs(err) < 1e-6) return t;
      const d = slopeX(t);
      if (Math.abs(d) < 1e-6) break;
      t -= err / d;
    }
    // Bisection fallback for the rare flat-slope case.
    let lo = 0;
    let hi = 1;
    t = x;
    while (lo < hi) {
      const xt = sampleX(t);
      if (Math.abs(xt - x) < 1e-6) break;
      if (x > xt) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
    }
    return t;
  };

  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    return sampleY(solveT(x));
  };
}

/** `--ease-physical` (§5): symmetric, no overshoot — Slide and Fold. */
export const easePhysical = cubicBezier(0.65, 0, 0.35, 1);

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export interface CameraStoreOptions {
  /** Skip all tweening — every move is an instant cut (reduced motion, §7). */
  reduced?: boolean;
  easing?: (x: number) => number;
  /** Duration policy; overridable for tests. */
  duration?: (from: Pose, to: Pose) => number;
}

/**
 * The store. `current` is the live pose; `slideTo(target, now)` starts (or
 * retargets) a tween; `tick(now)` advances it and returns whether it is still
 * animating. No rAF, no DOM, no wall-clock — the caller owns all three.
 */
export class CameraStore {
  current: Pose;

  private from: Pose;
  private to: Pose;
  private startedAt = 0;
  private durationMs = 0;
  private animating = false;

  private readonly reduced: boolean;
  private readonly easing: (x: number) => number;
  private readonly durationOf: (from: Pose, to: Pose) => number;

  constructor(initial: Pose, opts: CameraStoreOptions = {}) {
    this.current = { ...initial };
    this.from = { ...initial };
    this.to = { ...initial };
    this.reduced = opts.reduced ?? false;
    this.easing = opts.easing ?? easePhysical;
    this.durationOf = opts.duration ?? slideDuration;
  }

  get isAnimating(): boolean {
    return this.animating;
  }

  /** The target the camera is currently moving toward (or resting at). */
  get target(): Pose {
    return { ...this.to };
  }

  /** Instantly cut to a pose — reduced motion, boot adoption, or hard reset. */
  snap(target: Pose): void {
    this.current = { ...target };
    this.from = { ...target };
    this.to = { ...target };
    this.animating = false;
  }

  /**
   * Move toward `target`. Retargets from the *live* current pose (§7), so a call
   * mid-tween continues seamlessly from wherever the camera is now. Under
   * reduced motion it is an instant cut. A target equal to the current pose is a
   * no-op (no zero-length tween churn).
   */
  slideTo(target: Pose, now: number): void {
    if (this.reduced) {
      this.snap(target);
      return;
    }
    if (samePose(target, this.current)) {
      this.to = { ...target };
      this.animating = false;
      return;
    }
    this.from = { ...this.current };
    this.to = { ...target };
    this.startedAt = now;
    this.durationMs = this.durationOf(this.from, this.to);
    this.animating = true;
  }

  /**
   * Advance to time `now`. Returns true while still animating. Idempotent once
   * settled, so the caller can stop its rAF loop when this returns false.
   */
  tick(now: number): boolean {
    if (!this.animating) return false;
    const elapsed = now - this.startedAt;
    if (elapsed >= this.durationMs || this.durationMs <= 0) {
      this.current = { ...this.to };
      this.animating = false;
      return false;
    }
    const eased = this.easing(elapsed / this.durationMs);
    this.current = {
      x: lerp(this.from.x, this.to.x, eased),
      y: lerp(this.from.y, this.to.y, eased),
      zoom: lerp(this.from.zoom, this.to.zoom, eased),
    };
    return true;
  }
}

function samePose(a: Pose, b: Pose): boolean {
  return a.x === b.x && a.y === b.y && a.zoom === b.zoom;
}
