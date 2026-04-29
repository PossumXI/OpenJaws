import { describe, expect, test } from 'bun:test'
import {
  buildPersonaPlexProbeWebSocketUrl,
  parseArgs,
} from './personaplex-probe.ts'

describe('personaplex-probe', () => {
  test('builds the PersonaPlex chat websocket url with required prompts', () => {
    expect(
      buildPersonaPlexProbeWebSocketUrl({
        runtimeUrl: 'http://127.0.0.1:8998',
        textPrompt: 'You enjoy having a good conversation.',
        voicePrompt: 'NATF2.pt',
      }),
    ).toBe(
      'ws://127.0.0.1:8998/api/chat?text_prompt=You+enjoy+having+a+good+conversation.&voice_prompt=NATF2.pt',
    )
  })

  test('parseArgs keeps the probe bounded and explicit', () => {
    expect(
      parseArgs([
        '--json',
        '--url',
        'http://127.0.0.1:8998',
        '--timeout-ms',
        '250',
        '--voice-prompt',
        'NATF2.pt',
      ]),
    ).toMatchObject({
      json: true,
      runtimeUrl: 'http://127.0.0.1:8998',
      timeoutMs: 1000,
      voicePrompt: 'NATF2.pt',
    })
  })
})
