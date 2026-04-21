import { existsSync, readdirSync, statSync } from 'fs'
import { join, resolve } from 'path'
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

export function listQTraceFiles(root = process.cwd()): string[] {
  const artifactsDir = resolve(root, 'artifacts')
  if (!existsSync(artifactsDir)) {
    return []
  }

  const queue: Array<{ dir: string; inQScope: boolean }> = [
    { dir: artifactsDir, inQScope: false },
  ]
  const traces: string[] = []

  while (queue.length > 0) {
    const current = queue.shift()
    if (!current) {
      continue
    }
    const currentDir = current.dir
    let entries: string[]
    try {
      entries = readdirSync(currentDir)
    } catch {
      continue
    }

    for (const entry of entries) {
      if (!entry || entry.includes('\u0000')) {
        continue
      }
      const path = join(currentDir, entry)
      let stats: ReturnType<typeof statSync>
      try {
        stats = statSync(path)
      } catch {
        continue
      }
      if (stats.isDirectory()) {
        const inQScope = current.inQScope || (currentDir === artifactsDir && entry.startsWith('q-'))
        if (inQScope) {
          queue.push({ dir: path, inQScope })
        }
        continue
      }
      if (
        stats.isFile() &&
        entry.endsWith('.trace.jsonl') &&
        (
          (currentDir === artifactsDir && entry.startsWith('q-')) ||
          current.inQScope
        )
      ) {
        traces.push(resolve(path))
      }
    }
  }

  return traces.sort((left, right) => {
    try {
      return statSync(right).mtimeMs - statSync(left).mtimeMs
    } catch {
      return right.localeCompare(left)
    }
  })
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
