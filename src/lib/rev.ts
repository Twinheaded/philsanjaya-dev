/**
 * Build-time revision stamp for the title block's REV line (§9) — the
 * "built in public" signature, automated.
 *
 * Server-only: this uses `node:child_process` and must be imported from
 * component frontmatter (or another server module), never from client code.
 */

import { execSync } from 'node:child_process';

function shortSha(): string {
  try {
    return execSync('git rev-parse --short HEAD', {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
  } catch {
    // CI checkouts always have git, but never fail the build over a stamp.
    const fromEnv = process.env.GITHUB_SHA ?? '';
    return fromEnv ? fromEnv.slice(0, 7) : 'local';
  }
}

export const REV = {
  sha: shortSha(),
  date: new Date().toISOString().slice(0, 10),
} as const;
