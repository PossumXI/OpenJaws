import { describe, expect, test } from 'bun:test'
import { parseArgs } from './roundtable-runtime.ts'

describe('roundtable-runtime CLI options', () => {
  test('status-only mode disables action execution', () => {
    expect(parseArgs(['--status-only']).maxActionsPerRun).toBe(0)
  })

  test('max-actions accepts zero for bounded status checks', () => {
    expect(parseArgs(['--max-actions', '0']).maxActionsPerRun).toBe(0)
  })

  test('parses a positive execution timeout override', () => {
    expect(parseArgs(['--timeout-ms', '45000']).timeoutMs).toBe(45_000)
  })

  test('keeps the default timeout when the override is invalid', () => {
    expect(parseArgs(['--timeout-ms', '0']).timeoutMs).toBeUndefined()
  })
})
