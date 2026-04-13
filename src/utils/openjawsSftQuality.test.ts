import { describe, expect, it } from 'bun:test'
import {
  auditOpenJawsSftSamples,
  detectOpenJawsSftQualityIssues,
  filterCleanPreparedOpenJawsSftSamples,
} from './openjawsSftQuality.js'
import type { OpenJawsSftSample } from './openjawsSftDataset.js'
import type { PreparedOpenJawsSftSample } from './openjawsSftPreparation.js'

function sample(
  user: string,
  assistant: string,
): OpenJawsSftSample & Partial<PreparedOpenJawsSftSample> {
  return {
    messages: [
      { role: 'user', content: user },
      { role: 'assistant', content: assistant },
    ],
    metadata: {
      sessionId: 'session-1',
      cwd: 'D:\\openjaws\\OpenJaws',
      transcriptPath: 'D:\\sessions\\demo.jsonl',
      userTimestamp: null,
      assistantTimestamp: null,
      assistantModel: 'gemma4:e4b',
      isSidechain: false,
    },
    tags: ['agentic'],
    split: 'eval',
    signature: 'sig-1',
  }
}

describe('detectOpenJawsSftQualityIssues', () => {
  it('flags literal-response mismatches for dropping', () => {
    expect(
      detectOpenJawsSftQualityIssues(
        sample(
          'Reply with exactly LOCAL_OK and nothing else.',
          "I'm OpenJaws, a command-line interface for interacting with Claude.",
        ),
      ),
    ).toEqual([
      {
        code: 'exact_literal_mismatch',
        severity: 'drop',
        message:
          'Expected exact literal "LOCAL_OK" but got "I\'m OpenJaws, a command-line interface for interacting with Claude."',
      },
      {
        code: 'literal_prompt_identity_leak',
        severity: 'warning',
        message:
          'Literal-response prompt drifted into assistant self-introduction text.',
      },
    ])
  })

  it('allows exact literal matches through cleanly', () => {
    expect(
      detectOpenJawsSftQualityIssues(
        sample('Reply with exactly GEMINI_OK and nothing else.', 'GEMINI_OK'),
      ),
    ).toEqual([])
  })
})

describe('auditOpenJawsSftSamples', () => {
  it('counts issue classes and dropped samples', () => {
    const audit = auditOpenJawsSftSamples([
      sample('Reply with exactly GEMINI_OK and nothing else.', 'GEMINI_OK'),
      sample(
        'Reply with exactly LOCAL_OK and nothing else.',
        "I'm OpenJaws, a command-line interface for interacting with Claude.",
      ),
    ])

    expect(audit.summary).toEqual({
      totalSamples: 2,
      samplesWithIssues: 1,
      droppedSamples: 1,
      issueCounts: {
        exact_literal_mismatch: 1,
        literal_prompt_identity_leak: 1,
      },
    })
  })
})

describe('filterCleanPreparedOpenJawsSftSamples', () => {
  it('drops prepared samples with hard quality failures', () => {
    const clean = sample(
      'Reply with exactly GEMINI_OK and nothing else.',
      'GEMINI_OK',
    ) as PreparedOpenJawsSftSample
    const bad = sample(
      'Reply with exactly LOCAL_OK and nothing else.',
      "I'm OpenJaws, a command-line interface for interacting with Claude.",
    ) as PreparedOpenJawsSftSample

    expect(filterCleanPreparedOpenJawsSftSamples([clean, bad])).toEqual([clean])
  })
})
