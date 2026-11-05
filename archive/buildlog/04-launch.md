---
title: 'Launch'
entry: 4
date: 2026-07-06
milestone: M5
commits: [06eccee, 9e82950, d5c3f5f, 3a9a7f8, f322601, 316474a, 2b7e13a]
---

The last mile was two sprints in one: make the content true, then make the domain real.

**The content sprint ran on receipts.** The CTF study got its hero — real match footage,
audio stripped for an honest 2 KB saving (the track was near-silence), poster-only under
reduced motion (`9e82950`). The same commit corrected a reading the source data never
supported: coordination wins by denial *and* offence — 2.35 vs 0.37 captures head-to-head
— not "defence instead of offence". AEGISX was rewritten around the delivered system
rather than the planned one (`d5c3f5f`): Athena instead of Timestream and RDS, a direct
boto3 producer instead of Greengrass, SageMaker honestly pending — the
planned-vs-delivered reconciliation is now its own chapter, because the deviations *are*
the engineering. Market sentiment finally got its numbers when the submitted report
surfaced (`3a9a7f8`): F1 0.2222 → 0.5714, a ROC AUC improvement of exactly +0.000 stated
as-is, and the 23-sample test set disclosed right beside them. The one claim no located
document states — a "67% fewer API calls" refactor figure — ships as a pending card, not
a fact. The resume went live the same way: copy reconciled against the PDF it links
(`f322601`).

**Then the domain.** philsanjaya.com went from a PRD decision row (`06eccee`) to
production: canonical, OG, sitemap, and robots flipped in one commit alongside the
security headers — a CSP that pins the site's single inline script by hash, nosniff, a
strict referrer policy (`316474a`). Lighthouse re-ran clean against the live CSP: still
100s, zero console errors. One dead end is recorded rather than hidden: the www → apex
redirect first tried to live in the Pages `_redirects` file, whose own documentation
marks domain-level redirects unsupported — it moved to a zone Redirect Rule, and the
dead rule was deleted instead of left to confuse (`2b7e13a`).

The site now says where every number comes from — and the infrastructure finally says
the same about itself.
