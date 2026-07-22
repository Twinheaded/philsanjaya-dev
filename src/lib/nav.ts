/**
 * Route → camera pose resolution (§4, §7.3). Pure and DOM-free so the
 * open/close state machine is unit-tested in isolation (M4 notes 3, 6).
 *
 * A zone route resolves to its zone pose. A document route (opening a card into
 * a document, §7.3) resolves to the parent zone's position at the document zoom
 * — "the card's pose at zoom ≈ 1.45" — so opening a document is a camera push,
 * the same M3 Slide, not a separate system (M4 note 2).
 */

import type { Pose, Step } from './camera';
import { zoneById, zoneForPath } from './zones';

/** The open-document zoom (§7.3). */
export const DOC_ZOOM = 1.45;

/** The two-beat settle hold (§7.3 amended). The tunable token, 120–180ms. */
export const SETTLE_MS = 150;

/** Normalise a pathname: strip a trailing slash (except root). */
export function normalisePath(pathname: string): string {
  return pathname.replace(/(.)\/+$/, '$1');
}

/**
 * A zone route (Desk) vs a document route (Sheet). Zone routes: `/`, `/about`,
 * `/projects`, `/notes`, `/log`, and the paginated `/notes/N` `/log/N`.
 * Everything else under those trees (`/projects/<slug>`, `/notes/<slug>`,
 * `/log/<slug>`) is a document, as is any unknown path (the 404 document).
 */
export function isZoneRoute(pathname: string): boolean {
  const p = normalisePath(pathname) || '/';
  return p === '/' || p === '/about' || /^\/(projects|notes|log)(\/\d+)?$/.test(p);
}

/** A path whose last segment has a file extension is an asset (/resume.pdf,
 *  /og/x.png, /favicon.svg), never an in-app page. */
function hasExtension(pathname: string): boolean {
  return (normalisePath(pathname).split('/').pop() ?? '').includes('.');
}

/** A document page: a non-zone in-app route (project/note/log slug, or the 404).
 *  Assets are excluded — they are downloads, not documents to open on the desk. */
export function isDocumentRoute(pathname: string): boolean {
  return !isZoneRoute(pathname) && !hasExtension(pathname);
}

/** Any in-app page the camera should move for (zone or document). Assets are
 *  not page routes: navigating to one must not drive the camera or the morph. */
export function isPageRoute(pathname: string): boolean {
  return isZoneRoute(pathname) || isDocumentRoute(pathname);
}

/** The camera pose for any route. */
export function resolvePose(pathname: string): Pose {
  const zone = zoneForPath(pathname);
  if (isDocumentRoute(pathname)) {
    // Push into the parent zone at the document zoom; opening is a camera move.
    return { x: zone.x, y: zone.y, zoom: DOC_ZOOM };
  }
  return { x: zone.x, y: zone.y, zoom: zone.zoom };
}

function zonePose(zoneId: string): Pose {
  const z = zoneById(zoneId);
  return { x: z.x, y: z.y, zoom: z.zoom };
}

/** The push fraction where the reveal begins (§7.3: the document resolves in
 *  the final ~40% of the push). */
export const REVEAL_START = 0.6;

/**
 * Reveal amount as a pure function of push progress (§7.3): 0 while the camera
 * covers the first 60% of the push, then a linear ramp to 1 at the push's end.
 * The runtime drives this from the same tween tick as the camera — the reveal is
 * phase-locked to the push, never on its own clock — so it holds in BOTH the
 * same-zone unfold and cross-zone Beat 2 (they are the same push).
 */
export function revealAmount(pushProgress: number): number {
  if (pushProgress <= REVEAL_START) return 0;
  if (pushProgress >= 1) return 1;
  return (pushProgress - REVEAL_START) / (1 - REVEAL_START);
}

/** The reveal window's duration on the §7.2 zoom-only floor push: the final 40%
 *  of 450ms. Every reveal push (document zoom) is zoom-only, so this IS the
 *  window length of an on-time reveal. */
export const REVEAL_RAMP_MS = 180;

/**
 * The driven reveal amount at a tick: the push-progress mapping, capped by a
 * time ramp from when the reveal began. For an on-time swap the two ramps
 * coincide (the reveal window is REVEAL_RAMP_MS of the push) and the cap is a
 * no-op — the reveal stays a pure function of push progress. For a swap landing
 * late (after the push crossed 60%, or after it finished entirely) the cap turns
 * a single-frame pop into a full rAF-driven ramp — min() always follows the
 * slower of the two, so the reveal never completes before the push does.
 */
export function revealTick(pushProgress: number, msSinceBegin: number): number {
  const cap = Math.max(0, Math.min(1, msSinceBegin / REVEAL_RAMP_MS));
  return Math.min(revealAmount(pushProgress), cap);
}

/**
 * The Beat-2 gate for a two-beat cross-zone open (§7.3 amended). Beat 2 — the
 * zoom push to 1.45 AND the document reveal, together — starts at
 * `max(swap complete, travel leg + settle leg complete)`. Both conditions must
 * hold: the camera must have arrived at the parent zone and held the settle, and
 * the document swap must have landed. So a fast fetch waits out the settle, and a
 * slow fetch simply holds at the settled zone pose until the swap lands.
 *
 * `arrivedAt` is the time Beat 1 settled at the parent zone (< 0 until then).
 */
export function beat2Gate(
  arrivedAt: number,
  now: number,
  settleMs: number,
  swapReady: boolean
): boolean {
  if (arrivedAt < 0) return false; // Beat 1 has not settled yet
  return swapReady && now >= arrivedAt + settleMs;
}

/**
 * The camera plan for a navigation (§7.3 two-beat cross-zone unfold).
 *
 * Opening a document whose parent zone differs from the zone currently in view
 * travels in two beats — a normal SLIDE to the parent zone's pose, a settle
 * hold, then the UNFOLD zoom to the document. Closing to a zone that is not the
 * document's parent is the mirror: fold out to the parent, settle, slide on.
 * Same-zone opens/closes and plain zone moves are a single tween.
 */
export function planCamera(fromPath: string, toPath: string, settleMs = SETTLE_MS): Step[] {
  const fromZone = zoneForPath(fromPath).id;
  const toZone = zoneForPath(toPath).id;
  const dest = resolvePose(toPath);

  if (isDocumentRoute(toPath) && toZone !== fromZone) {
    // Two-beat OPEN: travel to the parent zone, settle, then unfold.
    return [{ pose: zonePose(toZone), settle: settleMs }, { pose: dest, settle: 0 }];
  }
  if (isDocumentRoute(fromPath) && !isDocumentRoute(toPath) && fromZone !== toZone) {
    // Two-beat CLOSE: fold out to the parent zone, settle, then slide on.
    return [{ pose: zonePose(fromZone), settle: settleMs }, { pose: dest, settle: 0 }];
  }
  return [{ pose: dest, settle: 0 }];
}
