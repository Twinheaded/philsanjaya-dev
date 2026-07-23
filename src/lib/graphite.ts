/**
 * Graphite stroke maths (§12, M7) — pure and DOM-free, so the charcoal
 * pipeline's calibration is unit-tested: pressure-like alpha, width jitter,
 * and the fade/scrub invariants that guarantee trails vanish to NOTHING.
 *
 * The fade is destination-out compositing (never overpainting translucent
 * desk colour — that leaves a gray film). But an 8-bit canvas fades
 * multiplicatively with rounding: once `alpha × FADE_ALPHA < 0.5` the
 * decrement rounds to zero and the mark STALLS as permanent residue. The
 * rolling scrub erases anything at or below that stall floor — the pair of
 * constants must always satisfy SCRUB_THRESHOLD ≥ stallFloor(FADE_ALPHA),
 * which the tests pin.
 */

/** Apply the destination-out fade on a WALL-CLOCK cadence — larger, less
 *  frequent steps keep the multiplicative decrement above the rounding floor
 *  for longer (stretching the smudge toward §12's ~20s), and a time base keeps
 *  the fade rate identical on 60Hz and 120Hz displays (review). */
export const FADE_INTERVAL_MS = 500;
/** The per-application destination-out alpha: one 4.5% cut per interval — a
 *  fresh stroke falls to the scrub floor in ~13–20s. */
export const FADE_ALPHA = 0.045;
/** 8-bit alpha at or below this is scrubbed to zero by the rolling bands. */
export const SCRUB_THRESHOLD = 12;
/** Scrub bands swept per fade pass. The scrub rides the fade cadence (review:
 *  a per-frame getImageData forces GPU readback every frame) — 8 bands of 36px
 *  every 500ms sweeps a 1620px-tall buffer in ~3s, far faster than the ~13s a
 *  stroke needs to decay to the stall floor. */
export const SCRUB_BANDS = 8;

/** The stored-alpha value below which multiplicative fading stalls:
 *  a × FADE_ALPHA < 0.5 rounds to no change. */
export function stallFloor(fadeAlpha: number): number {
  return Math.ceil(0.5 / fadeAlpha);
}

/** Seconds until a stroke of stored alpha `a0` first reaches the scrub floor
 *  (refresh-rate independent — the fade is wall-clock). */
export function secondsToScrub(a0: number, fadeAlpha = FADE_ALPHA): number {
  let a = a0;
  let applications = 0;
  while (a > SCRUB_THRESHOLD && applications < 500) {
    applications++;
    a = Math.round(a * (1 - fadeAlpha));
  }
  return (applications * FADE_INTERVAL_MS) / 1000;
}

/**
 * Pressure-like alpha (§12): slower motion presses harder (darker), a fast
 * flick barely marks. `jitter01` roughens the deposit per segment.
 * Returns a 0..1 canvas alpha; `base` is the --field-trail-alpha token.
 */
export function strokeAlpha(
  speed: number,
  maxSpeed: number,
  base: number,
  jitter01: number
): number {
  const slow = Math.max(0, Math.min(1, 1 - speed / Math.max(1e-6, maxSpeed)));
  return base * (0.55 + 0.45 * slow) * (0.8 + 0.4 * jitter01);
}

/**
 * Stroke width in CSS px at zoom 1 (§12 width jitter): each agent carries a
 * persistent `personality01` (its pencil), roughened per segment.
 */
export function strokeWidth(personality01: number, jitter01: number): number {
  return (0.75 + 0.7 * personality01) * (0.85 + 0.3 * jitter01);
}

/**
 * A segment longer than this (in desk units, for dt-clamped steps) is a
 * wrap-around teleport, not a stroke — drawing it would slash a line across
 * the whole desk.
 */
export function isWrapJump(segmentLength: number, maxSpeed: number, maxDt: number): boolean {
  return segmentLength > maxSpeed * maxDt * 3;
}
