import { describe, expect, test } from 'bun:test'
import { mkdirSync, writeFileSync } from 'fs'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  buildPersonaPlexRepairHint,
  buildPersonaPlexRuntimeStateDiagnostic,
  buildPersonaPlexProbeWebSocketUrl,
  parseArgs,
  selectPersonaPlexProbeRuntimeUrl,
} from './personaplex-probe.ts'

function createStation(files: string[] = []) {
  const root = mkdtempSync(join(tmpdir(), 'openjaws-personaplex-probe-'))
  const station = join(root, 'local-command-station')
  mkdirSync(station, { recursive: true })
  for (const file of files) {
    writeFileSync(join(station, file), '# test\n', 'utf8')
  }
  return root
}

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

  test('builds a non-secret local repair hint for a failed runtime', () => {
    const root = createStation(['start-personaplex-voice.ps1'])
    const hint = buildPersonaPlexRepairHint({
      root,
      ready: false,
      state: {
        runtimeMode: 'wsl',
        failedAt: '2026-04-25T04:13:41.859Z',
        healthyAt: null,
      },
    })

    expect(hint.status).toBe('runtime_failed')
    expect(hint.command).toBe('pwsh')
    expect(hint.args).toContain('-File')
    expect(hint.launcherPath.endsWith('start-personaplex-voice.ps1')).toBe(true)
    expect(hint.missing).toEqual([])
  })

  test('reports missing local launcher before operators try to repair', () => {
    const root = createStation([])
    const hint = buildPersonaPlexRepairHint({
      root,
      ready: false,
      state: null,
    })

    expect(hint.status).toBe('start_required')
    expect(hint.missing.some(item => item.endsWith('start-personaplex-voice.ps1'))).toBe(true)
  })
})
