import generatedSnapshot from './benchmarkSnapshot.generated.json'

export type BenchmarkSnapshot = {
  generatedAt: string
  source: string
  bridgeBench: {
    benchmarkId: string
    status: string
    bestPack: string
    scorePercent: number | null
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
    submissionState: string
    agent: string
    model: string
    outcome: string
    executionErrorTrials: number
    benchmarkFailedTrials: number
    summary: string
    submissionUrl?: string
  }
  terminalBenchSoak: {
    runId: string
    taskName: string
    status: string
    cycleCount: number
    totalTrials: number
    executionErrorTrials: number
    benchmarkFailedTrials: number
    summary: string
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
