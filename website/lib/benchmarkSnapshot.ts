import generatedSnapshot from './benchmarkSnapshot.generated.json'

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
    totalProbes: number
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
    url?: string
  }
}

export const BENCHMARK_SNAPSHOT: BenchmarkSnapshot =
  generatedSnapshot as BenchmarkSnapshot
