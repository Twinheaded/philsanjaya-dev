---
title: AEGISX cloud pipeline
slug: aegisx
order: 2
expNo: 2
tags: [ics-security, cloud]
stack: [Python, AWS Kinesis, Lambda, S3, Athena, SNS, SQS, CloudFormation]
period: '2025–2026'
summary: Streaming smart-grid security telemetry into a hardened AWS pipeline
question: Can OT security telemetry reach the cloud without the pipeline becoming the weak link?
status: published
metrics:
  - label: Event schema, validated per record
    value: 14 fields
    source: Sprint Four Report §5 project review; Reflection Report, achievements
  - label: Lambda validator
    value: ~430 lines
    source: Sprint Four Report §5 project review
  - label: Live incidents → ADRs
    value: 2 → 2
    source: Reflection Report, achievements — adr-001, adr-002
  - label: Alert flood at incident peak
    value: ~100 emails / 5 min
    source: Reflection Report; PR #8 summary captured in Sprint Four Report §2
  - label: Demo lake events (normal / anomaly / tamper)
    value: 162,095 / 20,634 / 1,982
    source: Sprint Four Report §2, dashboard capture — quarantine 0
  - label: Producer and Lambda revisions during integration
    value: 6 each
    source: Reflection Report, individual challenges — commit history
---

<!-- TODO(phil-voice) — §10 restructure notes (M6, agent-scaffolded; copy untouched):
     · Problem runs long; §10 wants 2–4 sentences — condense or bless as-is.
     · "Approach" + "Architecture" (incl. the inline SVG) now scaffold the Idea
       section — the SVG is redrawn to the §11 style in M8.
     · "Planned vs delivered" sits as a subsection of Result — it is honest
       results material; move or retitle if you disagree.
     · Reflection is not a §10 section — fold into Result, keep, or cut. -->

## Problem

AEGISX is a two-semester capstone: a smart-grid industrial-control-system security
platform built by a six-person team — OT-side encryption proxies, a Modbus
deep-packet-inspection firewall, an LSTM anomaly detector, a data diode, and an operator
dashboard, all running on-premises. My slice was the cloud tier, and the repository
audit in the reflection report is unambiguous: across every branch, I am the only person
who touched the cloud codebase. The brief was to give that on-prem stack a cloud
observability and offline-retraining tier: archive every scored security event, alert
on the critical ones, make the archive visible. The risk is obvious once stated — a
monitoring pipeline that floods, drops, or stalls is itself a security failure.
Live inference deliberately stays on-premises: in an ICS,
detection belongs next to the process. The cloud is the memory and the megaphone.

## Idea

Being the only cloud person meant no peer to review AWS judgement calls, so the
discipline had to be structural. Teammates' modules were treated as APIs to consume,
never code to edit; architecture decisions were recorded as ADRs the team could review
even when they could not review every line. The sharpest test came at the seam: the OT
bridge emitted lowercase keys while my validator required a strict TitleCase 14-field
schema, so records that passed locally died at the cloud boundary. Rather than patch a
teammate's format, the key mapping became its own adapter module and the 14-field schema
a version-controlled contract — the single source of truth both sides build against. The
infrastructure is captured as a CloudFormation template of intended state, and the
handover includes a migration runbook written for fresh-account deployment to the
client.

### Architecture

<svg viewBox="0 0 760 330" role="img" aria-label="AEGISX delivered architecture: on-premise Modbus monitoring streams scored events through a boto3 producer into Kinesis; a Lambda validator writes to a Hive-partitioned S3 data lake queried by Athena, publishes aggregated SNS alerts, and dead-letters failures to SQS. SageMaker retraining is a scaffold pending the model handoff; the CloudFront access path is documented but not deployed; the demo dashboard reads S3 locally, read-only" style="width: 100%; max-width: 720px; font-family: var(--font-mono); font-size: 11px;">
  <defs>
    <marker id="arr" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0 0L8 4L0 8z" fill="var(--mist)"></path>
    </marker>
  </defs>
  <rect x="8" y="28" width="196" height="182" rx="10" fill="none" stroke="var(--line)"></rect>
  <text x="20" y="18" fill="var(--mist)">on-prem (team stack)</text>
  <rect x="24" y="44" width="164" height="36" rx="6" fill="var(--surface)" stroke="var(--line)"></rect>
  <text x="106" y="66" text-anchor="middle" fill="var(--ink)">Modbus traffic</text>
  <rect x="24" y="104" width="164" height="36" rx="6" fill="var(--surface)" stroke="var(--line)"></rect>
  <text x="106" y="121" text-anchor="middle" fill="var(--ink)">mTLS proxies · DPI</text>
  <text x="106" y="134" text-anchor="middle" fill="var(--mist)">AES-256-GCM · firewall</text>
  <rect x="24" y="164" width="164" height="36" rx="6" fill="var(--surface)" stroke="var(--line)"></rect>
  <text x="106" y="181" text-anchor="middle" fill="var(--ink)">LSTM scoring</text>
  <text x="106" y="194" text-anchor="middle" fill="var(--mist)">on-prem by design</text>
  <rect x="24" y="224" width="164" height="36" rx="6" fill="var(--surface)" stroke="var(--signal)"></rect>
  <text x="106" y="241" text-anchor="middle" fill="var(--ink)">boto3 producer — mine</text>
  <text x="106" y="254" text-anchor="middle" fill="var(--mist)">direct — no Greengrass</text>
  <line x1="106" y1="80" x2="106" y2="102" stroke="var(--mist)" marker-end="url(#arr)"></line>
  <line x1="106" y1="140" x2="106" y2="162" stroke="var(--mist)" marker-end="url(#arr)"></line>
  <line x1="106" y1="200" x2="106" y2="222" stroke="var(--mist)" marker-end="url(#arr)"></line>
  <rect x="240" y="28" width="512" height="262" rx="10" fill="none" stroke="var(--line)"></rect>
  <text x="252" y="18" fill="var(--mist)">aws ap-southeast-2 (my slice — delivered)</text>
  <rect x="256" y="104" width="120" height="44" rx="6" fill="var(--surface)" stroke="var(--signal)"></rect>
  <text x="316" y="123" text-anchor="middle" fill="var(--ink)">Kinesis</text>
  <text x="316" y="138" text-anchor="middle" fill="var(--mist)">on-demand · KMS</text>
  <rect x="408" y="104" width="130" height="44" rx="6" fill="var(--surface)" stroke="var(--signal)"></rect>
  <text x="473" y="118" text-anchor="middle" fill="var(--ink)">Lambda</text>
  <text x="473" y="131" text-anchor="middle" fill="var(--mist)">~430-line validator</text>
  <text x="473" y="143" text-anchor="middle" fill="var(--mist)">14 fields · never raises</text>
  <rect x="408" y="44" width="130" height="40" rx="6" fill="var(--surface)" stroke="var(--signal)"></rect>
  <text x="473" y="61" text-anchor="middle" fill="var(--ink)">Athena</text>
  <text x="473" y="74" text-anchor="middle" fill="var(--mist)">queries the lake</text>
  <rect x="588" y="44" width="148" height="40" rx="6" fill="var(--surface)" stroke="var(--signal)"></rect>
  <text x="662" y="61" text-anchor="middle" fill="var(--ink)">S3 data lake</text>
  <text x="662" y="76" text-anchor="middle" fill="var(--mist)">Hive-partitioned · SSE</text>
  <rect x="588" y="106" width="148" height="40" rx="6" fill="var(--surface)" stroke="var(--signal)"></rect>
  <text x="662" y="123" text-anchor="middle" fill="var(--ink)">SNS alerts</text>
  <text x="662" y="138" text-anchor="middle" fill="var(--mist)">1 aggregated / batch</text>
  <rect x="588" y="168" width="148" height="40" rx="6" fill="var(--surface)" stroke="var(--line)"></rect>
  <text x="662" y="185" text-anchor="middle" fill="var(--ink)">SQS DLQ</text>
  <text x="662" y="200" text-anchor="middle" fill="var(--mist)">14-day retention</text>
  <line x1="190" y1="242" x2="316" y2="242" stroke="var(--mist)"></line>
  <line x1="316" y1="242" x2="316" y2="150" stroke="var(--mist)" marker-end="url(#arr)"></line>
  <line x1="376" y1="126" x2="406" y2="126" stroke="var(--mist)" marker-end="url(#arr)"></line>
  <line x1="538" y1="114" x2="586" y2="70" stroke="var(--mist)" marker-end="url(#arr)"></line>
  <line x1="538" y1="126" x2="586" y2="126" stroke="var(--mist)" marker-end="url(#arr)"></line>
  <line x1="538" y1="140" x2="586" y2="184" stroke="var(--mist)" stroke-dasharray="3 3" marker-end="url(#arr)"></line>
  <text x="548" y="172" fill="var(--mist)" font-size="10">on failure</text>
  <line x1="586" y1="64" x2="540" y2="64" stroke="var(--mist)" marker-end="url(#arr)"></line>
  <rect x="256" y="226" width="150" height="36" rx="6" fill="none" stroke="var(--mist)" stroke-dasharray="4 3"></rect>
  <text x="331" y="243" text-anchor="middle" fill="var(--mist)">SageMaker</text>
  <text x="331" y="256" text-anchor="middle" fill="var(--mist)" font-size="10">scaffold — pending model</text>
  <rect x="422" y="226" width="150" height="36" rx="6" fill="none" stroke="var(--mist)" stroke-dasharray="4 3"></rect>
  <text x="497" y="243" text-anchor="middle" fill="var(--mist)">CloudFront + OAC</text>
  <text x="497" y="256" text-anchor="middle" fill="var(--mist)" font-size="10">documented, not deployed</text>
  <rect x="588" y="226" width="148" height="36" rx="6" fill="var(--surface)" stroke="var(--line)"></rect>
  <text x="662" y="243" text-anchor="middle" fill="var(--ink)">demo dashboard</text>
  <text x="662" y="256" text-anchor="middle" fill="var(--mist)" font-size="10">local · read-only · S3</text>
  <line x1="662" y1="84" x2="662" y2="224" stroke="var(--mist)" stroke-dasharray="3 3" marker-end="url(#arr)"></line>
</svg>

The delivered pipeline runs in ap-southeast-2. A direct boto3 producer maps the OT
bridge's events into an on-demand, KMS-encrypted Kinesis stream. A Python 3.12 Lambda —
around 430 lines of validator — type-checks each record against the documented 14-field
schema, classifies it Normal, Anomaly, Tamper, or Quarantine, and writes it to a
Hive-partitioned S3 data lake with server-side encryption; malformed records go to the
quarantine prefix instead of being dropped, and the handler never raises, so one bad
record cannot fail a whole Kinesis batch. Athena queries the lake in place. SNS
publishes one aggregated alert per batch — tamper unconditionally, anomalies only past a
configurable confidence threshold — and records that fail repeatedly land in an SQS
dead-letter queue. IAM is least-privilege throughout. What the diagram does not show is
as deliberate as what it does: live LSTM inference never moved to the cloud.

## Result

The pipeline's defining results came from two live incidents, each now an ADR. The
first was the alert flood: the handler published one SNS email per event, and combined
with a three-second Lambda timeout — config drift from the intended thirty — and
Kinesis's default infinite retries, every batch timed out, was retried, partially
re-published, and timed out again, peaking at roughly a hundred alert emails in five
minutes. The second was the poison pill: a single malformed record drove the Lambda
into reprocessing an entire batch indefinitely. The fixes shipped together in PR #8
into the team's GUI-SUB branch — +3,363 −5 across 30 files, merged 4 June and approved
by the repository owner: per-batch aggregated
alerts with counts, categories, and up to five representative events, gated by a
configurable confidence threshold with tamper always alerting (adr-001); bounded
retries, bisect-on-error, a six-hour record-age cap, the dead-letter queue, and the
timeout reconciled to the template (adr-002). Verification followed: eleven unit tests
across the Lambda and producer, then a live four-event injection that produced three
invocations, zero errors, 588 ms peak duration, four archived S3 objects, and exactly
two aggregated alerts — the tamper and the above-threshold anomaly, with the
below-threshold anomaly correctly staying silent. By the handover demo the lake held
162,095 normal, 20,634 anomaly, and 1,982 tamper events, with quarantine at zero.

### Planned vs delivered

The Semester 1 roadmap and the delivered system differ, and the differences are the
engineering. Greengrass edge ingestion became the direct boto3 producer: weeks of
port-binding and VM-network fights ended with the honest realisation that the system
has no physical edge device, and the gateway was deprecated rather than defended.
Timestream and RDS consolidated into S3 queried with Athena — the archival and
analytical need met without operating two more managed stores. The SageMaker retraining
loop is an infrastructure-ready scaffold positioned as pending, because it depends on
the final model handoff. Step Functions orchestration was descoped once automated
physical incident response left the project's scope; SNS alerting plus the team's
documented incident-response playbooks meet the notification requirement. And the
production dashboard access path — CloudFront with Origin Access Control over an
IAM-authenticated URL — is documented but not deployed, after a Function URL 403 that
would not yield to root-causing in time; the demo dashboard runs locally, read-only,
over the S3 lake. Each deviation is recorded with its reasoning, not smoothed over.

## Reflection

The reflection report is harder on the process than on the pipeline, deliberately. The
two ADRs I am proudest of were committed about five hours after the code they describe,
and the repo contains essentially no upfront design artifacts — no PRD, no threat
model, no data dictionary. That reactive posture is exactly why the schema mismatch,
the retry loop, and the blocked dashboard URL were discovered at build time instead of
anticipated at design time; the commit history shows six revisions each to the producer
and the Lambda as the integration kept moving underneath them. The one guard not
implemented — idempotency — is documented as known debt rather than hidden. Version
control discipline measurably improved mid-project: loose prefixes gave way to
Conventional Commits and feature branches merged through pull requests into a shared
integration branch — the same workflow that builds and ships this site. Given the project again, the plan comes first: fix the
data contract and threat model upfront, pace delivery instead of compressing it into
the final week. The honest conclusion the report lands on: my engineering ability ran
ahead of my engineering process, and closing that gap is the most important thing I
took from AEGISX.
