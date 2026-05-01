import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { fileURLToPath } from 'url'
import {
  assertQTrainingRequirementsCoverModules,
  buildQTrainingEnvCommandPlan,
  parseQTrainingEnvBootstrapArgs,
  Q_TRAINING_REQUIRED_MODULES,
  resolveQTrainingRequirementsPath,
} from './q-training-env-bootstrap.ts'

const repoRoot = resolve(fileURLToPath(import.meta.url), '..', '..')

describe('q-training-env-bootstrap', () => {
  test('parses explicit Q training environment bootstrap options', () => {
    expect(
      parseQTrainingEnvBootstrapArgs([
        '--json',
        '--install',
        '--root',
        'D:\\openjaws\\OpenJaws',
        '--python',
        'py',
        '--venv-dir',
        '.tools\\q-venv',
        '--profile',
        'windows-cpu',
        '--timeout-ms',
        '120000',
      ]),
    ).toMatchObject({
      json: true,
      install: true,
      root: 'D:\\openjaws\\OpenJaws',
      python: 'py',
      venvDir: '.tools\\q-venv',
      profile: 'windows-cpu',
      timeoutMs: 120000,
    })
  })

  test('builds argv-only install commands for the local venv', () => {
    const plan = buildQTrainingEnvCommandPlan({
      pythonCommand: 'python',
      venvDir: 'D:\\openjaws\\OpenJaws\\.venv-q',
      venvPython: 'D:\\openjaws\\OpenJaws\\.venv-q\\Scripts\\python.exe',
      requirementsPath:
        'D:\\openjaws\\OpenJaws\\training\\q\\requirements-windows-cpu.txt',
    })

    expect(plan.createVenv).toEqual([
      'python',
      '-m',
      'venv',
      'D:\\openjaws\\OpenJaws\\.venv-q',
    ])
    expect(plan.installRequirements).toEqual([
      'D:\\openjaws\\OpenJaws\\.venv-q\\Scripts\\python.exe',
      '-m',
      'pip',
      'install',
      '-r',
      'D:\\openjaws\\OpenJaws\\training\\q\\requirements-windows-cpu.txt',
    ])
    expect(plan.verifyModules.join(' ')).toContain('evaluate')
  })

  test('keeps both Q requirements profiles aligned with system-check modules', () => {
    for (const profile of ['default', 'windows-cpu'] as const) {
      const requirementsPath = resolveQTrainingRequirementsPath({
        root: repoRoot,
        profile,
      })
      const missing = assertQTrainingRequirementsCoverModules({
        requirementsText: readFileSync(requirementsPath, 'utf8'),
      })

      expect(missing).toEqual([])
    }
  })

  test('detects missing required Q modules in requirements text', () => {
    const missing = assertQTrainingRequirementsCoverModules({
      requirementsText: [
        'torch --index-url https://download.pytorch.org/whl/cpu',
        'transformers>=4.53.0',
      ].join('\n'),
      modules: Q_TRAINING_REQUIRED_MODULES,
    })

    expect(missing).toEqual(['accelerate', 'datasets', 'evaluate', 'peft'])
  })
})
