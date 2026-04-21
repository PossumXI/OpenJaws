import { afterEach, describe, expect, test } from 'bun:test'
import {
  buildPublicBenchmarkSource,
  buildSnapshot,
  buildSnapshotForCheck,
  buildWandbSummary,
  collectMatchingReceiptPaths,
  isValidExistingReceiptPath,
  parseArgs,
  resolveLatestReceipt,
  resolveLatestPreferredReceipt,
  writeIfChanged,
} from './generate-website-benchmark-snapshot.ts'
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'fs'
import { join, resolve } from 'path'
import { tmpdir } from 'os'

const cleanupDirs: string[] = []

afterEach(() => {
  while (cleanupDirs.length > 0) {
    const dir = cleanupDirs.pop()
    if (dir) {
      rmSync(dir, { recursive: true, force: true })
    }
  }
})

function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  cleanupDirs.push(dir)
  return dir
}

describe('generate-website-benchmark-snapshot helpers', () => {
  test('parseArgs keeps the generated snapshot under website/lib by default', () => {
    const options = parseArgs([])

    expect(options.outFile.endsWith('website\\lib\\benchmarkSnapshot.generated.json')).toBe(true)
    expect(options.check).toBe(false)
    expect(options.terminalBenchSubmissionUrl).toContain('terminal-bench-2-leaderboard')
  })

  test('rejects null-byte and directory paths as receipt candidates', () => {
    const dir = makeTempDir('openjaws-snapshot-path-')
    const file = resolve(dir, 'receipt.json')
    writeFileSync(file, '{}\n', 'utf8')

    expect(isValidExistingReceiptPath(file)).toBe(true)
    expect(isValidExistingReceiptPath(`${dir}\0`)).toBe(false)
    expect(isValidExistingReceiptPath(dir)).toBe(false)
  })

  test('resolves the newest matching receipt with a safe glob path', () => {
    const dir = makeTempDir('openjaws-snapshot-glob-')
    const olderDir = resolve(dir, 'q-bridgebench-live-older')
    const newerDir = resolve(dir, 'q-bridgebench-live-newer')
    mkdirSync(olderDir, { recursive: true })
    mkdirSync(newerDir, { recursive: true })

    const olderReceipt = resolve(olderDir, 'bridgebench-report.json')
    const newerReceipt = resolve(newerDir, 'bridgebench-report.json')
    writeFileSync(olderReceipt, '{}\n', 'utf8')
    writeFileSync(newerReceipt, '{}\n', 'utf8')
    utimesSync(olderReceipt, new Date('2026-04-16T00:00:00.000Z'), new Date('2026-04-16T00:00:00.000Z'))
    utimesSync(newerReceipt, new Date('2026-04-17T00:00:00.000Z'), new Date('2026-04-17T00:00:00.000Z'))

    const resolved = resolveLatestReceipt(
      [resolve(dir, 'q-bridgebench-live-*', 'bridgebench-report.json')],
      olderReceipt,
    )

    expect(resolved).toBe(newerReceipt)
  })

  test('collectMatchingReceiptPaths returns newest-first matches for a pattern tier', () => {
    const dir = makeTempDir('openjaws-snapshot-collect-')
    const olderDir = resolve(dir, 'q-soak-live-older')
    const newerDir = resolve(dir, 'q-soak-live-newer')
    mkdirSync(olderDir, { recursive: true })
    mkdirSync(newerDir, { recursive: true })

    const olderReceipt = resolve(olderDir, 'q-soak-report.json')
    const newerReceipt = resolve(newerDir, 'q-soak-report.json')
    writeFileSync(olderReceipt, '{}\n', 'utf8')
    writeFileSync(newerReceipt, '{}\n', 'utf8')
    utimesSync(olderReceipt, new Date('2026-04-16T00:00:00.000Z'), new Date('2026-04-16T00:00:00.000Z'))
    utimesSync(newerReceipt, new Date('2026-04-17T00:00:00.000Z'), new Date('2026-04-17T00:00:00.000Z'))

    expect(
      collectMatchingReceiptPaths([resolve(dir, 'q-soak-live-*', 'q-soak-report.json')]),
    ).toEqual([newerReceipt, olderReceipt])
  })

  test('prefers the first matching pattern over newer lower-priority matches', () => {
    const dir = makeTempDir('openjaws-snapshot-priority-')
    const preferredDir = resolve(dir, 'q-bridgebench-live-priority')
    const fallbackDir = resolve(dir, 'q-bridgebench-dryrun-latest')
    mkdirSync(preferredDir, { recursive: true })
    mkdirSync(fallbackDir, { recursive: true })

    const preferredReceipt = resolve(preferredDir, 'bridgebench-report.json')
    const fallbackReceipt = resolve(fallbackDir, 'bridgebench-report.json')
    writeFileSync(preferredReceipt, '{}\n', 'utf8')
    writeFileSync(fallbackReceipt, '{}\n', 'utf8')
    utimesSync(preferredReceipt, new Date('2026-04-16T00:00:00.000Z'), new Date('2026-04-16T00:00:00.000Z'))
    utimesSync(fallbackReceipt, new Date('2026-04-17T00:00:00.000Z'), new Date('2026-04-17T00:00:00.000Z'))

    const resolved = resolveLatestReceipt(
      [
        resolve(dir, 'q-bridgebench-live-*', 'bridgebench-report.json'),
        resolve(dir, 'q-bridgebench-*', 'bridgebench-report.json'),
      ],
      fallbackReceipt,
    )

    expect(resolved).toBe(preferredReceipt)
  })

  test('builds an auth-missing W&B summary when the key is absent', () => {
    expect(
      buildWandbSummary({
        enabled: true,
        apiKeyPresent: false,
        source: 'env',
        url: 'https://wandb.ai/example/run',
      }),
    ).toEqual({
      status: 'auth missing',
      enabled: false,
      source: 'env',
      summary:
        'A live W&B project target was configured for this benchmark pass, but no local WANDB login/API key was available, so the receipts stayed local only.',
    })
  })

  test('resolveLatestPreferredReceipt prefers the newest receipt that matches the predicate', () => {
    const dir = makeTempDir('openjaws-snapshot-preferred-')
    const newestFailedDir = resolve(dir, 'q-soak-live-newest-failed')
    const olderPassedDir = resolve(dir, 'q-soak-live-older-passed')
    mkdirSync(newestFailedDir, { recursive: true })
    mkdirSync(olderPassedDir, { recursive: true })

    const newestFailedReceipt = resolve(newestFailedDir, 'q-soak-report.json')
    const olderPassedReceipt = resolve(olderPassedDir, 'q-soak-report.json')
    writeFileSync(newestFailedReceipt, '{}\n', 'utf8')
    writeFileSync(olderPassedReceipt, '{}\n', 'utf8')
    utimesSync(
      newestFailedReceipt,
      new Date('2026-04-17T00:00:00.000Z'),
      new Date('2026-04-17T00:00:00.000Z'),
    )
    utimesSync(
      olderPassedReceipt,
      new Date('2026-04-16T00:00:00.000Z'),
      new Date('2026-04-16T00:00:00.000Z'),
    )

    const resolved = resolveLatestPreferredReceipt(
      [resolve(dir, 'q-soak-live-*', 'q-soak-report.json')],
      newestFailedReceipt,
      patterns => collectMatchingReceiptPaths(patterns),
      path =>
        path === olderPassedReceipt
          ? ({ summary: { successCount: 52, errorCount: 0 } } as const)
          : ({ summary: { successCount: 2, errorCount: 2 } } as const),
      receipt => receipt.summary.successCount > 0 && receipt.summary.errorCount === 0,
    )

    expect(resolved).toBe(olderPassedReceipt)
  })
})

describe('generate-website-benchmark-snapshot integration helpers', () => {
  test('buildSnapshot composes the website snapshot from typed receipt inputs', () => {
    const options = parseArgs([
      '--terminalbench-submission-url',
      'https://example.com/submission',
    ])

    const fakePaths = {
      bridge: 'fake://bridgebench',
      soak: 'fake://soak',
      terminal: 'fake://terminalbench',
      terminalSoak: 'fake://terminalbench-soak',
      wandb: 'fake://wandb',
    }

    const snapshot = buildSnapshot(options, {
      resolveLatestReceipt: (patterns, fallbackPath) => {
        if (patterns.some(pattern => pattern.includes('q-terminalbench-official-public-'))) {
          return fakePaths.terminal
        }
        if (patterns.some(pattern => pattern.includes('q-terminalbench-soak-live-'))) {
          return fakePaths.terminalSoak
        }
        return fallbackPath
      },
      collectMatchingReceiptPaths: patterns => {
        const first = patterns[0] ?? ''
        if (first.includes('q-bridgebench-live-')) {
          return [fakePaths.bridge, fakePaths.wandb]
        }
        if (first.includes('q-soak-live-')) {
          return [fakePaths.soak]
        }
        if (first.includes('q-terminalbench-official-public-')) {
          return [fakePaths.terminal]
        }
        if (first.includes('q-terminalbench-soak-live-')) {
          return [fakePaths.terminalSoak]
        }
        return []
      },
      readJson: path => {
        switch (path) {
          case fakePaths.bridge:
            return {
              benchmarkId: 'bridge-1',
              generatedAt: '2026-04-16T00:00:00.000Z',
              bestResult: {
                pack: 'all',
                score: 42.11,
                summary: 'BridgeBench summary',
              },
            }
          case fakePaths.soak:
            return {
              runId: 'soak-1',
              generatedAt: '2026-04-16T00:05:00.000Z',
              durationMinutes: 30,
              summary: {
                totalProbes: 52,
                successCount: 52,
                errorCount: 0,
                byMode: {
                  openjaws: { latencyMs: { p95: 1200 } },
                  'oci-q': { latencyMs: { p95: 800 } },
                },
              },
            }
          case fakePaths.terminal:
            return {
              runId: 'terminal-1',
              generatedAt: '2026-04-16T00:10:00.000Z',
              officialSubmission: true,
              status: 'completed_with_errors',
              tasks: [{ taskName: 'terminal-bench/circuit-fibsqrt' }],
              aggregate: {
                totalTrials: 5,
                executionErrorTrials: 0,
                benchmarkFailedTrials: 5,
                avgReward: 0,
              },
              agent: 'openjaws',
              model: 'oci:Q',
            }
          case fakePaths.terminalSoak:
            return {
              runId: 'terminal-soak-1',
              generatedAt: '2026-04-16T00:12:00.000Z',
              status: 'completed_with_errors',
              tasks: [{ taskName: 'terminal-bench/circuit-fibsqrt' }],
              cycles: [{}, {}],
              aggregate: {
                totalTrials: 4,
                executionErrorTrials: 1,
                benchmarkFailedTrials: 2,
              },
            }
          case fakePaths.wandb:
            return {
              generatedAt: '2026-04-16T00:15:00.000Z',
              wandb: {
                enabled: true,
                apiKeyPresent: false,
                source: 'env',
              },
            }
          default:
            throw new Error(`Unexpected path ${path}`)
        }
      },
    })

    expect(snapshot.generatedAt).toBe('2026-04-16T00:15:00.000Z')
    expect(snapshot.bridgeBench.bestPack).toBe('all')
    expect(snapshot.bridgeBench.scorePercent).toBe(42.11)
    expect(snapshot.soak.summary).toContain('52/52 probes succeeded')
    expect(snapshot.terminalBench.scope).toBe('Official TerminalBench 2.0 public task record')
    expect(snapshot.terminalBench.status).toBe('completed_with_errors')
    expect(snapshot.terminalBench.submissionState).toBe('task_recorded')
    expect(snapshot.terminalBench.benchmarkFailedTrials).toBe(5)
    expect(snapshot.terminalBench.summary).toContain('public task discussion')
    expect(snapshot.terminalBench.summary).toContain('5 benchmark-failing trials')
    expect(snapshot.terminalBenchSoak.cycleCount).toBe(2)
    expect(snapshot.wandb.status).toBe('auth missing')
    expect(snapshot.source).toBe(buildPublicBenchmarkSource())
  })

  test('buildSnapshot prefers the latest clean soak and the latest authful W&B receipt', () => {
    const options = parseArgs([])

    const fakePaths = {
      bridgePreferred: 'fake://bridgebench-preferred',
      bridgeWandb: 'fake://bridgebench-wandb',
      soakPreferred: 'fake://soak-preferred',
      soakFailed: 'fake://soak-failed',
      terminal: 'fake://terminalbench',
      terminalSoak: 'fake://terminalbench-soak',
    }

    const snapshot = buildSnapshot(options, {
      resolveLatestReceipt: (patterns, fallbackPath) => {
        if (patterns.some(pattern => pattern.includes('q-terminalbench-official-public-'))) {
          return fakePaths.terminal
        }
        if (patterns.some(pattern => pattern.includes('q-terminalbench-soak-live-'))) {
          return fakePaths.terminalSoak
        }
        return fallbackPath
      },
      collectMatchingReceiptPaths: patterns => {
        const first = patterns[0] ?? ''
        if (first.includes('q-bridgebench-live-')) {
          return [fakePaths.bridgePreferred, fakePaths.bridgeWandb]
        }
        if (first.includes('q-soak-live-')) {
          return [fakePaths.soakFailed, fakePaths.soakPreferred]
        }
        return []
      },
      readJson: path => {
        switch (path) {
          case fakePaths.bridgePreferred:
            return {
              benchmarkId: 'bridge-preferred',
              generatedAt: '2026-04-18T01:12:14.192Z',
              bestResult: {
                pack: 'all',
                score: 42.11,
                summary: 'All pack · 42.11% mean token accuracy · score 42.11 · 1 eval sample',
              },
              wandb: {
                enabled: false,
                source: 'none',
              },
            }
          case fakePaths.bridgeWandb:
            return {
              benchmarkId: 'bridge-wandb',
              generatedAt: '2026-04-16T00:41:13.181Z',
              bestResult: null,
              wandb: {
                enabled: true,
                apiKeyPresent: false,
                source: 'cli',
                url: 'https://wandb.ai/example/project',
              },
            }
          case fakePaths.soakPreferred:
            return {
              runId: 'soak-clean',
              generatedAt: '2026-04-16T00:53:06.000Z',
              durationMinutes: 30,
              summary: {
                totalProbes: 52,
                successCount: 52,
                errorCount: 0,
                byMode: {
                  openjaws: { latencyMs: { p95: 8455 } },
                  'oci-q': { latencyMs: { p95: 4254 } },
                },
              },
            }
          case fakePaths.soakFailed:
            return {
              runId: 'soak-failed',
              generatedAt: '2026-04-18T01:10:33.420Z',
              durationMinutes: 5,
              summary: {
                totalProbes: 4,
                successCount: 2,
                errorCount: 2,
              },
            }
          case fakePaths.terminal:
            return {
              runId: 'terminal-1',
              generatedAt: '2026-04-16T16:07:08.000Z',
              officialSubmission: true,
              tasks: [{ taskName: 'circuit-fibsqrt' }],
              aggregate: {
                totalTrials: 5,
                executionErrorTrials: 0,
                avgReward: 0,
              },
              agent: 'openjaws',
              model: 'oci:Q',
            }
          case fakePaths.terminalSoak:
            return {
              runId: 'terminal-soak-1',
              generatedAt: '2026-04-17T00:11:59.000Z',
              status: 'completed_with_errors',
              tasks: [{ taskName: 'terminal-bench/circuit-fibsqrt' }],
              cycles: [{}, {}],
              aggregate: {
                totalTrials: 2,
                executionErrorTrials: 0,
                benchmarkFailedTrials: 2,
              },
            }
          default:
            throw new Error(`Unexpected path ${path}`)
        }
      },
    })

    expect(snapshot.bridgeBench.benchmarkId).toBe('bridge-preferred')
    expect(snapshot.soak.runId).toBe('soak-clean')
    expect(snapshot.soak.summary).toContain('30-minute bounded soak.')
    expect(snapshot.wandb.status).toBe('auth missing')
    expect(snapshot.wandb.url).toBeUndefined()
  })

  test('buildSnapshot derives completed_with_errors from benchmark-failing trials when receipt status is absent', () => {
    const options = parseArgs(['--terminalbench-submission-url', 'none'])

    const fakePaths = {
      bridge: 'fake://bridgebench',
      soak: 'fake://soak',
      terminal: 'fake://terminalbench',
      terminalSoak: 'fake://terminalbench-soak',
      wandb: 'fake://wandb',
    }

    const snapshot = buildSnapshot(options, {
      resolveLatestReceipt: (patterns, fallbackPath) => {
        if (patterns.some(pattern => pattern.includes('q-terminalbench-official-public-'))) {
          return fakePaths.terminal
        }
        if (patterns.some(pattern => pattern.includes('q-terminalbench-soak-live-'))) {
          return fakePaths.terminalSoak
        }
        return fallbackPath
      },
      collectMatchingReceiptPaths: patterns => {
        const first = patterns[0] ?? ''
        if (first.includes('q-bridgebench-live-')) {
          return [fakePaths.bridge, fakePaths.wandb]
        }
        if (first.includes('q-soak-live-')) {
          return [fakePaths.soak]
        }
        return []
      },
      readJson: path => {
        switch (path) {
          case fakePaths.bridge:
            return {
              benchmarkId: 'bridge-1',
              generatedAt: '2026-04-16T00:00:00.000Z',
              bestResult: {
                pack: 'all',
                score: 42.11,
                summary: 'BridgeBench summary',
              },
            }
          case fakePaths.soak:
            return {
              runId: 'soak-1',
              generatedAt: '2026-04-16T00:05:00.000Z',
              durationMinutes: 30,
              summary: {
                totalProbes: 52,
                successCount: 52,
                errorCount: 0,
              },
            }
          case fakePaths.terminal:
            return {
              runId: 'terminal-1',
              generatedAt: '2026-04-16T00:10:00.000Z',
              officialSubmission: true,
              tasks: [{ taskName: 'terminal-bench/circuit-fibsqrt' }],
              aggregate: {
                totalTrials: 5,
                executionErrorTrials: 0,
                benchmarkFailedTrials: 3,
                avgReward: 0,
              },
              agent: 'openjaws',
              model: 'oci:Q',
            }
          case fakePaths.terminalSoak:
            return {
              runId: 'terminal-soak-1',
              generatedAt: '2026-04-16T00:12:00.000Z',
              status: 'completed',
              tasks: [{ taskName: 'terminal-bench/circuit-fibsqrt' }],
              cycles: [{}, {}],
              aggregate: {
                totalTrials: 4,
                executionErrorTrials: 0,
                benchmarkFailedTrials: 0,
              },
            }
          case fakePaths.wandb:
            return {
              generatedAt: '2026-04-16T00:15:00.000Z',
              wandb: {
                enabled: false,
                apiKeyPresent: false,
                source: 'none',
              },
            }
          default:
            throw new Error(`Unexpected path ${path}`)
        }
      },
    })

    expect(snapshot.terminalBench.status).toBe('completed_with_errors')
    expect(snapshot.terminalBench.submissionState).toBe('local_only')
    expect(snapshot.terminalBench.benchmarkFailedTrials).toBe(3)
  })

  test('writeIfChanged only touches disk when the content changes', () => {
    const dir = makeTempDir('openjaws-snapshot-write-')
    const file = resolve(dir, 'benchmarkSnapshot.generated.json')

    expect(writeIfChanged(file, '{"status":"ok"}\n')).toBe(true)
    expect(writeIfChanged(file, '{"status":"ok"}\n')).toBe(false)
    expect(writeIfChanged(file, '{"status":"updated"}\n')).toBe(true)
  })

  test('buildSnapshotForCheck falls back to the committed snapshot when receipts are unavailable', () => {
    const dir = makeTempDir('openjaws-snapshot-check-')
    const outFile = resolve(dir, 'benchmarkSnapshot.generated.json')
    const fallbackSnapshot = {
      generatedAt: '2026-04-17T00:00:00.000Z',
      source: 'checked-in snapshot fallback',
      bridgeBench: {
        benchmarkId: 'fallback-bridge',
        bestPack: 'all',
        scorePercent: 42.11,
        summary: 'Fallback bridge summary',
      },
      soak: {
        runId: 'fallback-soak',
        durationMinutes: 30,
        totalProbes: 52,
        successCount: 52,
        errorCount: 0,
        summary: 'Fallback soak summary',
      },
      terminalBench: {
        runId: 'fallback-terminal',
        taskName: 'circuit-fibsqrt',
        scope: 'Official TerminalBench 2.0 public task',
        status: 'completed_with_errors',
        submissionState: 'submitted',
        agent: 'openjaws',
        model: 'oci:Q',
        outcome: 'reward 0.0 // 5 trials',
        executionErrorTrials: 0,
        benchmarkFailedTrials: 5,
        summary: 'Fallback terminal summary',
        submissionUrl: 'https://example.com/submission',
      },
      terminalBenchSoak: {
        runId: 'fallback-terminal-soak',
        taskName: 'terminal-bench/circuit-fibsqrt',
        status: 'completed_with_errors',
        cycleCount: 2,
        totalTrials: 2,
        executionErrorTrials: 0,
        benchmarkFailedTrials: 2,
        summary: 'Fallback terminal soak summary',
      },
      wandb: {
        status: 'auth missing',
        enabled: false,
        source: 'env',
        summary: 'Fallback wandb summary',
      },
    }
    writeFileSync(outFile, `${JSON.stringify(fallbackSnapshot, null, 2)}\n`, 'utf8')

    const options = {
      ...parseArgs([]),
      check: true,
      outFile,
    }

    const snapshot = buildSnapshotForCheck(options, {
      resolveLatestReceipt: (_patterns, fallbackPath) => fallbackPath,
      collectMatchingReceiptPaths: () => [],
      readJson: path => {
        if (path === outFile) {
          return fallbackSnapshot
        }
        throw new Error(`Required benchmark receipt not found: ${path}`)
      },
    })

    expect(snapshot).toEqual(fallbackSnapshot)
  })
})
