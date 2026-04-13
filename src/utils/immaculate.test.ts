import { describe, expect, test } from 'bun:test'
import {
  appendImmaculateSystemPrompt,
  buildImmaculateSystemPrompt,
  getImmaculateMode,
  getImmaculateStatus,
  isImmaculateEnabled,
} from './immaculate.js'

describe('immaculate orchestration policy', () => {
  test('defaults to enabled balanced mode', () => {
    expect(isImmaculateEnabled({})).toBe(true)
    expect(getImmaculateMode({})).toBe('balanced')
    expect(getImmaculateStatus({})).toEqual({
      enabled: true,
      mode: 'balanced',
      label: 'on · balanced',
    })
    expect(buildImmaculateSystemPrompt({})).toContain(
      '# Immaculate orchestration',
    )
  })

  test('can be disabled explicitly', () => {
    const settings = {
      immaculate: {
        enabled: false,
      },
    }

    expect(isImmaculateEnabled(settings)).toBe(false)
    expect(buildImmaculateSystemPrompt(settings)).toBeNull()
    expect(appendImmaculateSystemPrompt(['base prompt'], settings)).toEqual([
      'base prompt',
    ])
  })

  test('adds stricter verification guidance in strict mode', () => {
    const settings = {
      immaculate: {
        mode: 'strict',
      },
    }

    expect(getImmaculateMode(settings)).toBe('strict')
    expect(buildImmaculateSystemPrompt(settings)).toContain(
      'treat conflicting or partial results as unverified',
    )
  })

  test('appends the policy once without duplicating it', () => {
    const first = appendImmaculateSystemPrompt(['base prompt'], {})
    const second = appendImmaculateSystemPrompt(first, {})

    expect(first).toHaveLength(2)
    expect(first[1]).toContain('# Immaculate orchestration')
    expect(second).toEqual(first)
  })
})
