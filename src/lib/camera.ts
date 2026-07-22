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

/** One leg of a camera sequence: tween to `pose`, then hold `settle` ms before
 *  the next leg. The last leg's `settle` is ignored. */
export interface Step {
  pose: Pose;
  settle: number;
}

/**
 * The store. `current` is the live pose. `slideTo(target, now)` runs a single
 * tween; `sequenceTo(steps, now)` runs a multi-beat plan with settle holds (the
 * two-beat cross-zone unfold, §7.3). `tick(now)` advances and returns whether it
 * is still animating. Interruption is retarget-not-queue at *every* phase —
 * travelling or settling — so nav/Esc/Back spam never sticks (M4-tune note 6).
 * No rAF, no DOM, no wall-clock — the caller owns all three.
 */
export class CameraStore {
  current: Pose;

  private from: Pose;
  private to: Pose;
  private startedAt = 0;
  private durationMs = 0;
  private animating = false;

  // Sequence state.
  private plan: Step[] = [];
  private step = -1;
  private holding = false;
  private holdUntil = 0;
  private finalPose: Pose;

  private readonly reduced: boolean;
  private readonly easing: (x: number) => number;
  private readonly durationOf: (from: Pose, to: Pose) => number;

  constructor(initial: Pose, opts: CameraStoreOptions = {}) {
    this.current = { ...initial };
    this.from = { ...initial };
    this.to = { ...initial };
    this.finalPose = { ...initial };
    this.reduced = opts.reduced ?? false;
    this.easing = opts.easing ?? easePhysical;
    this.durationOf = opts.duration ?? slideDuration;
  }

  get isAnimating(): boolean {
    return this.animating;
  }

  /** The final pose of the current plan (or the resting pose). */
  get target(): Pose {
    return { ...this.finalPose };
  }

  /** Zero-based index of the leg currently running, or -1 when idle. */
  get stepIndex(): number {
    return this.step;
  }

  /** Legs in the active plan (0 when idle). */
  get stepCount(): number {
    return this.plan.length;
  }

  /** True while the camera is holding at a settle point between legs. */
  get isSettling(): boolean {
    return this.holding;
  }

  /**
   * Raw (un-eased) time progress [0,1] of the leg in flight at `now` — the phase
   * clock for progress-driven choreography (the §7.3 reveal is a pure function
   * of this). 1 when idle, when holding at a settle, or for a zero-duration leg.
   */
  progressAt(now: number): number {
    if (!this.animating || this.holding || this.durationMs <= 0) return 1;
    return Math.min(1, Math.max(0, (now - this.startedAt) / this.durationMs));
  }

  /** Instantly cut to a pose — reduced motion, boot adoption, or hard reset. */
  snap(target: Pose): void {
    this.current = { ...target };
    this.from = { ...target };
    this.to = { ...target };
    this.finalPose = { ...target };
    this.animating = false;
    this.plan = [];
    this.step = -1;
    this.holding = false;
  }

  /**
   * Move toward `target` in one tween. Retargets from the *live* current pose,
   * so a call mid-move continues from wherever the camera is now. Reduced motion
   * cuts instantly; a target equal to the current pose is a no-op.
   */
  slideTo(target: Pose, now: number): void {
    this.sequenceTo([{ pose: target, settle: 0 }], now);
  }

  /**
   * Run a multi-beat plan: tween to each leg's pose in turn, holding `settle` ms
   * between legs. Reduced motion cuts straight to the final pose (one cut, never
   * two — note 7). A single-leg plan whose pose equals the current pose is a
   * no-op. Retargets from the live pose, clearing any plan in flight.
   */
  sequenceTo(steps: Step[], now: number): void {
    if (steps.length === 0) return;
    const last = steps[steps.length - 1].pose;
    if (this.reduced) {
      this.snap(last);
      return;
    }
    if (steps.length === 1 && samePose(steps[0].pose, this.current)) {
      this.snap(steps[0].pose);
      return;
    }
    this.plan = steps.map((s) => ({ pose: { ...s.pose }, settle: s.settle }));
    this.finalPose = { ...last };
    this.beginStep(0, now);
  }

  private beginStep(i: number, now: number): void {
    this.step = i;
    this.holding = false;
    this.from = { ...this.current };
    this.to = { ...this.plan[i].pose };
    this.startedAt = now;
    this.durationMs = samePose(this.from, this.to) ? 0 : this.durationOf(this.from, this.to);
    this.animating = true;
  }

  /**
   * Advance to time `now`. Returns true while still animating (including during a
   * settle hold), false once the whole plan is done.
   */
  tick(now: number): boolean {
    if (!this.animating) return false;

    if (this.holding) {
      if (now < this.holdUntil) return true;
      this.beginStep(this.step + 1, now);
      return this.tick(now); // start the next leg at the same instant
    }

    const elapsed = now - this.startedAt;
    if (this.durationMs <= 0 || elapsed >= this.durationMs) {
      this.current = { ...this.to };
      const hasNext = this.step < this.plan.length - 1;
      if (hasNext) {
        const settle = this.plan[this.step].settle;
        if (settle > 0) {
          this.holding = true;
          this.holdUntil = now + settle;
          return true;
        }
        this.beginStep(this.step + 1, now);
        return this.tick(now);
      }
      this.animating = false;
      this.plan = [];
      this.step = -1;
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
