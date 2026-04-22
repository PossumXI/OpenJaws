import { describe, expect, test } from 'bun:test'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
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
      'q-provider-runtime',
    ])
    expect(resolveQPreflightRequirementsForBench('soak')).toEqual([
      'openjaws-binary',
      'q-provider-runtime',
    ])
    expect(resolveQPreflightRequirementsForBench('terminalbench')).toEqual([
      'harbor',
      'docker',
      'openjaws-provider-preflight',
      'clock-skew',
    ])
  })

  test('prefers the repo-local Harbor wrapper on Windows when it exists', () => {
    if (process.platform !== 'win32') {
      return
    }

    const root = mkdtempSync(join(tmpdir(), 'oj-harbor-wrapper-'))
    const previousCwd = process.cwd()
    try {
      mkdirSync(join(root, 'scripts'), { recursive: true })
      writeFileSync(join(root, 'scripts', 'harbor-cli.cmd'), '@echo off\r\n', 'utf8')
      process.chdir(root)
      expect(resolveDefaultHarborCommand()).toBe(
        join(root, 'scripts', 'harbor-cli.cmd'),
      )
    } finally {
      process.chdir(previousCwd)
      rmSync(root, { recursive: true, force: true })
    }
  })
})
