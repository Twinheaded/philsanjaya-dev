# 0007 — CI-driven Pages deploys over dashboard git integration

Date: 2026-06-13 · Amends the deployment consequence of [0005](0005-cloudflare-pages-hosting.md) · Elaborates PRD §11.4

## Status

Accepted

## Context

ADR 0005 chose Cloudflare Pages and assumed the dashboard's GitHub
integration would provide auto-deploy on `main`. During PHI-28 the project was
created and first deployed through wrangler's OAuth session instead (the git
integration cannot be established headlessly), which makes it a direct-upload
project — and Cloudflare cannot convert direct-upload projects to
git-connected in place. The two ways to get auto-deploy: delete and recreate
the project through the dashboard, or deploy from CI with an API token.

## Decision

Keep the direct-upload project and **deploy from GitHub Actions**: the CI
workflow's `deploy` job runs after build-and-test on every push to `main` and
publishes `dist` via `wrangler pages deploy`, authenticated by a
`CLOUDFLARE_API_TOKEN` repository secret (scoped to Pages edits). Phil created
the token and set the secret on 2026-06-13. The hosting choice in ADR 0005 is
unchanged.

## Consequences

- Deploys are gated behind the same CI that gates review: a commit that fails
  type-check, build, or tests never reaches production — strictly stronger
  than the dashboard integration, which builds independently of CI.
- One credential to manage: the token lives only in GitHub Actions secrets
  and the Cloudflare dashboard can roll it at any time without code changes.
- Deploy logs live in the Actions run, not the Cloudflare dashboard;
  deployment history remains visible via `wrangler pages deployment list`.
