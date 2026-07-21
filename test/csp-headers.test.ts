/**
 * CSP hash guard.
 *
 * `public/_headers` pins a `script-src` sha256 for each executable inline script
 * the site ships. If a snippet's body changes (even a comment or indentation)
 * and the pin is not updated, Cloudflare blocks the script in production — and
 * nothing else catches it, because `_headers` is applied by Pages, never by
 * `astro dev`/`preview`. That is exactly how the M2 rewrite of the theme snippet
 * out of the deleted Shell.astro slipped a broken CSP past a green `verify`.
 *
 * This test recomputes the hashes from the BUILT output and diffs them against
 * the pins, failing on a missing pin (would be blocked) or a stale pin (dead
 * config / drift signal). It runs after `astro build` in both `npm run verify`
 * and CI, so `dist/` is fresh.
 */

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = join(repoRoot, 'dist');
const headersPath = join(distDir, '_headers');

/** Collect every .html file under a directory, recursively. */
function htmlFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...htmlFiles(full));
    else if (name.endsWith('.html')) out.push(full);
  }
  return out;
}

/**
 * Whether an inline script with this `type` executes as script — the only case
 * `script-src` hashing applies to. `application/ld+json`, `importmap`,
 * `text/template`, etc. are not executed and need no hash.
 */
function isExecutableType(type: string | null): boolean {
  if (type === null) return true;
  const t = type.trim().toLowerCase();
  return (
    t === '' ||
    t === 'module' ||
    t === 'text/javascript' ||
    t === 'application/javascript' ||
    t === 'text/ecmascript' ||
    t === 'application/ecmascript'
  );
}

const SCRIPT_RE = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;

function cspHash(body: string): string {
  return 'sha256-' + createHash('sha256').update(body, 'utf8').digest('base64');
}

/** Hashes of the executable inline scripts in one HTML document. */
function inlineHashes(html: string): string[] {
  const hashes: string[] = [];
  for (const m of html.matchAll(SCRIPT_RE)) {
    const attrs = m[1];
    if (/\bsrc\s*=/i.test(attrs)) continue; // external script — governed by 'self'
    const typeMatch = attrs.match(/\btype\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const type = typeMatch ? (typeMatch[2] ?? typeMatch[3] ?? typeMatch[4] ?? '') : null;
    if (!isExecutableType(type)) continue;
    hashes.push(cspHash(m[2]));
  }
  return hashes;
}

/** The sha256 pins inside the `script-src` directive of the served CSP. */
function pinnedScriptSrcHashes(headers: string): Set<string> {
  const csp = headers.match(/Content-Security-Policy:\s*([^\n]*)/i)?.[1] ?? '';
  const scriptSrc = csp.match(/script-src([^;]*)/i)?.[1] ?? '';
  return new Set([...scriptSrc.matchAll(/'(sha256-[A-Za-z0-9+/=]+)'/g)].map((m) => m[1]));
}

describe('CSP script-src hashes match the built inline scripts', () => {
  it('has a fresh build to check', () => {
    expect(
      existsSync(distDir) && existsSync(headersPath),
      'dist/ or dist/_headers is missing — run `npm run build` first (verify/CI build before testing)'
    ).toBe(true);
  });

  it('pins exactly the executable inline scripts that were built', () => {
    // Map each built hash to the files it appears in, for actionable failures.
    const builtToFiles = new Map<string, string[]>();
    for (const file of htmlFiles(distDir)) {
      const rel = file.slice(distDir.length + 1).replaceAll('\\', '/');
      for (const h of inlineHashes(readFileSync(file, 'utf8'))) {
        builtToFiles.set(h, [...(builtToFiles.get(h) ?? []), rel]);
      }
    }

    const built = new Set(builtToFiles.keys());
    const pinned = pinnedScriptSrcHashes(readFileSync(headersPath, 'utf8'));

    // Sanity: the extractor must actually find scripts, or the guard is vacuous.
    expect(built.size, 'no executable inline scripts found — the extractor is broken').toBeGreaterThan(0);

    const missing = [...built].filter((h) => !pinned.has(h)); // built but unpinned → blocked in prod
    const stale = [...pinned].filter((h) => !built.has(h)); // pinned but not built → dead / drift

    expect(
      missing,
      `Inline scripts are not pinned in public/_headers — production would block them:\n` +
        missing.map((h) => `  ${h}  (e.g. ${builtToFiles.get(h)?.[0]})`).join('\n') +
        `\nRecompute the script-src hashes over dist/**/*.html and update public/_headers.`
    ).toEqual([]);

    expect(
      stale,
      `public/_headers pins hashes that no built script produces (stale/drift):\n` +
        stale.map((h) => `  ${h}`).join('\n') +
        `\nRemove or update them in public/_headers.`
    ).toEqual([]);
  });
});
