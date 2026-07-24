/**
 * JS budget guard (§14, enforced in CI — M10 note 1).
 *
 * §14 sets two hard JS ceilings:
 *   - initial route JS ≤ 90KB gz, EXCLUDING `three`;
 *   - the `three` chunk ≤ 200KB gz (amended from 160 — three's ShaderLib floor
 *     is ~185KB gz; see DECISIONS_LOG 2026-07-23), and it must stay OFF the
 *     critical path (dynamically imported post-idle, never statically reachable).
 *
 * Like the CSP guard, this recomputes from the BUILT output and fails on
 * regression, so a heavy dependency or an accidental static `import 'three'`
 * cannot slip past a green `verify`. It runs after `astro build` in both
 * `npm run verify` and CI, so `dist/` is fresh.
 *
 * "Initial route JS" is the TRANSITIVE STATIC-IMPORT CLOSURE the browser must
 * fetch to execute a cold load: seed from the route's `<script type=module src>`
 * (and any `modulepreload`), then follow every static `import … from "./x.js"` /
 * `export … from` / side-effect `import "./x.js"` — recursively. This is NOT the
 * same as scanning `<script>`/`modulepreload` tags: this Astro build emits NO
 * modulepreload links, and the entry scripts pull the shared chunks (router,
 * zones, engine, …) via bare static imports inside the JS, which appear in no
 * HTML tag. A tag-only scan would silently miss ~40% of the real initial JS and
 * let an over-budget shared-chunk regression pass green (M10 review, HIGH).
 *
 * A DYNAMIC `import(...)` is not a static edge, so `three` (imported via
 * `await import('three')` in desk-scene.ts) is excluded by construction — and
 * we assert that invariant: three must be in no route's static closure.
 *
 * Sizes are gzip level 9 (canonical, reproducible, tool-independent). Brotli —
 * what Cloudflare actually serves — is smaller (three ≈ 150KB br), so the gz
 * ceiling is the conservative bound.
 */

import { gzipSync } from 'node:zlib';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = join(repoRoot, 'dist');
const astroDir = join(distDir, '_astro');

/** §14 ceilings. */
const INITIAL_MAX_KB = 90;
const THREE_MAX_KB = 200;

const gzKb = (file: string): number => gzipSync(readFileSync(file), { level: 9 }).length / 1024;

/** three's revision banner — a string literal in three's own code, version
 *  tolerant (`three.js r185`, `r200`, …) and absent from our runtime chunks. */
const THREE_SIGNATURE = /three\.js r\d/;

function htmlFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...htmlFiles(full));
    else if (name.endsWith('.html')) out.push(full);
  }
  return out;
}

/** The route's entry module URLs (dist-relative, no leading slash): the
 *  `<script type=module src>` scripts + any `modulepreload` (this build emits
 *  none, but seed from them too so the walk is correct if that ever changes). */
function entrySeeds(html: string): string[] {
  const urls = new Set<string>();
  for (const m of html.matchAll(/<script\b[^>]*\btype=["']module["'][^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)) {
    urls.add(m[1].replace(/^\//, ''));
  }
  for (const m of html.matchAll(/<link\b[^>]*\brel=["']modulepreload["'][^>]*\bhref=["']([^"']+)["'][^>]*>/gi)) {
    urls.add(m[1].replace(/^\//, ''));
  }
  for (const m of html.matchAll(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*\brel=["']modulepreload["'][^>]*>/gi)) {
    urls.add(m[1].replace(/^\//, ''));
  }
  return [...urls];
}

/** Static import/export-from + side-effect import specifiers of one chunk.
 *  Dynamic `import(...)` is excluded: `\bimport\s*["']` never matches `import(`,
 *  and the from-clause form requires a `from` keyword a dynamic import lacks. */
function staticSpecs(src: string): string[] {
  const out = new Set<string>();
  for (const m of src.matchAll(/(?:\bimport\b[^;]*?\bfrom|\bexport\b[^;]*?\bfrom)\s*["']([^"']+)["']/g)) {
    out.add(m[1]);
  }
  for (const m of src.matchAll(/\bimport\s*["']([^"']+)["']/g)) {
    out.add(m[1]);
  }
  return [...out];
}

/** Resolve a specifier from the importing chunk's dist-relative path. */
function resolveSpec(fromRel: string, spec: string): string {
  if (spec.startsWith('/')) return spec.replace(/^\//, '');
  return posix.normalize(posix.join(posix.dirname(fromRel.replaceAll('\\', '/')), spec));
}

/** The transitive static-import closure (dist-relative .js paths) of the seeds. */
function staticClosure(seeds: string[]): Set<string> {
  const seen = new Set<string>();
  const queue = [...seeds];
  while (queue.length) {
    const rel = queue.shift()!;
    if (seen.has(rel)) continue;
    seen.add(rel);
    const full = join(distDir, rel);
    if (!existsSync(full)) continue;
    for (const spec of staticSpecs(readFileSync(full, 'utf8'))) {
      const resolved = resolveSpec(rel, spec);
      if (resolved.endsWith('.js')) queue.push(resolved);
    }
  }
  return seen;
}

describe('JS budgets (§14) hold in the built output', () => {
  it('has a fresh build to check', () => {
    expect(
      existsSync(distDir) && existsSync(astroDir),
      'dist/_astro is missing — run `npm run build` first (verify/CI build before testing)'
    ).toBe(true);
  });

  it('ships exactly one lazy `three` chunk, ≤ 200KB gz', () => {
    const jsChunks = readdirSync(astroDir).filter((f) => f.endsWith('.js'));
    const threeChunks = jsChunks.filter((f) => THREE_SIGNATURE.test(readFileSync(join(astroDir, f), 'utf8')));

    expect(
      threeChunks.length,
      `expected exactly one three chunk (matched ${THREE_SIGNATURE}); found ${threeChunks.length}: ${threeChunks.join(', ')}`
    ).toBe(1);

    const threeKb = gzKb(join(astroDir, threeChunks[0]));
    expect(
      threeKb <= THREE_MAX_KB,
      `three chunk ${threeChunks[0]} is ${threeKb.toFixed(1)}KB gz — over the §14 ceiling of ${THREE_MAX_KB}KB`
    ).toBe(true);
  });

  it('keeps `three` off the critical path (in no route\'s static-import closure)', () => {
    const jsChunks = readdirSync(astroDir).filter((f) => f.endsWith('.js'));
    const threeBases = new Set(
      jsChunks.filter((f) => THREE_SIGNATURE.test(readFileSync(join(astroDir, f), 'utf8')))
    );

    const reachableOn: string[] = [];
    for (const file of htmlFiles(distDir)) {
      const closure = staticClosure(entrySeeds(readFileSync(file, 'utf8')));
      if ([...closure].some((rel) => threeBases.has(basename(rel)))) {
        reachableOn.push(file.slice(distDir.length + 1).replaceAll('\\', '/'));
      }
    }
    expect(
      reachableOn,
      `three is statically reachable (on the critical path) on:\n  ${reachableOn.join('\n  ')}\n` +
        `it must be dynamically imported post-idle only (§8) — check for a static \`import 'three'\`.`
    ).toEqual([]);
  });

  it('keeps every route\'s initial JS ≤ 90KB gz (static closure, excluding three)', () => {
    const jsChunks = readdirSync(astroDir).filter((f) => f.endsWith('.js'));
    const threeBases = new Set(
      jsChunks.filter((f) => THREE_SIGNATURE.test(readFileSync(join(astroDir, f), 'utf8')))
    );

    const perRoute: Array<{ route: string; kb: number; chunks: number }> = [];
    for (const file of htmlFiles(distDir)) {
      const closure = staticClosure(entrySeeds(readFileSync(file, 'utf8')));
      let kb = 0;
      let n = 0;
      for (const rel of closure) {
        if (!rel.endsWith('.js') || threeBases.has(basename(rel))) continue;
        const f = join(distDir, rel);
        if (existsSync(f)) {
          kb += gzKb(f);
          n++;
        }
      }
      perRoute.push({ route: file.slice(distDir.length + 1).replaceAll('\\', '/'), kb, chunks: n });
    }

    // Sanity: the closure must reach real modules (router/zones/… ≫ 1 chunk),
    // or the walk is broken and the guard would be vacuous.
    const maxChunks = Math.max(...perRoute.map((r) => r.chunks));
    expect(maxChunks, 'static closure found ≤1 chunk per route — the import walk is broken').toBeGreaterThan(1);

    const over = perRoute.filter((r) => r.kb > INITIAL_MAX_KB);
    expect(
      over,
      `routes over the §14 initial-JS ceiling of ${INITIAL_MAX_KB}KB gz:\n` +
        over.map((r) => `  ${r.kb.toFixed(1)}KB  ${r.route}`).join('\n')
    ).toEqual([]);
  });
});
