export type FpsMetrics = {
  averageFps: number
  low1PctFps: number
}

export class FpsTracker {
  private readonly frameDurationsMs: number[] = []

  record(durationMs: number): void {
    if (!Number.isFinite(durationMs) || durationMs <= 0) {
      return
    }
    this.frameDurationsMs.push(durationMs)
    if (this.frameDurationsMs.length > 240) {
      this.frameDurationsMs.shift()
    }
  }

  getMetrics(): FpsMetrics {
    if (this.frameDurationsMs.length === 0) {
      return { averageFps: 0, low1PctFps: 0 }
    }

    const fpsSamples = this.frameDurationsMs
      .filter(durationMs => durationMs > 0)
      .map(durationMs => 1000 / durationMs)
      .sort((a, b) => a - b)

    if (fpsSamples.length === 0) {
      return { averageFps: 0, low1PctFps: 0 }
    }

    const averageFps =
      fpsSamples.reduce((sum, fps) => sum + fps, 0) / fpsSamples.length
    const lowIndex = Math.max(0, Math.floor(fpsSamples.length * 0.01) - 1)

    return {
      averageFps,
      low1PctFps: fpsSamples[lowIndex] ?? averageFps,
    }
  }
}
