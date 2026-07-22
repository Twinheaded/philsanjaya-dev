/**
 * The WebGL background scene (Layer 0, §8) — the room the desk sits in.
 *
 * Atmosphere only: a matte ground plane in the desk tone, a few abstract slab
 * volumes near the periphery for perspective depth, warm lighting, and a fog
 * vignette to `--desk-deep`. No texture maps, no shadow maps (§8) — flat
 * materials + lighting, a deliberate perf + aesthetic call.
 *
 * Sync contract (§3): the PerspectiveCamera is driven from the SAME camera store
 * as the DOM plane (via cameraPose()). It looks head-on at the ground so the
 * scale locks to the plane (`content must not swim` when Layer 0 toggles), the
 * distance maps from `zoom`, and the x/y pan is scaled by a parallax coefficient
 * of 0.85 so the background drifts slightly less than the content — the depth cue.
 *
 * Loading (§8): the site paints at rung 2 (the CSS ground) first; `three` is
 * dynamically imported after first idle and the scene fades in over ~600ms. Any
 * init failure disposes cleanly and stays on rung 2 — never a blank background.
 */

import type { Material, Scene, WebGLRenderer } from 'three';
import type { Pose } from '../lib/camera';
import { cameraPose } from './desk';

const PARALLAX = 0.85;
const FOV = 35;
const IDLE_MS = 2000; // pause the render loop after this long with no camera move
const DESK_W = 5200;
const DESK_H = 3400;

/** Read a CSS custom property as a 0xRRGGBB number for three. */
function tokenColor(name: string, fallback: number): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const m = /^#?([0-9a-f]{6})$/i.exec(raw);
  return m ? parseInt(m[1], 16) : fallback;
}

export interface DeskScene {
  destroy(): void;
  /** Nudge the render loop awake (e.g. a navigation has started). */
  wake(): void;
}

let started = false;

/**
 * Idempotent: initialises the scene once, after first idle. The canvas persists
 * across ClientRouter swaps (transition:persist), so this runs a single time.
 */
export function initDeskScene(): void {
  if (started) return;
  started = true;
  const ric = (window as Window & { requestIdleCallback?: (cb: () => void) => void })
    .requestIdleCallback;
  const run = () => void mount();
  if (ric) ric(run);
  else window.setTimeout(run, 200);
}

let scene: DeskScene | null = null;

async function mount(): Promise<void> {
  const canvas = document.getElementById('desk-scene') as HTMLCanvasElement | null;
  if (!canvas || scene) return;

  let THREE: typeof import('three');
  try {
    THREE = await import('three');
  } catch {
    console.warn('desk scene: three failed to load; staying on the CSS ground');
    return;
  }

  try {
    scene = build(THREE, canvas);
  } catch (err) {
    // build() disposes its own partial allocation before throwing, so there is
    // nothing to clean up here — just log and stay on the CSS ground.
    console.warn('desk scene: init failed; staying on the CSS ground', err);
    scene = null;
  }
}

function build(THREE: typeof import('three'), canvas: HTMLCanvasElement): DeskScene {
  const desk = tokenColor('--desk', 0xd8d2c6);
  const deskDeep = tokenColor('--desk-deep', 0xc7c0b2);
  const paper = tokenColor('--paper', 0xfafaf8);

  // Tracking refs for cleanup. Held outside the try so `disposeAll` can release
  // whatever was allocated even if construction throws part-way through — the
  // WebGL context + geometries must never leak on the fall-back-to-CSS path (§8).
  let trackRenderer: WebGLRenderer | null = null;
  let trackWorld: Scene | null = null;
  let trackObserver: ResizeObserver | null = null;
  let trackOnVisible: (() => void) | null = null;
  let rafId = 0;
  let running = false;

  const disposeAll = (): void => {
    cancelAnimationFrame(rafId);
    running = false;
    trackObserver?.disconnect();
    if (trackOnVisible) document.removeEventListener('visibilitychange', trackOnVisible);
    trackRenderer?.dispose();
    trackWorld?.traverse((o) => {
      const mesh = o as { geometry?: { dispose(): void }; material?: { dispose(): void } };
      mesh.geometry?.dispose();
      mesh.material?.dispose();
    });
    canvas.classList.remove('is-lit');
  };

  try {
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    trackRenderer = renderer;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));

    const world = new THREE.Scene();
    trackWorld = world;
    // Fog toward --desk-deep gives the edge vignette without a texture map.
    world.fog = new THREE.Fog(deskDeep, 900, 4200);

    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 20000);

    // Ground: a large matte plane in the desk tone, in the z=0 plane facing +z.
    // MeshStandard (§8) with roughness 1 / metalness 0 = a flat matte diffuse; its
    // per-fragment lighting gives a smooth light pool with no subdivision needed.
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(DESK_W * 1.6, DESK_H * 1.6),
      new THREE.MeshStandardMaterial({ color: desk, roughness: 1, metalness: 0 })
    );
    world.add(ground);

    // 3–5 abstract slabs near the periphery, raised toward the camera so an
    // off-axis perspective shows their sides — low-contrast paper/stone tones.
    const slabMat = new THREE.MeshStandardMaterial({ color: paper, roughness: 0.95, metalness: 0 });
    const slabDeepMat = new THREE.MeshStandardMaterial({ color: deskDeep, roughness: 1, metalness: 0 });
    const slabs: Array<[number, number, number, number, number, Material]> = [
      // x, y, w, h, depth(z), material
      [-2200, 900, 1300, 700, 220, slabMat],
      [2000, -1100, 1500, 900, 300, slabDeepMat],
      [1900, 1200, 900, 600, 180, slabMat],
      [-1900, -1200, 1100, 800, 260, slabDeepMat],
      [-200, 1600, 1700, 500, 160, slabMat],
    ];
    for (const [x, y, w, h, d, mat] of slabs) {
      const slab = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      slab.position.set(x, -y, d / 2); // desk y is down; three y is up
      world.add(slab);
    }

    // Warm lighting: broad ambient + one directional creating a pool toward centre.
    world.add(new THREE.AmbientLight(0xfff4e6, 0.55));
    const key = new THREE.DirectionalLight(0xffe9cc, 0.85);
    key.position.set(-600, 900, 1600);
    world.add(key);

    let vw = 0;
    let vh = 0;
    let idleSince = 0;
    let lastKey = '';
    const halfFovTan = Math.tan((FOV * Math.PI) / 360);

    function resize(): void {
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      vw = rect.width;
      vh = rect.height;
      renderer.setSize(vw, vh, false);
      camera.aspect = vw / vh;
    }

    /**
     * Position the camera from the store pose. Distance maps from zoom so the
     * ground's scale matches the DOM plane; x/y pan is parallaxed for depth.
     */
    function syncCamera(p: Pose): void {
      const dist = vh / (2 * p.zoom * halfFovTan);
      const cx = p.x * PARALLAX;
      const cy = -p.y * PARALLAX;
      camera.position.set(cx, cy, dist);
      camera.lookAt(cx, cy, 0);
      camera.updateProjectionMatrix();
    }

    function frame(now: number): void {
      if (document.hidden) {
        running = false;
        return;
      }
      const p = cameraPose();
      const key = `${p.x.toFixed(1)},${p.y.toFixed(1)},${p.zoom.toFixed(3)}`;
      if (key !== lastKey) {
        lastKey = key;
        idleSince = now;
        syncCamera(p);
        renderer.render(world, camera);
      } else if (now - idleSince > IDLE_MS) {
        running = false; // the camera has rested; stop drawing (§8 budget)
        return;
      }
      rafId = requestAnimationFrame(frame);
    }

    function wake(): void {
      if (running || document.hidden) return;
      running = true;
      idleSince = performance.now();
      rafId = requestAnimationFrame(frame);
    }

    const observer = new ResizeObserver(() => {
      resize();
      lastKey = ''; // force a re-render at the new size
      wake();
    });
    trackObserver = observer;
    observer.observe(canvas);
    resize();

    // The "lights on" moment (§8): fade the canvas in once the first frame is up.
    syncCamera(cameraPose());
    renderer.render(world, camera);
    canvas.classList.add('is-lit');
    wake();

    const onVisible = (): void => wake();
    trackOnVisible = onVisible;
    document.addEventListener('visibilitychange', onVisible);

    return { destroy: disposeAll, wake };
  } catch (err) {
    // Release anything we managed to allocate before re-throwing, so mount()'s
    // catch just logs and stays on the CSS ground with nothing leaked.
    disposeAll();
    throw err;
  }
}

/** Wake the scene's render loop (called by the desk runtime when a nav starts). */
export function wakeDeskScene(): void {
  scene?.wake();
}
