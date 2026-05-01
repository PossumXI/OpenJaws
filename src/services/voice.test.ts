import { describe, expect, test } from 'bun:test'

describe('voice optional native capture', () => {
  test('imports and reports availability even when native capture is absent', async () => {
    const { checkRecordingAvailability } = await import('./voice.ts')
    const availability = await checkRecordingAvailability()

    expect(typeof availability.available).toBe('boolean')
    expect(
      availability.reason === null || typeof availability.reason === 'string',
    ).toBe(true)
  })
})
