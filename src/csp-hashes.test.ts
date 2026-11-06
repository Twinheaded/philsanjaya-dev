/**
 * CSP hash guard (PHI-154, audit AUD-06). Runs after `astro build` in
 * `npm run verify` and in CI.
 *
 * public/_headers allows inline scripts only by sha256 hash. If an inline
 * script's text changes (an edit, or an Astro/Vite upgrade that rewrites an
 * inlined script) and its hash is not updated, browsers silently block it in
 * production while every local check stays green. This test rebuilds each
 * hash from dist/ and fails when one is missing from the policy.
 *
 * Data blocks such as JSON-LD (`type="application/ld+json"`) never execute,
 * so script-src does not apply to them and they are skipped.
 */

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const DIST = join(ROOT, 'dist');
const HEADERS = join(ROOT, 'public', '_headers');

/** HTML's JavaScript MIME type essences: a script with one of these runs. */
const JS_MIME_TYPES = new Set([
  'application/ecmascript',
  'application/javascript',
  'application/x-ecmascript',
  'application/x-javascript',
  'text/ecmascript',
  'text/javascript',
  'text/javascript1.0',
  'text/javascript1.1',
  'text/javascript1.2',
  'text/javascript1.3',
  'text/javascript1.4',
  'text/javascript1.5',
  'text/jscript',
  'text/livescript',
  'text/x-ecmascript',
  'text/x-javascript',
]);

/** Non-classic types that CSP's script-src still governs when inline. */
const OTHER_GOVERNED_TYPES = new Set(['module', 'importmap', 'speculationrules']);

interface InlineScript {
  body: string;
  hash: string;
}

/** The `type` attribute's value, or null when the attribute is absent. */
function typeAttribute(attrs: string): string | null {
  const m = attrs.match(/(?:^|\s)type\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i);
  return m ? (m[1] ?? m[2] ?? m[3] ?? '') : null;
}

/** Whether a <script> with these attributes is inline code that script-src governs. */
function isGovernedInlineScript(attrs: string): boolean {
  if (/(?:^|\s)src(?:\s*=|\s|$)/i.test(attrs)) return false; // external file, covered by 'self'
  const type = typeAttribute(attrs);
  if (type === null) return true;
  const t = type.trim().toLowerCase();
  return t === '' || JS_MIME_TYPES.has(t) || OTHER_GOVERNED_TYPES.has(t);
}

/** sha256 (base64) of a script body, as CSP computes it. */
function cspHash(body: string): string {
  return createHash('sha256').update(body, 'utf8').digest('base64');
}

/** Every inline script in an HTML document that script-src governs. */
function governedInlineScripts(html: string): InlineScript[] {
  const scripts: InlineScript[] = [];
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    if (isGovernedInlineScript(m[1])) scripts.push({ body: m[2], hash: cspHash(m[2]) });
  }
  return scripts;
}

/** The sha256 sources in the script-src directive of a _headers file. */
function scriptSrcHashes(headers: string): Set<string> {
  const csp = headers.match(/^\s*Content-Security-Policy:\s*(.+)$/im);
  if (!csp) throw new Error('public/_headers has no Content-Security-Policy line');
  const scriptSrc = csp[1].split(';').find((d) => d.trim().startsWith('script-src'));
  if (!scriptSrc) throw new Error('the Content-Security-Policy has no script-src directive');
  return new Set([...scriptSrc.matchAll(/'sha256-([A-Za-z0-9+/=]+)'/g)].map((m) => m[1]));
}

function htmlFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return htmlFiles(path);
    return e.name.endsWith('.html') ? [path] : [];
  });
}

describe('inline script detection', () => {
  it('skips JSON-LD and other data blocks', () => {
    const html =
      '<script type="application/ld+json">{"@type":"Person"}</script>' +
      "<script type='application/json'>{}</script>" +
      '<script type=text/plain>x</script>';
    expect(governedInlineScripts(html)).toEqual([]);
  });

  it('skips external scripts, including ones with a body', () => {
    expect(governedInlineScripts('<script type="module" src="/_astro/a.js"></script>')).toEqual([]);
    expect(governedInlineScripts('<script src=/a.js>ignored()</script>')).toEqual([]);
  });

  it('keeps classic, JavaScript-typed and module inline scripts', () => {
    const html =
      '<script>a()</script>' +
      '<script type="text/javascript">b()</script>' +
      '<script type="module" data-src="x">c()</script>' +
      '<script type="">d()</script>';
    expect(governedInlineScripts(html).map((s) => s.body)).toEqual(['a()', 'b()', 'c()', 'd()']);
  });

  it('hashes the exact body, whitespace included', () => {
    // Known value: sha256("alert('Hello, world.');"), the example in the CSP spec.
    expect(cspHash("alert('Hello, world.');")).toBe('qznLcsROx4GACP2dm0UCKCzCG+HiZ1guq6ZZDob/Tng=');
    expect(cspHash(' a()')).not.toBe(cspHash('a()'));
  });

  it('reads hashes from script-src only', () => {
    const headers =
      "/*\n  Content-Security-Policy: default-src 'self'; script-src 'self' 'sha256-AAA='; style-src 'sha256-BBB='\n";
    expect([...scriptSrcHashes(headers)]).toEqual(['AAA=']);
  });
});

describe('built site (dist/) against public/_headers', () => {
  it('lists a hash for every executable inline script on every page', () => {
    if (!existsSync(DIST)) {
      throw new Error('dist/ not found: run `astro build` first (npm run verify does both)');
    }
    const pages = htmlFiles(DIST);
    expect(pages.length, 'dist/ contains no HTML pages').toBeGreaterThan(0);

    const allowed = scriptSrcHashes(readFileSync(HEADERS, 'utf8'));
    const missing: string[] = [];
    for (const page of pages) {
      for (const { body, hash } of governedInlineScripts(readFileSync(page, 'utf8'))) {
        if (!allowed.has(hash)) {
          const preview = body.trim().replace(/\s+/g, ' ').slice(0, 60);
          missing.push(`${relative(ROOT, page).split(sep).join('/')}: 'sha256-${hash}' (script starts: ${preview})`);
        }
      }
    }

    expect(
      missing,
      'Inline scripts whose hash is missing from script-src in public/_headers. ' +
        'Browsers will block them in production. Add the hash shown, or revert the script change.'
    ).toEqual([]);
  });
});
