import { describe, expect, test } from 'bun:test'
import {
  buildOpenAICompatibleAssistantContent,
  buildOpenAICompatibleMessages,
  getOpenAICompatibleToolCalls,
  mapOpenAICompatibleStopReason,
  normalizeToolArgumentsFromString,
} from './externalInterop.js'

describe('external provider tool-call interop', () => {
  test('normalizes fenced and trailing-comma JSON tool arguments', () => {
    expect(
      normalizeToolArgumentsFromString(
        '```json\n{"command":"pwd",}\n```',
      ),
    ).toEqual({
      command: 'pwd',
    })
  })

  test('extracts tool calls from tool_calls, legacy function_call, and content parts without duplicating them', () => {
    const toolCalls = getOpenAICompatibleToolCalls({
      role: 'assistant',
      tool_calls: [
        {
          id: 'call_1',
          function: {
            name: 'Bash',
            arguments: '{"command":"pwd"}',
          },
        },
      ],
      function_call: {
        name: 'Read',
        arguments: '{"file_path":"README.md"}',
      },
      content: [
        {
          type: 'tool_call',
          id: 'call_2',
          function: {
            name: 'Read',
            arguments: '{"file_path":"README.md"}',
          },
        },
        {
          type: 'tool_call',
          id: 'call_3',
          function: {
            name: 'Glob',
            arguments: '{"pattern":"src/**/*.ts"}',
          },
        },
      ],
    })

    expect(toolCalls).toHaveLength(3)
    expect(toolCalls.map(call => call.function?.name)).toEqual([
      'Bash',
      'Read',
      'Glob',
    ])
  })

  test('preserves Gemini thought signatures when translating outgoing assistant tool use', () => {
    const messages = buildOpenAICompatibleMessages({
      system: [{ text: 'system prompt' }],
      messages: [
        {
          type: 'assistant',
          message: {
            content: [
              {
                type: 'text',
                text: 'Listing files.',
              },
              {
                type: 'tool_use',
                id: 'toolu_1',
                name: 'Bash',
                input: '{"command":"ls"}',
                extra_content: {
                  google: {
                    thought_signature: 'sig_123',
                  },
                },
              },
            ],
          },
        },
      ],
    })

    expect(messages).toHaveLength(2)
    expect(messages[1]).toMatchObject({
      role: 'assistant',
      tool_calls: [
        {
          id: 'toolu_1',
          type: 'function',
          extra_content: {
            google: {
              thought_signature: 'sig_123',
            },
          },
          function: {
            name: 'Bash',
            arguments: '{"command":"ls"}',
          },
        },
      ],
    })
  })

  test('builds assistant tool_use blocks from mixed OpenAI-compatible payload shapes', () => {
    const payload = {
      model: 'gemini-3.1-pro-preview',
      choices: [
        {
          finish_reason: 'stop',
          message: {
            role: 'assistant',
            content: [
              {
                type: 'text',
                text: 'I need to inspect the working directory.',
              },
              {
                type: 'tool_call',
                id: 'call_part',
                function: {
                  name: 'Read',
                  arguments: '{"file_path":"package.json"}',
                },
              },
            ],
            tool_calls: [
              {
                id: 'call_main',
                extra_content: {
                  google: {
                    thought_signature: 'sig_456',
                  },
                },
                function: {
                  name: 'Bash',
                  arguments: '```json\n{"command":"pwd",}\n```',
                },
              },
            ],
            function_call: {
              name: 'Glob',
              arguments: '{"pattern":"src/**/*.ts"}',
            },
          },
        },
      ],
    }

    const content = buildOpenAICompatibleAssistantContent(payload)

    expect(content).toHaveLength(4)
    expect(content[0]).toEqual({
      type: 'text',
      text: 'I need to inspect the working directory.',
    })
    expect(content[1]).toEqual({
      type: 'tool_use',
      id: 'call_main',
      name: 'Bash',
      input: {
        command: 'pwd',
      },
      extra_content: {
        google: {
          thought_signature: 'sig_456',
        },
      },
    })
    expect(content[2]).toMatchObject({
      type: 'tool_use',
      name: 'Glob',
      input: {
        pattern: 'src/**/*.ts',
      },
    })
    expect(typeof (content[2] as { id?: unknown }).id).toBe('string')
    expect(content[3]).toEqual({
      type: 'tool_use',
      id: 'call_part',
      name: 'Read',
      input: {
        file_path: 'package.json',
      },
    })
  })

  test('marks stop reason as tool_use whenever tool calls are present even if finish_reason is stop', () => {
    const payload = {
      choices: [
        {
          finish_reason: 'stop',
          message: {
            role: 'assistant',
            content: [
              {
                type: 'tool_call',
                id: 'call_1',
                function: {
                  name: 'Bash',
                  arguments: '{"command":"pwd"}',
                },
              },
            ],
          },
        },
      ],
    }

    expect(mapOpenAICompatibleStopReason(payload)).toBe('tool_use')
  })
})
