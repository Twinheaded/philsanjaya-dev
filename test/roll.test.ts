/**
 * The mobile roll maths (§13, M9): the scroll↔desk-y map, the viewport-zone
 * pick, the measured-offset pose resolver, and the §7.3 plans projected onto
 * the roll. The DOM half (snap behaviour, scroll driving) can't run in vitest
 * — it is verified in the browser pass and on Phil's phone (M9 note 7).
 */

import { describe, expect, it } from 'vitest';
import { DOC_ZOOM, planCamera, SETTLE_MS } from '../src/lib/nav';
import {
  ROLL_SPAN,
  rollCloseRetrace,
  rollDeskY,
  rollPose,
  rollResolver,
  rollScrollY,
  zoneAtScroll,
  type RollOffset,
} from '../src/lib/roll';

/** A plausible measured roll: five zones, notes runs tall (viewport 800). */
const OFFSETS: RollOffset[] = [
  { id: 'home', top: 0 },
  { id: 'experiments', top: 800 },
  { id: 'notes', top: 1600 },
  { id: 'log', top: 3000 },
  { id: 'workshop', top: 3800 },
];
const MAX = 3800; // last zone exactly one viewport tall
const VH = 800;

describe('rollDeskY / rollScrollY — the scroll↔desk map', () => {
  it('maps the scroll range onto the desk span, ends and centre exact', () => {
    expect(rollDeskY(0, MAX)).toBe(-ROLL_SPAN / 2);
    expect(rollDeskY(MAX, MAX)).toBe(ROLL_SPAN / 2);
    expect(rollDeskY(MAX / 2, MAX)).toBe(0);
  });

  it('round-trips: rollScrollY(rollDeskY(s)) === s across the range', () => {
    for (const s of [0, 1, 137, MAX / 3, MAX / 2, MAX - 1, MAX]) {
      expect(rollScrollY(rollDeskY(s, MAX), MAX)).toBeCloseTo(s, 6);
    }
  });

  it('clamps outside the range instead of extrapolating', () => {
    expect(rollDeskY(-500, MAX)).toBe(-ROLL_SPAN / 2);
    expect(rollDeskY(MAX + 500, MAX)).toBe(ROLL_SPAN / 2);
    expect(rollScrollY(-ROLL_SPAN, MAX)).toBe(0);
    expect(rollScrollY(ROLL_SPAN, MAX)).toBe(MAX);
  });

  it('a degenerate roll (no scroll range) is desk centre', () => {
    expect(rollDeskY(0, 0)).toBe(0);
    expect(rollDeskY(100, 0)).toBe(0);
    expect(rollScrollY(300, 0)).toBe(0);
  });

  it('rollPose is single-axis by construction: x 0, zoom 1', () => {
    const p = rollPose(1234, MAX);
    expect(p.x).toBe(0);
    expect(p.zoom).toBe(1);
    expect(p.y).toBe(rollDeskY(1234, MAX));
  });
});

describe('zoneAtScroll — the zone under the viewport midpoint', () => {
  it('a snap rest at a zone top belongs to that zone', () => {
    expect(zoneAtScroll(0, VH, OFFSETS)).toBe('home');
    expect(zoneAtScroll(800, VH, OFFSETS)).toBe('experiments');
    expect(zoneAtScroll(3800, VH, OFFSETS)).toBe('workshop');
  });

  it('a tall zone keeps ownership while its interior scrolls past', () => {
    // notes spans 1600..3000; at scroll 2400 the midpoint (2800) is still
    // above log's top (3000).
    expect(zoneAtScroll(2400, VH, OFFSETS)).toBe('notes');
    expect(zoneAtScroll(2700, VH, OFFSETS)).toBe('log'); // midpoint crossed 3000
  });

  it('degenerates safely: above the first zone → first; empty list → null', () => {
    expect(zoneAtScroll(-400, VH, OFFSETS)).toBe('home');
    expect(zoneAtScroll(0, VH, [])).toBeNull();
  });
});

describe('rollResolver — poses over measured offsets', () => {
  const poses = rollResolver(OFFSETS, MAX);

  it('a zone pose sits at the zone snap offset, x 0, zoom 1', () => {
    expect(poses.zone('notes')).toEqual({ x: 0, y: rollDeskY(1600, MAX), zoom: 1 });
  });

  it('a document pose keeps its zone y and carries DOC_ZOOM as the clock', () => {
    const zone = poses.zone('experiments');
    const doc = poses.doc('experiments');
    expect(doc.y).toBe(zone.y); // the push never moves the roll — zoom is a clock
    expect(doc.x).toBe(0);
    expect(doc.zoom).toBe(DOC_ZOOM);
  });

  it('an unknown id resolves to the roll top (never throws)', () => {
    expect(poses.zone('nope')).toEqual({ x: 0, y: rollDeskY(0, MAX), zoom: 1 });
  });
});

describe('planCamera over the roll resolver — §7.3 plans on y only', () => {
  const poses = rollResolver(OFFSETS, MAX);

  it('cross-zone open: travel to the parent zone, settle, then a pure-clock push', () => {
    const plan = planCamera('/', '/projects/aegisx', SETTLE_MS, poses);
    expect(plan).toHaveLength(2);
    expect(plan[0].pose).toEqual(poses.zone('experiments'));
    expect(plan[0].settle).toBe(SETTLE_MS);
    expect(plan[1].pose.zoom).toBe(DOC_ZOOM);
    // Beat 2 must not move the roll: same y as Beat 1's arrival.
    expect(plan[1].pose.y).toBe(plan[0].pose.y);
    expect(plan[1].pose.x).toBe(0);
  });

  it('same-zone open: a single leg, zoom-only relative to the zone rest', () => {
    const plan = planCamera('/projects', '/projects/aegisx', SETTLE_MS, poses);
    expect(plan).toHaveLength(1);
    expect(plan[0].pose).toEqual(poses.doc('experiments'));
  });

  it('zone→zone: one slide leg to the target snap offset', () => {
    const plan = planCamera('/', '/notes', SETTLE_MS, poses);
    expect(plan).toEqual([{ pose: poses.zone('notes'), settle: 0 }]);
  });

  it('the default resolver still yields the desktop §4 plan (unchanged API)', () => {
    const plan = planCamera('/', '/projects/aegisx');
    expect(plan).toHaveLength(2);
    expect(plan[0].pose).toEqual({ x: 1800, y: 0, zoom: 0.9 });
    expect(plan[1].pose).toEqual({ x: 1800, y: 0, zoom: DOC_ZOOM });
  });
});

describe('rollCloseRetrace — "Back folds and retraces"', () => {
  it('closing to the parent zone needs no retrace', () => {
    expect(rollCloseRetrace('/projects/aegisx', '/projects')).toEqual({
      parentId: 'experiments',
      targetId: 'experiments',
      retrace: false,
    });
  });

  it('closing across zones lands at the parent, then retraces', () => {
    expect(rollCloseRetrace('/projects/aegisx', '/')).toEqual({
      parentId: 'experiments',
      targetId: 'home',
      retrace: true,
    });
  });

  it('a note closes to its own zone', () => {
    expect(rollCloseRetrace('/notes/some-note', '/notes')).toEqual({
      parentId: 'notes',
      targetId: 'notes',
      retrace: false,
    });
  });
});
