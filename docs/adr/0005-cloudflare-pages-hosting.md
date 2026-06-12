# 0005 — Cloudflare Pages hosting

Date: 2026-06-12 · Elaborates PRD §11.4, §17

## Status

Accepted

## Context

The pipeline must give a live URL from day one (PHI-28), auto-deploy every push
to `main`, and at launch serve the production domain (philsanjaya.dev, §17)
with HTTPS enforced, `www` → apex redirect, and security headers (CSP,
X-Content-Type-Options, Referrer-Policy). Candidates: GitHub Pages, Netlify,
Vercel, Cloudflare Pages. GitHub Pages has no first-class custom-header or
redirect support. Netlify and Vercel would both work; neither consolidates DNS,
domain, and hosting in one place.

## Decision

**GitHub (public repo) → Cloudflare Pages**, auto-deploy on `main`. The site
lives at a `*.pages.dev` preview URL until M5, then moves to the production
domain with DNS also on Cloudflare. Custom headers and redirects ship as
`_headers` / `_redirects` files in the build output, versioned with the code.

## Consequences

- Static hosting at zero cost with previews per push; the public repo plus the
  deploy log become part of the build-in-public story (§4.5).
- DNS, TLS, domain, and hosting sit behind one account — one place to secure
  (2FA verified at PHI-46), one vendor coupling, accepted for a static site
  that could be rehosted anywhere in an afternoon.
- The GitHub ↔ Cloudflare git integration is configured through the dashboard,
  not the API — a one-time manual step in the otherwise scripted pipeline
  (encountered live during PHI-28).
