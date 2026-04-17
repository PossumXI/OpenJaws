import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  endInteractionSpan,
  endSessionTrace,
  getActiveSessionTracePath,
  logSessionTraceEvent,
  startInteractionSpan,
  startSessionTrace,
} from './sessionTracing.js'

const tempDirs: string[] = []
const previousTraceDir = process.env.OPENJAWS_SESSION_TRACE_DIR

afterEach(() => {
  process.env.OPENJAWS_SESSION_TRACE_DIR = previousTraceDir
  endSessionTrace()
  while (tempDirs.length > 0) {
    const path = tempDirs.pop()
    if (path) {
      rmSync(path, { force: true, recursive: true })
    }
  }
})

describe('session tracing', () => {
  test('writes typed session and span events into the active trace file', () => {
    const traceDir = mkdtempSync(join(tmpdir(), 'openjaws-session-trace-'))
    tempDirs.push(traceDir)
    process.env.OPENJAWS_SESSION_TRACE_DIR = traceDir

    startSessionTrace('session-test')
    const tracePath = getActiveSessionTracePath()
    const span = startInteractionSpan('Help me debug the project latency.')
    endInteractionSpan(span, { accepted: true })
    logSessionTraceEvent('route.dispatched', {
      routeId: 'route-1',
      provider: 'oci',
      model: 'Q',
    })
    endSessionTrace()

    expect(tracePath).toBeTruthy()
    const lines = readFileSync(tracePath!, 'utf8')
      .trim()
      .split(/\r?\n/)
      .map(line => JSON.parse(line) as { type: string })

    expect(lines.map(line => line.type)).toEqual([
      'session.started',
      'interaction.started',
      'interaction.completed',
      'route.dispatched',
      'session.ended',
    ])
  })
})
