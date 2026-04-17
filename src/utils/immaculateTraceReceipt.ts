import { createHash } from 'crypto'
import { readFileSync, statSync } from 'fs'
import {
  readImmaculateTraceSummary,
  type ImmaculateTraceSummary,
} from '../immaculate/traceSummary.js'

export type ImmaculateTraceReference = {
  path: string
  sha256: string
  bytes: number
  eventCount: number
  sessionId: string
  startedAt: string | null
  endedAt: string | null
  lastTimestamp: string | null
  countsByType: Record<string, number>
}

export function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

export function buildImmaculateTraceReference(
  path: string,
  summary = readImmaculateTraceSummary(path),
): ImmaculateTraceReference {
  return {
    path,
    sha256: sha256File(path),
    bytes: statSync(path).size,
    eventCount: summary.eventCount,
    sessionId: summary.sessionId,
    startedAt: summary.startedAt,
    endedAt: summary.endedAt,
    lastTimestamp: summary.lastTimestamp,
    countsByType: summary.countsByType,
  }
}

export function collectImmaculateTraceReferences(
  paths: string[],
): ImmaculateTraceReference[] {
  return paths.map(path => buildImmaculateTraceReference(path))
}
