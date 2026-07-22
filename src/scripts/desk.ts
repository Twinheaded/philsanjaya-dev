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
import { MotionTrace } from '../lib/motion-trace';
import {
  beat2Gate,
  isDocumentRoute,
  isPageRoute,
  normalisePath,
  planCamera,
  resolvePose,
  revealAmount,
  revealTick,
  SETTLE_MS,
} from '../lib/nav';
import { zoneForPath } from '../lib/zones';
import { mountDeskField, type DeskField } from './desk-field';
import { initDeskScene, wakeDeskScene } from './desk-scene';

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Motion debug trace (FIX A note 3): `?debug=motion` or
// `localStorage.setItem('debug:motion', '1')` prints one console.table of phase
// timestamps per completed move — numbers instead of videos.
const trace = new MotionTrace(
  (() => {
    try {
      return (
        new URLSearchParams(location.search).get('debug') === 'motion' ||
        localStorage.getItem('debug:motion') === '1'
      );
    } catch {
      return false;
    }
  })()
);

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

function frame(now: number): void {
  // Read the moving state from the STORE, before the tick — a module flag only
  // updated in here goes stale when a nav's tween never gets a frame before the
  // tab hides, and the resume frame would then skip settle() entirely (review):
  // the desk would sit at the pre-nav pose with .is-sliding leaked.
  const wasMoving = store.isAnimating;
  const animating = store.tick(now);
  if (animating) writePose();
  else if (wasMoving) settle(now);
  tickTwoBeat(now); // may start Beat 2's zoom tween (store.slideTo)
  tickReveal(now); // drives the reveal as a pure function of push progress
  // Keep the WebGL scene's loop awake for the whole camera move — Beat 2 of a
  // two-beat open fires from here (not from a nav), so waking only at nav start
  // could let the scene park during the swap hold and miss the zoom. Cheap: wake
  // no-ops when the scene loop is already running.
  if (store.isAnimating) wakeDeskScene();
  field?.frame(now, store.current);
  // Keep looping while the camera is moving, the field needs redrawing, a
  // two-beat open is still holding for its gate, or a reveal is still pending.
  // Re-read store.isAnimating AFTER tickTwoBeat — the frame that fires Beat 2
  // starts a fresh tween AND clears the gate, so the pre-tick `animating` is
  // stale and would stop the loop before the zoom-to-1.45 ever ticks.
  const holdingGate = !!twoBeat && !twoBeat.fired;
  const revealPending = !!reveal && !reveal.done;
  if (running && (store.isAnimating || field || holdingGate || revealPending)) {
    rafId = requestAnimationFrame(frame);
  } else {
    running = false;
  }
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
function settle(now: number): void {
  writePose();
  plane()?.classList.remove('is-sliding');
  // A two-beat hold settles at the parent zone mid-move — that is beat1:arrive
  // (marked by tickTwoBeat), not the end of the move.
  if (twoBeat && !twoBeat.fired) return;
  // With a reveal still driving, the move isn't over — tickReveal marks settled
  // and flushes when the reveal completes.
  if (!reveal || reveal.done) {
    trace.mark('settled', now);
    trace.flush();
  }
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
  swapAt: number; // performance.now() when the swap landed; -1 until then (trace)
  fired: boolean;
}
let twoBeat: TwoBeat | null = null;

function tickTwoBeat(now: number): void {
  if (!twoBeat || twoBeat.fired) return;
  // Record arrival at the parent zone (Beat 1 has settled into rest).
  if (twoBeat.arrivedAt < 0) {
    if (!store.isAnimating) {
      twoBeat.arrivedAt = now;
      trace.mark('beat1:arrive', now);
    }
    return;
  }
  // The swap has landed and its hidden document is the live body.
  const swapReady = twoBeat.swapDone && document.body.dataset.unfold === 'traveling';
  if (!beat2Gate(twoBeat.arrivedAt, now, SETTLE, swapReady)) return;

  // Beat 2 — fire the zoom push; the reveal driver (tickReveal) rides the same
  // tween as a pure function of its progress (FIX A). Gate semantics unchanged:
  // Beat 2 starts at max(swap complete, travel + settle complete).
  twoBeat.fired = true;
  trace.mark('settle:end', twoBeat.arrivedAt + SETTLE);
  trace.mark(
    'gate:open',
    now,
    `released by ${twoBeat.swapAt >= 0 && twoBeat.swapAt <= twoBeat.arrivedAt + SETTLE ? 'arrival+settle (swap was ready)' : 'swap (settle had elapsed)'}`
  );
  trace.mark('push:start', now);
  // The push begins: the desk STACKS now (blur/scrim ride their --t-stack
  // transition from push start, finishing before the settle — review), while the
  // document itself stays hidden until the reveal at 60%.
  if (document.body.dataset.unfold === 'traveling') {
    document.body.dataset.unfold = 'pushing';
  }
  store.slideTo(twoBeat.docPose, now);
}

// --- The reveal (§7.3, FIX A): a pure function of push progress. --------------
// The document's reveal is driven from the same tween tick as the camera — it
// begins at push progress ≥ 0.6 and completes at 1.0 (revealAmount), in BOTH the
// same-zone unfold and cross-zone Beat 2. Never on its own clock: no CSS
// transition, no VT morph timing — --unfold-t is written every tick and the
// document's opacity/scale derive from it (global.css, body[data-unfolding]).
interface RevealState {
  swapReady: boolean; // the (hidden) document body is live in the DOM
  begun: boolean; // visibility flipped on: origin set, marker set, focus landed
  begunAt: number; // when the reveal began (the revealTick catch-up anchor)
  done: boolean;
}
let reveal: RevealState | null = null;

function tickReveal(now: number): void {
  if (!reveal || reveal.done) return;
  // A cross-zone open reveals on Beat 2's push, never during Beat 1's travel.
  if (twoBeat && !twoBeat.fired) return;
  // No document in the DOM yet (the push can outrun a slow fetch) — hold; a late
  // swap then begins immediately and revealTick's time cap ramps it in (no pop).
  if (!reveal.swapReady) return;

  const p = store.progressAt(now);
  if (revealAmount(p) <= 0 && !reveal.begun) return;

  const body = document.body;
  if (!reveal.begun) {
    reveal.begun = true;
    reveal.begunAt = now;
    // Morph origin (note 4): the parent zone's card for THIS document — for a
    // same-zone open that is the clicked card itself.
    const card = document.querySelector<HTMLElement>(
      `.zone[data-current] a[href="${normalisePath(location.pathname)}"]`
    );
    if (card) {
      const r = card.getBoundingClientRect();
      body.style.setProperty('--unfold-ox', `${Math.round(r.left + r.width / 2)}px`);
      body.style.setProperty('--unfold-oy', `${Math.round(r.top + r.height / 2)}px`);
    }
    body.style.setProperty('--unfold-t', '0');
    body.dataset.unfolding = ''; // the reveal window: opacity/scale follow --unfold-t
    body.removeAttribute('data-unfold');
    trace.mark('reveal:start', now, `at push progress ${p.toFixed(2)}`);

    // Focus was deferred to the reveal so it coincides with the document appearing.
    if (pendingFocus) {
      pendingFocus = false;
      manageFocus();
    }
    return; // first visible frame is t = 0; the ramp starts next tick
  }

  // The driven amount: push-progress-locked, time-capped (a no-op when the swap
  // was on time; a full ramp instead of a single-frame pop when it was late).
  const t = revealTick(p, now - reveal.begunAt);
  body.style.setProperty('--unfold-t', String(t));

  if (t >= 1) {
    reveal.done = true;
    // Rest state carries no transform at all (and matches a hard load).
    body.removeAttribute('data-unfolding');
    body.style.removeProperty('--unfold-t');
    trace.mark('reveal:end', now);
    if (!store.isAnimating) {
      trace.mark('settled', now);
      trace.flush();
    }
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
  wakeDeskScene(); // the camera is about to move — wake the WebGL render loop
  pendingFocus = true;
  twoBeat = null; // interrupt-safe: a new nav abandons any held two-beat
  if (reveal?.begun && !reveal.done) {
    // Abandoning a reveal mid-drive: show the outgoing document fully so it
    // doesn't sit frozen half-revealed while the next page fetches.
    document.body.removeAttribute('data-unfolding');
    document.body.style.removeProperty('--unfold-t');
  }
  reveal = null;
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

  const now = performance.now();
  // Close out an interrupted move's marks first, so every table is one move
  // measured from its own nav:start (review: leaked marks skewed t0/deltas).
  if (trace.phases.length > 0) {
    trace.mark('interrupted', now);
    trace.flush();
  }
  trace.mark('nav:start', now, `${fromPath} -> ${normalisePath(toPath)}`);
  const plan = planCamera(fromPath, toPath, SETTLE);
  // Release content-visibility on every zone for the move so neither the arriving
  // nor the departing zone is blank while it crosses the frame (note 2).
  plane()?.classList.add('is-sliding');

  if (isDocumentRoute(toPath)) {
    // Every open reveals as a pure function of push progress (FIX A). The
    // incoming document is hidden from its first painted frame (before-swap
    // stamps the parsed body) until the reveal driver flips it on at ≥60% of
    // the push.
    reveal = { swapReady: false, begun: false, begunAt: 0, done: false };
  }

  if (plan.length > 1 && isDocumentRoute(toPath)) {
    // Two-beat OPEN: run Beat 1 (travel to the parent zone) now; Beat 2 (the
    // zoom push, with the reveal riding its progress) is gated on the swap and
    // fired by tickTwoBeat.
    twoBeat = {
      docPose: plan[plan.length - 1].pose,
      arrivedAt: -1,
      swapDone: false,
      swapAt: -1,
      fired: false,
    };
    trace.mark('beat1:start', now);
    store.slideTo(plan[0].pose, now);
  } else {
    // A single tween (a same-zone open's push rides this directly), or a
    // two-beat CLOSE (fold + slide auto-play — no reveal to coordinate).
    trace.mark(isDocumentRoute(toPath) ? 'push:start' : 'slide:start', now);
    store.sequenceTo(plan, now);
  }
  startLoop();
});

// Hide the incoming document until its reveal (FIX A: every open — cross-zone
// Beat 1 reads as a plain Slide; a same-zone push shows the desk zooming until
// 60%). Set on the parsed incoming body, before it becomes live, so the document
// is hidden from the very first painted frame. Two flavours: `traveling` (before
// the push — desk NOT stacked, no blur) vs `pushing` (the push is running — the
// desk stacks now, only the document itself is still hidden). A same-zone open's
// push is already running at swap time; a cross-zone open is still holding.
document.addEventListener('astro:before-swap', (e) => {
  const ev = e as Event & { newDocument?: Document };
  if (reveal && !reveal.begun && ev.newDocument) {
    ev.newDocument.body.dataset.unfold = twoBeat && !twoBeat.fired ? 'traveling' : 'pushing';
  }
});

// After the swap, re-assert the live pose so the swap does not cut to the
// incoming server pose; keep the move going on the new plane.
document.addEventListener('astro:after-swap', () => {
  const p = plane();
  if (!p) return;
  if (twoBeat) {
    twoBeat.swapDone = true;
    twoBeat.swapAt = performance.now();
  }
  if (reveal) {
    reveal.swapReady = true;
    // Also hide the document on the LIVE body: before-swap stamps the parsed
    // incoming body (so the VT snapshot is hidden), but a VT-less swap path may
    // not carry that mutation. This keeps the gate correct on every swap path.
    if (!reveal.begun) {
      document.body.dataset.unfold = twoBeat && !twoBeat.fired ? 'traveling' : 'pushing';
    }
    // A slow fetch can land after the push has settled and parked the loop —
    // restart it so the reveal driver runs (revealTick's time cap ramps it in).
    startLoop();
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
  // no pending nav) — note 8. For a document open it is deferred to the reveal
  // (tickReveal) so it coincides with the document appearing.
  if (pendingFocus && !twoBeat && !reveal) {
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

// (FIX A) The former same-zone card-tagging click handler is gone: every open —
// same-zone and cross-zone — now reveals via the progress-locked driver
// (tickReveal), from the card's measured origin, on the camera's clock. The
// document keeps its static `view-transition-name: unfold` only for the CLOSE
// fold-out (::view-transition-old(unfold) in global.css).

// Park the loop while hidden (§8); resume on return.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopLoop();
  else if (plane() && !reduced) startLoop();
});

// Cold start (astro:page-load also fires on first load, but guard for direct
// module eval before it).
if (document.readyState !== 'loading') onPageLoad();

// Layer 0 (§8): load the WebGL scene after first idle; it persists across swaps.
initDeskScene();
