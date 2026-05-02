import { describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  buildBenchmarkSeedEnv,
  DEFAULT_Q_BENCHMARK_SEED,
  resolveDeterministicSeed,
  resolveDefaultHarborCommand,
  resolveQPreflightRequirementsForBench,
} from './preflight.js'

describe('q preflight helpers', () => {
  test('falls back to the shared deterministic seed', () => {
    expect(resolveDeterministicSeed(null)).toBe(DEFAULT_Q_BENCHMARK_SEED)
    expect(resolveDeterministicSeed(7)).toBe(7)
  })

  test('builds a shared seed env bundle for downstream tools', () => {
    expect(buildBenchmarkSeedEnv(42)).toEqual({
      OPENJAWS_BENCHMARK_SEED: '42',
      SEED: '42',
      PYTHONHASHSEED: '42',
    })
  })

  test('exposes stable preflight presets per benchmark lane', () => {
    expect(resolveQPreflightRequirementsForBench('bridgebench')).toEqual([
      'bundle-manifest',
      'python-runtime',
      'oci-q-runtime',
    ])
    expect(resolveQPreflightRequirementsForBench('soak')).toEqual([
      'openjaws-binary',
      'oci-q-runtime',
    ])
    expect(resolveQPreflightRequirementsForBench('terminalbench')).toEqual([
      'harbor',
      'docker',
      'openjaws-provider-preflight',
      'clock-skew',
    ])
  })

  test('finds repo-local Harbor from a linked worktree through git common dir', () => {
    const root = mkdtempSync(join(tmpdir(), 'openjaws-harbor-main-'))
    const worktree = mkdtempSync(join(tmpdir(), 'openjaws-harbor-worktree-'))
    const harborExecutable = process.platform === 'win32' ? 'harbor.exe' : 'harbor'
    const harborPath = join(
      root,
      '.tools',
      'harbor-venv',
      'Scripts',
      harborExecutable,
    )
    mkdirSync(join(root, '.tools', 'harbor-venv', 'Scripts'), {
      recursive: true,
    })
    mkdirSync(join(root, '.git'), { recursive: true })
    writeFileSync(harborPath, '')

    expect(
      resolveDefaultHarborCommand({
        cwd: worktree,
        env: {},
        gitCommonDir: join(root, '.git'),
      }),
    ).toBe(harborPath)
  })
})
