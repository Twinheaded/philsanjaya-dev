/**
 * The desk zone map (§4). Each zone is a real route and a pose in desk units.
 *
 * Poses are emitted server-side as CSS custom properties (`--cam-x`, `--cam-y`,
 * `--cam-zoom` on `<body data-zone>`), and the DOM plane derives its transform
 * from those variables. Two consequences, both deliberate:
 *   - fallback rung 4 (no JS) costs zero JS — the page is already posed;
 *   - M3's camera store animates *these same variables* rather than inventing a
 *     second positioning system.
 *
 * Desk bounds are ~5200x3400 with the origin at desk centre; the generous empty
 * space between zones is part of the composition.
 */

export interface Zone {
  /** `data-zone` value and CSS hook. */
  id: string;
  /** Drafting sheet number, e.g. "01". */
  sheet: string;
  /** Title-block label. */
  label: string;
  href: string;
  /** Pose in desk units (x, y) and camera zoom at that pose. */
  x: number;
  y: number;
  zoom: number;
}

export const ZONES: Zone[] = [
  { id: 'home', sheet: '01', label: 'Home', href: '/', x: 0, y: 0, zoom: 1 },
  { id: 'experiments', sheet: '02', label: 'Experiments', href: '/projects', x: 1800, y: 0, zoom: 0.9 },
  { id: 'notes', sheet: '03', label: 'Notes', href: '/notes', x: 0, y: 1400, zoom: 0.95 },
  { id: 'log', sheet: '04', label: 'Log', href: '/log', x: -1800, y: 0, zoom: 0.95 },
  { id: 'workshop', sheet: '05', label: 'Workshop', href: '/about', x: 0, y: -1400, zoom: 0.95 },
];

/**
 * The zone a pathname belongs to. Paginated index routes (`/notes/2`) and
 * document routes (`/projects/<slug>`) resolve to their parent zone, so the
 * title block marks the right sheet active on every route.
 */
export function zoneForPath(pathname: string): Zone {
  const path =
    pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  if (path === '/projects' || path.startsWith('/projects/')) return ZONES[1];
  if (path === '/notes' || path.startsWith('/notes/')) return ZONES[2];
  if (path === '/log' || path.startsWith('/log/')) return ZONES[3];
  if (path === '/about') return ZONES[4];
  return ZONES[0];
}

/** Look up a zone by id; falls back to Home so callers never get undefined. */
export function zoneById(id: string): Zone {
  return ZONES.find((z) => z.id === id) ?? ZONES[0];
}
