import { describe, expect, test } from 'bun:test'
import {
  buildPersonaPlexRuntimeStateDiagnostic,
  buildPersonaPlexProbeWebSocketUrl,
  parseArgs,
  selectPersonaPlexProbeRuntimeUrl,
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

  test('summarizes stale runtime state for failed probes', () => {
    expect(
      buildPersonaPlexRuntimeStateDiagnostic(
        {
          runtimeMode: 'windows',
          processId: 10452,
          healthyAt: '2026-04-25T03:13:41.859Z',
        },
        Date.parse('2026-04-25T05:13:41.859Z'),
      ),
    ).toBe('mode windows, pid 10452, last healthy 2h ago')
  })

  test('includes launcher lastError diagnostics from runtime state', () => {
    expect(
      buildPersonaPlexRuntimeStateDiagnostic(
        {
          runtimeMode: 'wsl',
          wslPid: 407,
          failedAt: '2026-04-25T04:13:41.859Z',
          lastError:
            'PersonaPlex listener was bound, but ws://host:port/api/chat did not produce the expected hello frame.',
        },
        Date.parse('2026-04-25T04:15:41.859Z'),
      ),
    ).toBe(
      'mode wsl, pid 407, failed 2m ago, last error PersonaPlex listener was bound, but ws://host:port/api/chat did not produce the expected hello frame.',
    )
  })

  test('ignores failed runtime state when no later healthy marker exists', () => {
    expect(
      selectPersonaPlexProbeRuntimeUrl({
        runtimeUrl: null,
        state: {
          runtimeUrl: 'http://127.0.0.1:9555',
          failedAt: '2026-04-25T04:13:41.859Z',
          healthyAt: null,
        },
      }),
    ).toEqual({
      runtimeUrl: 'http://127.0.0.1:8998',
      runtimeUrlSource: 'default',
      ignoredStateRuntimeUrl: 'http://127.0.0.1:9555',
    })
  })

  test('keeps state runtime url when health is newer than failure', () => {
    expect(
      selectPersonaPlexProbeRuntimeUrl({
        runtimeUrl: null,
        state: {
          runtimeUrl: 'http://127.0.0.1:9555',
          failedAt: '2026-04-25T04:13:41.859Z',
          healthyAt: '2026-04-25T04:14:41.859Z',
        },
      }),
    ).toMatchObject({
      runtimeUrl: 'http://127.0.0.1:9555',
      runtimeUrlSource: 'state',
      ignoredStateRuntimeUrl: null,
    })
  })
})
