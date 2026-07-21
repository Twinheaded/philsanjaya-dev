/**
 * Desk runtime (M3, PHI-64): the camera store wired to routing.
 *
 * A module singleton that survives ClientRouter swaps. It owns one CameraStore,
 * drives it from a single rAF loop, and writes the pose to the exact CSS vars M2
 * emits (`--cam-x/--cam-y/--cam-zoom` on <body>) — one positioning system
 * (note 1). The same loop renders the desk-space agent field (note 7).
 *
 * SLIDE is zone<->zone only (note 5). Zone<->document keeps M2's crossfade.
 * Navigation and popstate both retarget the tween from the live pose (notes 3),
 * because ClientRouter routes back/forward through the same transition events.
 * Under reduced motion every move is an instant cut (§7).
 *
 * The tween runs on rAF, which never ticks while the document is hidden — so the
 * motion cannot be exercised in the headless preview pane (that is where feel is
 * verified in a real browser, note 6). The maths is unit-tested in
 * test/camera.test.ts.
 */

import { CameraStore, type Pose } from '../lib/camera';
import { zoneForPath } from '../lib/zones';
import { mountDeskField, type DeskField } from './desk-field';

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function readServerPose(): Pose {
  const s = getComputedStyle(document.body);
  const num = (name: string, fallback: number) => {
    const n = parseFloat(s.getPropertyValue(name));
    return Number.isFinite(n) ? n : fallback;
  };
  return { x: num('--cam-x', 0), y: num('--cam-y', 0), zoom: num('--cam-zoom', 1) };
}

// Boot: adopt the server-rendered pose as the store's initial state (note 1) —
// zero first-frame jump, because <body> already carries these exact values.
const store = new CameraStore(readServerPose(), { reduced });

/** Expose the live pose for other desk layers (the WebGL scene lands in M5). */
export function cameraPose(): Pose {
  return store.current;
}

function writePose(): void {
  const p = store.current;
  const b = document.body;
  b.style.setProperty('--cam-x', String(p.x));
  b.style.setProperty('--cam-y', String(p.y));
  b.style.setProperty('--cam-zoom', String(p.zoom));
}

/**
 * Zone routes (Desk) get the Slide; document routes (Sheet) keep the crossfade
 * (note 5). `/projects/<slug>` etc. are documents; `/notes/2` stays a zone.
 */
function isZoneRoute(pathname: string): boolean {
  const p = pathname.replace(/\/+$/, '') || '/';
  return p === '/' || p === '/about' || /^\/(projects|notes|log)(\/\d+)?$/.test(p);
}

function poseFor(pathname: string): Pose {
  const z = zoneForPath(pathname);
  return { x: z.x, y: z.y, zoom: z.zoom };
}

// --- The single rAF loop: camera + field. -------------------------------------
let field: DeskField | null = null;
let rafId = 0;
let running = false;
let wasAnimating = false;

function frame(now: number): void {
  const animating = store.tick(now);
  if (animating) writePose();
  else if (wasAnimating) settle();
  wasAnimating = animating;
  field?.frame(now, store.current);
  if (running) rafId = requestAnimationFrame(frame);
}

function startLoop(): void {
  if (running || document.hidden) return;
  running = true;
  rafId = requestAnimationFrame(frame);
}

function stopLoop(): void {
  running = false;
  cancelAnimationFrame(rafId);
}

/** Ran once the camera settles: end the slide cleanly (note 2). */
function settle(): void {
  writePose();
  document.querySelector('.desk-plane')?.classList.remove('is-sliding');
  moveFocusToArrivedHeading();
}

// --- Focus (note 2): never strand focus in the departing/inert zone. ----------
let focusWasInDepartingMain = false;

function moveFocusToArrivedHeading(): void {
  if (!focusWasInDepartingMain) return;
  focusWasInDepartingMain = false;
  // The arriving zone's heading is an <h1> in either class (Home uses
  // .home__name, the others .zone-title), so match the landmark's h1 directly.
  const heading = document.querySelector<HTMLElement>('main#main h1');
  if (heading) {
    heading.setAttribute('tabindex', '-1');
    heading.focus({ preventScroll: true });
  }
}

// --- Navigation intercept. ----------------------------------------------------
// URL updates at motion start: ClientRouter pushes state as the navigation
// begins, and we start the tween here, in the same tick.
document.addEventListener('astro:before-preparation', (e) => {
  const ev = e as Event & { to?: URL };
  const toPath = ev.to?.pathname ?? location.pathname;
  // Only act when leaving a desk (a document route has no plane to move).
  if (!document.querySelector('.desk-plane')) return;
  if (!isZoneRoute(toPath)) return; // zone -> document: crossfade owns it (note 5)

  const currentMain = document.querySelector('.zone[data-current]');
  focusWasInDepartingMain = !!currentMain && currentMain.contains(document.activeElement);

  const target = poseFor(toPath);
  if (reduced) {
    store.snap(target);
    return;
  }
  // Release content-visibility on every zone so the arriving one is not blank as
  // it slides in and the departing one keeps rendering as it leaves (note 2).
  document.querySelector('.desk-plane')?.classList.add('is-sliding');
  store.slideTo(target, performance.now());
  startLoop();
});

// After the document swaps, re-assert the live pose so the swap does not cut to
// the incoming server pose, and keep the slide going on the new plane.
document.addEventListener('astro:after-swap', () => {
  const plane = document.querySelector('.desk-plane');
  if (!plane) return; // arrived on a document — no desk to pose
  // A settled arrival (hard nav, or coming back from a document) adopts the
  // destination pose; a slide in flight keeps its live pose for continuity.
  if (!store.isAnimating) store.snap(poseFor(location.pathname));
  writePose();
  if (!reduced && store.isAnimating) plane.classList.add('is-sliding');
});

// --- Per-page (re)initialisation. ---------------------------------------------
function onPageLoad(): void {
  const plane = document.querySelector('.desk-plane');
  const canvas = document.getElementById('desk-field') as HTMLCanvasElement | null;

  // Rebind / tear down the field to the current page's canvas.
  field?.destroy();
  field = canvas ? mountDeskField(canvas) : null;

  if (!plane) {
    // Document route: no desk to animate. Settle the store on this page's pose,
    // so a slide interrupted by diving into a document (its before-preparation
    // early-returns without touching the store) cannot leave it stuck animating
    // and freeze the next zone arrival at a stale pose.
    store.snap(poseFor(location.pathname));
    stopLoop();
    wasAnimating = false;
    return;
  }

  // When settled (hard load, or a non-slide arrival), adopt this page's pose and
  // clear any inherited slide state. A slide still in flight is left untouched so
  // it finishes and settle() cleans up.
  if (!store.isAnimating) {
    plane.classList.remove('is-sliding');
    store.snap(poseFor(location.pathname));
  }

  if (reduced) {
    writePose();
    // Reduced motion has no tween, so settle() never runs — manage focus here.
    moveFocusToArrivedHeading();
    field?.renderStatic(store.current);
    return;
  }
  startLoop();
}

document.addEventListener('astro:page-load', onPageLoad);

// Park the loop while hidden (§8); resume on return.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopLoop();
  else if (document.querySelector('.desk-plane') && !reduced) startLoop();
});

// Cold start (astro:page-load also fires on first load, but guard for direct
// module eval before it): kick the field/loop if we are already on a desk.
if (document.readyState !== 'loading') onPageLoad();
