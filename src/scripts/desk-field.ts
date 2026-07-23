/**
 * The agent field, re-materialised as graphite (§12, M7).
 *
 * Agents wander in desk coordinates and leave CHARCOAL STROKES — segments with
 * width jitter and pressure-like alpha (slow = pressed harder), drawn once,
 * crisp, with round caps; softness is baked into the low stroke alpha, never
 * canvas shadowBlur (M7 note 2). The marks ACCUMULATE on the canvas and fade
 * by destination-out compositing — never by overpainting translucent desk
 * colour, which leaves a gray film. Because an 8-bit canvas fades
 * multiplicatively with rounding (marks stall as permanent residue below
 * `stallFloor`), a rolling scrub band zeroes anything at or below
 * SCRUB_THRESHOLD — trails vanish to NOTHING (§12 note 1; invariants pinned in
 * test/graphite.test.ts).
 *
 * The field travels WITH the camera (M7 note 3): on a pose change the
 * accumulated bitmap is re-projected (one affine blit through an aux buffer).
 * The slight resampling softening during a slide reads as charcoal smudging
 * under a moved page. Agent state lives at module level and the canvas
 * `transition:persist`s, so the marks survive route swaps instead of resetting.
 *
 * Density is Phil's token pair (§12 note 3): `--field-count` and
 * `--field-trail-alpha` in tokens.css. Reduced motion parks the field — desk.ts
 * never mounts it, an empty desk (M7 note 4).
 */

import { mulberry32, step, wanderForce, type Agent, type Bounds } from '../islands/agents/behaviours';
import { PARAMS } from '../islands/agents/engine';
import {
  FADE_ALPHA,
  FADE_INTERVAL_MS,
  isWrapJump,
  SCRUB_BANDS,
  SCRUB_THRESHOLD,
  strokeAlpha,
  strokeWidth,
} from '../lib/graphite';
import type { Pose } from '../lib/camera';

/** Desk bounds (§4): ~5200 x 3400, origin at centre. Agents wander this box. */
const DESK_W = 5200;
const DESK_H = 3400;
const DESK_MIN_X = -DESK_W / 2;
const DESK_MIN_Y = -DESK_H / 2;

const MAX_DT = 0.05; // clamp integration after a tab-hidden gap
/** Scrub band height in device px — one band per frame cycles the canvas. */
const SCRUB_BAND = 36;

/** A wandering pencil: the sim agent plus its persistent stroke personality
 *  and the desk position of its last drawn mark. */
interface Pencil {
  agent: Agent;
  personality: number; // persistent width character (0..1)
  lastX: number; // desk coords of the last drawn segment end
  lastY: number;
}

// --- Module-level state: the field persists across ClientRouter swaps. -------
let pencils: Pencil[] = [];
let rng = mulberry32(1);
/** The pose the bitmap was last drawn at — module-level so a remount (e.g.
 *  returning from a document) re-projects the surviving marks correctly. */
let lastCam: Pose | null = null;

function seedPencils(count: number): void {
  rng = mulberry32((performance.timeOrigin + performance.now()) >>> 0);
  pencils = Array.from({ length: count }, () => {
    const angle = rng() * Math.PI * 2;
    const speed = PARAMS.maxSpeed * (0.6 + rng() * 0.4);
    const x = rng() * DESK_W;
    const y = rng() * DESK_H;
    return {
      agent: { x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, wanderAngle: 0 },
      personality: rng(),
      lastX: x,
      lastY: y,
    };
  });
}

export interface DeskField {
  /** Step the sim to `now` (ms) and draw new strokes projected through `cam`. */
  frame(now: number, cam: Pose): void;
  destroy(): void;
}

export function mountDeskField(canvas: HTMLCanvasElement): DeskField {
  const context = canvas.getContext('2d');
  if (!context) {
    return { frame() {}, destroy() {} };
  }
  const ctx: CanvasRenderingContext2D = context;

  // Tokens (§12 note 3): Phil's density pair, read at mount.
  const styles = getComputedStyle(canvas);
  const token = (name: string, fallback: number) => {
    const n = parseFloat(styles.getPropertyValue(name));
    return Number.isFinite(n) ? n : fallback;
  };
  const COUNT = Math.max(1, Math.round(token('--field-count', 30)));
  const TRAIL_ALPHA = Math.min(1, Math.max(0.02, token('--field-trail-alpha', 0.16)));
  const color = styles.getPropertyValue('--ink').trim() || '#232323';

  if (pencils.length !== COUNT) seedPencils(COUNT);

  const bounds: Bounds = { width: DESK_W, height: DESK_H, margin: 0 };

  let vw = 0;
  let vh = 0;
  let dpr = 1;
  let aux: HTMLCanvasElement | null = null;
  let last = performance.now();
  let lastFadeAt = performance.now();
  let scrubY = 0;

  function resize(): void {
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    vw = rect.width;
    vh = rect.height;
    const w = Math.round(vw * dpr);
    const h = Math.round(vh * dpr);
    // CRITICAL guard (review BLOCKER): assigning canvas.width/height resets the
    // drawing buffer EVEN WHEN UNCHANGED — and this runs on every remount
    // (each navigation). A same-size pass must keep the accumulated marks and
    // the module lastCam, so the first frame re-projects them to the new pose.
    if (canvas.width !== w || canvas.height !== h) {
      // A genuine size/dpr change clears the bitmap — a fresh sheet after a
      // window resize. Acceptable; strokes re-accumulate.
      canvas.width = w;
      canvas.height = h;
      aux = null; // re-created lazily at the new size
      lastCam = null; // no reprojection across a size change
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();

  /** Desk coords -> CSS-px screen coords through the camera (§3 projection). */
  function project(deskX: number, deskY: number, cam: Pose): [number, number] {
    return [vw / 2 + (deskX - cam.x) * cam.zoom, vh / 2 + (deskY - cam.y) * cam.zoom];
  }

  /** Re-project the accumulated bitmap from the previous pose to `cam` — the
   *  marks live on the DESK, so they must move with it (one affine blit). */
  function reproject(cam: Pose): void {
    if (!lastCam || (lastCam.x === cam.x && lastCam.y === cam.y && lastCam.zoom === cam.zoom)) {
      return;
    }
    if (!aux) {
      aux = document.createElement('canvas');
      aux.width = canvas.width;
      aux.height = canvas.height;
    }
    const actx = aux.getContext('2d');
    if (!actx) return;
    actx.setTransform(1, 0, 0, 1, 0, 0);
    actx.clearRect(0, 0, aux.width, aux.height);
    actx.drawImage(canvas, 0, 0);

    // Device-space affine: scale k about the viewport centre + pan delta.
    const k = cam.zoom / lastCam.zoom;
    const tx = dpr * ((vw / 2) * (1 - k) + (lastCam.x - cam.x) * cam.zoom);
    const ty = dpr * ((vh / 2) * (1 - k) + (lastCam.y - cam.y) * cam.zoom);
    ctx.setTransform(k, 0, 0, k, tx, ty);
    ctx.clearRect(-tx / k, -ty / k, canvas.width / k, canvas.height / k);
    ctx.drawImage(aux, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /**
   * The destination-out fade (§12 note 1) on a WALL-CLOCK cadence (review:
   * frame-counting would fade twice as fast on a 120Hz display), applied in
   * DEVICE space so the buffer's last row/column — a partial CSS pixel after
   * dpr rounding — is fully covered (review: partial coverage raised its stall
   * floor above the scrub). The scrub rides the same cadence: per-frame
   * getImageData would force a GPU readback every frame and demote the canvas
   * to software raster (review) — at 500ms it is rare, and SCRUB_BANDS bands
   * per pass still sweep the buffer ~4x faster than a stroke can decay to the
   * stall floor, so trails still vanish to NOTHING.
   */
  function fadeAndScrub(now: number): void {
    if (now - lastFadeAt < FADE_INTERVAL_MS) return;
    lastFadeAt = now;

    ctx.globalCompositeOperation = 'destination-out';
    ctx.globalAlpha = FADE_ALPHA;
    ctx.fillStyle = '#000';
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;

    for (let b = 0; b < SCRUB_BANDS; b++) {
      const h = Math.min(SCRUB_BAND, canvas.height - scrubY);
      if (h <= 0) {
        scrubY = 0;
        continue;
      }
      const img = ctx.getImageData(0, scrubY, canvas.width, h);
      const d = img.data;
      let dirty = false;
      for (let i = 3; i < d.length; i += 4) {
        if (d[i] !== 0 && d[i] <= SCRUB_THRESHOLD) {
          d[i] = 0;
          d[i - 1] = 0;
          d[i - 2] = 0;
          d[i - 3] = 0;
          dirty = true;
        }
      }
      if (dirty) ctx.putImageData(img, 0, scrubY);
      scrubY += h;
      if (scrubY >= canvas.height) scrubY = 0;
    }
  }

  return {
    frame(now: number, cam: Pose): void {
      if (vw === 0) {
        resize();
        if (vw === 0) return;
      }
      const dt = Math.min((now - last) / 1000, MAX_DT);
      last = now;

      reproject(cam);
      fadeAndScrub(now);

      // Step and stroke. Each pencil draws one segment per frame — crisp, low
      // alpha, round caps; no shadowBlur (M7 note 2).
      ctx.strokeStyle = color;
      ctx.lineCap = 'round';
      const pad = 24;
      for (const p of pencils) {
        const a = p.agent;
        const [fx, fy] = wanderForce(a, PARAMS, rng);
        step(a, fx, fy, PARAMS, bounds, dt);
        const dxd = a.x - p.lastX;
        const dyd = a.y - p.lastY;
        const len = Math.hypot(dxd, dyd);
        if (isWrapJump(len, PARAMS.maxSpeed, MAX_DT)) {
          // A bounds wrap teleports the pencil — lift it, no desk-crossing slash.
          p.lastX = a.x;
          p.lastY = a.y;
          continue;
        }
        if (len < 0.5) continue; // pencil resting: no zero-length deposits

        const [x0, y0] = project(p.lastX + DESK_MIN_X, p.lastY + DESK_MIN_Y, cam);
        const [x1, y1] = project(a.x + DESK_MIN_X, a.y + DESK_MIN_Y, cam);
        p.lastX = a.x;
        p.lastY = a.y;
        if (
          (x0 < -pad && x1 < -pad) ||
          (x0 > vw + pad && x1 > vw + pad) ||
          (y0 < -pad && y1 < -pad) ||
          (y0 > vh + pad && y1 > vh + pad)
        ) {
          continue; // fully off-viewport: the mark exists, drawing can wait
        }

        const speed = Math.hypot(a.vx, a.vy);
        ctx.globalAlpha = strokeAlpha(speed, PARAMS.maxSpeed, TRAIL_ALPHA, rng());
        ctx.lineWidth = strokeWidth(p.personality, rng()) * cam.zoom;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      lastCam = { ...cam };
    },
    destroy(): void {
      observer.disconnect();
    },
  };
}
