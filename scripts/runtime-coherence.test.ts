import { describe, expect, test } from 'bun:test'
import { buildPersonaPlexCoherenceProbe } from './runtime-coherence.ts'

describe('runtime-coherence PersonaPlex mapping', () => {
  test('maps a ready PersonaPlex probe into a reachable coherence probe', () => {
    expect(
      buildPersonaPlexCoherenceProbe({
        status: 'ok',
        ready: true,
        runtimeUrl: 'http://127.0.0.1:8998',
        websocketUrl:
          'ws://127.0.0.1:8998/api/chat?text_prompt=private&voice_prompt=NATF2.pt',
        voicePrompt: 'NATF2.pt',
        textPrompt: 'hello',
        latencyMs: 42,
        firstByte: 0,
        messageType: 'binary',
        runtimeState: null,
        runtimeUrlSource: 'default',
        ignoredStateRuntimeUrl: null,
        repair: {
          status: 'ready',
          summary: 'PersonaPlex bridge is ready; no repair action is required.',
          command: 'pwsh',
          args: ['-NoProfile'],
          stationRoot: 'station',
          launcherPath: 'launcher',
          missing: [],
        },
      }),
    ).toEqual({
      label: 'PersonaPlex',
      url:
        'ws://127.0.0.1:8998/api/chat?text_prompt=%5Bconfigured%5D&voice_prompt=%5Bconfigured%5D',
      reachable: true,
      status: null,
      detail: 'http://127.0.0.1:8998 hello byte 0 in 42ms',
    })
  })

  test('keeps PersonaPlex failures actionable in runtime coherence', () => {
    const probe = buildPersonaPlexCoherenceProbe({
      status: 'error',
      ready: false,
      runtimeUrl: 'http://127.0.0.1:8998',
      websocketUrl: 'ws://127.0.0.1:8998/api/chat',
      voicePrompt: 'NATF2.pt',
      textPrompt: 'hello',
      latencyMs: 10,
      firstByte: null,
      messageType: null,
      runtimeState: null,
      runtimeUrlSource: 'default',
      ignoredStateRuntimeUrl: null,
      error: 'PersonaPlex WebSocket error',
      repair: {
        status: 'start_required',
        summary:
          'PersonaPlex runtime is not answering the voice WebSocket; start it with the local voice launcher on the operator machine.',
        command: 'pwsh',
        args: ['-NoProfile'],
        stationRoot: 'station',
        launcherPath: 'launcher',
        missing: [],
      },
    })

    expect(probe.reachable).toBe(false)
    expect(probe.status).toBe('error')
    expect(probe.detail).toContain('PersonaPlex WebSocket error')
    expect(probe.detail).toContain('start it with the local voice launcher')
  })
})
