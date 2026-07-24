/**
 * Mobile vertical-roll maths (§13, M9) — pure and DOM-free, like camera.ts.
 *
 * Below 768px the desk collapses to a single-axis vertical roll: the five
 * zones stack in sheet order and the document (root) scroller IS the position.
 * The camera store stays the single source of truth (§3): a user scroll is
 * mirrored into the store, a navigation tweens the store and the runtime
 * writes the scroller from it. Both directions pass through the mapping here —
 * scroll offset ↔ roll desk-y, a linear map of the full scroll range onto the
 * desk's vertical span — so the field's compositor ride and the scene's slight
 * parallax keep reading the same desk-space pose they always have.
 *
 * Zoom stays exactly what it is on desktop: the PROGRESS CLOCK for the §7.3
 * reveal. Mobile projections ignore it (static scene camera, untransformed
 * plane), so a roll document pose keeps its parent zone's y and carries
 * DOC_ZOOM purely to drive the phase-locked reveal — same gate, same driver,
 * one reduced-motion cut.
 */

import type { Pose } from './camera';
import { DOC_ZOOM, type PoseResolver } from './nav';
import { zoneForPath } from './zones';

/**
 * The desk's vertical span (§4): the roll maps its scroll range onto this
 * band, so the store's desk-y — which drives the WebGL scene's slight
 * parallax and the graphite field — stays in the coordinates those layers
 * expect. A fixed span (not the measured scroll height) keeps the scene's
 * MOBILE_PARALLAX and the field's density content-independent.
 *
 * Consequence, by design (review #23): zone cards are laid out by native
 * flow (1:1 with scroll), while the field is a desk-projected background
 * that pans with desk-y — i.e. at ROLL_SPAN/maxScroll of the scroll rate.
 * On a roll taller than ROLL_SPAN the field reads as a slower atmospheric
 * layer behind the content (it sits BELOW the plane, occluded by paper), not
 * as marks glued to specific cards — that literal "drawn on the desk beside
 * the paper" relationship (§12) only holds on the desktop desk, where the
 * cards are themselves desk-projected. The alternative (projecting the field
 * in scroll space) blanks the lower half of a tall roll, since the agents
 * only wander the ±ROLL_SPAN/2 desk box. Bounded parallax is the better read.
 */
export const ROLL_SPAN = 3400;

/** A zone's snap position in the roll: its id and document scroll offset.
 *  Offsets are expected in DOM (sheet) order, ascending. */
export interface RollOffset {
  id: string;
  top: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Scroll offset → roll desk-y: [0, maxScroll] maps linearly onto
 *  [-ROLL_SPAN/2, +ROLL_SPAN/2]. A degenerate roll (no range) is desk centre. */
export function rollDeskY(scrollY: number, maxScroll: number): number {
  if (maxScroll <= 0) return 0;
  return (clamp(scrollY, 0, maxScroll) / maxScroll - 0.5) * ROLL_SPAN;
}

/** Roll desk-y → scroll offset (the inverse of rollDeskY, clamped). */
export function rollScrollY(deskY: number, maxScroll: number): number {
  if (maxScroll <= 0) return 0;
  return clamp((deskY / ROLL_SPAN + 0.5) * maxScroll, 0, maxScroll);
}

/** The roll pose for a scroll offset: x locked to 0, zoom locked to 1 —
 *  single-axis by construction (no free 2D panning, §13). */
export function rollPose(scrollY: number, maxScroll: number): Pose {
  return { x: 0, y: rollDeskY(scrollY, maxScroll), zoom: 1 };
}

/**
 * The zone occupying the viewport: the last zone whose top sits at or above
 * the viewport's vertical midpoint. Snap rests exactly on a zone top
 * (scroll-snap-align: start), and a tall zone keeps ownership while its
 * interior scrolls past. Null only for an empty offset list.
 */
export function zoneAtScroll(
  scrollY: number,
  viewportH: number,
  offsets: RollOffset[]
): string | null {
  const mid = scrollY + viewportH / 2;
  let id: string | null = null;
  for (const o of offsets) {
    if (o.top <= mid) id = o.id;
  }
  return id ?? (offsets.length > 0 ? offsets[0].id : null);
}

/**
 * A PoseResolver over measured roll offsets: a zone pose sits at the zone's
 * snap offset; a document pose keeps its parent zone's y and carries DOC_ZOOM
 * as the reveal's progress clock. An unknown id resolves to the roll's top —
 * callers pass ids from the same DOM the offsets were measured on.
 */
export function rollResolver(offsets: RollOffset[], maxScroll: number): PoseResolver {
  const zone = (zoneId: string): Pose => {
    const o = offsets.find((z) => z.id === zoneId);
    return rollPose(o ? o.top : 0, maxScroll);
  };
  return {
    zone,
    doc: (zoneId: string) => ({ ...zone(zoneId), zoom: DOC_ZOOM }),
  };
}

/**
 * The close plan for the roll ("Back folds and retraces", §7.3 on y). While
 * the document DOM is live the roll does not exist — document routes keep the
 * posed plane — so a close runs the FOLD clock in place, and the runtime
 * finishes on the arriving zone DOM: land the roll at the document's parent
 * zone (the desk the document was sitting on), then, when history is
 * retracing to some other zone, slide on.
 */
export function rollCloseRetrace(
  fromPath: string,
  toPath: string
): { parentId: string; targetId: string; retrace: boolean } {
  const parentId = zoneForPath(fromPath).id;
  const targetId = zoneForPath(toPath).id;
  return { parentId, targetId, retrace: parentId !== targetId };
}
