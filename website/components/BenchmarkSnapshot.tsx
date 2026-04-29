import { BENCHMARK_SNAPSHOT } from '../lib/benchmarkSnapshot'

function formatSnapshotDate(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function formatStatusLabel(value: string): string {
  return value.replace(/_/g, ' ')
}

function formatTerminalBenchHeadline(): string {
  const terminalBench = BENCHMARK_SNAPSHOT.terminalBench
  if (terminalBench.status !== 'completed_with_errors') {
    return terminalBench.outcome
  }

  if (
    terminalBench.benchmarkFailedTrials > 0 &&
    terminalBench.executionErrorTrials > 0
  ) {
    return `${terminalBench.benchmarkFailedTrials} benchmark failures / ${terminalBench.executionErrorTrials} runtime errors`
  }

  if (terminalBench.benchmarkFailedTrials > 0) {
    return `${terminalBench.benchmarkFailedTrials} benchmark failures`
  }

  if (terminalBench.executionErrorTrials > 0) {
    return `${terminalBench.executionErrorTrials} runtime errors`
  }

  return formatStatusLabel(terminalBench.status)
}

export function BenchmarkSnapshotSection(): React.ReactNode {
  return (
    <section
      className="benchmark-snapshot"
      aria-label="Benchmark snapshot"
      id="benchmarks"
    >
      <div className="section-heading">
        <span className="eyebrow">Benchmark snapshot</span>
        <h2>Proof you can inspect.</h2>
        <p>
          OpenJaws publishes practical benchmark receipts so teams can see what
          ran, what passed, and what still needs work.
        </p>
      </div>

      <div className="benchmark-snapshot-meta">
        <span>Generated {formatSnapshotDate(BENCHMARK_SNAPSHOT.generatedAt)}</span>
        <span>Verified receipts</span>
        <span>Repeatable runs</span>
        <span>Public results only</span>
      </div>

      <div className="benchmark-snapshot-grid">
        <article className="benchmark-card benchmark-card-highlight">
          <span className="benchmark-label">BridgeBench</span>
          <strong>
            {BENCHMARK_SNAPSHOT.bridgeBench.scorePercent !== null
              ? `${BENCHMARK_SNAPSHOT.bridgeBench.scorePercent.toFixed(2)}%`
              : formatStatusLabel(BENCHMARK_SNAPSHOT.bridgeBench.status)}
          </strong>
          <p>{BENCHMARK_SNAPSHOT.bridgeBench.summary}</p>
          <div className="benchmark-card-footnote">
            <span>Best pack: {BENCHMARK_SNAPSHOT.bridgeBench.bestPack}</span>
            <span>ID: {BENCHMARK_SNAPSHOT.bridgeBench.benchmarkId}</span>
            <span>Status: {formatStatusLabel(BENCHMARK_SNAPSHOT.bridgeBench.status)}</span>
          </div>
        </article>

        <article className="benchmark-card">
          <span className="benchmark-label">30-Min Soak</span>
          <strong>
            {BENCHMARK_SNAPSHOT.soak.successCount}/
            {BENCHMARK_SNAPSHOT.soak.totalProbes}
          </strong>
          <p>{BENCHMARK_SNAPSHOT.soak.summary}</p>
          <div className="benchmark-card-footnote">
            <span>Duration: {BENCHMARK_SNAPSHOT.soak.durationMinutes} min</span>
            <span>Errors: {BENCHMARK_SNAPSHOT.soak.errorCount}</span>
          </div>
        </article>

        <article className="benchmark-card">
          <span className="benchmark-label">Public TerminalBench</span>
          <strong>{formatTerminalBenchHeadline()}</strong>
          <p>{BENCHMARK_SNAPSHOT.terminalBench.summary}</p>
          <div className="benchmark-card-footnote">
            <span>{BENCHMARK_SNAPSHOT.terminalBench.scope}</span>
            <span>Task: {BENCHMARK_SNAPSHOT.terminalBench.taskName}</span>
            <span>Agent: {BENCHMARK_SNAPSHOT.terminalBench.agent}</span>
            <span>Model: {BENCHMARK_SNAPSHOT.terminalBench.model}</span>
            <span>Outcome: {BENCHMARK_SNAPSHOT.terminalBench.outcome}</span>
            <span>Status: {formatStatusLabel(BENCHMARK_SNAPSHOT.terminalBench.status)}</span>
            <span>
              Runtime errors: {BENCHMARK_SNAPSHOT.terminalBench.executionErrorTrials}
            </span>
            <span>
              Benchmark failures: {BENCHMARK_SNAPSHOT.terminalBench.benchmarkFailedTrials}
            </span>
            <span>
              Submission: {formatStatusLabel(BENCHMARK_SNAPSHOT.terminalBench.submissionState)}
            </span>
            {BENCHMARK_SNAPSHOT.terminalBench.submissionUrl ? (
              <a
                href={BENCHMARK_SNAPSHOT.terminalBench.submissionUrl}
                target="_blank"
                rel="noreferrer"
              >
                Official submission
              </a>
            ) : null}
          </div>
        </article>

        <article className="benchmark-card">
          <span className="benchmark-label">TerminalBench Soak</span>
          <strong>
            {BENCHMARK_SNAPSHOT.terminalBenchSoak.cycleCount} cycles /
            {' '}
            {BENCHMARK_SNAPSHOT.terminalBenchSoak.totalTrials} trials
          </strong>
          <p>{BENCHMARK_SNAPSHOT.terminalBenchSoak.summary}</p>
          <div className="benchmark-card-footnote">
            <span>Task: {BENCHMARK_SNAPSHOT.terminalBenchSoak.taskName}</span>
            <span>Status: {BENCHMARK_SNAPSHOT.terminalBenchSoak.status}</span>
            <span>
              Runtime errors: {BENCHMARK_SNAPSHOT.terminalBenchSoak.executionErrorTrials}
            </span>
            <span>
              Benchmark failures: {BENCHMARK_SNAPSHOT.terminalBenchSoak.benchmarkFailedTrials}
            </span>
          </div>
        </article>

        <article className="benchmark-card">
          <span className="benchmark-label">Receipt Publishing</span>
          <strong>{BENCHMARK_SNAPSHOT.wandb.status}</strong>
          <p>{BENCHMARK_SNAPSHOT.wandb.summary}</p>
          <div className="benchmark-card-footnote">
            <span>
              Mode: {BENCHMARK_SNAPSHOT.wandb.enabled ? 'external + local' : 'local receipt archive'}
            </span>
            {BENCHMARK_SNAPSHOT.wandb.url ? (
              <a
                href={BENCHMARK_SNAPSHOT.wandb.url}
                target="_blank"
                rel="noreferrer"
              >
                W&B target
              </a>
            ) : null}
          </div>
        </article>
      </div>
    </section>
  )
}
