import { describe, expect, test } from 'bun:test'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { evaluateBridgeBenchPackPreflight } from './q-bridgebench.ts'

describe('q-bridgebench preflight guard', () => {
  test('marks local q CPU runs as remote_required when host memory is too tight', () => {
    const sandbox = mkdtempSync(join(tmpdir(), 'q-bridgebench-'))
    const trainFile = join(sandbox, 'bundle', 'train.jsonl')
    mkdirSync(join(sandbox, 'bundle'), { recursive: true })
    writeFileSync(trainFile, '{"messages":[]}\n', 'utf8')

    const preflight = evaluateBridgeBenchPackPreflight({
      baseModel: 'q',
      trainFile,
      python: 'python',
      useCpu: true,
      modelBytes: 16_000_000_000,
      availableMemoryBytes: 1_200_000_000,
      totalMemoryBytes: 8_000_000_000,
    })

    expect(preflight.decision).toBe('remote_required')
    expect(preflight.reasonCode).toBe('insufficient_host_memory')

    rmSync(sandbox, { force: true, recursive: true })
  })
})
