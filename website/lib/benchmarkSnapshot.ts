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
  generatedAt: '2026-04-16T02:13:00.000Z',
  source:
    'Rendered from local artifacts: q-bridgebench-live-20260415-nowandb, q-soak-live-20260416, and q-terminalbench-live-20260416-ociq-fixed9.',
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
    runId: 'q-terminalbench-20260416T020922',
    status: 'completed_with_errors',
    agent: 'openjaws-harbor',
    model: 'oci:Q',
    outcome: '1 runtime error',
    summary:
      'Harbor, Docker, and local provider preflight are green. The latest one-task run reached real execution and completed with one runtime error because OCI IAM config staging inside the container is still not portable end to end.',
  },
  wandb: {
    status: 'auth missing',
    enabled: false,
    source: 'local machine',
    summary:
      'Live W&B logging was attempted for the April 16 benchmark pass, but no local WANDB_API_KEY/login was configured, so the benchmark receipts stayed local only.',
  },
} as const
