/**
 * Live readout (FR-14): displays only measured values — agent count,
 * active behaviour name, fps sampled at 1 Hz. Unmeasured values render
 * as an em-dash, never an invented number (PRD §4.2).
 */

import type { ReadoutData } from './engine';

export function renderReadout(el: Element, data: ReadoutData): void {
  const fps = data.fps === null ? '—' : String(data.fps);
  el.textContent = `${data.behaviour}() · ${data.count} agents · ${fps} fps`;
}
