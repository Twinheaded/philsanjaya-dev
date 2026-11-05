# AUDIT_FINDINGS — philsanjaya.com (PHI-121)

Read-only audit of `main` (`dc88124`; production build `c4f7725`) plus an
inventory of `redesign/inventors-workbench` (`ab03abe`). Date: 2026-11-05.
Auditor: Claude Code, `/repo-audit`. The architecture map is in
[PROJECT_CONTEXT.md](PROJECT_CONTEXT.md). No source file was changed.

## 1. Summary

The live site is in good technical shape. The local gate `npm run verify` is
green. Production is byte-identical to a fresh build of `main`. No route,
internal link or external link is broken. Layouts hold at 9 viewport sizes,
including 320×568 and phone landscape. The CSP hashes match the built inline
scripts. Every declared budget passes with headroom: JS is 12.5 KB gz against a
50 KB budget, and contrast passes WCAG AA in both themes. No secret was found in
the git history. The material risks are about **truthfulness** and the
**deploy path**, not the code.

Top 3 risks:

1. **AUD-01 (HIGH):** the published `/resume.pdf` makes AEGISX and
   market-sentiment claims that the site's own case studies say were not
   delivered or can't be sourced.
2. **AUD-03 (MEDIUM):** the CI deploy job puts `CLOUDFLARE_API_TOKEN` in every
   step's environment, then downloads and runs whatever `wrangler` version is
   latest.
3. **AUD-02 (MEDIUM):** the home page, About page and resume still say
   "final-semester … completing July 2026", four months after that date.

Limitations: Lighthouse, axe and actionlint/zizmor are not installed, so those
checks were not run. Animation and canvas painting can't be verified in the
agent pane. Cloudflare dashboard settings, including the token's scope, are not
visible from the repo.

## 2. Coverage

**Audited end to end (main):**

| Area | What was traced |
| --- | --- |
| Secrets & git history | All 82 commits on all branches, plus 5 local dangling objects. Searched for token-shaped and secret-shaped strings and for sensitive filenames; looked for high-entropy strings outside `package-lock.json`. Checked published file metadata (`resume.pdf`, media). |
| CI / deploy / repo settings | `ci.yml` line by line; Actions permissions; secret names and dates; branch protection; collaborators; the latest main run's jobs (logs have expired); the redesign branch's preview job. |
| Live site (ordinary page loads only) | Status codes, redirects (www, http), security headers, 404 handling. Hash-compared 13 live pages with a local build. Checked preview aliases on `pages.dev`. |
| Routes, links, metadata | Every built HTML page: title, description, canonical, OG/Twitter, `lang`, h1 count. All internal `href`/`src` values resolve in `dist/`. All 30 external links fetched. Sitemap and robots checked. |
| JS-on behaviour | 16 routes in a real browser (local `astro preview`): no script errors, `aria-current`, chapter keyboard navigation, `#chapter` deep links, live-region announcements, and the About email link on the live site after a cold load and after an in-site navigation. |
| No-JS behaviour (FR-74) | 10 routes at desktop and phone sizes, in a sandboxed iframe with scripts blocked. Checked readable content, scroll containers and dead controls. |
| Mobile / short viewports | 14 routes × 9 sizes (1366×768 … 320×568, 844×390, 667×375). Looked for text pushed off-screen with no scroll container, and for horizontal overflow. |
| Content truthfulness | Every `metrics[]` entry in the 5 case studies and the numeric claims in body prose, About, Home, build log and the note. Sources: the `_inbox` PDFs, the source repos under `D:/002_Workspace/Archive/`, git history, and Linear comments. Also the published resume vs the CV and the site. (A subagent gathered the leads; I verified each finding below myself.) |
| Declared budgets (PRD §8) | JS gz per file and in total, island bundle, fonts, CSS. WCAG contrast for every text token pair in both themes. |
| Dependencies | `npm audit` (tracked in PHI-147). Checked whether any advisory reaches a browser-shipped code path. |
| Tests | What the 29 tests cover, and which correctness-critical code has no test. |

**Skipped, one line each:**

- Data integrity: the site has no state, database or user data.
- Server-side security: static output; there is no server runtime to attack.
- Visual design taste, Phil's prose and the redesign's art direction: out of scope per the brief.
- Redesign internals: inventory only, per the brief (§7).

**Couldn't verify (needs Phil, a real browser, or a dashboard):**

- Agent canvas animation, 60 fps, the `d` debug overlay, slide direction, the reduced-motion static frame and ≤150 ms fade (FR-07/17), touch swipe and tap-flee on a phone, and the no-flash theme on load. The agent pane suspends `requestAnimationFrame`.
- Lighthouse ≥ 95 and the axe "zero critical" gate (FR-76): tools not installed. Last recorded run: 100/100/100/100 (PHI-45, June 2026).
- `CLOUDFLARE_API_TOKEN` scope and expiry: Cloudflare dashboard only.
- Whether the Cloudflare zone has HSTS or Email Obfuscation set intentionally (AUD-05, AUD-08).
- The LinkedIn profile: the URL returns 200, but LinkedIn may serve a sign-in wall. The resume's text layer reads `linkedin.com/in/philipussanjaya` while the visible link wraps as `philipus-sanjaya`. Please click it once.
- Two content leads I could not check because PDF page rendering (poppler) isn't installed: (a) `aegisx.md:23,26` cite "Sprint Four Report §2" for values reportedly shown on p11, an unnumbered section; (b) `aegisx.md:146-147` says PR #8 was "approved", but the PR screenshot sidebar may read "No reviews".
- Claims sourced only to private material that isn't on disk: market-sentiment "667 days scored" (`market-sentiment.md:24-26`), "630 added / 1,330 deleted" (`:57`, `:92`), the GRU layer sizes and logistic-regression use. Unbacked by the repo or `_inbox`, but the site attributes them to private history, so no finding was raised.

## 3. Baseline checks

| Command / check | Result | Notes |
| --- | --- | --- |
| `git status` (main) | clean | Restored clone. Local `main` is 1 ahead of `origin/main` (`dc88124`, a PRD docs commit, unpushed). The audit branch was cut from it. |
| `node --version` / `npm --version` | v24.16.0 / 11.13.0 | On PATH (`C:\Program Files\nodejs`); no PATH prelude needed. CI uses Node 22. |
| `npm ci` | OK | `git status` stayed clean afterwards. |
| `npm run check` (astro check, 24 files) | 0 errors, 0 warnings, 41 hints | |
| `npm run build` | OK, 18 pages, ~13 s | |
| `npm test` (vitest) | 29/29 passed | |
| `npm run verify` | exit 0 | `main` already has `verify` (`package.json:16`), identical to the redesign branch's. |
| `npm audit` | 17 vulnerabilities (1 low, 4 moderate, 11 high, 1 critical) | **Tracked in PHI-147, not re-opened.** `--omit=dev`: 12 (1 low, 10 high, 1 critical). |
| npm advisories on browser-shipped code | none applicable | Shipped JS is Astro's ClientRouter/router plus Phil's own scripts (`dist/_astro/*.js`, 8 files). The Astro XSS advisories need attacker-controlled attribute names or directive values at render time. Here all content is Phil's own markdown, rendered at build time. Nothing new beyond PHI-147. |
| Secret scan (custom grep over `git log --all -p`, 82 commits, plus dangling objects) | no hits | `gitleaks` / `trufflehog` **not run (not installed)**. Recommend running gitleaks once. |
| Sensitive filenames ever tracked | none | Only `src/styles/tokens.css` matched "token" (design tokens). |
| GitHub secret list | `CLOUDFLARE_API_TOKEN`, updated 2026-07-19T13:43Z | Matches the PHI-60 rotation. No sign it was re-exposed. |
| Latest main CI run | success (c4f7725; attempt 2 on 2026-07-19, deploy ran) | Run logs have expired (>90 days), so the wrangler version used can't be read. |
| Branch protection on `main` | none (HTTP 404 "Branch not protected") | See AUD-12. |
| CSP hash probe on `dist/**/*.html` | 2/2 inline scripts match `_headers` | The theme snippet is on 18 pages; the mask observer on 6. |
| Internal link probe | 0 broken | One oddity: the 404 page's canonical (AUD-11). |
| External links (30) | 30 × HTTP 200 | 29 GitHub, 1 LinkedIn. |
| Layout probe, 14 routes × 9 sizes | no clipped content, no horizontal overflow | Overflow goes into `.panel-scroll`, `.note-pane` or the chapter frame as designed (the PHI-59 fixes hold). |
| No-JS probe, 10 routes × 2 sizes | content readable; dead controls on desktop | AUD-04. |
| JS-on probe, 16 routes | 0 script errors | |
| Live vs local build (13 pages) | identical after stripping CR; `/about` differs | Local CRLF comes from `core.autocrlf=true`. `/about` differs because of Cloudflare Email Obfuscation (AUD-05). |
| Security headers (live) | CSP, XFO DENY, nosniff, Referrer-Policy, Permissions-Policy present; **HSTS absent** | AUD-08. |
| JS budget (≤ 50 KB gz site-wide) | **12,504 B gz** (gzip -9, 8 files) | Pass. |
| Island budget (≤ 12 KB gz) | **3,035 B gz** (engine + readout + home entry) | Pass. |
| Fonts (≤ 90 KB, woff2, preloaded) | 63,400 B for the 4 latin woff2 files; 3 preloaded | Pass. |
| CSS | 6,071 B gz | No budget declared. |
| WCAG AA contrast (tokens.css) | lowest pair: light `--mist` on `--bg`, 4.75:1 | Pass in both themes (≥ 4.5:1 for every text pair). |
| Lighthouse | **not run** | Not installed; per the brief, no global tools installed. |
| axe | **not run** | Not installed. A basic DOM probe found no images without alt, unnamed links or buttons, duplicate ids, or heading skips. |
| actionlint / zizmor (workflow linters) | **not run** | Not installed. Recommended for AUD-03. |
| Redesign branch `npm ci` + `npm run verify` | exit 0: 0 errors, 44 hints, 18 pages, 138/138 tests | Built from a `git archive` copy in the session scratchpad; the main checkout was untouched. |

## 4. Findings register

Severity counts: **CRITICAL 0 · HIGH 1 · MEDIUM 2 · LOW 8 · INFO 2** (13 findings).

---

### AUD-01 — Published resume contradicts the site's own case studies

- **Severity:** HIGH · **Confidence:** CONFIRMED · **Area:** content truthfulness
- **Location:** `public/resume.pdf`, linked from `src/pages/index.astro:59` and `src/pages/about.astro:55`. It is byte-identical to `_inbox/Philipus_Sanjaya_CV.pdf` (`cmp` → identical) and was last changed in `f322601` (2026-07-05).
- **Evidence (observed, resume text vs repo text):**

| Resume says | The site says |
| --- | --- |
| AEGISX streams data "into Timestream, RDS and S3"; Skills list includes Timestream | `src/content/projects/aegisx.md:164-165`: "Timestream and RDS consolidated into S3 queried with Athena" |
| "Built SageMaker anomaly detection" | `aegisx.md:165-167`: the SageMaker loop is "an infrastructure-ready scaffold positioned as pending" |
| "automated Step Functions/SNS alerting" | `aegisx.md:167-168`: "Step Functions orchestration was descoped" |
| "a dashboard on App Runner/CloudFront" | `aegisx.md:169-172`: CloudFront is "documented but not deployed"; the demo dashboard runs locally |
| Sentiment pipeline using "Alpha Vantage, Finnhub, NewsAPI" | `market-sentiment.md:42-43`: Finnhub and NewsAPI clients "were written but never wired into the pipeline" |
| "Engineered 40+ features" | metric card `market-sentiment.md:22` and body `:47`: 35 features |
| "…for ASX equities" | `market-sentiment.md:24,67`: IBM and Coca-Cola (NYSE) |
| "sklearn-style interface, cutting external API calls by 67%" | `market-sentiment.md:27-29` holds this as a `pending` card. `:88-89` says the interface "actually trains with train(), not fit()" and that the 67% figure is one "no located document states" |
| CTF delivery "tracked through 20+ issues and milestones" | `ctf-arena.md:45`: "18 Linear issues" (may be ambiguous if milestones are counted too) |

  The Sprint Four Report deviation table (p37, per the subagent's read)
  agrees with the case study, not the resume.
- **Preconditions and impact:** a recruiter who reads the resume and then the
  case study (both are one click from Home) sees two different systems. That
  undercuts the site's central "receipts" promise (PRD G-honesty, FR-22). The
  resume also states the 67% figure that the site deliberately won't show.
  Phil judges the wording; this finding is only that the published claims
  conflict with the repo's own sourced account.
- **Recommended fix:** Phil revises the AEGISX and market-sentiment bullets to
  match the delivered systems and drops or sources the 67% claim. Then
  regenerate `public/resume.pdf` and re-review it (FR-61). Reconcile the CTF
  issue count. Keep `_inbox/Philipus_Sanjaya_CV.pdf` in sync.
- **Regression test:** a manual checklist item in the content-review step: each
  resume bullet must map to a case-study sentence or metric source. Automation
  isn't practical for PDF prose.

---

### AUD-02 — "Final-semester / completing July 2026" is stale

- **Severity:** MEDIUM · **Confidence:** CONFIRMED (date past); whether Phil graduated is unknown · **Area:** content truthfulness
- **Location:** `src/pages/index.astro:25` (meta description), `:43-45` (hero);
  `src/pages/about.astro:8` (meta), `:19-20`, `:31` ("Current focus: finishing
  the degree"), `:35` ("available from July 2026"); `public/resume.pdf`
  (header, and "2023 – Jul 2026 (expected)"). The meta descriptions also feed
  search snippets and link previews.
- **Evidence:** `grep -nE "July 2026|final-semester|finishing the degree" src/pages/*.astro` returns the lines above. Today is 2026-11-05.
- **Preconditions and impact:** every visitor and every search snippet sees a
  future tense for a date four months past. It reads as an abandoned site, or
  as a degree not finished on time.
- **Recommended fix:** Phil confirms his status, then updates the five page
  locations, the two meta descriptions and the resume together. Consider
  wording that doesn't expire (e.g. "graduated July 2026" or "Bachelor of CS,
  Swinburne, 2026").
- **Regression test:** none automatic. Add a dated-claims item to the release
  checklist (e.g. grep for future-tense month/year claims before each deploy).

---

### AUD-03 — Deploy job exposes the Cloudflare token to every step and to unpinned code

- **Severity:** MEDIUM · **Confidence:** CONFIRMED (configuration); exploitation needs an upstream compromise · **Area:** CI / supply chain
- **Location:** `.github/workflows/ci.yml:37-39` (job-level `env:`),
  `:50-53` (`npm ci`, `npm run build` with the token in env), `:55`
  (`npx wrangler pages deploy …`); `:20-21,44,46` (actions pinned by tag only).
- **Evidence:**
  - The token is set at **job** level, so every step inherits it, including
    `npm ci` (which runs dependency install scripts: `esbuild` and optional
    `sharp`/`fsevents` have them) and `npm run build` (all of Astro, Vite,
    satori, resvg and their transitive deps execute with
    `process.env.CLOUDFLARE_API_TOKEN` readable).
  - `grep -c '"node_modules/wrangler"' package-lock.json` → `0`. Wrangler is
    not a dependency, so `npx wrangler` downloads the **latest** published
    wrangler and its dependency tree on every deploy and runs it with the token.
  - `gh api repos/Twinheaded/philsanjaya-dev/actions/permissions` →
    `"allowed_actions":"all","sha_pinning_required":false`. `actions/checkout@v5`
    and `actions/setup-node@v5` are mutable tags.
  - Mitigations already present: `permissions: contents: read` (`ci.yml:9-10`);
    deploy only on push to `main` (`:35`); fork PRs get no secrets.
- **Preconditions and impact:** a malicious release of wrangler, any build-time
  dependency, or a retagged action would get a token that can deploy or alter
  the production site. This is the brief's #1 critical class. The token's
  actual scope is unknown from the repo (see Coverage).
- **Recommended fix:**
  1. Add `wrangler` as a pinned devDependency, so it is locked with an
     integrity hash, or use `cloudflare/wrangler-action` pinned by commit SHA
     with an explicit `wranglerVersion`.
  2. Move `CLOUDFLARE_API_TOKEN` from job `env` to the deploy step only.
  3. Deploy the `dist/` artifact produced by `build-and-test` (upload, then
     download) instead of reinstalling and rebuilding with the secret present.
     Otherwise use `npm ci --ignore-scripts` in the deploy job.
  4. Pin actions by full SHA.
  5. In the Cloudflare dashboard, confirm the token is limited to *Cloudflare
     Pages: Edit* on this one account, and set an expiry.
- **Regression test:** a small test (vitest or a CI step) that parses `ci.yml`
  and asserts the secret appears only in the deploy step's `env`, and that
  every `uses:` is a 40-character SHA. Run `zizmor`/`actionlint` in CI if
  adopted.

---

### AUD-04 — Without JS, desktop shows dead controls (FR-74 broken)

- **Severity:** LOW · **Confidence:** CONFIRMED · **Area:** frontend / no-JS fallback
- **Location:** `src/styles/global.css:49-51` (hiding rule inside `@layer base`);
  `src/layouts/Shell.astro:132` (`js-only hidden md:block` — theme toggle and
  the "← → move" hint), `:156` (`js-only … hidden … lg:flex` — keycaps).
- **Evidence:** reproduced at 1366×768 in a sandboxed iframe with scripts
  blocked (`data-js` absent):
  `div.js-only.hidden.md:block display=block visibleText="theme: auto ← → move …"`
  and `#keycaps display=flex`. Cause: Tailwind v4 cascade layers rank
  `utilities` above `base`, so `md:block` / `lg:flex` override
  `html:not([data-js]) .js-only { display:none }` regardless of specificity.
  At phone size the rule works, because those wrappers have no responsive
  display utility.
- **Preconditions and impact:** JS disabled or failed, at ≥ 768 px. The visitor
  sees a "theme: auto" button that does nothing, plus arrow-key hints for
  navigation that doesn't exist. FR-74 says the no-JS page "offers no dead UI".
  Content is unaffected.
- **Recommended fix:** make the `.js-only` hide rule win over utilities. Move
  it out of `@layer base` (unlayered, or into `@layer utilities`, with
  `!important` if needed), or move the responsive display utility to an inner
  element.
- **Regression test:** a no-JS check on the built output, e.g. a Playwright
  test with `javaScriptEnabled: false` at 1366×768, asserting no `.js-only`
  element is visible.

---

### AUD-05 — Contact email is unusable without JS (Cloudflare Email Obfuscation)

- **Severity:** LOW · **Confidence:** CONFIRMED · **Area:** live site / no-JS / edge configuration
- **Location:** Cloudflare zone setting (not in the repo). It affects
  `src/pages/about.astro:40` (`href="mailto:…"`).
- **Evidence:**
  - Live `/about/` HTML has `href="/cdn-cgi/l/email-protection#…"` plus an
    injected `<script data-cfasync="false" src="/cdn-cgi/scripts/5c5dd728/cloudflare-static/email-decode.min.js">`.
    Neither exists in `dist/about/index.html` (diff of live vs local).
  - `curl https://philsanjaya.com/cdn-cgi/l/email-protection` shows "You are
    unable to access this email address … You must enable Javascript".
  - With JS the link decodes correctly, on a cold load and after an in-site
    ClientRouter navigation from Home (both checked in the browser:
    `href="mailto:sanjayaphilipus11@gmail.com"`).
  - The same address is in plain text in the home page JSON-LD
    (`index.astro:14`), so the obfuscation protects little.
- **Preconditions and impact:** no-JS visitors (FR-74) cannot email Phil, the
  primary recruiter action. It is also an undeclared edge dependency: the
  injected script passes CSP only because it is same-origin. A future CSP
  change could break it silently.
- **Recommended fix:** Phil decides either to disable Email Obfuscation for the
  zone (Scrape Shield), or to wrap the link in `<!--email_off-->` …
  `<!--/email_off-->`.
- **Regression test:** a post-deploy smoke check that `curl /about/` contains
  `href="mailto:`.

---

### AUD-06 — No automated check that CSP hashes match the built inline scripts

- **Severity:** LOW · **Confidence:** CONFIRMED (gap exists; a past incident is in history) · **Area:** build / CI
- **Location:** `public/_headers:1-6` (manual "recompute" instructions);
  `package.json:16` (`verify` has no such check); `.github/workflows/ci.yml`.
- **Evidence:**
  - Today the hashes match (baseline probe: 2/2 OK).
  - Commit `2bdd538` records that the reading-pane mask script "has been
    silently blocked there since 316474a", which was caught only by a
    Lighthouse pass.
  - Astro inlines the small `NotePane.astro` script itself, so its emitted
    body, and therefore its hash, can change on an Astro upgrade without any
    source edit. The PHI-147 fix requires an Astro upgrade.
- **Preconditions and impact:** any edit to the theme snippet, or an Astro or
  Vite upgrade that changes the inlined script text. In production the theme
  script would be blocked: no stored theme and no `data-js`, so JS-only
  controls vanish, and the reading-pane mask stops. `verify` and CI stay green
  because `_headers` is applied only by Cloudflare.
- **Recommended fix:** add a post-build test that recomputes sha256 (base64)
  over every executable inline `<script>` in `dist/**/*.html` and fails if any
  hash is missing from `public/_headers`. The audit's throwaway probe does
  exactly this in about 15 lines. Land it **before** the PHI-147 upgrade.
- **Regression test:** that test is itself the regression test. Prove it by
  editing one character of the theme snippet and watching it fail.

---

### AUD-07 — Canceled redesign is publicly reachable at a preview URL

- **Severity:** LOW · **Confidence:** CONFIRMED · **Area:** deploy / exposure
- **Location:** `https://redesign-inventors-workbench.philsanjaya-dev.pages.dev/`,
  created by the redesign branch's `preview` CI job (redesign `ci.yml`, the
  `preview:` job). The latest run on 2026-07-24 for `ab03abe` shows
  `preview: success`.
- **Evidence:** `curl` returns `HTTP 200` for `/`, `/projects/`, `/about/` and
  `/resume.pdf`, with header `x-robots-tag: noindex` and canonical
  `https://philsanjaya.com/`.
- **Preconditions and impact:** anyone with or guessing the URL sees an
  unreviewed site under Phil's name, including its copy (the branch still
  carries `TODO(phil…)` markers in 9 `src` files). It isn't indexed, and
  nothing links to it. The redesign's future is undecided (PHI-72 canceled).
- **Recommended fix:** Phil decides either to delete the preview deployments
  in Cloudflare (Workers & Pages → `philsanjaya-dev` → Deployments), or to put
  preview deployments behind Cloudflare Access.
- **Regression test:** none. Revisit when deciding the redesign (see §7).

---

### AUD-08 — No HSTS header on production

- **Severity:** LOW · **Confidence:** CONFIRMED · **Area:** security headers
- **Location:** `public/_headers:7-12` (no `Strict-Transport-Security`); no
  zone-level HSTS observed.
- **Evidence:** `curl -sI https://philsanjaya.com/` returns CSP, XFO,
  nosniff, Referrer-Policy and Permissions-Policy, but no
  `strict-transport-security`. `http://philsanjaya.com/` → 301 to https, so
  only first-visit downgrade protection is missing.
- **Preconditions and impact:** an on-path attacker on a visitor's first
  plain-http request (e.g. public Wi-Fi) could strip the redirect. Low for a
  static portfolio.
- **Recommended fix:** add `Strict-Transport-Security: max-age=31536000` to
  `_headers`, or enable HSTS on the zone. Add `includeSubDomains` only after
  confirming every subdomain serves HTTPS.
- **Regression test:** a post-deploy header smoke check (`curl -sI`, assert
  `strict-transport-security` is present).

---

### AUD-09 — Build-log review-finding counts are not backed by their cited commits

- **Severity:** LOW · **Confidence:** CONFIRMED (absence in the cited commits) · **Area:** content truthfulness
- **Location:** `src/content/buildlog/01-foundation.md:27` ("eighteen findings
  (`420834e`)"); `src/content/buildlog/02-content-engine.md:25` ("Sixteen
  confirmed findings (`58be36f`)").
- **Evidence:** `git show -s --format=%B 420834e` and `58be36f` contain no
  count. `58be36f` says only "62 agents, double-verified". The subagent found
  no count in the PHI-29 or PHI-33 Linear comments either.
- **Preconditions and impact:** a reader following the receipt link can't
  verify the number, which is the build log's whole premise (FR-51).
- **Recommended fix:** Phil points each count at the review record that holds
  it (a Linear comment link), or removes the number.
- **Regression test:** none practical.

---

### AUD-10 — Power-forecasting metric sources cite cells by a numbering readers won't find

- **Severity:** LOW · **Confidence:** CONFIRMED · **Area:** content truthfulness (source pointers)
- **Location:** `src/content/projects/power-forecasting.md:14,17,20` ("notebook
  cell 18 / 44 / 53").
- **Evidence:** a probe of
  `Archive/…/portfolio-assessment-3-…/Portfolio_Assessment_3_CL05_Philipus.ipynb`
  shows the values sit at 0-based cell indices 18, 44 and 53, which Jupyter
  displays as `In[10]` (0.9779), `In[23]` (0.7477) and `In[28]` (0.1016).
  The values are correct; only the pointers are off.
- **Preconditions and impact:** anyone checking the source opens the wrong
  cell.
- **Recommended fix:** cite `In [10]`, `In [23]`, `In [28]` (or name the cell's
  heading).
- **Regression test:** none.

---

### AUD-11 — 404 page carries a canonical to `/404/` and is served as HTTP 200 there

- **Severity:** LOW · **Confidence:** CONFIRMED · **Area:** SEO / metadata
- **Location:** `src/layouts/Shell.astro:23,38` (canonical built from the
  pathname for every page, including `src/pages/404.astro`).
- **Evidence:** `dist/404.html` has canonical `https://philsanjaya.com/404/`.
  Live: `/404/` → 308 → `/404` → **200**. `/does-not-exist` → 404 (correct).
  The page has no `noindex`. The sitemap excludes it (correct).
- **Preconditions and impact:** a crawler following the canonical indexes a
  "Not found" page as a real page (soft 404). Minor.
- **Recommended fix:** on the 404 page, omit the canonical and add
  `<meta name="robots" content="noindex">` (e.g. a `noindex` prop on Shell).
- **Regression test:** a build-output assertion that `dist/404.html` contains
  `noindex` and no canonical.

---

### AUD-12 — `main` has no branch protection

- **Severity:** INFO · **Confidence:** CONFIRMED · **Area:** repo settings
- **Evidence:** `gh api repos/Twinheaded/philsanjaya-dev/branches/main/protection`
  → `404 Branch not protected`. The only collaborator is `Twinheaded`. The
  deploy still requires `build-and-test` to pass (`ci.yml:34`).
- **Impact:** a force-push or a mistaken direct push to `main` deploys to
  production with no review gate. Only Phil can push today, so there is no
  outside-actor risk.
- **Recommended fix:** a ruleset on `main` that blocks force-push and deletion
  and requires the `build-and-test` check. Optional for a solo repo.
- **Regression test:** none.

---

### AUD-13 — Documentation drift: README says Astro 5; `main` has no DECISIONS_LOG

- **Severity:** INFO · **Confidence:** CONFIRMED · **Area:** docs
- **Evidence:** `README.md:15` reads "Astro 5"; `package.json:24` has
  `"astro": "^6.4.6"` (installed 6.4.8); ADR 0006 records the upgrade. The
  PHI-121 brief and older notes also say Astro 5. `DECISIONS_LOG.md` exists
  only on the redesign branch (`git ls-tree -r --name-only redesign/inventors-workbench`).
- **Recommended fix:** update the README stack line. Decide whether `main`
  gets a `DECISIONS_LOG.md` (the global rules expect one).
- **Regression test:** none.

---

### Not raised as findings (checked, noted for the record)

- **Account ID in `ci.yml:39`:** a Cloudflare account ID is an identifier, not a credential.
- **`philsanjaya-dev.pages.dev` serves production without `noindex`:** the canonical points to philsanjaya.com, so search engines consolidate. Informational.
- **CTF source repo:** it has an uncommitted re-run (`git -C …/ctf_arena status`: `M experiments/results/…`, `M config.py`, and more; HEAD `feb59f1`). The site matches the **committed** results. Already flagged under PHI-47. If the re-run is ever committed, re-check all three CTF metric cards.
- **Case-study video has no captions track:** the audio was stripped (`04-launch.md`), so it is video-only with an `aria-label`. Not a WCAG 1.2.1 failure as such.
- **Theme script `localStorage` access has no `try/catch`:** couldn't reproduce a visible failure (opaque-origin sandbox test inconclusive). Dropped.

## 5. Proposed milestones

Proposals only; chat Claude and Phil decide.

| Pri | Milestone | Covers | Draft acceptance criteria | Depends on | Size |
| --- | --- | --- | --- | --- | --- |
| **P0** | Truth pass: resume and dated claims | AUD-01, AUD-02 | Every resume bullet maps to a case-study sentence or a sourced metric, and the 67% claim is removed or sourced. Status wording on Home, About (body and meta) and the resume reflects Phil's actual status as of the fix date. The new `resume.pdf` is reviewed by Phil (FR-61). `npm run verify` is green. Live `/resume.pdf` is the new file. | Phil's input on graduation status and wording | S (mostly Phil's writing) |
| **P1** | Deploy-path hardening | AUD-03, AUD-12 | Wrangler is pinned in the lockfile (or a SHA-pinned action). The token is present only in the deploy step's env. Deploy uses the tested artifact or `--ignore-scripts`. All `uses:` are SHA-pinned. Token scope is confirmed as Pages:Edit on one account, with an expiry. A ruleset on `main` requires `build-and-test` and blocks force-push. One real deploy succeeds afterwards. | Coordinate lockfile changes with PHI-147 | S–M |
| **P1** | CSP hash guard | AUD-06 | A test fails when any executable inline script in `dist/**/*.html` lacks a matching hash in `public/_headers`. It runs in `verify` and CI. It is proven by a deliberate one-character change. | Land **before** the PHI-147 Astro upgrade | XS–S |
| **P2** | No-JS and edge polish | AUD-04, AUD-05, AUD-08, AUD-11 | With JS disabled at 1366×768, no `.js-only` control is visible. Live `/about/` HTML contains `href="mailto:`. `strict-transport-security` is on live responses. `dist/404.html` has `noindex` and no canonical. | Phil's Cloudflare zone decisions (Email Obfuscation, HSTS) | S |
| **P2** | Decide the redesign preview's exposure | AUD-07 | Phil chooses to delete the preview deployments, gate them with Access, or keep them as is, and the choice is recorded in a decision log. | Phil's redesign decision (§7) | XS |
| **P3** | Source pointers and docs hygiene | AUD-09, AUD-10, AUD-13 | Build-log counts link to their record or are removed. Power-forecasting sources cite `In [n]`. The README says Astro 6. The DECISIONS_LOG question is decided. | — | XS |

PHI-147 (npm audit) stays its own issue. Its Astro upgrade is the trigger that
makes the CSP guard urgent, so the order should be: CSP guard → PHI-147.

## 6. Checks for Phil in a real browser

These can't be verified from the agent pane:

1. On Home, the agents animate smoothly. Pressing `d` and the small button toggles the overlay.
2. With OS "reduce motion" on: one static agent frame, and panels fade (≤ 150 ms) instead of sliding.
3. Panel slides go left when moving right in the rail, and the reverse.
4. On a phone: swiping between panels works, a tap scatters the agents, and the settings menu theme toggle works.
5. The theme toggle survives a reload with no flash of the wrong theme.
6. One Lighthouse run (home, one case study, one note) against the ≥ 95 gate, plus an axe scan.
7. The CTF case-study video plays on click and autoplays muted where motion is allowed.
8. The LinkedIn link opens the right profile.

## 7. Redesign branch inventory (`redesign/inventors-workbench`, inventory only)

| Question | Answer | Evidence |
| --- | --- | --- |
| Does it build and pass `verify`? | **Yes.** `npm ci` exit 0; `verify` exit 0: astro check 0 errors / 0 warnings / 44 hints, 18 pages, **138/138 tests in 8 files**. | Clean `git archive` export to the scratchpad; logs reviewed. |
| How far does it diverge? | 22 commits ahead and 1 behind (`dc88124`, docs only). Merge-base `c4f7725`. **65 files changed, +9,357 / −1,453.** New deps: `three@^0.185.1`, `@types/three`, `@fontsource/geist`, `geist-mono` and `caveat`. | `git rev-list --left-right --count`, `git diff --shortstat main...redesign/inventors-workbench`, `git diff main redesign/… -- package.json` |
| Textual merge conflicts? | **None.** `git merge-tree --write-tree` produced a tree with no conflicts. | `git merge-tree --write-tree --name-only main redesign/inventors-workbench` |
| CSP on its build | 2/2 inline-script hashes match its `_headers` (theme hash changed to `P33Z4…`). | Audit probe over its `dist/` |
| `npm audit` | The same 17 as `main` (PHI-147 applies to both). | its `npm ci` output |
| PR | Draft PR #2 "Inventor's Workbench redesign" is open. | `gh pr list` |

**What would block a future merge:**

1. **Its JS breaches `main`'s PRD budget.** The branch ships **208,318 B gz**
   of JS (gzip -9, 9 files), of which `three` is 187,593 B. PRD §8 on `main`
   says "≤ 50 KB gzipped" site-wide. A merge needs the PRD budget amended
   (a new ADR) or the redesign's own budget formally adopted.
2. **Its `preview` CI job widens AUD-03.** It deploys **every** non-main,
   same-repo branch and PR to a public `pages.dev` alias with the same
   production-capable token and the same unpinned `npx wrangler`. Merging it
   as is makes any pushed branch publicly deployable. Fix AUD-03 first, and
   decide whether previews should exist at all (AUD-07).
3. **Unfinished sign-off.** PHI-72 (staging, cross-browser and Phil sign-off)
   was canceled. `TODO(phil…)` markers remain in 9 files under `src/` (diagram
   components, all 5 project files, the case-study page), versus 0 on `main`.
4. **Shared findings must be fixed on both branches or re-checked after a
   merge.** AUD-01/02 (content and dates), AUD-06 (it has its own hand-kept
   CSP hash), AUD-11 (its 404 canonical has the same pattern) and AUD-13.
5. **Docs that would land on `main`.** `DECISIONS_LOG.md`,
   `INVENTORS_WORKBENCH_HANDOFF.md` and `docs/redesign/M0-baseline-audit.md`
   would arrive with it. That is fine, but `PROJECT_CONTEXT.md` would need a
   rewrite.

## 8. Final status

**AUDIT COMPLETE.** All in-scope areas from the brief were audited, the
redesign inventory was done, and each item that couldn't be verified
(animation, Lighthouse/axe, Cloudflare dashboard settings, two PDF-page
pointers) is listed with the reason and handed to Phil.
