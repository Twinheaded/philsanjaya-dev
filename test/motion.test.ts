/**
 * The phase-locked reveal (FIX A, follow-up to PHI-65). The reveal is a pure
 * function of push progress — 0 until 60% of the push, 1 at its end — driven
 * from the same tween tick as the camera, in BOTH the same-zone unfold and
 * cross-zone Beat 2. These tests pin the mapping, the store's phase clock, the
 * flip point, and the phase ORDER of a full two-beat move via the debug trace.
 * Feel stays Phil's call in a real browser (note 6).
 */

import { describe, expect, it } from 'vitest';
import { CameraStore, type Pose } from '../src/lib/camera';
import { MotionTrace, type TraceRow } from '../src/lib/motion-trace';
import {
  beat2Gate,
  revealAmount,
  REVEAL_RAMP_MS,
  REVEAL_START,
  revealTick,
  SETTLE_MS,
} from '../src/lib/nav';

const HOME: Pose = { x: 0, y: 0, zoom: 1 };
const ZONE: Pose = { x: 1800, y: 0, zoom: 0.9 };
const DOC: Pose = { x: 1800, y: 0, zoom: 1.45 };

/** A store with a fixed 400ms leg duration so progress maths stay readable. */
const makeStore = () => new CameraStore(HOME, { duration: () => 400 });

describe('revealAmount — a pure function of push progress (§7.3)', () => {
  it('is 0 through the first 60% of the push', () => {
    expect(revealAmount(0)).toBe(0);
    expect(revealAmount(0.3)).toBe(0);
    expect(revealAmount(REVEAL_START)).toBe(0);
  });

  it('ramps linearly across the final 40%', () => {
    expect(revealAmount(0.7)).toBeCloseTo(0.25, 10);
    expect(revealAmount(0.8)).toBeCloseTo(0.5, 10);
    expect(revealAmount(0.9)).toBeCloseTo(0.75, 10);
  });

  it('completes exactly at the push end (and clamps beyond)', () => {
    expect(revealAmount(1)).toBe(1);
    expect(revealAmount(1.2)).toBe(1);
  });

  it('is monotonic — the document never un-reveals as the push advances', () => {
    let prev = -1;
    for (let p = 0; p <= 1.0001; p += 0.01) {
      const t = revealAmount(p);
      expect(t).toBeGreaterThanOrEqual(prev);
      prev = t;
    }
  });
});

describe('CameraStore.progressAt — the raw phase clock', () => {
  it('tracks raw elapsed/duration for the leg in flight', () => {
    const store = makeStore();
    store.slideTo(DOC, 0);
    expect(store.progressAt(0)).toBe(0);
    expect(store.progressAt(100)).toBeCloseTo(0.25, 10);
    expect(store.progressAt(240)).toBeCloseTo(0.6, 10);
    expect(store.progressAt(399)).toBeCloseTo(0.9975, 10);
  });

  it('is 1 when idle (a settled camera has fully "arrived")', () => {
    const store = makeStore();
    expect(store.progressAt(123)).toBe(1);
    store.slideTo(DOC, 0);
    store.tick(400); // completes
    expect(store.progressAt(400)).toBe(1);
  });

  it('is 1 while holding at a settle between legs', () => {
    const store = makeStore();
    store.sequenceTo(
      [
        { pose: ZONE, settle: 150 },
        { pose: DOC, settle: 0 },
      ],
      0
    );
    store.tick(400); // leg 1 done -> holding
    expect(store.isSettling).toBe(true);
    expect(store.progressAt(450)).toBe(1);
  });

  it('clamps to [0, 1] for times outside the leg', () => {
    const store = makeStore();
    store.slideTo(DOC, 100);
    expect(store.progressAt(50)).toBe(0);
    expect(store.progressAt(9999)).toBe(1);
  });
});

describe('the reveal flips only when push progress crosses 0.6', () => {
  it('composed with a live tween: zero before 60% of the duration, > 0 after', () => {
    const store = makeStore(); // 400ms push -> the flip is at t = 240ms
    store.slideTo(DOC, 0);
    for (let now = 0; now <= 240; now += 16) {
      store.tick(now);
      expect(revealAmount(store.progressAt(now))).toBe(0);
    }
    store.tick(250);
    expect(revealAmount(store.progressAt(250))).toBeGreaterThan(0);
    store.tick(400);
    expect(revealAmount(store.progressAt(400))).toBe(1);
  });

  it('a held camera (gate open, push not yet fired) contributes no reveal', () => {
    // Before the push starts the driver never reads progressAt (it returns for
    // an unfired gate) — but even the raw mapping at progress 0 is 0.
    expect(revealAmount(0)).toBe(0);
  });
});

describe('revealTick — the time-capped driven amount (late-swap catch-up)', () => {
  it('is a no-op for an on-time reveal: the cap tracks the push window', () => {
    // A 450ms push: the reveal window is its last 180ms. With begin at the 60%
    // crossing, msSinceBegin/180 equals the push mapping at every subsequent ms.
    for (let ms = 0; ms <= 180; ms += 15) {
      const p = 0.6 + (ms / 180) * 0.4;
      expect(revealTick(p, ms)).toBeCloseTo(revealAmount(p), 10);
    }
  });

  it('turns a late swap (push already done) into a full ramp, not a pop', () => {
    expect(revealTick(1, 0)).toBe(0);
    expect(revealTick(1, REVEAL_RAMP_MS / 2)).toBeCloseTo(0.5, 10);
    expect(revealTick(1, REVEAL_RAMP_MS)).toBe(1);
  });

  it('never runs ahead of the push (min of the two ramps)', () => {
    // Even with unlimited time, the reveal cannot exceed the push mapping.
    expect(revealTick(0.7, 10_000)).toBeCloseTo(revealAmount(0.7), 10);
    expect(revealTick(0.6, 10_000)).toBe(0);
  });

  it('is monotonic in both arguments', () => {
    let prev = -1;
    for (let i = 0; i <= 20; i++) {
      const t = revealTick(0.6 + (i / 20) * 0.4, (i / 20) * 200);
      expect(t).toBeGreaterThanOrEqual(prev);
      prev = t;
    }
  });
});

/** One frame of the sim's clock. */
const STEP = 16;
/** The §7.2 zoom-only push duration (the real reveal pushes are all zoom-only). */
const PUSH_MS = 450;

interface SimResult {
  phases: string[];
  /** Timestamp of a phase (first occurrence), or -1. */
  at(phase: string): number;
  rows: TraceRow[][];
}

/**
 * A re-enactment of the desk runtime's choreography using only the pure pieces
 * (CameraStore + beat2Gate + revealAmount/revealTick + MotionTrace). Mirrors
 * desk.ts's tick order — including the begin frame (t = 0) and the time-capped
 * ramp — so the assertions cover ORDER **and TIMING** (the reported bug class
 * was a timing bug within a correct order: the reveal ran in the first ~30% of
 * the push instead of the final 40%).
 */
function simulateTwoBeatOpen(swapAt: number): SimResult {
  const rows: TraceRow[][] = [];
  const trace = new MotionTrace(true, (r) => rows.push(r));
  const marks: Array<{ phase: string; at: number }> = [];
  const mark = (phase: string, at: number, detail?: string) => {
    trace.mark(phase, at, detail);
    marks.push({ phase, at });
  };
  const store = new CameraStore(HOME, { duration: () => PUSH_MS });

  let arrivedAt = -1;
  let swapDone = false;
  let fired = false;
  let revealBegun = false;
  let begunAt = 0;
  let revealDone = false;

  mark('nav:start', 0, '/ -> /projects/aegisx');
  mark('beat1:start', 0);
  store.slideTo(ZONE, 0);

  for (let now = STEP; now <= 3000; now += STEP) {
    const animating = store.tick(now);
    if (revealDone && !animating) break;
    if (!swapDone && now >= swapAt) swapDone = true; // astro:after-swap

    // tickTwoBeat (desk.ts order: after the store tick)
    if (!fired) {
      if (arrivedAt < 0) {
        if (!store.isAnimating) {
          arrivedAt = now;
          mark('beat1:arrive', now);
        }
      } else if (beat2Gate(arrivedAt, now, SETTLE_MS, swapDone)) {
        fired = true;
        mark('settle:end', arrivedAt + SETTLE_MS);
        mark('gate:open', now, swapAt <= arrivedAt + SETTLE_MS ? 'settle' : 'swap');
        mark('push:start', now);
        store.slideTo(DOC, now);
      }
    }

    // tickReveal (mirrors desk.ts: begin frame at t=0, then the capped ramp)
    if (fired && swapDone && !revealDone) {
      const p = store.progressAt(now);
      if (!revealBegun) {
        if (revealAmount(p) > 0) {
          revealBegun = true;
          begunAt = now;
          mark('reveal:start', now);
        }
      } else {
        const t = revealTick(p, now - begunAt);
        if (t >= 1) {
          revealDone = true;
          mark('reveal:end', now);
          if (!store.isAnimating) mark('settled', now);
        }
      }
    }
  }

  const phases = trace.phases;
  trace.flush();
  expect(rows).toHaveLength(1); // one table per completed move
  return {
    phases,
    at: (phase) => marks.find((m) => m.phase === phase)?.at ?? -1,
    rows,
  };
}

/**
 * The SAME-ZONE open: the push starts at nav (not at a gate), the reveal is
 * held until the swap lands. The late-swap case is where the review found the
 * single-frame pop — revealTick's cap must turn it into a full ramp.
 */
function simulateSameZoneOpen(swapAt: number): SimResult {
  const marks: Array<{ phase: string; at: number }> = [];
  const mark = (phase: string, at: number) => marks.push({ phase, at });
  const store = new CameraStore(ZONE, { duration: () => PUSH_MS });

  let swapDone = false;
  let revealBegun = false;
  let begunAt = 0;
  let revealDone = false;

  mark('nav:start', 0);
  mark('push:start', 0);
  store.slideTo(DOC, 0);

  for (let now = STEP; now <= 3000; now += STEP) {
    const animating = store.tick(now);
    if (revealDone && !animating) break;
    if (!swapDone && now >= swapAt) swapDone = true;

    if (swapDone && !revealDone) {
      const p = store.progressAt(now);
      if (!revealBegun) {
        if (revealAmount(p) > 0) {
          revealBegun = true;
          begunAt = now;
          mark('reveal:start', now);
        }
      } else {
        const t = revealTick(p, now - begunAt);
        if (t >= 1) {
          revealDone = true;
          mark('reveal:end', now);
        }
      }
    }
  }

  return {
    phases: marks.map((m) => m.phase),
    at: (phase) => marks.find((m) => m.phase === phase)?.at ?? -1,
    rows: [],
  };
}

describe('two-beat open phase order AND timing (trace-asserted, both gate orderings)', () => {
  const EXPECTED = [
    'nav:start',
    'beat1:start',
    'beat1:arrive',
    'settle:end',
    'gate:open',
    'push:start',
    'reveal:start',
    'reveal:end',
    'settled',
  ];

  it('fast fetch (swap during travel): settle releases the gate', () => {
    expect(simulateTwoBeatOpen(200).phases).toEqual(EXPECTED);
  });

  it('slow fetch (swap after settle): swap releases the gate', () => {
    expect(simulateTwoBeatOpen(900).phases).toEqual(EXPECTED);
  });

  it('TIMING: the reveal occupies the final 40% of the push, not the first 30%', () => {
    for (const swapAt of [200, 900]) {
      const sim = simulateTwoBeatOpen(swapAt);
      const push = sim.at('push:start');
      const start = sim.at('reveal:start');
      const end = sim.at('reveal:end');
      // Begins at 60% of the 450ms push (+ up to two frames of quantisation) —
      // the reported bug (reveal starting ~150-250ms into a beat, i.e. < 55%)
      // fails this bound.
      expect(start - push).toBeGreaterThanOrEqual(0.6 * PUSH_MS);
      expect(start - push).toBeLessThanOrEqual(0.6 * PUSH_MS + 2 * STEP);
      // Completes with the push (within frame quantisation of its end).
      expect(end - push).toBeGreaterThanOrEqual(PUSH_MS);
      expect(end - push).toBeLessThanOrEqual(PUSH_MS + 2 * STEP);
    }
  });

  it('the reveal begins after the push starts, never before', () => {
    for (const swapAt of [100, 500, 900]) {
      const { phases } = simulateTwoBeatOpen(swapAt);
      expect(phases.indexOf('reveal:start')).toBeGreaterThan(phases.indexOf('push:start'));
      expect(phases.indexOf('reveal:end')).toBeGreaterThan(phases.indexOf('reveal:start'));
    }
  });
});

describe('same-zone open — the reveal holds for the swap, and a late swap ramps', () => {
  it('on-time swap: the reveal rides the final 40% of the push', () => {
    const sim = simulateSameZoneOpen(100);
    expect(sim.at('reveal:start')).toBeGreaterThanOrEqual(0.6 * PUSH_MS);
    expect(sim.at('reveal:start')).toBeLessThanOrEqual(0.6 * PUSH_MS + 2 * STEP);
    expect(sim.at('reveal:end')).toBeLessThanOrEqual(PUSH_MS + 2 * STEP);
  });

  it('late swap (push already finished): a full ramp, never a single-frame pop', () => {
    const sim = simulateSameZoneOpen(700); // push ended at 450; swap at ~700
    const start = sim.at('reveal:start');
    const end = sim.at('reveal:end');
    expect(start).toBeGreaterThanOrEqual(700); // begins when the swap lands
    // The ramp spans the full catch-up window — a pop would make this ~one frame.
    expect(end - start).toBeGreaterThanOrEqual(REVEAL_RAMP_MS);
    expect(end - start).toBeLessThanOrEqual(REVEAL_RAMP_MS + 2 * STEP);
  });

  it('mid-ramp swap (60%-100% of push): still ramps over the catch-up window', () => {
    const sim = simulateSameZoneOpen(380); // swap lands at ~84% of the push
    const start = sim.at('reveal:start');
    const end = sim.at('reveal:end');
    expect(end - start).toBeGreaterThanOrEqual(REVEAL_RAMP_MS - STEP);
  });
});

describe('MotionTrace', () => {
  it('records nothing and emits nothing when disabled', () => {
    const rows: TraceRow[][] = [];
    const trace = new MotionTrace(false, (r) => rows.push(r));
    trace.mark('nav:start', 0);
    trace.flush();
    expect(trace.phases).toEqual([]);
    expect(rows).toEqual([]);
  });

  it('emits relative and delta times, then resets', () => {
    const rows: TraceRow[][] = [];
    const trace = new MotionTrace(true, (r) => rows.push(r));
    trace.mark('nav:start', 1000);
    trace.mark('slide:start', 1000.05);
    trace.mark('settled', 1450);
    trace.flush();
    expect(rows).toHaveLength(1);
    expect(rows[0].map((r) => r.phase)).toEqual(['nav:start', 'slide:start', 'settled']);
    expect(rows[0][0].ms).toBe(0);
    expect(rows[0][2].ms).toBeCloseTo(450, 0);
    expect(rows[0][2]['+ms']).toBeCloseTo(449.9, 0);
    trace.flush();
    expect(rows).toHaveLength(1); // nothing left to emit
  });

  it('presents a retroactive mark (settle:end) on the timeline, not arrival order', () => {
    const rows: TraceRow[][] = [];
    const trace = new MotionTrace(true, (r) => rows.push(r));
    trace.mark('beat1:arrive', 500);
    trace.mark('gate:open', 700);
    trace.mark('settle:end', 650); // marked late, timestamped earlier
    trace.flush();
    expect(rows[0].map((r) => r.phase)).toEqual(['beat1:arrive', 'settle:end', 'gate:open']);
  });
});
