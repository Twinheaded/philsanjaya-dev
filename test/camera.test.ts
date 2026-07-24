/**
 * Camera store maths (M3, PHI-64). Per note 6, the math is verified here — end
 * states, durations, easing and retarget-from-live — while motion *feel* is
 * Phil's in a real browser (the preview pane runs hidden, so rAF never ticks).
 * Time is injected, so every tween is deterministic without a clock.
 */

import { describe, expect, it } from 'vitest';
import {
  CameraStore,
  cubicBezier,
  easePhysical,
  slideDuration,
  type Pose,
} from '../src/lib/camera';

const HOME: Pose = { x: 0, y: 0, zoom: 1 };
const EXPERIMENTS: Pose = { x: 1800, y: 0, zoom: 0.9 };
const NOTES: Pose = { x: 0, y: 1400, zoom: 0.95 };

describe('slideDuration (§7.2)', () => {
  it('is the 450ms floor for a zoom-only move (d=0, note 4)', () => {
    expect(slideDuration(HOME, { x: 0, y: 0, zoom: 1.45 })).toBe(450);
  });

  it('is the floor whenever 300 + 0.12d < 450 (d < 1250)', () => {
    expect(slideDuration(HOME, { x: 1000, y: 0, zoom: 1 })).toBe(450);
  });

  it('scales with distance in the mid-range', () => {
    // d = 1800 -> 300 + 216 = 516
    expect(slideDuration(HOME, EXPERIMENTS)).toBeCloseTo(516, 5);
  });

  it('clamps to the 800ms ceiling for very long moves', () => {
    expect(slideDuration(HOME, { x: 5000, y: 0, zoom: 1 })).toBe(800);
  });

  it('uses euclidean x/y distance, ignoring zoom', () => {
    const a = slideDuration(HOME, { x: 300, y: 400, zoom: 1 }); // d = 500
    expect(a).toBe(450); // 300 + 60 = 360 -> floor
  });
});

describe('cubicBezier easing', () => {
  it('pins the endpoints', () => {
    expect(easePhysical(0)).toBe(0);
    expect(easePhysical(1)).toBe(1);
    expect(easePhysical(-0.5)).toBe(0);
    expect(easePhysical(2)).toBe(1);
  });

  it('is symmetric about the midpoint for a symmetric curve', () => {
    // cubic-bezier(0.65,0,0.35,1) is point-symmetric: f(0.5)=0.5, f(x)+f(1-x)=1.
    expect(easePhysical(0.5)).toBeCloseTo(0.5, 3);
    expect(easePhysical(0.25) + easePhysical(0.75)).toBeCloseTo(1, 3);
  });

  it('never overshoots [0,1] (no bounce, §7)', () => {
    for (let x = 0; x <= 1; x += 0.01) {
      const y = easePhysical(x);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(1);
    }
  });

  it('linear identity: cubic-bezier(1/3,1/3,2/3,2/3) ~ y=x', () => {
    const linear = cubicBezier(1 / 3, 1 / 3, 2 / 3, 2 / 3);
    expect(linear(0.42)).toBeCloseTo(0.42, 4);
  });
});

describe('CameraStore tween', () => {
  it('starts settled at the initial pose', () => {
    const c = new CameraStore(HOME);
    expect(c.isAnimating).toBe(false);
    expect(c.current).toEqual(HOME);
    expect(c.tick(1000)).toBe(false);
  });

  it('reaches the exact target pose at the end of the tween', () => {
    const c = new CameraStore(HOME);
    c.slideTo(EXPERIMENTS, 0);
    const dur = slideDuration(HOME, EXPERIMENTS);
    expect(c.tick(dur / 2)).toBe(true); // mid-flight, still animating
    expect(c.tick(dur)).toBe(false); // settled exactly at duration
    expect(c.current).toEqual(EXPERIMENTS);
    expect(c.isAnimating).toBe(false);
  });

  it('holds the exact end pose after overshooting the duration', () => {
    const c = new CameraStore(HOME);
    c.slideTo(NOTES, 0);
    c.tick(10_000);
    expect(c.current).toEqual(NOTES);
  });

  it('interpolates monotonically between endpoints while animating', () => {
    const c = new CameraStore(HOME);
    c.slideTo(EXPERIMENTS, 0);
    const dur = slideDuration(HOME, EXPERIMENTS);
    let prevX = -Infinity;
    for (let t = 0; t <= dur; t += dur / 20) {
      c.tick(t);
      expect(c.current.x).toBeGreaterThanOrEqual(prevX - 1e-9);
      expect(c.current.x).toBeGreaterThanOrEqual(0);
      expect(c.current.x).toBeLessThanOrEqual(EXPERIMENTS.x);
      prevX = c.current.x;
    }
  });

  it('retargets from the live interpolated pose, not the old origin (§7)', () => {
    const c = new CameraStore(HOME);
    c.slideTo(EXPERIMENTS, 0);
    const dur1 = slideDuration(HOME, EXPERIMENTS);
    c.tick(dur1 / 2);
    const live = { ...c.current };
    expect(live.x).toBeGreaterThan(0);
    expect(live.x).toBeLessThan(EXPERIMENTS.x);

    // New nav mid-tween: retarget to NOTES from `live`, not from HOME.
    c.slideTo(NOTES, dur1 / 2);
    // The instant after retargeting, the pose is unchanged from `live`
    // (from === live), so there is no jump.
    c.tick(dur1 / 2);
    expect(c.current.x).toBeCloseTo(live.x, 6);
    expect(c.current.y).toBeCloseTo(live.y, 6);

    // And it lands cleanly on NOTES.
    const dur2 = slideDuration(live, NOTES);
    c.tick(dur1 / 2 + dur2);
    expect(c.current).toEqual(NOTES);
  });

  it('models popstate spam: repeated mid-tween retargets never jump and settle correctly', () => {
    const c = new CameraStore(HOME);
    let now = 0;
    const targets = [EXPERIMENTS, NOTES, HOME, EXPERIMENTS, HOME];
    for (const t of targets) {
      c.slideTo(t, now);
      const before = { ...c.current };
      c.tick(now); // tick at the same instant: no time elapsed -> no movement
      expect(c.current.x).toBeCloseTo(before.x, 9);
      now += 40; // partial advance before the next interrupt
      c.tick(now);
    }
    // Let the final move (to HOME) finish.
    c.tick(now + 1000);
    expect(c.current).toEqual(HOME);
    expect(c.isAnimating).toBe(false);
  });

  it('zoom-only move interpolates zoom over the 450ms floor', () => {
    const c = new CameraStore(HOME);
    const zoomed = { x: 0, y: 0, zoom: 1.45 };
    c.slideTo(zoomed, 0);
    expect(c.isAnimating).toBe(true);
    c.tick(225); // halfway through the 450ms floor
    expect(c.current.zoom).toBeGreaterThan(1);
    expect(c.current.zoom).toBeLessThan(1.45);
    c.tick(450);
    expect(c.current.zoom).toBe(1.45);
  });

  it('a target equal to the current pose does not start a tween', () => {
    const c = new CameraStore(EXPERIMENTS);
    c.slideTo({ ...EXPERIMENTS }, 0);
    expect(c.isAnimating).toBe(false);
    expect(c.current).toEqual(EXPERIMENTS);
  });

  it('reduced motion cuts instantly with no animation', () => {
    const c = new CameraStore(HOME, { reduced: true });
    c.slideTo(EXPERIMENTS, 0);
    expect(c.isAnimating).toBe(false);
    expect(c.current).toEqual(EXPERIMENTS);
    expect(c.tick(100)).toBe(false);
  });

  it('snap() adopts a pose as the settled state (boot / hard reset)', () => {
    const c = new CameraStore(HOME);
    c.snap(NOTES);
    expect(c.current).toEqual(NOTES);
    expect(c.target).toEqual(NOTES);
    expect(c.isAnimating).toBe(false);
  });
});

describe('CameraStore.sequenceTo — the two-beat plan (M4-tune)', () => {
  const DOC_EXP: Pose = { x: 1800, y: 0, zoom: 1.45 };
  const SETTLE = 150;
  const plan = [
    { pose: EXPERIMENTS, settle: SETTLE },
    { pose: DOC_EXP, settle: 0 },
  ];

  it('plays both legs and lands exactly on the final pose', () => {
    const c = new CameraStore(HOME);
    c.sequenceTo(plan, 0);
    expect(c.stepCount).toBe(2);
    expect(c.target).toEqual(DOC_EXP);
    // Tick as the rAF loop would — the settle hold is wall-clock, so it must be
    // traversed by ticks, not one giant jump.
    const beat1 = slideDuration(HOME, EXPERIMENTS);
    const beat2 = slideDuration(EXPERIMENTS, DOC_EXP);
    c.tick(beat1); // beat 1 done -> hold begins
    c.tick(beat1 + SETTLE); // hold released -> beat 2 begins
    expect(c.tick(beat1 + SETTLE + beat2)).toBe(false); // beat 2 done
    expect(c.current).toEqual(DOC_EXP);
    expect(c.isAnimating).toBe(false);
    expect(c.stepIndex).toBe(-1);
  });

  it('holds at the settle point between the beats', () => {
    const c = new CameraStore(HOME);
    c.sequenceTo(plan, 0);
    const beat1 = slideDuration(HOME, EXPERIMENTS);
    c.tick(beat1); // beat 1 just completed -> entering the hold
    expect(c.current).toEqual(EXPERIMENTS);
    expect(c.isSettling).toBe(true);
    // Still holding partway through the settle: pose does not move.
    c.tick(beat1 + SETTLE / 2);
    expect(c.current).toEqual(EXPERIMENTS);
    expect(c.isSettling).toBe(true);
    // After the settle, beat 2 begins.
    c.tick(beat1 + SETTLE + 1);
    expect(c.isSettling).toBe(false);
    expect(c.stepIndex).toBe(1);
  });

  it('interrupting BEAT 1 (travelling) retargets from the live pose', () => {
    const c = new CameraStore(HOME);
    c.sequenceTo(plan, 0);
    const beat1 = slideDuration(HOME, EXPERIMENTS);
    c.tick(beat1 / 2);
    const live = { ...c.current };
    expect(live.x).toBeGreaterThan(0);
    expect(live.x).toBeLessThan(EXPERIMENTS.x);
    // A number-key to Notes mid-travel.
    c.slideTo(NOTES, beat1 / 2);
    c.tick(beat1 / 2); // same instant: no jump
    expect(c.current.x).toBeCloseTo(live.x, 6);
    c.tick(beat1 / 2 + 2000);
    expect(c.current).toEqual(NOTES);
    expect(c.isAnimating).toBe(false);
  });

  it('interrupting the SETTLE hold retargets from the settled pose', () => {
    const c = new CameraStore(HOME);
    c.sequenceTo(plan, 0);
    const beat1 = slideDuration(HOME, EXPERIMENTS);
    c.tick(beat1 + SETTLE / 2); // mid-settle at EXPERIMENTS
    expect(c.isSettling).toBe(true);
    c.slideTo(HOME, beat1 + SETTLE / 2); // Back, mid-settle
    expect(c.isSettling).toBe(false);
    c.tick(beat1 + SETTLE / 2); // no jump
    expect(c.current).toEqual(EXPERIMENTS);
    c.tick(beat1 + SETTLE / 2 + 2000);
    expect(c.current).toEqual(HOME);
    expect(c.isAnimating).toBe(false);
  });

  it('spamming keys/Esc/Back across both phases still settles cleanly', () => {
    const c = new CameraStore(HOME);
    let now = 0;
    const seq = [plan, [{ pose: NOTES, settle: 0 }], plan, [{ pose: HOME, settle: 0 }]];
    for (const s of seq) {
      c.sequenceTo(s as never, now);
      const before = { ...c.current };
      c.tick(now); // same instant, no movement
      expect(c.current.x).toBeCloseTo(before.x, 9);
      now += 50;
      c.tick(now);
    }
    c.tick(now + 3000);
    expect(c.current).toEqual(HOME);
    expect(c.isAnimating).toBe(false);
  });

  it('reduced motion cuts straight to the final pose (one cut, never two — note 7)', () => {
    const c = new CameraStore(HOME, { reduced: true });
    c.sequenceTo(plan, 0);
    expect(c.isAnimating).toBe(false);
    expect(c.current).toEqual(DOC_EXP);
    expect(c.stepCount).toBe(0);
  });
});
