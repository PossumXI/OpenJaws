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
    return `${terminalBench.benchmarkFailedTrials} benchmark failures // ${terminalBench.executionErrorTrials} runtime errors`
  }

  if (terminalBench.benchmarkFailedTrials > 0) {
    return `${terminalBench.benchmarkFailedTrials} benchmark failures`
  }

  if (terminalBench.executionErrorTrials > 0) {
    return `${terminalBench.executionErrorTrials} runtime errors`
  }

  return formatStatusLabel(terminalBench.status)
}

function formatBridgeBenchHeadline(): string {
  const scorePercent = BENCHMARK_SNAPSHOT.bridgeBench.scorePercent
  return typeof scorePercent === 'number' ? `${scorePercent.toFixed(2)}%` : 'dry run'
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
        <h2>Measured, not invented.</h2>
        <p>Generated from checked benchmark reports.</p>
      </div>

      <div className="benchmark-snapshot-meta">
        <span>Generated {formatSnapshotDate(BENCHMARK_SNAPSHOT.generatedAt)}</span>
        <span>Local and official results</span>
        <span>Signed activity records</span>
        <span>Repeatable release checks</span>
        <span>No synthetic benchmark claims</span>
      </div>

      <div className="benchmark-snapshot-grid">
        <article className="benchmark-card benchmark-card-highlight">
          <span className="benchmark-label">BridgeBench</span>
          <strong>{formatBridgeBenchHeadline()}</strong>
          <p>{BENCHMARK_SNAPSHOT.bridgeBench.summary}</p>
          <div className="benchmark-card-footnote">
            <span>Best pack: {BENCHMARK_SNAPSHOT.bridgeBench.bestPack}</span>
            <span>ID: {BENCHMARK_SNAPSHOT.bridgeBench.benchmarkId}</span>
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
            {BENCHMARK_SNAPSHOT.terminalBenchSoak.cycleCount} cycles //
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
          <span className="benchmark-label">W&B</span>
          <strong>{BENCHMARK_SNAPSHOT.wandb.status}</strong>
          <p>{BENCHMARK_SNAPSHOT.wandb.summary}</p>
          <div className="benchmark-card-footnote">
            <span>Enabled: {BENCHMARK_SNAPSHOT.wandb.enabled ? 'yes' : 'no'}</span>
            <span>Source: {BENCHMARK_SNAPSHOT.wandb.source}</span>
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
