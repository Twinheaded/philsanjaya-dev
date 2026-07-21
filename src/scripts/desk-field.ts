/**
 * The agent field, in desk space (§12, M3 note 7).
 *
 * The steering sim now lives on the *whole desk*, not the Home panel: agents
 * wander in desk coordinates and every frame are projected to the screen through
 * the camera pose — the same projection the DOM plane uses — so the marks
 * inhabit the desk and slide with it. The canvas is one viewport-fixed layer
 * beneath the DOM plane, whose opaque paper occludes the marks naturally.
 *
 * Trails are graphite (`--ink` at low alpha, §12). Density is capped and the
 * loop is owned by the caller (`desk.ts`), which parks it on `document.hidden`
 * (§8). The pure steering maths is reused from behaviours.ts unchanged.
 */

import { mulberry32, step, wanderForce, type Agent, type Bounds } from '../islands/agents/behaviours';
import { PARAMS } from '../islands/agents/engine';
import type { Pose } from '../lib/camera';

/** Desk bounds (§4): ~5200 x 3400, origin at centre. Agents wander this box. */
const DESK_W = 5200;
const DESK_H = 3400;
const DESK_MIN_X = -DESK_W / 2;
const DESK_MIN_Y = -DESK_H / 2;

/** §12 density cap — the desk must read as organised, not scribbled. */
const DENSITY = 34;
const MAX_DT = 0.05; // clamp integration after a tab-hidden gap
const ALPHA = 0.22; // graphite, matches the recoloured engine

function graphite(canvas: HTMLCanvasElement): string {
  return getComputedStyle(canvas).getPropertyValue('--ink').trim() || '#232323';
}

export interface DeskField {
  /** Step the sim to `now` (ms) and render it projected through `cam`. */
  frame(now: number, cam: Pose): void;
  /** Draw a single static frame (reduced motion) without stepping. */
  renderStatic(cam: Pose): void;
  destroy(): void;
}

export function mountDeskField(canvas: HTMLCanvasElement): DeskField {
  const context = canvas.getContext('2d');
  if (!context) {
    return { frame() {}, renderStatic() {}, destroy() {} };
  }
  const ctx: CanvasRenderingContext2D = context;

  const rng = mulberry32((performance.timeOrigin + performance.now()) >>> 0);
  // Sim runs in a [0..DESK_W] x [0..DESK_H] box; wrap keeps it seamless.
  const bounds: Bounds = { width: DESK_W, height: DESK_H, margin: 0 };
  const agents: Agent[] = Array.from({ length: DENSITY }, () => {
    const angle = rng() * Math.PI * 2;
    const speed = PARAMS.maxSpeed * (0.6 + rng() * 0.4);
    return {
      x: rng() * DESK_W,
      y: rng() * DESK_H,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      wanderAngle: 0,
    };
  });

  let vw = 0;
  let vh = 0;
  let dpr = 1;
  let color = graphite(canvas);
  let last = performance.now();

  function resize(): void {
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    vw = rect.width;
    vh = rect.height;
    canvas.width = Math.round(vw * dpr);
    canvas.height = Math.round(vh * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    color = graphite(canvas);
  }

  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();

  /** Desk coords -> screen, matching the DOM plane's projection (§3). */
  function project(deskX: number, deskY: number, cam: Pose): [number, number] {
    return [
      vw / 2 + (deskX - cam.x) * cam.zoom,
      vh / 2 + (deskY - cam.y) * cam.zoom,
    ];
  }

  function render(cam: Pose): void {
    if (vw === 0) return;
    ctx.clearRect(0, 0, vw, vh);
    ctx.globalAlpha = ALPHA;
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    const pad = 24;
    for (const a of agents) {
      const [sx, sy] = project(a.x + DESK_MIN_X, a.y + DESK_MIN_Y, cam);
      if (sx < -pad || sx > vw + pad || sy < -pad || sy > vh + pad) continue;
      const r = 2 * cam.zoom;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fill();
      const m = Math.hypot(a.vx, a.vy) || 1;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + (a.vx / m) * 10 * cam.zoom, sy + (a.vy / m) * 10 * cam.zoom);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  return {
    frame(now: number, cam: Pose): void {
      const dt = Math.min((now - last) / 1000, MAX_DT);
      last = now;
      for (const a of agents) {
        const [fx, fy] = wanderForce(a, PARAMS, rng);
        step(a, fx, fy, PARAMS, bounds, dt);
      }
      render(cam);
    },
    renderStatic(cam: Pose): void {
      last = performance.now();
      render(cam);
    },
    destroy(): void {
      observer.disconnect();
    },
  };
}
