import { describe, expect, test } from 'bun:test'
import {
  applySedSubstitution,
  parseSedEditCommand,
  type SedEditInfo,
} from './sedEditParser.js'

function sedInfo(overrides: Partial<SedEditInfo>): SedEditInfo {
  return {
    filePath: 'file.txt',
    pattern: '',
    replacement: 'X',
    flags: 'g',
    extendedRegex: false,
    ...overrides,
  }
}

describe('sed edit parser', () => {
  test('parses a simple in-place substitution command', () => {
    expect(parseSedEditCommand("sed -i 's/foo/bar/g' file.txt")).toEqual({
      filePath: 'file.txt',
      pattern: 'foo',
      replacement: 'bar',
      flags: 'g',
      extendedRegex: false,
    })
  })

  test('keeps unescaped BRE plus as a literal character', () => {
    const output = applySedSubstitution(
      'a+b aaab',
      sedInfo({ pattern: 'a+b' }),
    )

    expect(output).toBe('X aaab')
  })

  test('converts escaped BRE plus into a JavaScript quantifier', () => {
    const output = applySedSubstitution(
      'ab aaab a+b',
      sedInfo({ pattern: 'a\\+b' }),
    )

    expect(output).toBe('X X a+b')
  })

  test('preserves ERE plus as a quantifier when -E or -r is active', () => {
    const output = applySedSubstitution(
      'ab aaab a+b',
      sedInfo({ pattern: 'a+b', extendedRegex: true }),
    )

    expect(output).toBe('X X a+b')
  })

  test('keeps a doubled BRE backslash as a literal backslash match', () => {
    const output = applySedSubstitution(
      'a\\b aab',
      sedInfo({ pattern: 'a\\\\b' }),
    )

    expect(output).toBe('X aab')
  })

  test('treats sentinel-looking pattern bytes as literal input', () => {
    const sentinel = '\x00PLUS\x00'
    const output = applySedSubstitution(
      `x${sentinel}y xy`,
      sedInfo({ pattern: `x${sentinel}y`, flags: '' }),
    )

    expect(output).toBe('X xy')
  })

  test('returns original content when the converted regex is invalid', () => {
    const content = 'unchanged'

    expect(
      applySedSubstitution(
        content,
        sedInfo({ pattern: '[', extendedRegex: true }),
      ),
    ).toBe(content)
  })
})
