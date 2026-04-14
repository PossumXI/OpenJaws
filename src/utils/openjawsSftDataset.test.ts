import { describe, expect, it } from 'bun:test'
import {
  buildOpenJawsSftSamples,
  extractVisibleTranscriptText,
} from './openjawsSftDataset.js'

describe('extractVisibleTranscriptText', () => {
  it('keeps only text blocks from array content', () => {
    expect(
      extractVisibleTranscriptText([
        { type: 'text', text: 'alpha' },
        { type: 'tool_use', id: 'tool_1', name: 'Bash' },
        { type: 'text', text: 'beta' },
      ]),
    ).toBe('alpha\n\nbeta')
  })

  it('strips ansi escapes from string content', () => {
    expect(extractVisibleTranscriptText('\u001b[1mhello\u001b[22m')).toBe(
      'hello',
    )
  })
})

describe('buildOpenJawsSftSamples', () => {
  it('builds user-assistant pairs and skips command noise', () => {
    const samples = buildOpenJawsSftSamples(
      [
        {
          type: 'user',
          sessionId: 'session-1',
          cwd: 'D:\\openjaws\\OpenJaws',
          timestamp: '2026-04-11T15:00:00.000Z',
          message: {
            role: 'user',
            content:
              '<command-name>/provider</command-name>\n<command-message>provider</command-message>',
          },
        },
        {
          type: 'user',
          sessionId: 'session-1',
          cwd: 'D:\\openjaws\\OpenJaws',
          timestamp: '2026-04-11T15:01:00.000Z',
          message: {
            role: 'user',
            content: 'look at the auth path',
          },
        },
        {
          type: 'assistant',
          sessionId: 'session-1',
          cwd: 'D:\\openjaws\\OpenJaws',
          timestamp: '2026-04-11T15:01:05.000Z',
          message: {
            role: 'assistant',
            model: 'q',
            content: [{ type: 'text', text: 'Auth failure is in the key load.' }],
          },
        },
      ],
      'D:\\sessions\\demo.jsonl',
    )

    expect(samples).toHaveLength(1)
    expect(samples[0]).toEqual({
      messages: [
        {
          role: 'user',
          content: 'look at the auth path',
        },
        {
          role: 'assistant',
          content: 'Auth failure is in the key load.',
        },
      ],
      metadata: {
        sessionId: 'session-1',
        cwd: 'D:\\openjaws\\OpenJaws',
        transcriptPath: 'D:\\sessions\\demo.jsonl',
        userTimestamp: '2026-04-11T15:01:00.000Z',
        assistantTimestamp: '2026-04-11T15:01:05.000Z',
        assistantModel: 'q',
        isSidechain: false,
      },
    })
  })

  it('skips sidechain samples unless explicitly included', () => {
    const entries = [
      {
        type: 'user',
        sessionId: 'session-1',
        isSidechain: true,
        message: {
          role: 'user',
          content: 'scan the repo',
        },
      },
      {
        type: 'assistant',
        sessionId: 'session-1',
        isSidechain: true,
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'Scanning.' }],
        },
      },
    ]

    expect(buildOpenJawsSftSamples(entries, 'D:\\sessions\\agent.jsonl')).toEqual(
      [],
    )
    expect(
      buildOpenJawsSftSamples(entries, 'D:\\sessions\\agent.jsonl', {
        includeSidechains: true,
      }),
    ).toHaveLength(1)
  })

  it('drops greeting-only low-signal prompts by default', () => {
    const entries = [
      {
        type: 'user',
        sessionId: 'session-1',
        message: {
          role: 'user',
          content: 'hello',
        },
      },
      {
        type: 'assistant',
        sessionId: 'session-1',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'Hello there.' }],
        },
      },
    ]

    expect(buildOpenJawsSftSamples(entries, 'D:\\sessions\\hello.jsonl')).toEqual(
      [],
    )
    expect(
      buildOpenJawsSftSamples(entries, 'D:\\sessions\\hello.jsonl', {
        includeLowSignal: true,
      }),
    ).toHaveLength(1)
  })
})
