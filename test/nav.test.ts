/**
 * M4 open/close state machine (PHI-65). Per notes 3 and 6, the mechanics are
 * proven here: pose resolution per route type, and that the camera store never
 * sticks across interrupted dive/fold/spam sequences. Choreography feel is
 * Phil's in a real browser.
 */

import { describe, expect, it } from 'vitest';
import { CameraStore, slideDuration, type Pose } from '../src/lib/camera';
import { DOC_ZOOM, isDocumentRoute, isPageRoute, isZoneRoute, resolvePose } from '../src/lib/nav';

const round = (p: Pose): Pose => ({
  x: Math.round(p.x),
  y: Math.round(p.y),
  zoom: Math.round(p.zoom * 100) / 100,
});

describe('route classification', () => {
  it('classifies zone routes', () => {
    for (const p of ['/', '/about', '/projects', '/notes', '/log', '/notes/2', '/log/3']) {
      expect(isZoneRoute(p), p).toBe(true);
      expect(isDocumentRoute(p), p).toBe(false);
    }
  });

  it('classifies document routes (and unknown = 404 document)', () => {
    for (const p of ['/projects/aegisx', '/notes/porting', '/log/01-foundation', '/nope']) {
      expect(isDocumentRoute(p), p).toBe(true);
      expect(isZoneRoute(p), p).toBe(false);
    }
  });

  it('ignores a trailing slash', () => {
    expect(isZoneRoute('/projects/')).toBe(true);
    expect(isDocumentRoute('/projects/aegisx/')).toBe(true);
  });

  it('excludes assets — a file with an extension is never a page/document', () => {
    for (const a of ['/resume.pdf', '/favicon.svg', '/og/aegisx.png', '/robots.txt']) {
      expect(isDocumentRoute(a), a).toBe(false);
      expect(isZoneRoute(a), a).toBe(false);
      expect(isPageRoute(a), a).toBe(false); // the camera must not move for these
    }
  });

  it('real page routes are page routes', () => {
    for (const p of ['/', '/projects', '/notes/2', '/projects/aegisx', '/nope']) {
      expect(isPageRoute(p), p).toBe(true);
    }
  });
});

describe('resolvePose', () => {
  it('poses zone routes at their zone', () => {
    expect(round(resolvePose('/'))).toEqual({ x: 0, y: 0, zoom: 1 });
    expect(round(resolvePose('/projects'))).toEqual({ x: 1800, y: 0, zoom: 0.9 });
    expect(round(resolvePose('/notes'))).toEqual({ x: 0, y: 1400, zoom: 0.95 });
  });

  it('poses a paginated route at its parent zone', () => {
    expect(round(resolvePose('/notes/2'))).toEqual(round(resolvePose('/notes')));
  });

  it('poses a document at its parent zone position, at the document zoom', () => {
    const doc = resolvePose('/projects/aegisx');
    expect(doc.x).toBe(1800);
    expect(doc.y).toBe(0);
    expect(doc.zoom).toBe(DOC_ZOOM);
  });

  it('a document open is a zoom-heavy, translation-light move from its zone', () => {
    // /projects (zone) -> /projects/aegisx (document): same x/y, zoom 0.9 -> 1.45.
    const from = resolvePose('/projects');
    const to = resolvePose('/projects/aegisx');
    expect(Math.hypot(to.x - from.x, to.y - from.y)).toBe(0);
    // Zero translation distance -> the 450ms slide floor (note 4 territory).
    expect(slideDuration(from, to)).toBe(450);
  });
});

describe('open/close never sticks (note 3)', () => {
  const drive = (store: CameraStore, path: string, now: number) =>
    store.slideTo(resolvePose(path), now);

  it('dive into a document, then Back to the zone, then a number-key to another zone', () => {
    const store = new CameraStore(resolvePose('/'));
    let now = 0;

    drive(store, '/projects', now); // Slide home -> experiments
    now += 120;
    store.tick(now); // mid-slide

    drive(store, '/projects/aegisx', now); // dive: push to 1.45 (retarget from live)
    now += 80;
    store.tick(now);

    drive(store, '/projects', (now += 0)); // Back: fold out (retarget again)
    now += 60;
    store.tick(now);

    drive(store, '/notes', now); // number-key to another zone (retarget again)
    // Let it finish.
    store.tick(now + 2000);

    expect(round(store.current)).toEqual(round(resolvePose('/notes')));
    expect(store.isAnimating).toBe(false);
  });

  it('spam open/close both directions settles on the last target with no jump', () => {
    const store = new CameraStore(resolvePose('/projects'));
    let now = 0;
    const seq = ['/projects/aegisx', '/projects', '/projects/aegisx', '/projects', '/projects/ctf-arena'];
    for (const p of seq) {
      drive(store, p, now);
      const before = { ...store.current };
      store.tick(now); // same instant: no movement, so no jump on retarget
      expect(store.current.x).toBeCloseTo(before.x, 9);
      expect(store.current.zoom).toBeCloseTo(before.zoom, 9);
      now += 30; // partial advance before the next interrupt
      store.tick(now);
    }
    store.tick(now + 2000);
    expect(round(store.current)).toEqual(round(resolvePose('/projects/ctf-arena')));
    expect(store.isAnimating).toBe(false);
  });

  it('a document-to-document jump lands at the new document pose', () => {
    const store = new CameraStore(resolvePose('/projects/aegisx'));
    // Same pose family (both parent = experiments): a no-op, must not animate.
    store.slideTo(resolvePose('/projects/ctf-arena'), 0);
    expect(store.isAnimating).toBe(false);
    expect(round(store.current)).toEqual(round(resolvePose('/projects/ctf-arena')));
  });

  it('reduced motion cuts document opens instantly', () => {
    const store = new CameraStore(resolvePose('/'), { reduced: true });
    store.slideTo(resolvePose('/projects/aegisx'), 0);
    expect(store.isAnimating).toBe(false);
    expect(store.current.zoom).toBe(DOC_ZOOM);
  });
});
