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
  DOC_ZOOM,
  isDocumentRoute,
  isPageRoute,
  normalisePath,
  planCamera,
  resolvePose,
  revealAmount,
  revealTick,
  SETTLE_MS,
} from '../lib/nav';
import {
  rollCloseRetrace,
  rollPose,
  rollResolver,
  rollScrollY,
  zoneAtScroll,
  type RollOffset,
} from '../lib/roll';
import { zoneById, zoneForPath } from '../lib/zones';
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

// --- §13 mobile roll state (M9). ----------------------------------------------
// Below 768px, zone routes collapse to a native vertical scroll — the ROOT
// scroller IS the position (one system, §3): a user scroll is mirrored into
// the store; a navigation tweens the store and writePose drives scrollTop
// from it. Document routes never roll (they keep the fixed posed plane), so
// every roll operation is gated on onRoll().
const mobileMq = window.matchMedia('(max-width: 767px)');
const isMobile = (): boolean => mobileMq.matches;
const onRoll = (): boolean => isMobile() && document.body.dataset.view === 'zone';

let rollDriving = false; // a store tween owns scrollTop for this move
let rollMax = 0; // the scroll range captured when the drive began
let rollScrollUntil = 0; // wall-clock end of the live user-scroll window
let rollSettleTimer = 0;
let rollScrollRaf = 0;
let adoptFromScroll = false; // a zone traversal: keep the restored offset
let retraceAfterClose: { parentId: string; targetId: string } | null = null;
// A real page navigation is committing (before-preparation → page-load). While
// it holds, the roll's autonomous scroll-settle (rollSettled) must NOT run: a
// mid-drive interrupt could otherwise replaceState/announce against the
// DEPARTING page and corrupt its history entry (review regression of fix 5).
let navInFlight = false;

/** True while any camera choreography is in flight — a tween, a held two-beat
 *  gate, a running reveal, or a live user scroll on the roll (§13: pencils
 *  lift and the bitmap rides the compositor while the finger owns the desk).
 *  The graphite field pauses during all of these and bakes at settle. */
export function cameraAnimating(): boolean {
  return (
    store.isAnimating ||
    (!!twoBeat && !twoBeat.fired) ||
    (!!reveal && !reveal.done) ||
    performance.now() < rollScrollUntil
  );
}

function writePose(): void {
  const p = store.current;
  const b = document.body;
  if (isMobile()) {
    // Mobile projections (§13): x is locked, zoom is the reveal's progress
    // clock (never a projection input), and a document route's backdrop is
    // STATIC — the server-rendered inline vars already hold the parent pose,
    // so the runtime leaves them alone there.
    if (b.dataset.view !== 'zone') return;
    b.style.setProperty('--cam-x', '0');
    b.style.setProperty('--cam-y', String(p.y));
    b.style.setProperty('--cam-zoom', '1');
    if (rollDriving) window.scrollTo(0, rollScrollY(p.y, rollMax));
    return;
  }
  b.style.setProperty('--cam-x', String(p.x));
  b.style.setProperty('--cam-y', String(p.y));
  b.style.setProperty('--cam-zoom', String(p.zoom));
}

/** Measure the zones' snap offsets on the live roll DOM. gBCR is safe here:
 *  mobile zone routes render the plane untransformed, in static flow. */
function rollOffsets(): RollOffset[] {
  const base = window.scrollY;
  return Array.from(document.querySelectorAll<HTMLElement>('.desk-plane .zone')).map((z) => ({
    id: z.dataset.zoneId ?? '',
    top: Math.max(0, Math.round(z.getBoundingClientRect().top + base)),
  }));
}

function rollMaxScroll(): number {
  const d = document.documentElement;
  return Math.max(0, d.scrollHeight - d.clientHeight);
}

/** A store tween takes the scroller: capture the range and disarm the CSS
 *  snap (it would re-target the browser's own scroll mid-drive). Every drive
 *  ends ON a snap position, so re-arming at the end never jumps. */
function beginRollDrive(): void {
  rollMax = rollMaxScroll();
  rollDriving = true;
  document.documentElement.setAttribute('data-roll-tween', '');
}

function endRollDrive(): void {
  rollDriving = false;
  document.documentElement.removeAttribute('data-roll-tween');
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
  // Keep looping ONLY while the camera is moving, a two-beat open is holding
  // for its gate, or a reveal is pending. The graphite field is NOT a reason to
  // loop (perf fix): it draws on its own low-frequency timer and rides the
  // compositor during moves — with it in this condition the loop never parked
  // and §8's idle discipline was silently defeated. Re-read store.isAnimating
  // AFTER tickTwoBeat — the frame that fires Beat 2 starts a fresh tween AND
  // clears the gate, so the pre-tick `animating` is stale and would stop the
  // loop before the zoom-to-1.45 ever ticks.
  const holdingGate = !!twoBeat && !twoBeat.fired;
  const revealPending = !!reveal && !reveal.done;
  if (running && (store.isAnimating || holdingGate || revealPending)) {
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
  // A finished roll drive hands the scroller back: it landed exactly on a
  // snap position (zone tops are the only tween targets), so re-arming the
  // CSS snap is a no-op jump-wise. Beat-1 arrivals land here too — Beat 2 is
  // a pure clock on the roll and never drives scroll.
  if (rollDriving) endRollDrive();
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
  // Target the landmark by id only, not `main#main`: on the roll the in-view
  // zone can be a rehomed `<section role="main" id="main">` (rehomeMainLandmark),
  // so a tag-qualified selector would miss it. Exactly one element carries
  // id="main" at any time, so `#main` is unambiguous.
  if (document.body.dataset.view === 'document') {
    // Opened a document: focus its heading.
    const h = document.querySelector<HTMLElement>('#main h1') ?? document.getElementById('main');
    focusEl(h);
    return;
  }
  // Arrived at a zone. If we just closed a document, return focus to the card it
  // came from (note 4); otherwise the arriving zone's heading (note 8).
  if (departedFrom && isDocumentRoute(departedFrom)) {
    const card = document.querySelector<HTMLElement>(`#main a[href="${departedFrom}"]`);
    if (card) {
      focusEl(card);
      return;
    }
  }
  focusEl(document.querySelector<HTMLElement>('#main h1'));
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
  const ev = e as Event & { from?: URL; to?: URL; navigationType?: string };
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
  endRollDrive(); // a new nav abandons a driven roll tween (retarget law)
  retraceAfterClose = null;
  adoptFromScroll = false;
  // A real navigation is now committing: cancel any pending roll scroll-settle
  // and suppress it until page-load, so it cannot rewrite the departing page's
  // history entry mid-swap (review regression of fix 5).
  navInFlight = true;
  if (rollSettleTimer) {
    window.clearTimeout(rollSettleTimer);
    rollSettleTimer = 0;
  }
  // Read the origin from the event, not `location`: on popstate the browser has
  // already moved `location` to the destination before this fires, so
  // `location.pathname` would be the destination, breaking close -> card focus.
  const fromPath = normalisePath((ev.from ?? location).pathname);
  departedFrom = fromPath;

  if (reduced) {
    // One instant cut to the final pose — never two cuts (note 7). On mobile
    // the arriving page adopts pose + scroll at page-load: still one cut. A
    // zone traversal keeps the router-restored offset there too (review #6).
    if (isMobile()) {
      adoptFromScroll =
        ev.navigationType === 'traverse' &&
        !isDocumentRoute(toPath) &&
        !isDocumentRoute(fromPath);
    } else {
      store.snap(resolvePose(toPath));
    }
    return;
  }

  if (isMobile()) {
    mobileNavigate(fromPath, toPath, ev.navigationType);
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

// --- §13 mobile navigation (M9): the same verbs projected onto the roll. -----
// Zone slides and document opens run the SAME store / two-beat / reveal
// machinery as desktop — only the pose space differs (measured roll offsets;
// zoom stays the reveal's clock). A close cannot measure the roll from the
// document DOM (document routes keep the posed plane), so it folds in place
// and the zone arrival lands the roll + retraces (rollArriveFromClose).
function mobileNavigate(fromPath: string, toPath: string, navigationType?: string): void {
  const now = performance.now();
  if (trace.phases.length > 0) {
    trace.mark('interrupted', now);
    trace.flush();
  }
  trace.mark('nav:start', now, `${fromPath} -> ${normalisePath(toPath)} (roll)`);

  const opening = isDocumentRoute(toPath);
  if (opening) {
    // Every open reveals as a pure function of push progress (FIX A) —
    // identical driver, identical gate, on the zoom clock.
    reveal = { swapReady: false, begun: false, begunAt: 0, done: false };
  }

  if (isDocumentRoute(fromPath)) {
    if (!opening) {
      // CLOSE: fold in place — the zoom clock runs the §7.3 close window
      // (the VT fade rides it); the arriving zone DOM lands the roll at the
      // parent and retraces if history is heading further (note: "Back folds
      // and retraces").
      retraceAfterClose = rollCloseRetrace(fromPath, toPath);
      trace.mark('fold:start', now);
      store.slideTo({ x: store.current.x, y: store.current.y, zoom: 1 }, now);
      startLoop();
      return;
    }
    // Document -> document: no roll on either side. Hold the pose; the
    // reveal's time cap ramps the incoming sheet in (no pop).
    store.snap({ x: store.current.x, y: store.current.y, zoom: DOC_ZOOM });
    trace.mark('push:start', now);
    startLoop(); // the reveal driver needs frames (loop keys on revealPending)
    return;
  }

  if (!opening && navigationType === 'traverse') {
    // Back/forward between zones: the router restores its own offset — adopt
    // it at arrival instead of fighting it with a tween.
    adoptFromScroll = true;
    return;
  }

  // Measure the roll UNDER FORCED RENDER (review #1): is-sliding first —
  // content-visibility placeholders under-report never-rendered zones by
  // whole viewports, and the drive must target (and re-project through) the
  // same geometry the browser scrolls during the slide. is-sliding stays on
  // through the tween, so the rendered heights are recorded as remembered
  // sizes and the post-settle roll keeps this geometry.
  plane()?.classList.add('is-sliding');
  const offsets = rollOffsets();
  const poses = rollResolver(offsets, rollMaxScroll());
  const plan = planCamera(fromPath, toPath, SETTLE, poses);

  if (plan.length > 1 && opening) {
    // Two-beat OPEN, vertical (M9 note 6): Beat 1 slides the roll to the
    // parent zone, the settle holds, and the gated Beat 2 (tickTwoBeat) runs
    // the zoom clock with the reveal riding its progress — same gate, same
    // phase-locked reveal as desktop.
    twoBeat = {
      docPose: plan[plan.length - 1].pose,
      arrivedAt: -1,
      swapDone: false,
      swapAt: -1,
      fired: false,
    };
    trace.mark('beat1:start', now);
    beginRollDrive();
    store.slideTo(plan[0].pose, now);
  } else {
    trace.mark(opening ? 'push:start' : 'slide:start', now);
    beginRollDrive();
    store.sequenceTo(plan, now);
  }
  // A same-pose plan snaps instead of tweening (e.g. /notes -> /notes/2 —
  // the pager shares its zone's pose): the drive never runs, so hand the
  // scroller back NOW or the mirror stays dead behind rollDriving (review #3).
  if (!store.isAnimating) {
    endRollDrive();
    plane()?.classList.remove('is-sliding');
  }
  startLoop();
}

/** Land the roll after a close: the parent zone first — the desk the
 *  document was sitting on — then, if history retraces further, slide on.
 *  Runs on the arriving zone DOM (after-swap; page-load as the fallback). */
function rollArriveFromClose(): void {
  const pending = retraceAfterClose;
  retraceAfterClose = null;
  if (!pending || !onRoll()) return;
  const retracing = pending.targetId !== pending.parentId;
  // Force-render before measuring (review #1): a zone above the parent is a
  // content-visibility placeholder (100dvh estimate) until it renders, which
  // mis-targets the parent's true top. is-sliding unskips all zones; the
  // render is remembered (contain-intrinsic-size: auto), so the geometry
  // survives its removal at rest.
  plane()?.classList.add('is-sliding');
  const offsets = rollOffsets();
  const max = rollMaxScroll();
  const parent = offsets.find((z) => z.id === pending.parentId);
  window.scrollTo(0, Math.min(parent?.top ?? 0, max));
  store.snap(rollPose(window.scrollY, max));
  writePose();
  if (retracing) {
    const now = performance.now();
    trace.mark('retrace:start', now);
    beginRollDrive(); // stays force-rendered through the tween; settle clears it
    store.slideTo(rollResolver(offsets, max).zone(pending.targetId), now);
    startLoop();
  } else {
    plane()?.classList.remove('is-sliding'); // rest: restore §8 containment
  }
}

/** Land the roll at rest for the current URL: hard loads and instant cuts
 *  scroll to the zone's snap offset; a traversal adopts the offset the
 *  router restored (adoptFromScroll — cleared at page-load, the end of the
 *  navigation lifecycle). Measures under forced render so a deep-linked zone
 *  below the fold lands on its TRUE top, not a placeholder estimate (#1). */
function adoptRollRest(): void {
  const wasSliding = !!plane()?.classList.contains('is-sliding');
  plane()?.classList.add('is-sliding');
  const max = rollMaxScroll();
  if (!adoptFromScroll) {
    const o = rollOffsets().find((z) => z.id === zoneForPath(location.pathname).id);
    if (o) window.scrollTo(0, Math.min(o.top, max));
  }
  store.snap(rollPose(window.scrollY, max));
  writePose();
  if (!wasSliding && !store.isAnimating) plane()?.classList.remove('is-sliding');
}

// The user's finger owns the scroller: mirror it into the store — the single
// source stays single, read back into the same pose every projection
// consumes. rAF-throttled; echoes of our own driven writes are ignored.
window.addEventListener(
  'scroll',
  () => {
    if (!onRoll() || rollDriving) return;
    rollScrollUntil = performance.now() + 200; // pencils lift (§13: park hard)
    if (rollSettleTimer) window.clearTimeout(rollSettleTimer);
    rollSettleTimer = window.setTimeout(rollSettled, 180);
    if (rollScrollRaf) return;
    rollScrollRaf = requestAnimationFrame(() => {
      rollScrollRaf = 0;
      if (!onRoll() || rollDriving) return;
      store.snap(rollPose(window.scrollY, rollMaxScroll()));
      writePose();
      wakeDeskScene();
    });
  },
  { passive: true }
);
if ('onscrollend' in window) {
  window.addEventListener(
    'scrollend',
    () => {
      if (onRoll() && !rollDriving) rollSettled();
    },
    { passive: true }
  );
}

// A touch or wheel mid-drive hands the position back to the user (§7's
// retarget law, roll edition): abandon the tween from the live offset. The
// snap stays disarmed until the fling settles — rollSettled re-arms it.
function interruptRollDrive(): void {
  if (!onRoll() || !rollDriving) return;
  endRollDrive(); // clears data-roll-tween (snap re-arms after the fling)
  store.snap(rollPose(window.scrollY, rollMaxScroll()));
  rollScrollUntil = performance.now() + 200;
  // The store snap skips settle() (the frame loop sees no active tween), so
  // tear down here: drop the force-render class (§8 idle discipline — else
  // all five zones stay content-visibility:visible at rest, review), and
  // schedule rollSettled so a bare tap (zero scroll delta → no scroll/
  // scrollend event) still re-arms the snap and syncs the URL/zone marks.
  plane()?.classList.remove('is-sliding');
  if (rollSettleTimer) window.clearTimeout(rollSettleTimer);
  rollSettleTimer = window.setTimeout(rollSettled, 180);
  // A pending arrival must adopt this hand-off offset, not re-drive to the
  // destination zone's top (adoptRollRest honours the flag) — review.
  adoptFromScroll = true;
}
window.addEventListener('touchstart', interruptRollDrive, { passive: true });
window.addEventListener('wheel', interruptRollDrive, { passive: true });

/** A user scroll has come to rest: re-arm the snap, then bring the route to
 *  the zone under the viewport — replaceState (scroll is browsing, not
 *  history), the zone marks, the title block, and the announcer. The roll IS
 *  the Slide (§13), so a settled scroll ends in the same state a settled
 *  camera move would. */
function rollSettled(): void {
  if (rollSettleTimer) {
    window.clearTimeout(rollSettleTimer);
    rollSettleTimer = 0;
  }
  // navInFlight: a real navigation is swapping — do NOT replaceState/announce
  // against the departing page (review regression of fix 5). The arriving page
  // establishes its own rest state at page-load; the next user scroll re-syncs.
  if (!onRoll() || rollDriving || store.isAnimating || navInFlight) return;
  document.documentElement.removeAttribute('data-roll-tween');
  const id = zoneAtScroll(window.scrollY, window.innerHeight, rollOffsets());
  if (!id || id === document.body.dataset.zone) return;
  const zone = zoneById(id);
  history.replaceState(history.state, '', zone.href);
  syncZoneMarks(id);
}

/** Re-point the roll's zone marks at `id`: body data-zone, the zones'
 *  data-current, the <main> landmark, the title block (roll:zonechange), the
 *  announcer. The roll IS one scrolling document, so the primary-content
 *  landmark follows the zone in view — moving data-current WITHOUT the <main>
 *  would leave the landmark on an off-screen zone, and an mq→desktop cross
 *  would then inert the real <main> (review regression of fix 7). */
function syncZoneMarks(id: string): void {
  document.body.dataset.zone = id;
  for (const z of document.querySelectorAll<HTMLElement>('.desk-plane .zone')) {
    if ((z.dataset.zoneId ?? '') === id) z.setAttribute('data-current', '');
    else z.removeAttribute('data-current');
  }
  rehomeMainLandmark(id);
  document.dispatchEvent(new CustomEvent('roll:zonechange'));
  const zone = zoneById(id);
  const live = document.querySelector('p.sr-only[aria-live]');
  if (live) live.textContent = `Sheet ${zone.sheet}, ${zone.label}`;
}

/** Keep the `<main id="main">` landmark on the zone in view (roll only). The
 *  template renders the server-current zone as `<main id="main">` and the rest
 *  as labelled `<section>` regions; as the roll scrolls, promote the in-view
 *  zone to the main landmark and demote the previous one back to a region —
 *  by ROLE (the elements keep their tags; no re-parenting of scroll content).
 *  So data-current, the landmark, the URL and the desktop pose never diverge. */
function rehomeMainLandmark(id: string): void {
  for (const z of document.querySelectorAll<HTMLElement>('.desk-plane .zone')) {
    const zone = zoneById(z.dataset.zoneId ?? '');
    if ((z.dataset.zoneId ?? '') === id) {
      z.id = 'main';
      // role="main" makes a <section> the main landmark; a native <main> tag
      // needs none. Either way it is THE main, and its region label is dropped.
      if (z.tagName === 'MAIN') z.removeAttribute('role');
      else z.setAttribute('role', 'main');
      z.removeAttribute('aria-label');
    } else {
      if (z.id === 'main') z.removeAttribute('id');
      // Demote a native <main> tag to a labelled region so there is never a
      // second main landmark; a <section> is already a region via its label.
      if (z.tagName === 'MAIN') z.setAttribute('role', 'region');
      else z.removeAttribute('role');
      z.setAttribute('aria-label', `Sheet ${zone.sheet} ${zone.label}`);
    }
  }
}

/**
 * Per-modality DOM state (M9). On the roll every zone is live content — the
 * server-rendered `inert` (the desktop focus fence around off-zones) would
 * kill taps and selection inside them, and the sheets' scroll-region
 * tabstops are pointless when the root scrolls. Restored exactly on the way
 * back up. Rung 4 keeps the server truth — the documented §13 trade-off: a
 * no-JS phone reads every zone but interacts via the title-block routes.
 */
function applyModality(): void {
  const zoneView = document.body.dataset.view === 'zone';
  const roll = isMobile() && zoneView;
  for (const z of document.querySelectorAll<HTMLElement>('.desk-plane .zone')) {
    const current = z.hasAttribute('data-current');
    z.inert = zoneView ? (roll ? false : !current) : true;
  }
  for (const s of document.querySelectorAll<HTMLElement>('.zone__sheet')) {
    s.tabIndex = roll ? -1 : 0;
  }
}

// Crossing the 768px boundary (rotate / resize): abandon any in-flight
// choreography and re-project the rest pose into the arriving system — a
// cut, by nature. Rare enough that a tween would be over-engineering.
mobileMq.addEventListener('change', () => {
  endRollDrive();
  twoBeat = null;
  if (reveal && !reveal.done) {
    document.body.removeAttribute('data-unfolding');
    document.body.style.removeProperty('--unfold-t');
    document.body.removeAttribute('data-unfold');
  }
  reveal = null;
  retraceAfterClose = null;
  // store.snap below skips settle(), so clear the force-render class here or
  // it leaks and defeats the off-zone containment (§8) until the next nav.
  plane()?.classList.remove('is-sliding');
  applyModality();
  // The field's density token (--field-count: 30 desktop / 18 mobile) is read
  // once at mount, so a boundary crossing must remount it to honour the new
  // modality (battery on the phone) — same onDesk/!reduced guard as page-load.
  const canvas = document.getElementById('desk-field') as HTMLCanvasElement | null;
  field?.destroy();
  const onDesk = document.body.dataset.view !== 'document';
  field = canvas && onDesk && !reduced ? mountDeskField(canvas) : null;
  if (document.body.dataset.view === 'zone') {
    if (isMobile()) adoptRollRest();
    else {
      store.snap(resolvePose(location.pathname));
      writePose();
    }
  } else if (isMobile()) {
    store.snap({ x: 0, y: 0, zoom: DOC_ZOOM });
  } else {
    store.snap(resolvePose(location.pathname));
    writePose();
  }
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
  if (isMobile()) {
    // The swapped-in DOM carries the server's inert fences — lift them for
    // the roll before the first tap can land (page-load re-runs this).
    applyModality();
    if (document.body.dataset.view === 'zone') {
      if (rollDriving) {
        // Astro's swap replaces the <html> attribute set (the same wipe
        // BaseHead re-stamps data-js for) — re-disarm the snap BEFORE the
        // scroll writes below, or mandatory snap quantises the rest of the
        // drive to zone tops (review #2).
        document.documentElement.setAttribute('data-roll-tween', '');
      }
      if (retraceAfterClose) {
        // A close arrived: land at the parent, retrace if history goes on.
        rollArriveFromClose();
      } else if (store.isAnimating) {
        // Mid-slide swap: the new roll adopts the live offset this frame,
        // before the router's own scroll reset can paint. Keep the arriving
        // zones force-rendered — the swap dropped the old plane's class.
        plane()?.classList.add('is-sliding');
        window.scrollTo(0, rollScrollY(store.current.y, rollMax || rollMaxScroll()));
      } else if (!twoBeat) {
        adoptRollRest();
      }
    } else {
      // Swapped into a document. Beat 1's remaining travel is invisible now
      // (the roll left with the old DOM) — fast-forward the arrival so the
      // settle + gate run on the visible timeline instead of holding a
      // static backdrop for the rest of a dead tween (review #4).
      if (twoBeat && !twoBeat.fired && store.isAnimating) store.snap(store.target);
      if (rollDriving) endRollDrive();
    }
  } else if (!store.isAnimating && !twoBeat) {
    // Adopt the destination pose only for a settled, non-two-beat arrival — a
    // held two-beat is resting at the parent pose and must NOT jump to 1.45.
    store.snap(resolvePose(location.pathname));
  }
  writePose();
  if (!reduced && store.isAnimating) p.classList.add('is-sliding');
});

// --- Per-page (re)initialisation. ---------------------------------------------
function onPageLoad(): void {
  navInFlight = false; // the navigation has committed; the roll may settle again
  const p = plane();
  const canvas = document.getElementById('desk-field') as HTMLCanvasElement | null;

  // The field is desk-wide but hidden behind an open document (Stack), so it is
  // only mounted on zone routes — no invisible rendering, and the loop can stop.
  // Reduced motion parks the field entirely (M7 note 4): an empty desk, no
  // ambient animation — the canvas persists but nothing mounts or draws.
  field?.destroy();
  const onDesk = document.body.dataset.view !== 'document';
  field = canvas && onDesk && !reduced ? mountDeskField(canvas) : null;

  if (!p) {
    stopLoop();
    return;
  }

  applyModality();

  // Settled arrival (hard load or a non-animating nav): adopt this page's pose
  // and clear any inherited slide state. A move still in flight is left to finish
  // and settle() cleans up. A held two-beat open is resting at the parent pose
  // waiting for its gate — do NOT snap it to the document pose.
  if (isMobile()) {
    if (document.body.dataset.view === 'zone') {
      if (retraceAfterClose) {
        rollArriveFromClose(); // fallback — after-swap normally consumed it
      } else if (!store.isAnimating && !twoBeat) {
        p.classList.remove('is-sliding');
        adoptRollRest();
      }
    } else if (!store.isAnimating && !twoBeat && !reveal) {
      // A document at rest (hard load): the clock idles at the doc zoom;
      // y 0 keeps the scene's slight parallax neutral.
      store.snap({ x: 0, y: 0, zoom: DOC_ZOOM });
    }
    adoptFromScroll = false; // the navigation lifecycle ends here
  } else if (!store.isAnimating && !twoBeat) {
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

  if (reduced) return; // no loop: cuts are instant, the field is parked (M7)
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

// M7 polish: cursor tilt + the ink-reveal flourish (delegated, binds once).
import './polish';
