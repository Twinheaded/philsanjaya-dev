---
title: AEGISX cloud pipeline
slug: aegisx
order: 2
tags: [ics-security, cloud]
stack: [Python, AWS Kinesis, Lambda, S3, SNS, CloudFormation]
period: '2026'
summary: Streaming smart-grid security telemetry into a hardened AWS pipeline
question: Can OT security telemetry reach the cloud without the pipeline becoming the weak link?
status: published
metrics:
  - label: Alert flood at incident peak
    value: 100+ emails / 5 min
    source: cloud/docs/adr-001-alert-aggregation.md, incident summary
  - label: Stuck records drained to DLQ
    value: '379'
    source: cloud/docs/adr-002-stream-resilience.md, verification
  - label: Post-hardening e2e errors
    value: '0'
    source: adr-001/002 verification — 4 records, 2 aggregated alerts, ~600 ms
---

## Problem

AEGISX is a university capstone: a smart-grid industrial-control-system security
platform built by a team of seven, spanning OT encryption, a Modbus firewall, an LSTM
anomaly detector, a data diode, and an operator dashboard. Everything scored stayed on
the factory floor. My slice was the cloud: take the security events the on-prem stack
produces — every Modbus frame relayed through an AES-256-GCM proxy pair, scored live by
the LSTM before it leaves the premises — and stream them into AWS storage and alerting
that an operator can trust. The risk is obvious: a monitoring pipeline that floods,
drops, or stalls is itself a security failure.

## Approach

I owned the cloud subtree end to end and treated the boundary as a contract: a
canonical 14-field event schema, validated in the processor, with invalid records
quarantined rather than dropped. Architecture decisions are recorded as ADRs — authored,
as the documents themselves state, by me with an AI pair — and the infrastructure is
captured as a validated CloudFormation template after live console drift proved that
memory is not documentation. Verification came before claims: unit tests on the
aggregation logic, a live end-to-end injection, and a test runbook.

## Architecture

<svg viewBox="0 0 760 330" role="img" aria-label="AEGISX architecture: on-premise Modbus monitoring streams scored events through Kinesis to Lambda, which writes to S3 and alerts via SNS, with an SQS dead-letter queue; Timestream, SageMaker and CloudFront remain planned" style="width: 100%; max-width: 720px; font-family: var(--font-mono); font-size: 11px;">
  <defs>
    <marker id="arr" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0 0L8 4L0 8z" fill="var(--mist)"></path>
    </marker>
  </defs>
  <rect x="8" y="28" width="196" height="262" rx="10" fill="none" stroke="var(--line)"></rect>
  <text x="20" y="18" fill="var(--mist)">on-prem (team stack)</text>
  <rect x="24" y="44" width="164" height="36" rx="6" fill="var(--surface)" stroke="var(--line)"></rect>
  <text x="106" y="66" text-anchor="middle" fill="var(--ink)">Modbus traffic</text>
  <rect x="24" y="104" width="164" height="36" rx="6" fill="var(--surface)" stroke="var(--line)"></rect>
  <text x="106" y="121" text-anchor="middle" fill="var(--ink)">AES-256-GCM proxy</text>
  <text x="106" y="134" text-anchor="middle" fill="var(--mist)">firewall · RTT tracking</text>
  <rect x="24" y="164" width="164" height="36" rx="6" fill="var(--surface)" stroke="var(--line)"></rect>
  <text x="106" y="181" text-anchor="middle" fill="var(--ink)">LSTM scoring</text>
  <text x="106" y="194" text-anchor="middle" fill="var(--mist)">on-prem, pre-cloud</text>
  <rect x="24" y="224" width="164" height="36" rx="6" fill="var(--surface)" stroke="var(--line)"></rect>
  <text x="106" y="241" text-anchor="middle" fill="var(--ink)">producer</text>
  <text x="106" y="254" text-anchor="middle" fill="var(--mist)">4 workers · backoff</text>
  <line x1="106" y1="80" x2="106" y2="102" stroke="var(--mist)" marker-end="url(#arr)"></line>
  <line x1="106" y1="140" x2="106" y2="162" stroke="var(--mist)" marker-end="url(#arr)"></line>
  <line x1="106" y1="200" x2="106" y2="222" stroke="var(--mist)" marker-end="url(#arr)"></line>
  <rect x="240" y="28" width="512" height="262" rx="10" fill="none" stroke="var(--line)"></rect>
  <text x="252" y="18" fill="var(--mist)">aws ap-southeast-2 (my slice)</text>
  <rect x="256" y="104" width="120" height="44" rx="6" fill="var(--surface)" stroke="var(--signal)"></rect>
  <text x="316" y="123" text-anchor="middle" fill="var(--ink)">Kinesis</text>
  <text x="316" y="138" text-anchor="middle" fill="var(--mist)">single shard</text>
  <rect x="408" y="104" width="130" height="44" rx="6" fill="var(--surface)" stroke="var(--signal)"></rect>
  <text x="473" y="123" text-anchor="middle" fill="var(--ink)">Lambda</text>
  <text x="473" y="138" text-anchor="middle" fill="var(--mist)">validate · classify</text>
  <rect x="588" y="44" width="148" height="40" rx="6" fill="var(--surface)" stroke="var(--signal)"></rect>
  <text x="662" y="61" text-anchor="middle" fill="var(--ink)">S3 data lake</text>
  <text x="662" y="76" text-anchor="middle" fill="var(--mist)">+ quarantine</text>
  <rect x="588" y="106" width="148" height="40" rx="6" fill="var(--surface)" stroke="var(--signal)"></rect>
  <text x="662" y="123" text-anchor="middle" fill="var(--ink)">SNS alerts</text>
  <text x="662" y="138" text-anchor="middle" fill="var(--mist)">aggregated / batch</text>
  <rect x="588" y="168" width="148" height="40" rx="6" fill="var(--surface)" stroke="var(--line)"></rect>
  <text x="662" y="185" text-anchor="middle" fill="var(--ink)">SQS DLQ</text>
  <text x="662" y="200" text-anchor="middle" fill="var(--mist)">14-day retention</text>
  <line x1="190" y1="242" x2="316" y2="242" stroke="var(--mist)"></line>
  <line x1="316" y1="242" x2="316" y2="150" stroke="var(--mist)" marker-end="url(#arr)"></line>
  <line x1="376" y1="126" x2="406" y2="126" stroke="var(--mist)" marker-end="url(#arr)"></line>
  <line x1="538" y1="114" x2="586" y2="70" stroke="var(--mist)" marker-end="url(#arr)"></line>
  <line x1="538" y1="126" x2="586" y2="126" stroke="var(--mist)" marker-end="url(#arr)"></line>
  <line x1="538" y1="140" x2="586" y2="184" stroke="var(--mist)" stroke-dasharray="3 3" marker-end="url(#arr)"></line>
  <text x="556" y="170" fill="var(--mist)" font-size="10">on failure</text>
  <rect x="256" y="226" width="150" height="36" rx="6" fill="none" stroke="var(--mist)" stroke-dasharray="4 3"></rect>
  <text x="331" y="243" text-anchor="middle" fill="var(--mist)">Timestream</text>
  <text x="331" y="256" text-anchor="middle" fill="var(--mist)" font-size="10">planned, not built</text>
  <rect x="422" y="226" width="150" height="36" rx="6" fill="none" stroke="var(--mist)" stroke-dasharray="4 3"></rect>
  <text x="497" y="243" text-anchor="middle" fill="var(--mist)">SageMaker</text>
  <text x="497" y="256" text-anchor="middle" fill="var(--mist)" font-size="10">planned, not built</text>
  <rect x="588" y="226" width="148" height="36" rx="6" fill="none" stroke="var(--mist)" stroke-dasharray="4 3"></rect>
  <text x="662" y="243" text-anchor="middle" fill="var(--mist)">CloudFront</text>
  <text x="662" y="256" text-anchor="middle" fill="var(--mist)" font-size="10">planned, not built</text>
</svg>

Scored events leave the producer with exponential-backoff retries, land in a Kinesis
stream, and trigger a Python 3.12 Lambda in batches of up to 100: validate against the
schema, classify each record as normal, anomaly, or tamper, write everything to a
Hive-partitioned S3 data lake (invalid records to a quarantine prefix), and publish one
aggregated SNS alert per batch — tamper unconditionally, anomalies only at confidence 75
or above. Failures retry three times with batch bisection, age out after six hours, and
land in a dead-letter queue. The diagram is honest about scope: the analytics layer —
Timestream, SageMaker retraining, CloudFront — stayed on the drawing board.

## Results

The pipeline's defining result came from breaking it. A console-drifted three-second
Lambda timeout (the template said thirty), per-event SNS publishing, and Kinesis's
default infinite retries combined into a self-sustaining loop: roughly nineteen errored
invocations a minute and more than a hundred alert emails every five minutes, ended by
an emergency disable of the event source mapping. The fix is recorded in two ADRs:
batch-aggregated alerts behind a confidence gate, bounded retries with bisection, a
six-hour record age cap, and the dead-letter queue. Verification followed: ten unit
tests on the aggregation logic; a live four-event injection producing four S3 objects,
two aggregated alerts, and zero errors in about 600 ms; and 379 stuck records drained
cleanly into the DLQ. The README's own status line is kept honest — demo-validated, but
not yet production-hardened.

## Reflection

The incident taught more than the build. Cloud defaults are a threat model: infinite
retries turned one slow function into an alert flood. Console drift is real — the live
timeout silently disagreed with the template until it mattered, which is why the
CloudFormation template now documents intent even where resources were first provisioned
by hand. Honest status language ("demo-validated") survived into the docs because
overclaiming in a security project is its own kind of vulnerability. Left open at
handover: migrating off a personal AWS account, completing the live OT-bridge
integration, and the planned analytics layer. The ADRs credit their authorship plainly —
me, with an AI pair — the same working arrangement that built this site.
