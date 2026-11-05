/**
 * Panel sequence tests (PHI-159). The shell's slides, arrow keys, swipe and
 * rail marker all derive from PANELS and panelIndex(), so these pin the
 * three-panel order after Notes and Log were removed.
 */

import { describe, expect, it } from 'vitest';
import { PANELS, panelIndex } from './panels';

describe('PANELS', () => {
  it('is Home, Projects, About, numbered 01–03', () => {
    expect(PANELS.map((p) => [p.num, p.label, p.href])).toEqual([
      ['01', 'Home', '/'],
      ['02', 'Projects', '/projects'],
      ['03', 'About', '/about'],
    ]);
  });
});

describe('panelIndex', () => {
  it('finds each top-level panel, with or without a trailing slash', () => {
    expect(panelIndex('/')).toBe(0);
    expect(panelIndex('/projects')).toBe(1);
    expect(panelIndex('/projects/')).toBe(1);
    expect(panelIndex('/about')).toBe(2);
    expect(panelIndex('/about/')).toBe(2);
  });

  it('returns -1 for deeper routes, so arrow keys and swipe do nothing there', () => {
    expect(panelIndex('/projects/ctf-arena')).toBe(-1);
    expect(panelIndex('/404')).toBe(-1);
  });

  it('no longer treats the removed Notes and Log routes as panels', () => {
    for (const path of ['/notes', '/notes/2', '/log', '/log/2', '/log/01-foundation']) {
      expect(panelIndex(path)).toBe(-1);
    }
  });
});
