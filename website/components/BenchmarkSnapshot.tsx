import { BENCHMARK_SNAPSHOT } from '../lib/benchmarkSnapshot'

function formatSnapshotDate(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
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
        <p>{BENCHMARK_SNAPSHOT.source}</p>
      </div>

      <div className="benchmark-snapshot-meta">
        <span>Generated {formatSnapshotDate(BENCHMARK_SNAPSHOT.generatedAt)}</span>
        <span>Local + official receipts</span>
        <span>No synthetic benchmark claims</span>
      </div>

      <div className="benchmark-snapshot-grid">
        <article className="benchmark-card benchmark-card-highlight">
          <span className="benchmark-label">BridgeBench</span>
          <strong>{BENCHMARK_SNAPSHOT.bridgeBench.scorePercent.toFixed(2)}%</strong>
          <p>{BENCHMARK_SNAPSHOT.bridgeBench.summary}</p>
          <div className="benchmark-card-footnote">
            <span>Best pack: {BENCHMARK_SNAPSHOT.bridgeBench.bestPack}</span>
            <span>ID: {BENCHMARK_SNAPSHOT.bridgeBench.benchmarkId}</span>
          </div>
        </article>

        <article className="benchmark-card">
          <span className="benchmark-label">30-Min Soak</span>
          <strong>{BENCHMARK_SNAPSHOT.soak.successCount}/52</strong>
          <p>{BENCHMARK_SNAPSHOT.soak.summary}</p>
          <div className="benchmark-card-footnote">
            <span>Duration: {BENCHMARK_SNAPSHOT.soak.durationMinutes} min</span>
            <span>Errors: {BENCHMARK_SNAPSHOT.soak.errorCount}</span>
          </div>
        </article>

        <article className="benchmark-card">
          <span className="benchmark-label">Public TerminalBench</span>
          <strong>{BENCHMARK_SNAPSHOT.terminalBench.outcome}</strong>
          <p>{BENCHMARK_SNAPSHOT.terminalBench.summary}</p>
          <div className="benchmark-card-footnote">
            <span>{BENCHMARK_SNAPSHOT.terminalBench.scope}</span>
            <span>Task: {BENCHMARK_SNAPSHOT.terminalBench.taskName}</span>
            <span>Agent: {BENCHMARK_SNAPSHOT.terminalBench.agent}</span>
            <span>Model: {BENCHMARK_SNAPSHOT.terminalBench.model}</span>
            <span>Status: {BENCHMARK_SNAPSHOT.terminalBench.status}</span>
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
          <span className="benchmark-label">W&B</span>
          <strong>{BENCHMARK_SNAPSHOT.wandb.status}</strong>
          <p>{BENCHMARK_SNAPSHOT.wandb.summary}</p>
          <div className="benchmark-card-footnote">
            <span>Enabled: {BENCHMARK_SNAPSHOT.wandb.enabled ? 'yes' : 'no'}</span>
            <span>Source: {BENCHMARK_SNAPSHOT.wandb.source}</span>
          </div>
        </article>
      </div>
    </section>
  )
}
