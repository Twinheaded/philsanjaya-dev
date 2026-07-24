/**
 * The WebGL background scene (Layer 0, §8) — the room the desk sits in.
 *
 * Atmosphere only: a matte ground plane in the desk tone, a few abstract slab
 * volumes near the periphery for perspective depth, warm lighting, and a
 * camera-synced vertex-grade vignette to `--desk-deep` (§8's fog vignette,
 * reworked in FIX B — fog depth is flat across a head-on ground, so the grade
 * carries the vignette instead). No texture maps, no shadow maps (§8).
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
import { cubicBezier, type Pose } from '../lib/camera';
import { cameraPose } from './desk';

const PARALLAX = 0.85;
const FOV = 35;
const IDLE_MS = 2000; // pause the render loop after this long with no camera move
const DESK_W = 5200;
const DESK_H = 3400;

// §13 mobile (M9): a simplified STATIC camera — head-on at rest scale, zoom
// ignored (on mobile it is the reveal's progress clock, not a projection
// input), with a slight vertical parallax from the roll. The store's roll y
// spans the desk band (±1700), so 0.06 drifts the room ≈ ±100 units across
// the whole roll — atmosphere, not travel.
const mobileMq = window.matchMedia('(max-width: 767px)');
const MOBILE_PARALLAX = 0.06;
/** DPR cap: 1.5 desktop (§8), 1 on the roll (§13). */
const dprCap = (): number => (mobileMq.matches ? 1 : 1.5);

/**
 * Luminance-parity calibration (FIX B). The lights-on fade may change light
 * QUALITY, never QUANTITY: the rendered ground must match the CSS ground (the
 * rung-2 radial gradient it fades over) — pool tone at the frame centre, the
 * gradient's corner tone at the corners, ΔY ≤ 2–3 at every sampled point.
 *
 * HOW: a camera-synced vertex grade. Fog cannot produce a radial vignette here
 * — three's fog depth is the view-plane z (constant across a head-on ground),
 * which is exactly why the M5 scene rendered flat. Instead the ground plane is
 * subdivided and syncCamera recomputes its vertex colors from the SAME radial
 * profile the CSS ground uses (§3 ellipse 145%×125% at 50%,38%), projected
 * through the live camera — so the pool tracks the viewport precisely as the
 * CSS pool does, at every pose and zoom, and the periphery grades to
 * --desk-deep. No texture maps (§8): the grade is a geometry attribute.
 *
 * The lights are white and flat: three's physically-based diffuse divides the
 * light sum by π (measured — a lit level ~0.36× naive expectation), so the
 * intensities carry a π factor; LIGHT_GAIN is the residual trim measured with
 * the ?debug=scene harness (the standard material's broad F0=0.04 specular
 * adds a few flat percent).
 */
const LIGHT_GAIN = 1.0;
/**
 * Lights-on warm-up (§8 follow-up): the grade starts FLATTENED — every vertex
 * at the viewport-mean tone, same average luminance — and eases to full
 * pool/vignette contrast over ~900ms, slabs riding the same ease. Light
 * REDISTRIBUTES; the whole-desk mean is invariant at every instant by
 * construction (mixing toward the area mean preserves the mean in linear
 * space). Under prefers-reduced-motion there is no warm-up: full contrast
 * immediately.
 */
const WARMUP_MS = 900;
/** The --ease-settle curve (§5) — a lift-in, for the room waking. */
const easeSettle = cubicBezier(0.2, 0, 0, 1);
const reducedMotion = (): boolean =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;
/** Ground subdivisions for the vertex grade (the gradient is slow — linear
 *  interpolation across a ~90-unit quad is far below 1 ΔY of error). */
const GRADE_SEGS_X = 96;
const GRADE_SEGS_Y = 64;
/** The CSS ground's radial-gradient geometry (global.css body): ellipse radii
 *  as fractions of the viewport, centre in normalized viewport coords. */
const POOL_CX = 0.5;
const POOL_CY = 0.38;
const POOL_RX = 1.45;
const POOL_RY = 1.25;
const POOL_MID_STOP = 0.46; // pool -> desk at 46%, desk -> deep at 100%

/** sRGB EOTF (electro-optical): 0-1 sRGB component to linear. */
function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

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
  const ric = (
    window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => void;
    }
  ).requestIdleCallback;
  const run = () => void mount();
  // The timeout deadline matters: a hidden tab gets no idle periods at all, so
  // without it the scene would never init in the background (and the harness
  // could never measure it there). 2s is still comfortably post-idle.
  if (ric) ric(run, { timeout: 2000 });
  else window.setTimeout(run, 200);
}

let scene: DeskScene | null = null;

async function mount(): Promise<void> {
  const canvas = document.getElementById('desk-scene') as HTMLCanvasElement | null;
  if (!canvas || scene) return;

  // §13 rung-2 threshold: Save-Data on a phone keeps the CSS ground — the
  // ~188KB three chunk is never fetched. Evaluated once at first idle: a
  // session that STARTS narrow with Save-Data stays on rung 2 for its
  // lifetime (the `started` latch never re-runs mount), which is the intended
  // read of the preference; a later rotate to a wide viewport does not fetch
  // three. Desktop that starts wide is unaffected (§8 gates on failure only).
  const conn = (navigator as { connection?: { saveData?: boolean } }).connection;
  if (mobileMq.matches && conn?.saveData === true) {
    console.info('desk scene: rung 2 — CSS ground (Save-Data, §13)');
    return;
  }

  let THREE: typeof import('three');
  try {
    THREE = await import('three');
  } catch {
    console.warn('desk scene: three failed to load; staying on the CSS ground');
    console.info('desk scene: rung 2 — CSS ground fallback (three failed to load)');
    return;
  }

  try {
    scene = build(THREE, canvas);
  } catch (err) {
    // build() disposes its own partial allocation before throwing, so there is
    // nothing to clean up here — just log and stay on the CSS ground.
    console.warn('desk scene: init failed; staying on the CSS ground', err);
    console.info('desk scene: rung 2 — CSS ground fallback (init failed)');
    scene = null;
  }
}

const debugScene = (): boolean => {
  try {
    return (
      new URLSearchParams(location.search).get('debug') === 'scene' ||
      localStorage.getItem('debug:scene') === '1'
    );
  } catch {
    return false;
  }
};

function build(THREE: typeof import('three'), canvas: HTMLCanvasElement): DeskScene {
  const desk = tokenColor('--desk', 0xd8d2c6);
  const deskDeep = tokenColor('--desk-deep', 0xc7c0b2);
  const paper = tokenColor('--paper', 0xfafaf8);
  const pool = tokenColor('--desk-pool', 0xe1dcd3);

  // Tracking refs for cleanup. Held outside the try so `disposeAll` can release
  // whatever was allocated even if construction throws part-way through — the
  // WebGL context + geometries must never leak on the fall-back-to-CSS path (§8).
  let trackRenderer: WebGLRenderer | null = null;
  let trackWorld: Scene | null = null;
  let trackObserver: ResizeObserver | null = null;
  let trackOnVisible: (() => void) | null = null;
  let trackOnMq: (() => void) | null = null;
  let rafId = 0;
  let litRaf = 0;
  let running = false;

  const disposeAll = (): void => {
    cancelAnimationFrame(rafId);
    cancelAnimationFrame(litRaf); // a pending lights-on must not fire post-dispose
    running = false;
    trackObserver?.disconnect();
    if (trackOnVisible) document.removeEventListener('visibilitychange', trackOnVisible);
    if (trackOnMq) mobileMq.removeEventListener('change', trackOnMq);
    trackRenderer?.dispose();
    trackWorld?.traverse((o) => {
      const mesh = o as { geometry?: { dispose(): void }; material?: { dispose(): void } };
      mesh.geometry?.dispose();
      mesh.material?.dispose();
    });
    canvas.classList.remove('is-lit');
    canvas.dataset.rung = '2'; // the CSS ground is the active rung again
    delete (window as unknown as Record<string, unknown>).__deskScene;
  };

  try {
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    trackRenderer = renderer;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, dprCap()));
    // Pin the output pipeline (FIX B): sRGB out, no tone mapping — these are
    // today's three defaults, but the luminance calibration depends on them, so
    // a future three default drift must not silently re-grade the desk.
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;

    const world = new THREE.Scene();
    trackWorld = world;

    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 20000);

    // Ground: a large matte plane in the z=0 plane facing +z, subdivided so a
    // camera-synced vertex grade can carry the §3 two-tone profile (FIX B —
    // see the calibration comment at the top). Material colour is WHITE: the
    // grade IS the colour (vColor multiplies the diffuse), so the rendered
    // ground equals the CSS gradient tone at every vertex.
    const groundGeo = new THREE.PlaneGeometry(
      DESK_W * 1.6,
      DESK_H * 1.6,
      GRADE_SEGS_X,
      GRADE_SEGS_Y
    );
    groundGeo.setAttribute(
      'color',
      new THREE.BufferAttribute(new Float32Array((GRADE_SEGS_X + 1) * (GRADE_SEGS_Y + 1) * 3), 3)
    );
    const ground = new THREE.Mesh(
      groundGeo,
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        vertexColors: true,
        roughness: 1,
        metalness: 0,
      })
    );
    world.add(ground);

    // The three gradient stops in LINEAR space (CSS interpolates the gradient
    // in sRGB, so mixing happens in sRGB and converts after — see gradeAt).
    const poolC = new THREE.Color(pool);
    const deskC = new THREE.Color(desk);
    const deepC = new THREE.Color(deskDeep);
    const stops = [poolC, deskC, deepC].map((c) => {
      // Color(hex) already converted to linear working space; recover sRGB 0-1.
      const s = c.clone().convertLinearToSRGB();
      return [s.r, s.g, s.b];
    });

    /** The CSS ground tone at gradient-normalized radius g, as LINEAR [r,g,b]. */
    function gradeAt(g: number, out: number[]): void {
      let a: number[];
      let b: number[];
      let t: number;
      if (g <= POOL_MID_STOP) {
        a = stops[0];
        b = stops[1];
        t = g / POOL_MID_STOP;
      } else {
        a = stops[1];
        b = stops[2];
        t = Math.min(1, (g - POOL_MID_STOP) / (1 - POOL_MID_STOP));
      }
      out[0] = srgbToLinear(a[0] + (b[0] - a[0]) * t);
      out[1] = srgbToLinear(a[1] + (b[1] - a[1]) * t);
      out[2] = srgbToLinear(a[2] + (b[2] - a[2]) * t);
    }

    // The grade repaints per vertex on every moved frame — precompute the
    // radius->linear-tone curve once so the hot loop is an index pick, not
    // three pow() calls per vertex. 1024 samples over g in [0,1] keeps the
    // quantisation far below 1 ΔY.
    const LUT_N = 1024;
    const gradeLut = new Float32Array(LUT_N * 3);
    {
      const tone: number[] = [0, 0, 0];
      for (let i = 0; i < LUT_N; i++) {
        gradeAt(i / (LUT_N - 1), tone);
        gradeLut[i * 3] = tone[0];
        gradeLut[i * 3 + 1] = tone[1];
        gradeLut[i * 3 + 2] = tone[2];
      }
    }

    // The FLAT warm-up tone: the viewport-area mean of the grade in linear
    // space. The profile lives in NORMALIZED viewport coords (the CSS ellipse
    // radii are viewport fractions), so this is a constant — pose- and
    // aspect-independent. Mixing every vertex toward it keeps the whole-desk
    // mean exact at every warm-up instant.
    const flat: [number, number, number] = [0, 0, 0];
    {
      let n = 0;
      for (let iy = 0; iy < 16; iy++) {
        for (let ix = 0; ix < 24; ix++) {
          const nx = (ix + 0.5) / 24;
          const ny = (iy + 0.5) / 16;
          const g = Math.hypot((nx - POOL_CX) / POOL_RX, (ny - POOL_CY) / POOL_RY);
          const li = 3 * Math.min(LUT_N - 1, Math.round(g * (LUT_N - 1)));
          flat[0] += gradeLut[li];
          flat[1] += gradeLut[li + 1];
          flat[2] += gradeLut[li + 2];
          n++;
        }
      }
      flat[0] /= n;
      flat[1] /= n;
      flat[2] /= n;
    }

    // Warm-up state: contrast 0 = flat room, 1 = full pool/vignette. Reduced
    // motion never warms up — full contrast from the first frame.
    let contrast = reducedMotion() ? 1 : 0;
    let warmupStart = -1; // performance.now() when lights-on started the ease

    // 3–5 abstract slabs near the periphery, raised toward the camera so an
    // off-axis perspective shows their sides — low-contrast warm stone tones.
    // The albedos are premixed DOWN by the M5 warm rig's lit factors
    // ((0.55·amb + 0.85·cosθ·key)/π per channel of the old 0xfff4e6/0xffe9cc
    // lights): the FIX B rig is white and π-compensated (it renders albedo at
    // ~1.0× for the ground grade), and without this the slabs would blow out to
    // full token tone — a paper slab reading as a foreground document card, and
    // a hard load at a slab-heavy pose (e.g. /notes) breaking the ≤1.5%
    // whole-desk fade budget (adversarial review).
    const M5_SLAB_LIT: [number, number, number] = [0.399, 0.341, 0.274];
    const slabTone = (hex: number) => {
      const c = new THREE.Color(hex); // hex setter → linear working space
      return c.setRGB(c.r * M5_SLAB_LIT[0], c.g * M5_SLAB_LIT[1], c.b * M5_SLAB_LIT[2]);
    };
    // The slabs ride the warm-up as OPACITY (review): mixing their albedo
    // toward the flat tone left their SIDE faces visible at contrast 0 (side
    // normals get a different light sum than the +z ground, so no albedo makes
    // them match). A transparent slab IS the ground behind it — exactly, at
    // every pose — and fades monotonically into the accepted rest look.
    const slabMat = new THREE.MeshStandardMaterial({
      color: slabTone(paper),
      roughness: 0.95,
      metalness: 0,
      transparent: true,
    });
    const slabDeepMat = new THREE.MeshStandardMaterial({
      color: slabTone(deskDeep),
      roughness: 1,
      metalness: 0,
      transparent: true,
    });

    /** Push the current contrast into the slab materials (the ground's mix
     *  happens per vertex in syncCamera). */
    function applyContrast(): void {
      slabMat.opacity = contrast;
      slabDeepMat.opacity = contrast;
    }
    applyContrast();
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

    // Lighting (FIX B): flat and white, sized so a white-albedo surface renders
    // its vertex-grade tone EXACTLY — the warmth lives in the grade (the token
    // palette), so the fade over the CSS ground is hue-neutral by construction.
    // three's physical diffuse divides the light sum by π; the §8 ambient/key
    // balance (0.55 : 0.85·cosθ) splits the compensated total, and LIGHT_GAIN
    // is the measured trim (the flat residual specular sheen).
    const keyPos = new THREE.Vector3(-600, 900, 1600);
    const cosTheta = keyPos.clone().normalize().z; // ground normal is +z
    const balance = 0.55 + 0.85 * cosTheta;
    const total = (Math.PI / balance) * LIGHT_GAIN;
    world.add(new THREE.AmbientLight(0xffffff, 0.55 * total));
    const key = new THREE.DirectionalLight(0xffffff, 0.85 * total);
    key.position.copy(keyPos);
    world.add(key);

    let vw = 0;
    let vh = 0;
    let idleSince = 0;
    let lastKey = '';
    // §13: on mobile the grade paints once per size (and through the warm-up)
    // — the slight parallax drift is far too small to re-project 6k vertices
    // for every frame of a scroll.
    let gradePainted = false;
    const halfFovTan = Math.tan((FOV * Math.PI) / 360);

    function resize(): void {
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      vw = rect.width;
      vh = rect.height;
      // Refresh the DPR cap: monitor drags and browser zoom change
      // devicePixelRatio, and setSize scales the buffer from the STORED ratio
      // (review — a stale ratio renders soft on a sharper display). The cap
      // itself is modal: 1.5 desktop, 1 on the roll (§13).
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, dprCap()));
      renderer.setSize(vw, vh, false);
      camera.aspect = vw / vh;
      gradePainted = false; // the §13 one-shot grade repaints at the new size
    }

    /**
     * Repaint the grade in normalized-viewport space: a ground vertex at
     * world (wx, wy) sits at screen nx = 0.5 + (wx-cx)/visW (head-on camera),
     * ny = 0.5 - (wy-cy)/visH (three y-up vs screen y-down).
     */
    function paintGrade(cx: number, cy: number, visW: number, visH: number): void {
      const pos = groundGeo.getAttribute('position');
      const col = groundGeo.getAttribute('color') as { array: Float32Array; needsUpdate: boolean };
      const arr = col.array;
      for (let i = 0; i < pos.count; i++) {
        const nx = 0.5 + (pos.getX(i) - cx) / visW;
        const ny = 0.5 - (pos.getY(i) - cy) / visH;
        const g = Math.hypot((nx - POOL_CX) / POOL_RX, (ny - POOL_CY) / POOL_RY);
        const li = 3 * Math.min(LUT_N - 1, Math.round(g * (LUT_N - 1)));
        // Warm-up mix (mean-invariant): flat room tone -> full grade.
        arr[i * 3] = flat[0] + (gradeLut[li] - flat[0]) * contrast;
        arr[i * 3 + 1] = flat[1] + (gradeLut[li + 1] - flat[1]) * contrast;
        arr[i * 3 + 2] = flat[2] + (gradeLut[li + 2] - flat[2]) * contrast;
      }
      col.needsUpdate = true;
    }

    /**
     * Position the camera from the store pose. Distance maps from zoom so the
     * ground's scale matches the DOM plane; x/y pan is parallaxed for depth.
     * The vertex grade re-projects with the camera (FIX B): the pool stays
     * viewport-anchored — exactly the CSS ground's behaviour — at every pose
     * and zoom, and the desk beyond the frame grades on to --desk-deep.
     *
     * §13 mobile: a simplified STATIC camera instead — head-on at rest scale
     * (zoom is the reveal's clock there, not a projection input), a slight
     * vertical parallax from the roll's y, and a one-shot grade (repainted
     * only for the warm-up and on resize — the drift is too small to
     * re-project per scroll frame).
     */
    function syncCamera(p: Pose, warming = false): void {
      if (mobileMq.matches) {
        const dist = vh / (2 * halfFovTan);
        const cy = -p.y * MOBILE_PARALLAX;
        camera.position.set(0, cy, dist);
        camera.lookAt(0, cy, 0);
        camera.updateProjectionMatrix();
        if (!gradePainted || warming) {
          paintGrade(0, 0, vw, vh);
          gradePainted = true;
        }
        return;
      }
      gradePainted = false; // desktop repaints every sync; mobile re-arms
      const dist = vh / (2 * p.zoom * halfFovTan);
      const cx = p.x * PARALLAX;
      const cy = -p.y * PARALLAX;
      camera.position.set(cx, cy, dist);
      camera.lookAt(cx, cy, 0);
      camera.updateProjectionMatrix();
      paintGrade(cx, cy, vw / p.zoom, vh / p.zoom);
    }

    function frame(now: number): void {
      if (document.hidden) {
        running = false;
        return;
      }
      // Self-heal a zero-size init: build() can run before a background tab's
      // first layout (rect 0x0), and the ResizeObserver's correction is part
      // of the rendering steps — which never ran while hidden. Cheap no-op
      // whenever the size is real.
      if (vh === 0) resize();
      // Advance the lights-on warm-up: contrast eases 0 -> 1 over WARMUP_MS.
      // `warming` stays true for the final c = 1 frame so it renders.
      let warming = false;
      if (warmupStart >= 0) {
        const raw = (now - warmupStart) / WARMUP_MS;
        contrast = raw >= 1 ? 1 : easeSettle(raw);
        if (raw >= 1) warmupStart = -1;
        applyContrast();
        warming = true;
      }
      const p = cameraPose();
      // On the roll only y is a projection input (x locked, zoom is the
      // reveal's clock — syncCamera ignores both), so x/zoom must not be
      // render-dirty inputs either: otherwise a document open/close zoom
      // ramp forces ~27 bit-identical full-scene renders during exactly the
      // frames the reveal contends for (review). Desktop keys on all three.
      const key = mobileMq.matches
        ? p.y.toFixed(1)
        : `${p.x.toFixed(1)},${p.y.toFixed(1)},${p.zoom.toFixed(3)}`;
      if (key !== lastKey || warming) {
        lastKey = key;
        idleSince = now;
        syncCamera(p, warming);
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

    // Crossing the 768px boundary swaps camera modes AND the DPR cap (§13):
    // re-cap, invalidate the grade and the pose key, and draw a frame.
    const onMq = (): void => {
      resize();
      gradePainted = false;
      lastKey = '';
      wake();
    };
    trackOnMq = onMq;
    mobileMq.addEventListener('change', onMq);

    // The "lights on" moment (§8 + FIX B): render first, then start the 600ms
    // fade from a rAF callback — rAF runs just before the paint that composites
    // the rendered canvas, so the crossfade can never begin on a blank frame
    // (the measured mid-fade dip). While the tab is hidden, rAF (and so the
    // fade AND the warm-up) defers until the scene is actually visible. The
    // rung flip + one console.info make the state observable in two seconds —
    // parity made rung 1 and rung 2 identical at rest, so a silent init
    // failure would otherwise be invisible.
    syncCamera(cameraPose());
    renderer.render(world, camera);
    litRaf = requestAnimationFrame(() => {
      canvas.classList.add('is-lit');
      canvas.dataset.rung = '1';
      console.info('desk scene: rung 1 — Layer 0 live (lights on)');
      // Decide the warm-up ONCE, here, in both directions (review): a
      // reduced-motion flip between build and lights-on must neither strand a
      // flat room (contrast 0, no warm-up ever) nor dip an already-full scene.
      if (reducedMotion()) {
        if (contrast !== 1) {
          contrast = 1;
          applyContrast();
          lastKey = ''; // force the woken loop to render the corrected frame
        }
      } else if (contrast < 1) {
        warmupStart = performance.now();
      }
      wake();
    });

    const onVisible = (): void => wake();
    trackOnVisible = onVisible;
    document.addEventListener('visibilitychange', onVisible);

    // Measurement harness (?debug=scene or localStorage debug:scene=1): one
    // manual render + readPixels — no rAF, works with the pane hidden — so
    // luminance parity is verifiable against the CSS gradient (FIX B).
    if (debugScene()) {
      (window as unknown as Record<string, unknown>).__deskScene = {
        renderer,
        world,
        camera,
        syncCamera,
        /** Render once and sample RGBA at normalized viewport points (y down). */
        sample(points: Array<[number, number]>): number[][] {
          resize(); // hidden panes never ran the ResizeObserver correction
          syncCamera(cameraPose());
          renderer.render(world, camera);
          const gl = renderer.getContext();
          const w = gl.drawingBufferWidth;
          const h = gl.drawingBufferHeight;
          const px = new Uint8Array(4);
          return points.map(([nx, ny]) => {
            gl.readPixels(
              Math.round(nx * (w - 1)),
              Math.round((1 - ny) * (h - 1)),
              1,
              1,
              gl.RGBA,
              gl.UNSIGNED_BYTE,
              px
            );
            return [px[0], px[1], px[2], px[3]];
          });
        },
        /** Force a warm-up contrast (0..1) for mid-fade parity measurement —
         *  cancels a running warm-up; set back to 1 when done. */
        setContrast(c: number): void {
          warmupStart = -1;
          contrast = Math.max(0, Math.min(1, c));
          applyContrast();
          // Keep the LIVE canvas in sync on visible tabs (review): the loop
          // only renders on pose change, so invalidate and wake it. On mobile
          // the grade is a one-shot — force it to repaint at the new contrast
          // too, or the ground stays graded at the old value under new slabs.
          gradePainted = false;
          lastKey = '';
          wake();
        },
        /** Render once and return the whole-frame mean [R,G,B]. */
        mean(): number[] {
          resize(); // hidden panes never ran the ResizeObserver correction
          syncCamera(cameraPose());
          renderer.render(world, camera);
          const gl = renderer.getContext();
          const w = gl.drawingBufferWidth;
          const h = gl.drawingBufferHeight;
          const buf = new Uint8Array(w * h * 4);
          gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
          let r = 0;
          let g = 0;
          let b = 0;
          const n = w * h;
          for (let i = 0; i < buf.length; i += 4) {
            r += buf[i];
            g += buf[i + 1];
            b += buf[i + 2];
          }
          return [r / n, g / n, b / n];
        },
      };
    }

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
