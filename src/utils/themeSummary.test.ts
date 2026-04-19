import { describe, expect, test } from 'bun:test'
import { describeThemeSetting, formatThemeName } from './themeSummary.js'

describe('themeSummary', () => {
  test('formats human-readable theme labels', () => {
    expect(formatThemeName('dark')).toBe('Dark')
    expect(formatThemeName('light')).toBe('Light')
    expect(formatThemeName('opencheeks-light')).toBe('OpenCheeks light')
    expect(formatThemeName('dark-ansi')).toBe('Dark (ANSI)')
  })

  test('describes auto mode using the currently rendered theme', () => {
    expect(describeThemeSetting('auto', 'dark')).toBe('Auto -> Dark')
    expect(describeThemeSetting('auto', 'light')).toBe('Auto -> Light')
  })

  test('describes explicit mode using the rendered theme label', () => {
    expect(describeThemeSetting('dark', 'dark')).toBe('Dark')
    expect(describeThemeSetting('light-daltonized', 'light-daltonized')).toBe(
      'Light (colorblind-friendly)',
    )
  })
})
