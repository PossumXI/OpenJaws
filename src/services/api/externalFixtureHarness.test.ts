import { describe, expect, test } from 'bun:test'
import {
  replayOpenAICompatibleFixture,
  type OpenAICompatibleReplayFixture,
} from './externalFixtureHarness.js'

async function loadFixture(
  name: string,
): Promise<OpenAICompatibleReplayFixture> {
  return (await Bun.file(
    new URL(`./fixtures/${name}.json`, import.meta.url),
  ).json()) as OpenAICompatibleReplayFixture
}

describe('replayOpenAICompatibleFixture', () => {
  test('replays Gemini thought-signature fixture end to end', async () => {
    const fixture = await loadFixture('gemini-thought-signature-round')
    const replay = replayOpenAICompatibleFixture(fixture)

    expect(replay.outgoingMessages[1]).toMatchObject({
      role: 'assistant',
      tool_calls: [
        {
          id: 'toolu_1',
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
    expect(replay.assistantContent).toHaveLength(4)
    expect(replay.assistantContent[1]).toEqual({
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
    expect(replay.stopReason).toBe('tool_use')
  })

  test('replays legacy dedupe fixture without emitting duplicate Read tool calls', async () => {
    const fixture = await loadFixture('legacy-function-call-dedupe')
    const replay = replayOpenAICompatibleFixture(fixture)

    expect(replay.assistantContent).toHaveLength(3)
    expect(
      replay.assistantContent.filter(
        block => block.type === 'tool_use' && block.name === 'Read',
      ),
    ).toHaveLength(1)
    expect(replay.assistantContent).toMatchObject([
      {
        type: 'tool_use',
        id: 'call_1',
        name: 'Bash',
        input: {
          command: 'pwd',
        },
      },
      {
        type: 'tool_use',
        name: 'Read',
        input: {
          file_path: 'README.md',
        },
      },
      {
        type: 'tool_use',
        id: 'call_3',
        name: 'Glob',
        input: {
          pattern: 'src/**/*.ts',
        },
      },
    ])
    expect(replay.stopReason).toBe('tool_use')
  })
})
