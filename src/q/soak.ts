export type QSoakProbeMode = 'openjaws' | 'oci-q'
export type QSoakProbeStatus = 'ok' | 'failed' | 'dry_run'

export type QSoakProbeResult = {
  index: number
  mode: QSoakProbeMode
  status: QSoakProbeStatus
  startedAt: string
  endedAt: string
  latencyMs: number | null
  command?: string
  exitCode?: number | null
  responseText?: string | null
  error?: string | null
}

export function buildQSoakSummary(stats: {
  total: number
  ok: number
  failed: number
  dryRun: number
  latencies: number[]
}): Record<string, unknown> {
  const sorted = [...stats.latencies].sort((a, b) => a - b)
  const percentile = (p: number): number | null => {
    if (sorted.length === 0) {
      return null
    }
    const index = Math.min(
      sorted.length - 1,
      Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
    )
    return sorted[index] ?? null
  }

  const averageLatencyMs =
    sorted.length > 0
      ? Math.round(sorted.reduce((sum, value) => sum + value, 0) / sorted.length)
      : null

  return {
    totalProbes: stats.total,
    successCount: stats.ok,
    errorCount: stats.failed,
    dryRunCount: stats.dryRun,
    latencyMs: {
      average: averageLatencyMs,
      min: sorted[0] ?? null,
      p50: percentile(50),
      p95: percentile(95),
      max: sorted[sorted.length - 1] ?? null,
    },
  }
}
