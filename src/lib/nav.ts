/**
 * Route → camera pose resolution (§4, §7.3). Pure and DOM-free so the
 * open/close state machine is unit-tested in isolation (M4 notes 3, 6).
 *
 * A zone route resolves to its zone pose. A document route (opening a card into
 * a document, §7.3) resolves to the parent zone's position at the document zoom
 * — "the card's pose at zoom ≈ 1.45" — so opening a document is a camera push,
 * the same M3 Slide, not a separate system (M4 note 2).
 */

import type { Pose } from './camera';
import { zoneForPath } from './zones';

/** The open-document zoom (§7.3). */
export const DOC_ZOOM = 1.45;

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
