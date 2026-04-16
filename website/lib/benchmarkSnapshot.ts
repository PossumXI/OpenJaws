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
    submissionUrl?: string
  }
  wandb: {
    status: string
    enabled: boolean
    source: string
    summary: string
  }
}

export const BENCHMARK_SNAPSHOT: BenchmarkSnapshot = {
  generatedAt: '2026-04-16T16:20:00.000Z',
  source:
    'Rendered from verified receipts: q-bridgebench-live-20260415-nowandb, q-soak-live-20260416, and q-terminalbench-official-public-20260416-circuit-fibsqrt-v2 plus the official leaderboard submission discussion.',
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
    runId: 'q-terminalbench-20260416T160708',
    taskName: 'circuit-fibsqrt',
    scope: 'Official TerminalBench 2.0 public task',
    status: 'submitted',
    agent: 'openjaws-harbor',
    model: 'oci:Q',
    outcome: 'reward 0.0 // 5 trials',
    summary:
      'OpenJaws ran one official public TerminalBench 2.0 task on OCI Q with five attempts, zero runtime errors, and reward 0.0. The receipt is now packaged and submitted through the official leaderboard repo discussion flow.',
    submissionUrl:
      'https://huggingface.co/datasets/harborframework/terminal-bench-2-leaderboard/discussions/141',
  },
  wandb: {
    status: 'auth missing',
    enabled: false,
    source: 'local machine',
    summary:
      'Live W&B logging was attempted for the April 16 benchmark pass, but no local WANDB login was configured on this machine, so the benchmark receipts stayed local only.',
  },
} as const
