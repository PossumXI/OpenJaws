import { existsSync } from 'fs'
import { resolve } from 'path'
import {
  readImmaculateTraceSummary,
  type ImmaculateTraceSummary,
} from '../immaculate/traceSummary.js'

export type QTraceSummary = ImmaculateTraceSummary & {
  kind: 'benchmark'
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

export function readLatestQTraceSummary(root = process.cwd()): QTraceSummary | null {
  const latestPath = listQTraceFiles(root)[0]
  if (!latestPath) {
    return null
  }
  try {
    return {
      ...readImmaculateTraceSummary(latestPath),
      kind: 'benchmark',
    }
  } catch {
    return null
  }
}
