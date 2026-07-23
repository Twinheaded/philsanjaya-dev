/**
 * The agent field, re-materialised as graphite (§12, M7 — perf-reworked).
 *
 * Agents wander in desk coordinates and leave CHARCOAL STROKES — segments with
 * width jitter and pressure-like alpha (slow = pressed harder), drawn once,
 * crisp, with round caps; softness is baked into the low stroke alpha, never
 * canvas shadowBlur (M7 note 2). The marks ACCUMULATE on the canvas and fade
 * by destination-out compositing — never by overpainting translucent desk
 * colour, which leaves a gray film. Because an 8-bit canvas fades
 * multiplicatively with rounding (marks stall as permanent residue below
 * `stallFloor`), rolling scrub bands zero anything at or below
 * SCRUB_THRESHOLD — trails vanish to NOTHING (§12 note 1; invariants pinned in
 * test/graphite.test.ts).
 *
 * PERF ARCHITECTURE (the fix for the M7 regression — §8 idle discipline):
 * - The field owns NO rAF work. Ambient life runs on a LOW-FREQUENCY TIMER
 *   (~6Hz): step the pencils, lay the new segments, fade/scrub when due. At
 *   rest the main thread is idle between ticks and the desk runtime's rAF
 *   loop parks — the field is no longer a reason to loop.
 * - During a camera move the pencils LIFT (the timer skips) and the
 *   accumulated bitmap rides the COMPOSITOR: `.desk-field`'s CSS transform is
 *   derived from the same `--cam-*` vars the runtime already writes each
 *   animated frame (the `.desk-plane` pattern), relative to the pose the
 *   bitmap was last baked at (`--field-x0/y0/z0-inv`, inline on the canvas).
 *   Zero canvas repaints per animated frame — the M7 per-frame re-projection
 *   (two full-canvas blits) was the travel/push jank in Phil's recording.
 * - At settle the bitmap is re-projected ONCE (one affine blit through an aux
 *   buffer — the resample softening reads as charcoal smudging under a moved
 *   page) and the bake vars reset the CSS transform to identity.
 * - The canvas renders at DPR 1 — soft charcoal needs no retina, and it
 *   halves-to-quarters every fill/blit/readback.
 *
 * The canvas `transition:persist`s and pencil/bake state lives at module
 * level, so the marks survive route swaps. CRITICAL: assigning canvas
 * width/height resets the drawing buffer EVEN WHEN UNCHANGED — resize() must
 * guard on a real size change (M7 review BLOCKER). Density is Phil's token
 * pair (§12 note 3): `--field-count` and `--field-trail-alpha` in tokens.css.
 * Reduced motion parks the field — desk.ts never mounts it (M7 note 4).
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
import { cameraAnimating, cameraPose } from './desk';

/** Desk bounds (§4): ~5200 x 3400, origin at centre. Agents wander this box. */
const DESK_W = 5200;
const DESK_H = 3400;
const DESK_MIN_X = -DESK_W / 2;
const DESK_MIN_Y = -DESK_H / 2;

/** The ambient cadence (perf fix): ~6Hz. Stroke segments join at shallow
 *  wander angles, so the polyline still reads as a continuous pencil line. */
const TICK_MS = 166;
/** Integration clamp — must exceed TICK_MS so a normal tick is never slowed,
 *  while a hidden-tab gap still can't teleport a pencil. */
const MAX_DT = 0.2;
/** Charcoal is soft by design — DPR 1 (vs the GL scene's 1.5 cap) quarters the
 *  device-pixel volume of every fill, blit, and scrub readback (perf fix). */
const DPR = 1;
/** Scrub band height in device px. */
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
/** The pose the bitmap was last BAKED at — module-level so a remount (e.g.
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
  destroy(): void;
}

export function mountDeskField(canvas: HTMLCanvasElement): DeskField {
  const context = canvas.getContext('2d');
  if (!context) {
    return { destroy() {} };
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
  let aux: HTMLCanvasElement | null = null;
  let last = performance.now();
  let lastFadeAt = performance.now();
  let scrubY = 0;

  function resize(): void {
    // LAYOUT size, never getBoundingClientRect (review BLOCKER): the canvas
    // now carries the compositor transform, and a mid-tween remount would
    // measure the SCALED box — wiping the bitmap via the size guard and
    // poisoning the projection with a transformed vw/vh.
    const rw = canvas.clientWidth;
    const rh = canvas.clientHeight;
    if (rw === 0 || rh === 0) return;
    vw = rw;
    vh = rh;
    const w = Math.round(vw * DPR);
    const h = Math.round(vh * DPR);
    // CRITICAL guard (review BLOCKER): assigning canvas.width/height resets the
    // drawing buffer EVEN WHEN UNCHANGED — and this runs on every remount
    // (each navigation). A same-size pass must keep the accumulated marks and
    // the module lastCam, so the next bake re-projects them to the new pose.
    if (canvas.width !== w || canvas.height !== h) {
      // A genuine size change clears the bitmap — a fresh sheet after a
      // window resize. Acceptable; strokes re-accumulate.
      canvas.width = w;
      canvas.height = h;
      aux = null; // re-created lazily at the new size
      lastCam = null; // no reprojection across a size change
      clearPoseVars();
    }
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }

  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();

  /** Publish the baked pose for the CSS compositor transform (global.css
   *  derives the between-bakes motion from these + the live --cam-* vars). */
  function setPoseVars(cam: Pose): void {
    canvas.style.setProperty('--field-x0', String(cam.x));
    canvas.style.setProperty('--field-y0', String(cam.y));
    canvas.style.setProperty('--field-z0-inv', String(1 / cam.zoom));
  }
  function clearPoseVars(): void {
    canvas.style.removeProperty('--field-x0');
    canvas.style.removeProperty('--field-y0');
    canvas.style.removeProperty('--field-z0-inv');
  }

  /** Desk coords -> CSS-px screen coords through the camera (§3 projection). */
  function project(deskX: number, deskY: number, cam: Pose): [number, number] {
    return [vw / 2 + (deskX - cam.x) * cam.zoom, vh / 2 + (deskY - cam.y) * cam.zoom];
  }

  /**
   * BAKE: re-project the accumulated bitmap from the pose it was drawn at to
   * `cam` — one affine blit, run ONCE per settle (never per frame; the CSS
   * transform carries the motion in between).
   */
  function bake(cam: Pose): void {
    if (lastCam && (lastCam.x !== cam.x || lastCam.y !== cam.y || lastCam.zoom !== cam.zoom)) {
      if (!aux) {
        aux = document.createElement('canvas');
        aux.width = canvas.width;
        aux.height = canvas.height;
      }
      const actx = aux.getContext('2d');
      if (actx) {
        actx.setTransform(1, 0, 0, 1, 0, 0);
        actx.clearRect(0, 0, aux.width, aux.height);
        actx.drawImage(canvas, 0, 0);

        // Device-space affine: scale k about the viewport centre + pan delta.
        const k = cam.zoom / lastCam.zoom;
        const tx = DPR * ((vw / 2) * (1 - k) + (lastCam.x - cam.x) * cam.zoom);
        const ty = DPR * ((vh / 2) * (1 - k) + (lastCam.y - cam.y) * cam.zoom);
        ctx.setTransform(k, 0, 0, k, tx, ty);
        ctx.clearRect(-tx / k, -ty / k, canvas.width / k, canvas.height / k);
        ctx.drawImage(aux, 0, 0);
        ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      }
    }
    lastCam = { ...cam };
    setPoseVars(cam);
  }

  // Probe canvas filter support once: setting an unsupported filter leaves it
  // at 'none'. With support, the scrub is a GPU-side alpha-threshold blit —
  // zero getImageData EVER (per-frame readbacks demoted the M7 canvas to
  // software raster; that demotion made the reprojection blits jank during
  // slides — the hidden cost behind Phil's duplicated frames).
  const filterSupported = (() => {
    try {
      // The prototype check first (review HIGH): on browsers WITHOUT canvas
      // filter support, assigning the property creates a plain expando that
      // reads back verbatim — the assign-and-readback probe alone would report
      // support on exactly the browsers that lack it.
      if (!('filter' in CanvasRenderingContext2D.prototype)) return false;
      ctx.filter = 'url(#graphite-scrub)';
      const ok = ctx.filter !== 'none';
      ctx.filter = 'none';
      return ok;
    } catch {
      return false;
    }
  })();

  /**
   * The destination-out fade (§12 note 1) on a wall-clock cadence, applied in
   * DEVICE space so the dpr-rounded edge row/column is fully covered — then the
   * scrub. Primary scrub: one filtered blit through the aux buffer via the
   * #graphite-scrub SVG alpha table (alpha ≤ the 8-bit stall floor snaps to
   * exactly zero — trails vanish to NOTHING, GPU-side). Fallback (no canvas
   * filter support): a small rolling JS band sweep — lazier residue clearance,
   * still bounded.
   */
  function fadeAndScrub(now: number): void {
    if (now - lastFadeAt < FADE_INTERVAL_MS) return;
    // Advance by the interval, not to `now` (review): the ~166ms tick grid
    // would otherwise quantise the cadence to ~664ms and silently stretch the
    // calibrated decay by a third. The clamp stops catch-up bursts.
    lastFadeAt = Math.max(lastFadeAt + FADE_INTERVAL_MS, now - FADE_INTERVAL_MS);

    ctx.globalCompositeOperation = 'destination-out';
    ctx.globalAlpha = FADE_ALPHA;
    ctx.fillStyle = '#000';
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;

    if (filterSupported && document.getElementById('graphite-scrub')) {
      if (!aux) {
        aux = document.createElement('canvas');
        aux.width = canvas.width;
        aux.height = canvas.height;
      }
      const actx = aux.getContext('2d');
      if (actx) {
        actx.setTransform(1, 0, 0, 1, 0, 0);
        actx.clearRect(0, 0, aux.width, aux.height);
        actx.filter = 'url(#graphite-scrub)';
        actx.drawImage(canvas, 0, 0);
        actx.filter = 'none';
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(aux, 0, 0);
      }
    } else {
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
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }

  /** One ambient tick (~6Hz): lift during moves, bake at settle, then step the
   *  pencils and lay their strokes. */
  function tick(): void {
    const now = performance.now();
    if (document.hidden) {
      last = now; // no dt accumulation across a hidden gap
      return;
    }
    if (vw === 0) {
      resize();
      if (vw === 0) return;
    }
    if (cameraAnimating()) {
      // Pencils lift while the desk moves; the compositor carries the bitmap.
      last = now;
      return;
    }
    const cam = cameraPose();
    if (
      !lastCam ||
      lastCam.x !== cam.x ||
      lastCam.y !== cam.y ||
      lastCam.zoom !== cam.zoom
    ) {
      bake(cam);
    }

    const dt = Math.min((now - last) / 1000, MAX_DT);
    last = now;

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

    fadeAndScrub(now);
  }

  const interval = window.setInterval(tick, TICK_MS);

  return {
    destroy(): void {
      window.clearInterval(interval);
      observer.disconnect();
    },
  };
}
