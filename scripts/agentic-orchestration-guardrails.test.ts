import { describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'
import {
  buildAgenticOrchestrationGuardrailRules,
  evaluateGuardrailRules,
  parseArgs,
  runAgenticOrchestrationGuardrailAudit,
  type GuardrailRule,
} from './agentic-orchestration-guardrails.ts'

function writeText(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, text, 'utf8')
}

describe('agentic orchestration guardrails', () => {
  test('evaluates a passing rule against explicit fragments', () => {
    const root = mkdtempSync(join(tmpdir(), 'openjaws-agentic-guard-pass-'))
    try {
      writeText(join(root, 'one.ts'), 'alpha beta gamma')
      const rules: GuardrailRule[] = [
        {
          id: 'sample',
          title: 'Sample rule',
          category: 'docs',
          why: 'test',
          files: [
            {
              path: 'one.ts',
              fragments: ['alpha', 'gamma'],
            },
          ],
        },
      ]

      const report = evaluateGuardrailRules({
        root,
        rules,
        now: new Date('2026-04-30T00:00:00.000Z'),
      })

      expect(report.ok).toBe(true)
      expect(report.counts).toEqual({ passed: 1, failed: 0 })
      expect(report.results[0]).toMatchObject({
        id: 'sample',
        status: 'passed',
        missingFiles: [],
        missingFragments: [],
      })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test('reports missing files and fragments without reading outside root', () => {
    const root = mkdtempSync(join(tmpdir(), 'openjaws-agentic-guard-fail-'))
    try {
      writeText(join(root, 'one.ts'), 'alpha only')
      const rules: GuardrailRule[] = [
        {
          id: 'sample',
          title: 'Sample rule',
          category: 'docs',
          why: 'test',
          files: [
            {
              path: 'one.ts',
              fragments: ['alpha', 'missing'],
            },
            {
              path: '..\\outside.ts',
              fragments: ['never'],
            },
            {
              path: 'absent.ts',
              fragments: ['never'],
            },
          ],
        },
      ]

      const report = evaluateGuardrailRules({
        root,
        rules,
        now: new Date('2026-04-30T00:00:00.000Z'),
      })

      expect(report.ok).toBe(false)
      expect(report.counts).toEqual({ passed: 0, failed: 1 })
      expect(report.results[0]?.missingFiles).toEqual([
        '..\\outside.ts',
        'absent.ts',
      ])
      expect(report.results[0]?.missingFragments).toEqual([
        {
          path: 'one.ts',
          fragment: 'missing',
        },
      ])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test('keeps the real repo guardrail suite green', () => {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
    const report = runAgenticOrchestrationGuardrailAudit({
      root,
      now: new Date('2026-04-30T00:00:00.000Z'),
    })

    expect(report.ok).toBe(true)
    expect(report.results).toHaveLength(
      buildAgenticOrchestrationGuardrailRules().length,
    )
  })

  test('parses CLI options', () => {
    expect(parseArgs(['--json', '--root', '.', '--out', '.tmp/guard.json']))
      .toMatchObject({
        json: true,
        root: resolve('.'),
        outPath: resolve('.tmp/guard.json'),
      })
  })
})
