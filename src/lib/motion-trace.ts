/**
 * Motion debug trace (Phil's FIX A note 3): a phase-timestamp recorder for the
 * camera choreography. The desk runtime marks each phase boundary — beat1
 * start/arrive, settle end, gate open (and which condition released it), push
 * start, reveal start/end, settled — and flushes one console.table per completed
 * move, so numbers can be pasted instead of recording videos.
 *
 * Pure and DOM-free (the sink is injected; console.table is only the default),
 * so tests can capture the marks and assert phase ORDER.
 *
 * Enable in the browser with `?debug=motion` on any URL, or persistently with
 * `localStorage.setItem('debug:motion', '1')`.
 */

export interface PhaseMark {
  phase: string;
  /** Timestamp in ms (performance.now() in the runtime; any clock in tests). */
  at: number;
  detail?: string;
}

export interface TraceRow {
  phase: string;
  /** ms since the first mark of this move. */
  ms: number;
  /** ms since the previous mark. */
  '+ms': number;
  detail: string;
}

export class MotionTrace {
  private marks: PhaseMark[] = [];

  constructor(
    private readonly enabled: boolean,
    private readonly sink: (rows: TraceRow[]) => void = (rows) => console.table(rows)
  ) {}

  /** Record a phase boundary. No-op when the trace is disabled. */
  mark(phase: string, at: number, detail?: string): void {
    if (!this.enabled) return;
    this.marks.push({ phase, at, detail });
  }

  /** The recorded phase names, in order (for order assertions in tests). */
  get phases(): string[] {
    return this.marks.map((m) => m.phase);
  }

  /** Emit the recorded move as a table (relative + delta times) and reset. */
  flush(): void {
    if (!this.enabled || this.marks.length === 0) return;
    // Marks may be recorded out of order (a retroactive settle:end lands after
    // gate:open with an earlier timestamp) — present them on the move's timeline.
    const sorted = [...this.marks].sort((a, b) => a.at - b.at);
    const t0 = sorted[0].at;
    this.sink(
      sorted.map((m, i) => ({
        phase: m.phase,
        ms: round1(m.at - t0),
        '+ms': i === 0 ? 0 : round1(m.at - sorted[i - 1].at),
        detail: m.detail ?? '',
      }))
    );
    this.marks = [];
  }
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
