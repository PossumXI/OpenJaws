import { describe, expect, it } from 'bun:test'

import { parseArgs } from './roundtable-runtime.js'

describe('roundtable-runtime CLI parsing', () => {
  it('keeps one-shot status reads passive by default', () => {
    const options = parseArgs([])

    expect(options.loop).toBe(false)
    expect(options.steadyState).toBeNull()
    expect(options.maxActionsPerRun).toBe(1)
  })

  it('accepts zero max actions for safe ingest and quarantine drains', () => {
    const options = parseArgs([
      '--no-steady-state',
      '--max-actions',
      '0',
      '--allow-root',
      'D:\\openjaws\\OpenJaws',
    ])

    expect(options.steadyState).toBe(false)
    expect(options.maxActionsPerRun).toBe(0)
    expect(options.allowRoots).toEqual(['D:\\openjaws\\OpenJaws'])
  })

  it('allows explicit one-shot steady-state planning without loop mode', () => {
    const options = parseArgs(['--steady-state', '--channel', 'dev_support'])

    expect(options.loop).toBe(false)
    expect(options.steadyState).toBe(true)
    expect(options.channelName).toBe('dev_support')
  })

  it('keeps loop mode separate from explicit steady-state opt out', () => {
    const options = parseArgs(['--loop', '--no-steady-state'])

    expect(options.loop).toBe(true)
    expect(options.steadyState).toBe(false)
  })
})
