export type BenchmarkSnapshot = {
  generatedAt: string
  source: string
  bridgeBench: {
    benchmarkId: string
    bestPack: string
    scorePercent: number
    summary: string
  }
  soak: {
    runId: string
    durationMinutes: number
    successCount: number
    errorCount: number
    summary: string
  }
  terminalBench: {
    runId: string
    taskName: string
    scope: string
    status: string
    agent: string
    model: string
    outcome: string
    summary: string
  }
  wandb: {
    status: string
    enabled: boolean
    source: string
    summary: string
  }
}

export const BENCHMARK_SNAPSHOT: BenchmarkSnapshot = {
  generatedAt: '2026-04-16T05:38:00.000Z',
  source:
    'Rendered from verified receipts: q-bridgebench-live-20260415-nowandb, q-soak-live-20260416, and q-terminalbench-public-20260416-circuit-fibsqrt-scrubtest.',
  bridgeBench: {
    benchmarkId: 'q-bridgebench-20260416T004137',
    bestPack: 'all',
    scorePercent: 42.11,
    summary:
      'Local audited-pack eval over Q bundle slices. Best current pack: all at 42.11%. Agentic matched the same score on this bounded smoke.',
  },
  soak: {
    runId: 'q-soakbench-20260416T005306',
    durationMinutes: 30,
    successCount: 52,
    errorCount: 0,
    summary:
      '30-minute bounded soak. 52/52 probes succeeded with zero errors. OpenJaws p95 latency: 8455 ms. Direct OCI-Q p95 latency: 4254 ms.',
  },
  terminalBench: {
    runId: 'q-terminalbench-20260416T053356',
    taskName: 'terminal-bench/circuit-fibsqrt',
    scope: 'Official public TerminalBench task',
    status: 'completed_with_errors',
    agent: 'openjaws-harbor',
    model: 'oci:Q',
    outcome: 'reward 0.0',
    summary:
      'The latest bounded public-dataset TerminalBench pass completed cleanly at the harness level on circuit-fibsqrt. Reward stayed 0.0 with zero runtime errors, and the wrapper now redacts Harbor raw env bundles in place.',
  },
  wandb: {
    status: 'auth missing',
    enabled: false,
    source: 'local machine',
    summary:
      'Live W&B logging was attempted for the April 16 benchmark pass, but no local WANDB_API_KEY/login was configured, so the benchmark receipts stayed local only.',
  },
} as const
