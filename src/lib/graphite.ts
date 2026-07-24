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
/** 8-bit alpha at or below this is scrubbed to zero. Must sit at the SVG
 *  scrub filter's last zero stop (3/63 of 255 ≈ 12.1) — see scrubTable(). */
export const SCRUB_THRESHOLD = 12;
/** FALLBACK ONLY (browsers without canvas `filter` support, e.g. older
 *  Safari): rolling JS bands per fade pass. Kept small — the per-pixel
 *  ImageData loop is the expensive path (a large sweep was a >50ms long task,
 *  perf fix) — so fallback residue clears more lazily but still bounded. */
export const SCRUB_BANDS = 2;

/**
 * The GPU scrub (perf fix): an SVG feComponentTransfer alpha table applied as
 * ONE filtered blit per fade pass — no getImageData, no per-pixel JS, and the
 * canvas never demotes to software raster (the per-frame readbacks were the
 * hidden cost behind the M7 jank). The table maps alpha ≤ 3/63 (≈ the 8-bit
 * stall floor, 12.1 of 255) to EXACTLY zero and is identity above; the one
 * interpolation band between the zero stop and identity spans (12.1, 16.2] —
 * kept STRICTLY below the faintest fresh stroke (≈18 at the default tokens,
 * pinned in the tests), so newborn marks are never crushed (review): only
 * pixels already fading through the band die faster, and fade + threshold
 * provably converges every pixel to nothing.
 */
export function scrubTable(): string {
  const v: string[] = ['0', '0', '0', '0'];
  for (let k = 4; k <= 63; k++) v.push((k / 63).toFixed(4));
  return v.join(' ');
}

/** The top of the scrub table's pull-down band in 8-bit alpha: values above
 *  this pass through the filter untouched. */
export const SCRUB_BAND_TOP = (4 / 63) * 255;

/** The faintest alpha a fresh stroke can be laid at (8-bit), given a base
 *  trail-alpha token — must clear SCRUB_BAND_TOP or new marks get crushed. */
export function minFreshAlpha(base: number): number {
  return strokeAlpha(Number.MAX_SAFE_INTEGER, 1, base, 0) * 255;
}

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
