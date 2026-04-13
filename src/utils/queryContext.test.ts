import { describe, expect, test } from 'bun:test'
import { mergeLiveImmaculateSystemContext } from './queryContext.js'

describe('mergeLiveImmaculateSystemContext', () => {
  test('adds a fresh immaculate context when available', () => {
    expect(
      mergeLiveImmaculateSystemContext(
        { gitStatus: 'clean' },
        'Immaculate live context',
      ),
    ).toEqual({
      gitStatus: 'clean',
      immaculate: 'Immaculate live context',
    })
  })

  test('preserves the existing system context when no live immaculate context exists', () => {
    const systemContext = { gitStatus: 'clean' }
    expect(mergeLiveImmaculateSystemContext(systemContext, null)).toEqual(
      systemContext,
    )
  })
})
