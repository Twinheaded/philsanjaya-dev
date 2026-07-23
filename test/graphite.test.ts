/**
 * Graphite stroke calibration (§12, M7). The invariants here are the ones a
 * screenshot cannot check while the pane runs headless: the fade/scrub pair
 * guarantees trails vanish to NOTHING (no 8-bit stall residue), and the
 * pressure/width maps stay inside their design envelopes.
 */

import { describe, expect, it } from 'vitest';
import {
  FADE_ALPHA,
  FADE_INTERVAL_MS,
  isWrapJump,
  minFreshAlpha,
  SCRUB_BAND_TOP,
  SCRUB_BANDS,
  SCRUB_THRESHOLD,
  scrubTable,
  secondsToScrub,
  stallFloor,
  strokeAlpha,
  strokeWidth,
} from '../src/lib/graphite';

describe('fade/scrub invariants — trails must vanish to nothing (§12 note 1)', () => {
  it('the scrub floor covers the 8-bit multiplicative stall', () => {
    // Below stallFloor the destination-out decrement rounds to zero and the
    // mark would sit as gray residue forever; the scrub must reach it.
    expect(SCRUB_THRESHOLD).toBeGreaterThanOrEqual(stallFloor(FADE_ALPHA));
  });

  it('a fresh full-density stroke reaches the scrub inside the ~20s smudge window', () => {
    // Fresh stroke at the default token: 0.16 * 255 ≈ 41 stored alpha. The
    // fade is wall-clock, so this holds on 60Hz and 120Hz alike.
    const seconds = secondsToScrub(41);
    expect(seconds).toBeGreaterThan(8); // slow smudge, not a wipe
    expect(seconds).toBeLessThan(25); // and it does actually vanish (~20s)
  });

  it('even the darkest plausible stroke vanishes', () => {
    expect(secondsToScrub(255)).toBeLessThan(60); // never more than a minute
  });

  it('the fade cadence is coarse enough to keep decrements above rounding', () => {
    // One application must move a typical stroke by at least 1 alpha step.
    expect(Math.round(41 * (1 - FADE_ALPHA))).toBeLessThan(41);
    expect(FADE_INTERVAL_MS).toBeGreaterThanOrEqual(250);
  });

  it('the GPU scrub table zeroes exactly the stall band and nothing above it', () => {
    const v = scrubTable().split(' ').map(Number);
    expect(v).toHaveLength(64);
    // The zero band [0, 3/63] covers the stall floor, so every stalled pixel
    // snaps to nothing on the next pass.
    expect(v[0]).toBe(0);
    expect(v[3]).toBe(0);
    expect((3 / 63) * 255).toBeGreaterThanOrEqual(SCRUB_THRESHOLD);
    expect((3 / 63) * 255).toBeGreaterThanOrEqual(stallFloor(FADE_ALPHA));
    // Monotone, identity at the top: living strokes are never brightened or
    // reordered, and full-alpha marks pass through untouched.
    for (let i = 1; i < v.length; i++) expect(v[i]).toBeGreaterThanOrEqual(v[i - 1]);
    expect(v[63]).toBe(1);
  });

  it('the pull-down band never touches a fresh stroke (review)', () => {
    // The faintest newborn mark at the default token must clear the band top,
    // or fast pencils would see their marks crushed within a second of being
    // laid instead of smudging out on the designed decay.
    expect(minFreshAlpha(0.16)).toBeGreaterThan(SCRUB_BAND_TOP);
  });

  it('the JS fallback sweep is bounded (no-filter browsers)', () => {
    // Without canvas filter support the rolling bands clear residue lazily —
    // slower than the primary path, but every band is revisited well inside
    // half a minute, so no residue is ever permanent.
    const sweepSeconds = (1620 / (SCRUB_BANDS * 36)) * (FADE_INTERVAL_MS / 1000);
    expect(sweepSeconds).toBeLessThan(30);
  });
});

describe('pressure-like alpha (§12)', () => {
  it('slower motion presses harder', () => {
    const slow = strokeAlpha(20, 200, 0.16, 0.5);
    const fast = strokeAlpha(190, 200, 0.16, 0.5);
    expect(slow).toBeGreaterThan(fast);
  });

  it('stays within the token envelope (never darker than 1.2x base)', () => {
    for (let v = 0; v <= 200; v += 25) {
      for (const j of [0, 0.5, 1]) {
        const a = strokeAlpha(v, 200, 0.16, j);
        expect(a).toBeGreaterThan(0);
        expect(a).toBeLessThanOrEqual(0.16 * 1.2 + 1e-9);
      }
    }
  });
});

describe('width jitter (§12)', () => {
  it('spans a pencil-like envelope and never collapses to zero', () => {
    let min = Infinity;
    let max = 0;
    for (const p of [0, 0.5, 1]) {
      for (const j of [0, 0.5, 1]) {
        const w = strokeWidth(p, j);
        min = Math.min(min, w);
        max = Math.max(max, w);
      }
    }
    expect(min).toBeGreaterThan(0.5);
    expect(max).toBeLessThan(2);
    expect(max / min).toBeGreaterThan(1.5); // real variation, not uniform dots
  });
});

describe('wrap guard', () => {
  it('a dt-clamped step is never treated as a wrap', () => {
    expect(isWrapJump(200 * 0.05, 200, 0.05)).toBe(false);
  });
  it('a desk-crossing teleport is', () => {
    expect(isWrapJump(3000, 200, 0.05)).toBe(true);
  });
});
