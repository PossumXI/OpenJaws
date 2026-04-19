import { existsSync } from 'fs'
import { resolve } from 'path'
import {
  readImmaculateTraceSummary,
  selectPreferredImmaculateTraceSummary,
  type ImmaculateTraceSummary,
} from '../immaculate/traceSummary.js'

export type QTraceSummary = ImmaculateTraceSummary & {
  kind: 'benchmark'
}

type QTraceSummaryReadOptions = {
  referenceTimeMs?: number
  activeWindowMs?: number
}

function normalizeGlobPattern(path: string): string {
  return path.replace(/\\/g, '/')
}

export function listQTraceFiles(root = process.cwd()): string[] {
  const patterns = [
    resolve(root, 'artifacts', 'q-*.trace.jsonl'),
    resolve(root, 'artifacts', 'q-*', '*.trace.jsonl'),
    resolve(root, 'artifacts', 'q-*', '**', '*.trace.jsonl'),
  ]

  return Array.from(
    new Set(
      patterns.flatMap(pattern =>
        Array.from(new Bun.Glob(normalizeGlobPattern(pattern)).scanSync()),
      ),
    ),
  )
    .map(path => resolve(path))
    .filter(path => existsSync(path))
    .sort((left, right) => right.localeCompare(left))
}

export function listQTraceSummaries(
  root = process.cwd(),
  options: QTraceSummaryReadOptions = {},
): QTraceSummary[] {
  return listQTraceFiles(root).flatMap(path => {
    try {
      return [
        {
          ...readImmaculateTraceSummary(path, options),
          kind: 'benchmark' as const,
        },
      ]
    } catch {
      return []
    }
  })
}

export function readLatestQTraceSummary(
  root = process.cwd(),
  options: QTraceSummaryReadOptions = {},
): QTraceSummary | null {
  const preferred = selectPreferredImmaculateTraceSummary(
    listQTraceSummaries(root, options),
  )
  return preferred ? { ...preferred, kind: 'benchmark' } : null
}
