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
import {
  beat2Gate,
  isDocumentRoute,
  isPageRoute,
  normalisePath,
  planCamera,
  resolvePose,
  SETTLE_MS,
} from '../lib/nav';
import { zoneForPath } from '../lib/zones';
import { mountDeskField, type DeskField } from './desk-field';

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// The two-beat settle hold, from the --t-settle token (falls back to SETTLE_MS).
const SETTLE = (() => {
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--t-settle').trim();
  const ms = raw.endsWith('ms') ? parseFloat(raw) : Number.NaN;
  return Number.isFinite(ms) ? ms : SETTLE_MS;
})();

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
  tickTwoBeat(now); // may start Beat 2's zoom tween (store.slideTo)
  field?.frame(now, store.current);
  // Keep looping while the camera is moving, the field needs redrawing, or a
  // two-beat open is still holding for its gate. Re-read store.isAnimating AFTER
  // tickTwoBeat — the frame that fires Beat 2 starts a fresh tween AND clears the
  // gate, so the pre-tick `animating` is stale and would stop the loop before the
  // zoom-to-1.45 ever ticks.
  const holdingGate = !!twoBeat && !twoBeat.fired;
  if (running && (store.isAnimating || field || holdingGate)) rafId = requestAnimationFrame(frame);
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

// --- Two-beat cross-zone unfold (§7.3 amended, gated). -------------------------
// Beat 1 travels to the parent zone with the incoming document hidden
// (body[data-unfold=traveling]), so it reads as a plain Slide. Beat 2 — the zoom
// push to 1.45 AND the reveal, together — is gated on
//   max(swap complete, travel leg + settle leg complete):
// a fast fetch waits out the settle; a slow fetch holds at the settled parent
// pose until the swap lands. The camera does NOT zoom to 1.45 on its own clock —
// the controller fires the zoom at the gate, so it never opens mid-slide.
interface TwoBeat {
  docPose: Pose;
  arrivedAt: number; // performance.now() when Beat 1 settled at the parent zone; -1 until then
  swapDone: boolean;
  fired: boolean;
}
let twoBeat: TwoBeat | null = null;

function tickTwoBeat(now: number): void {
  if (!twoBeat || twoBeat.fired) return;
  // Record arrival at the parent zone (Beat 1 has settled into rest).
  if (twoBeat.arrivedAt < 0) {
    if (!store.isAnimating) twoBeat.arrivedAt = now;
    return;
  }
  // The swap has landed and its hidden document is the live body.
  const swapReady = twoBeat.swapDone && document.body.dataset.unfold === 'traveling';
  if (!beat2Gate(twoBeat.arrivedAt, now, SETTLE, swapReady)) return;

  // Beat 2 — fire the zoom push and the reveal together (Phil fix #3).
  twoBeat.fired = true;
  store.slideTo(twoBeat.docPose, now);
  revealDocument();
}

function revealDocument(): void {
  const body = document.body;
  // Morph origin (note 4): the parent zone's card for THIS document, not the
  // featured card left behind on the previous zone.
  const card = document.querySelector<HTMLElement>(
    `.zone[data-current] a[href="${normalisePath(location.pathname)}"]`
  );
  if (card) {
    const r = card.getBoundingClientRect();
    body.style.setProperty('--unfold-ox', `${Math.round(r.left + r.width / 2)}px`);
    body.style.setProperty('--unfold-oy', `${Math.round(r.top + r.height / 2)}px`);
  }
  body.removeAttribute('data-unfold'); // the document unfolds in (CSS transition)

  // Focus was deferred to the reveal so it coincides with the document appearing.
  if (pendingFocus) {
    pendingFocus = false;
    manageFocus();
  }
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
  twoBeat = null; // interrupt-safe: a new nav abandons any held two-beat
  // Read the origin from the event, not `location`: on popstate the browser has
  // already moved `location` to the destination before this fires, so
  // `location.pathname` would be the destination, breaking close -> card focus.
  const fromPath = normalisePath((ev.from ?? location).pathname);
  departedFrom = fromPath;

  if (reduced) {
    // One instant cut to the final pose — never two cuts (note 7).
    store.snap(resolvePose(toPath));
    return;
  }

  const plan = planCamera(fromPath, toPath, SETTLE);
  // Release content-visibility on every zone for the move so neither the arriving
  // nor the departing zone is blank while it crosses the frame (note 2).
  plane()?.classList.add('is-sliding');

  if (plan.length > 1 && isDocumentRoute(toPath)) {
    // Two-beat OPEN: run Beat 1 (travel to the parent zone) now; Beat 2 (the zoom
    // push + reveal) is gated on the swap and fired by tickTwoBeat. The document
    // is hidden from the first painted frame (before-swap stamps the incoming
    // body).
    twoBeat = {
      docPose: plan[plan.length - 1].pose,
      arrivedAt: -1,
      swapDone: false,
      fired: false,
    };
    store.slideTo(plan[0].pose, performance.now());
  } else {
    // A single tween, or a two-beat CLOSE (fold + slide auto-play — no reveal to
    // coordinate with a swap).
    store.sequenceTo(plan, performance.now());
  }
  startLoop();
});

// Hide the incoming document until Beat 2 of a two-beat open, so Beat 1 reads as
// a plain Slide to the parent zone. Set on the parsed incoming body, before it
// becomes live, so the document is hidden from the very first painted frame.
document.addEventListener('astro:before-swap', (e) => {
  const ev = e as Event & { newDocument?: Document };
  if (twoBeat && ev.newDocument) {
    ev.newDocument.body.dataset.unfold = 'traveling';
  }
});

// After the swap, re-assert the live pose so the swap does not cut to the
// incoming server pose; keep the move going on the new plane.
document.addEventListener('astro:after-swap', () => {
  const p = plane();
  if (!p) return;
  if (twoBeat) {
    twoBeat.swapDone = true;
    // Also hide the document on the LIVE body: before-swap stamps the parsed
    // incoming body (so the VT snapshot is hidden), but a VT-less swap path may
    // not carry that mutation. This keeps the gate correct on every swap path.
    document.body.dataset.unfold = 'traveling';
  }
  // Adopt the destination pose only for a settled, non-two-beat arrival — a
  // held two-beat is resting at the parent pose and must NOT jump to 1.45.
  if (!store.isAnimating && !twoBeat) store.snap(resolvePose(location.pathname));
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
  // and settle() cleans up. A held two-beat open is resting at the parent pose
  // waiting for its gate — do NOT snap it to the document pose.
  if (!store.isAnimating && !twoBeat) {
    p.classList.remove('is-sliding');
    store.snap(resolvePose(location.pathname));
    writePose();
  }

  // Focus follows every client navigation (not the initial hard load, which has
  // no pending nav) — note 8. For a two-beat open it is deferred to the reveal
  // (revealDocument) so it coincides with the document appearing.
  if (pendingFocus && !twoBeat) {
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

// --- Unfold morph (note 1): for a SAME-ZONE open the clicked card shares its
// name with the document, so the browser FLIP-morphs the card into it. A
// cross-zone open is NOT tagged — its morph originates from the parent zone's
// card at Beat 2 (revealDocument, note 4), not the card clicked here. ----------
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
    // Cross-zone opens use the two-beat JS reveal, not the browser morph.
    if (zoneForPath(href).id !== document.body.dataset.zone) return;
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
