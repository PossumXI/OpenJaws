import { afterEach, describe, expect, test } from 'bun:test'
import {
  buildSnapshot,
  buildWandbSummary,
  isValidExistingReceiptPath,
  parseArgs,
  resolveLatestReceipt,
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
      url: 'https://wandb.ai/example/run',
      summary:
        'A live W&B project target was configured for this benchmark pass, but no local WANDB login/API key was available, so the receipts stayed local only.',
    })
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

    let callIndex = 0
    const snapshot = buildSnapshot(options, {
      resolveLatestReceipt: (_patterns, fallbackPath) => {
        callIndex += 1
        switch (callIndex) {
          case 1:
            return fakePaths.bridge
          case 2:
            return fakePaths.soak
          case 3:
            return fakePaths.terminal
          case 4:
            return fakePaths.terminalSoak
          case 5:
            return fakePaths.wandb
          default:
            return fallbackPath
        }
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
              tasks: [{ taskName: 'terminal-bench/circuit-fibsqrt' }],
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
    expect(snapshot.terminalBench.scope).toBe('Official TerminalBench 2.0 public task')
    expect(snapshot.terminalBench.status).toBe('submitted')
    expect(snapshot.terminalBench.summary).toContain('official leaderboard submission')
    expect(snapshot.terminalBenchSoak.cycleCount).toBe(2)
    expect(snapshot.wandb.status).toBe('auth missing')
    expect(snapshot.source).toContain(fakePaths.bridge)
  })

  test('writeIfChanged only touches disk when the content changes', () => {
    const dir = makeTempDir('openjaws-snapshot-write-')
    const file = resolve(dir, 'benchmarkSnapshot.generated.json')

    expect(writeIfChanged(file, '{"status":"ok"}\n')).toBe(true)
    expect(writeIfChanged(file, '{"status":"ok"}\n')).toBe(false)
    expect(writeIfChanged(file, '{"status":"updated"}\n')).toBe(true)
  })
})
