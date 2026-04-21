import { describe, expect, test } from 'bun:test'
import {
  buildBenchmarkSeedEnv,
  DEFAULT_Q_BENCHMARK_SEED,
  resolveDeterministicSeed,
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
})
