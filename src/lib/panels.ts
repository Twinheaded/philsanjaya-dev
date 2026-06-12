/**
 * The top-level panel sequence (PRD §6). Rail order is a true left-to-right
 * sequence; navigation direction derives from index comparison.
 */
export interface Panel {
  num: string;
  label: string;
  href: string;
}

export const PANELS: Panel[] = [
  { num: '01', label: 'Home', href: '/' },
  { num: '02', label: 'Projects', href: '/projects' },
  { num: '03', label: 'Notes', href: '/notes' },
  { num: '04', label: 'Log', href: '/log' },
  { num: '05', label: 'About', href: '/about' },
];

/** Index of a pathname in the panel sequence, or -1 for deeper routes. */
export function panelIndex(pathname: string): number {
  const path =
    pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  const direct = PANELS.findIndex((p) => p.href === path);
  if (direct !== -1) return direct;
  // Paginated index routes (/notes/2, /log/3) still belong to their panel:
  // the rail marker and arrow-key navigation stay active there.
  const paged = path.match(/^(\/(?:notes|log))\/\d+$/);
  if (paged) return PANELS.findIndex((p) => p.href === paged[1]);
  return -1;
}
