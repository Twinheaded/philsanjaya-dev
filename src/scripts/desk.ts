/**
 * Desk runtime (M3/M4): the camera store wired to routing, plus Fold/Stack.
 *
 * A module singleton that survives ClientRouter swaps. It owns one CameraStore,
 * drives it from a single rAF loop, and writes the pose to the CSS vars the
 * layouts emit (`--cam-x/--cam-y/--cam-zoom` on <body>) — one positioning system
 * (M3 note 1). The same loop renders the desk-space agent field (M3 note 7).
 *
 * Every navigation is a camera move now (M4 note 2): a zone Slide, or a document
 * push to the parent zone at the document zoom (opening a card into a document).
 * Nav and popstate both retarget the tween from the live pose (note 3), because
 * ClientRouter routes back/forward through the same transition events. STACK is
 * CSS, keyed on `body[data-view]`. Esc folds an open document to its parent.
 * Focus follows EVERY navigation (M4 note 8). Under reduced motion moves are
 * instant cuts (§7).
 *
 * The tween runs on rAF, which never ticks while the document is hidden — so the
 * motion cannot be exercised in the headless preview pane (feel is verified in a
 * real browser, note 6). The maths/state machine are unit-tested in
 * test/camera.test.ts and test/nav.test.ts.
 */

import { navigate } from 'astro:transitions/client';
import { CameraStore, type Pose } from '../lib/camera';
import { isDocumentRoute, isPageRoute, normalisePath, resolvePose } from '../lib/nav';
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

// Boot: adopt the server-rendered pose (note 1) — zero first-frame jump.
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

const plane = () => document.querySelector('.desk-plane');

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
  // Keep looping while the camera is moving or the field needs redrawing; a
  // settled document page (field hidden -> not mounted) lets the loop stop.
  if (running && (animating || field)) rafId = requestAnimationFrame(frame);
  else running = false;
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

/** Ran once the camera settles: end the move cleanly. */
function settle(): void {
  writePose();
  plane()?.classList.remove('is-sliding');
}

// --- Focus (M4 note 8): every navigation lands focus in the arriving content. --
let pendingFocus = false;
let departedFrom = ''; // the path we navigated away from (for close -> card)

function manageFocus(): void {
  if (document.body.dataset.view === 'document') {
    // Opened a document: focus its heading.
    const h = document.querySelector<HTMLElement>('main#main h1') ?? document.getElementById('main');
    focusEl(h);
    return;
  }
  // Arrived at a zone. If we just closed a document, return focus to the card it
  // came from (note 4); otherwise the arriving zone's heading (note 8).
  if (departedFrom && isDocumentRoute(departedFrom)) {
    const card = document.querySelector<HTMLElement>(
      `main#main a[href="${departedFrom}"]`
    );
    if (card) {
      focusEl(card);
      return;
    }
  }
  focusEl(document.querySelector<HTMLElement>('main#main h1'));
}

function focusEl(el: HTMLElement | null): void {
  if (!el) return;
  // Headings are not natively focusable, so give them a programmatic-focus
  // tabindex. Never do this to elements already in the tab order (anchors,
  // buttons) — tabindex="-1" would REMOVE them from it (WCAG 2.4.3).
  if (!el.matches('a[href], button, input, select, textarea, [tabindex]')) {
    el.setAttribute('tabindex', '-1');
  }
  el.focus({ preventScroll: true });
}

// --- Navigation intercept: start the camera move as the nav begins. -----------
document.addEventListener('astro:before-preparation', (e) => {
  const ev = e as Event & { from?: URL; to?: URL };
  const toPath = ev.to?.pathname ?? location.pathname;
  if (!plane()) return; // defensive; every route renders a plane
  if (!isPageRoute(toPath)) return; // asset/download (e.g. /resume.pdf): no camera
  pendingFocus = true;
  // Read the origin from the event, not `location`: on popstate the browser has
  // already moved `location` to the destination before this fires, so
  // `location.pathname` would be the destination, breaking close -> card focus.
  departedFrom = normalisePath((ev.from ?? location).pathname);

  const target = resolvePose(toPath);
  if (reduced) {
    store.snap(target);
    return;
  }
  // Release content-visibility on every zone for the move so neither the
  // arriving nor the departing zone is blank while it crosses the frame (note 2).
  plane()?.classList.add('is-sliding');
  store.slideTo(target, performance.now());
  startLoop();
});

// After the swap, re-assert the live pose so the swap does not cut to the
// incoming server pose; keep the move going on the new plane.
document.addEventListener('astro:after-swap', () => {
  const p = plane();
  if (!p) return;
  if (!store.isAnimating) store.snap(resolvePose(location.pathname));
  writePose();
  if (!reduced && store.isAnimating) p.classList.add('is-sliding');
});

// --- Per-page (re)initialisation. ---------------------------------------------
function onPageLoad(): void {
  const p = plane();
  const canvas = document.getElementById('desk-field') as HTMLCanvasElement | null;

  // The field is desk-wide but hidden behind an open document (Stack), so it is
  // only mounted on zone routes — no invisible rendering, and the loop can stop.
  field?.destroy();
  const onDesk = document.body.dataset.view !== 'document';
  field = canvas && onDesk ? mountDeskField(canvas) : null;

  if (!p) {
    stopLoop();
    wasAnimating = false;
    return;
  }

  // Settled arrival (hard load or a non-animating nav): adopt this page's pose
  // and clear any inherited slide state. A move still in flight is left to finish
  // and settle() cleans up.
  if (!store.isAnimating) {
    p.classList.remove('is-sliding');
    store.snap(resolvePose(location.pathname));
    writePose();
  }

  // Focus follows every client navigation (not the initial hard load, which has
  // no pending nav) — note 8. preventScroll keeps the camera in charge of motion.
  if (pendingFocus) {
    pendingFocus = false;
    manageFocus();
  }

  if (reduced) {
    field?.renderStatic(store.current);
    return;
  }
  startLoop();
}

document.addEventListener('astro:page-load', onPageLoad);

// --- Fold with Esc (note 4): close an open document to its parent zone. --------
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || e.defaultPrevented) return;
  if (document.body.dataset.view !== 'document') return;
  const t = e.target as HTMLElement | null;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
  e.preventDefault();
  navigate(zoneForPath(location.pathname).href);
});

// --- Unfold morph (note 1): the clicked card shares its name with the document,
// so the browser FLIP-morphs the card into the opening document. Only the clicked
// card is named, so exactly one shared pair exists across the swap. ------------
document.addEventListener(
  'click',
  (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) {
      return;
    }
    const link = (e.target as HTMLElement | null)?.closest<HTMLAnchorElement>('a[href]');
    if (!link) return;
    const href = link.getAttribute('href') ?? '';
    if (!href.startsWith('/') || !isDocumentRoute(href)) return;
    // Clear any stray name, then tag the clicked card as the morph counterpart.
    for (const el of document.querySelectorAll<HTMLElement>('[style*="view-transition-name"]')) {
      if (el !== link) el.style.removeProperty('view-transition-name');
    }
    link.style.setProperty('view-transition-name', 'unfold');
  },
  true
);

// Park the loop while hidden (§8); resume on return.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopLoop();
  else if (plane() && !reduced) startLoop();
});

// Cold start (astro:page-load also fires on first load, but guard for direct
// module eval before it).
if (document.readyState !== 'loading') onPageLoad();
