/**
 * M7 polish (§7.1 + §7 flourish): the cursor tilt on lifted cards, and the
 * ink-reveal underline — the site's ONLY flourish.
 *
 * Loaded by desk.ts (a module singleton surviving ClientRouter swaps), so all
 * listeners are delegated and bind once.
 */

import { zoneForPath } from '../lib/zones';

// Live media-query refs (review): the CSS halves of these features re-evaluate
// continuously, so the JS must read .matches at use time, not freeze booleans
// at module eval.
const reducedMq = window.matchMedia('(prefers-reduced-motion: reduce)');
const fineMq = window.matchMedia('(pointer: fine)');

// --- Cursor tilt (§7.1): ≤1.2° toward the cursor, hover-capable inputs only.
// Writes the CSS vars the lift transform reads; the lift itself is pure CSS.
const MAX_TILT = 1.2;
document.addEventListener('pointermove', (e) => {
  // Per-EVENT modality (review): (pointer: fine) describes the PRIMARY
  // pointer — on a touch-capable laptop a finger still fires pointermove.
  if (e.pointerType !== 'mouse' && e.pointerType !== 'pen') return;
  if (!fineMq.matches || reducedMq.matches) return;
  const card = (e.target as HTMLElement | null)?.closest<HTMLElement>('.paper-card');
  if (!card) return;
  const r = card.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return;
  const nx = (e.clientX - r.left) / r.width - 0.5;
  const ny = (e.clientY - r.top) / r.height - 0.5;
  // Top edge tilts away (negative rotateX is toward the viewer at the top).
  card.style.setProperty('--tilt-x', `${(-ny * 2 * MAX_TILT).toFixed(2)}deg`);
  card.style.setProperty('--tilt-y', `${(nx * 2 * MAX_TILT).toFixed(2)}deg`);
});
document.addEventListener('pointerout', (e) => {
  const card = (e.target as HTMLElement | null)?.closest<HTMLElement>('.paper-card');
  if (!card || card.contains(e.relatedTarget as Node | null)) return;
  card.style.removeProperty('--tilt-x');
  card.style.removeProperty('--tilt-y');
});

// Input-modality stamp (review): a tap on a hybrid device sets sticky :hover,
// which would hold the card lifted after the finger leaves — rule 5 says touch
// gets the press state, never hover. CSS reads html[data-input='touch'].
document.addEventListener(
  'pointerdown',
  (e) => {
    document.documentElement.dataset.input = e.pointerType === 'touch' ? 'touch' : 'fine';
  },
  { capture: true, passive: true }
);

// --- Ink reveal: once per session per zone (documents share their parent
// zone's key), skipped under reduced motion — the static underline stands.
// The in-memory set is the primary guard (review): if sessionStorage is
// blocked, the flourish stays once-per-SPA-session instead of every nav.
const drawn = new Set<string>();
function inkReveal(): void {
  const target = document.querySelector<SVGElement>('main#main .ink-underline');
  if (!target || reducedMq.matches) return;
  const key = `ink:${zoneForPath(location.pathname).id}`;
  if (drawn.has(key)) return;
  try {
    if (sessionStorage.getItem(key) === '1') return;
    sessionStorage.setItem(key, '1');
  } catch {
    // Storage unavailable: the module-scope set still holds for this session.
  }
  drawn.add(key);
  target.classList.add('ink-draw');
}

document.addEventListener('astro:page-load', inkReveal);
inkReveal(); // cold start (page-load may already have fired before this module)
