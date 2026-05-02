import { describe, expect, test } from 'bun:test'
import { parseArgs, shouldRunDynamicPlanner } from './roundtable-runtime.ts'

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

  test('runs the dynamic planner by default during executable passes', () => {
    expect(
      shouldRunDynamicPlanner({
        ...parseArgs([]),
        handoffPaths: [],
      }),
    ).toBe(true)
  })

  test('does not stage dynamic planner handoffs during status-only checks', () => {
    const options = parseArgs(['--status-only'])
    expect(options.maxActionsPerRun).toBe(0)
    expect(shouldRunDynamicPlanner(options)).toBe(false)
  })

  test('does not mix dynamic planner work with explicit handoff execution', () => {
    const options = parseArgs(['--handoff', 'handoff.json'])
    expect(options.handoffPaths).toEqual(['handoff.json'])
    expect(shouldRunDynamicPlanner(options)).toBe(false)
  })

  test('accepts an explicit dynamic planner opt-out', () => {
    const options = parseArgs(['--no-dynamic-planner'])
    expect(options.dynamicPlanner).toBe(false)
    expect(shouldRunDynamicPlanner(options)).toBe(false)
  })
})
