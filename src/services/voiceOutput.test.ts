import { describe, expect, it } from 'bun:test'
import { summarizeTextForSpeech } from './voiceOutput.js'

describe('summarizeTextForSpeech', () => {
  it('removes fenced code blocks before speaking', () => {
    expect(
      summarizeTextForSpeech(
        'Done. ```ts\nconst secret = 1\n``` Next step is to rerun the tests.',
      ),
    ).toBe('Done. code omitted Next step is to rerun the tests.')
  })

  it('caps long spoken summaries', () => {
    const spoken = summarizeTextForSpeech('x'.repeat(400))
    expect(spoken.length).toBeLessThanOrEqual(280)
    expect(spoken.endsWith('…')).toBe(true)
  })
})
