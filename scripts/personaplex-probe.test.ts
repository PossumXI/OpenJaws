import { describe, expect, test } from 'bun:test'
import { mkdirSync, writeFileSync } from 'fs'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import {
  buildPersonaPlexLauncherWarnings,
  buildPersonaPlexRepairHint,
  buildPersonaPlexRuntimeStateDiagnostic,
  buildPersonaPlexProbeWebSocketUrl,
  parseArgs,
  probePersonaPlexRuntime,
  readRuntimeState,
  redactSensitiveText,
  redactPersonaPlexProbeWebSocketUrl,
  resolvePersonaPlexLauncherPath,
  resolvePersonaPlexRuntimeStatePath,
  resolvePersonaPlexStationRoot,
  sanitizePersonaPlexRuntimeState,
  sanitizePersonaPlexProbeResultForOutput,
  selectPersonaPlexProbeRuntimeUrl,
  validatePersonaPlexRuntimeUrl,
} from './personaplex-probe.ts'

function createStation(files: string[] = []) {
  const root = mkdtempSync(join(tmpdir(), 'openjaws-personaplex-probe-'))
  const station = join(root, 'local-command-station')
  mkdirSync(station, { recursive: true })
  for (const file of files) {
    const target = join(station, file)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, '# test\n', 'utf8')
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

  test('redacts configured prompts before probe output is logged', () => {
    const websocketUrl =
      'ws://127.0.0.1:8998/api/chat?text_prompt=private+operator+text&voice_prompt=NATF2.pt'

    expect(redactPersonaPlexProbeWebSocketUrl(websocketUrl)).toBe(
      'ws://127.0.0.1:8998/api/chat?text_prompt=%5Bconfigured%5D&voice_prompt=%5Bconfigured%5D',
    )
    expect(
      sanitizePersonaPlexProbeResultForOutput({
        status: 'error',
        ready: false,
        runtimeUrl: 'http://127.0.0.1:8998',
        websocketUrl,
        voicePrompt: 'NATF2.pt',
        textPrompt: 'private operator text',
        latencyMs: 3,
        firstByte: null,
        messageType: null,
        runtimeState: null,
        runtimeUrlSource: 'default',
        ignoredStateRuntimeUrl: null,
        repair: {
          status: 'start_required',
          summary: 'start required',
          command: 'pwsh',
          args: [],
          stationRoot: 'station',
          launcherPath: 'launcher',
          missing: [],
          warnings: [],
        },
      }),
    ).toMatchObject({
      websocketUrl:
        'ws://127.0.0.1:8998/api/chat?text_prompt=%5Bconfigured%5D&voice_prompt=%5Bconfigured%5D',
      textPrompt: '[configured]',
      voicePrompt: '[configured]',
    })
  })

  test('parseArgs keeps the probe bounded and explicit', () => {
    expect(
      parseArgs([
        '--json',
        '--url',
        'http://127.0.0.1:8998',
        '--timeout-ms',
        '250',
        '--station-root',
        'D:\\openjaws\\OpenJaws\\local-command-station',
        '--runtime-state-path',
        'D:\\openjaws\\OpenJaws\\local-command-station\\personaplex-runtime\\runtime.json',
        '--launcher-path',
        'D:\\openjaws\\OpenJaws\\local-command-station\\start-personaplex-voice.ps1',
        '--voice-prompt',
        'NATF2.pt',
      ]),
    ).toMatchObject({
      json: true,
      allowRemote: false,
      runtimeUrl: 'http://127.0.0.1:8998',
      timeoutMs: 1000,
      stationRoot: 'D:\\openjaws\\OpenJaws\\local-command-station',
      runtimeStatePath:
        'D:\\openjaws\\OpenJaws\\local-command-station\\personaplex-runtime\\runtime.json',
      launcherPath:
        'D:\\openjaws\\OpenJaws\\local-command-station\\start-personaplex-voice.ps1',
      voicePrompt: 'NATF2.pt',
    })
  })

  test('resolves explicit operator station paths for release audits', () => {
    const root = createStation(['start-personaplex-voice.ps1'])
    const stationRoot = join(root, 'local-command-station')
    const runtimeStatePath = join(stationRoot, 'personaplex-runtime', 'runtime.json')
    const launcherPath = join(stationRoot, 'start-personaplex-voice.ps1')

    expect(resolvePersonaPlexStationRoot({ stationRoot })).toBe(stationRoot)
    expect(
      resolvePersonaPlexRuntimeStatePath({ stationRoot, runtimeStatePath }),
    ).toBe(runtimeStatePath)
    expect(resolvePersonaPlexLauncherPath({ stationRoot, launcherPath })).toBe(
      launcherPath,
    )
  })

  test('warns on generated PersonaPlex scripts with inline secrets without leaking values', () => {
    const root = createStation(['start-personaplex-voice.ps1'])
    const stationRoot = join(root, 'local-command-station')
    const generatedScript = join(
      stationRoot,
      'personaplex-runtime',
      'start-personaplex-wsl.sh',
    )
    mkdirSync(dirname(generatedScript), { recursive: true })
    writeFileSync(
      generatedScript,
      "export HF_TOKEN='hf_test_secret_value_that_should_not_log'\n",
      'utf8',
    )

    const warnings = buildPersonaPlexLauncherWarnings({
      stationRoot,
      launcherPath: join(stationRoot, 'start-personaplex-voice.ps1'),
    })

    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('inline secret assignment detected')
    expect(warnings[0]).toContain('start-personaplex-wsl.sh')
    expect(warnings[0]).not.toContain('hf_test_secret_value')
  })

  test('only probes loopback PersonaPlex endpoints by default', async () => {
    expect(
      validatePersonaPlexRuntimeUrl({
        runtimeUrl: 'http://127.0.0.1:8998',
        allowRemote: false,
      }),
    ).toBeNull()
    expect(
      validatePersonaPlexRuntimeUrl({
        runtimeUrl: 'https://example.com/personaplex',
        allowRemote: false,
      }),
    ).toContain('loopback')
    expect(
      validatePersonaPlexRuntimeUrl({
        runtimeUrl: 'https://example.com/personaplex',
        allowRemote: true,
      }),
    ).toBeNull()
  })

  test('rejects runtime URLs with credentials before opening WebSockets', async () => {
    const result = await probePersonaPlexRuntime({
      json: true,
      allowRemote: true,
      timeoutMs: 1000,
      runtimeUrl: 'https://user:secret@example.com/personaplex',
      textPrompt: 'hello',
      voicePrompt: 'NATF2.pt',
    })

    expect(result.ready).toBe(false)
    expect(result.error).toContain('must not include credentials')
  })

  test('sanitizes runtime state before it reaches artifacts', () => {
    expect(
      sanitizePersonaPlexRuntimeState({
        runtimeMode: 'wsl',
        wslPid: 407,
        token: 'should-not-appear',
        runtimeUrl: 'http://127.0.0.1:8998/api/chat?token=abc',
        lastError:
          'failed with Authorization: Bearer super-secret at https://example.com/api?token=abc',
      }),
    ).toEqual({
      runtimeMode: 'wsl',
      runtimeUrl: 'http://127.0.0.1:8998/api/chat?token=%5Bredacted%5D',
      wslPid: 407,
      lastError:
        'failed with Authorization: Bearer [redacted] at https://example.com/api?token=%5Bredacted%5D',
    })
    expect(redactSensitiveText('password=hunter2 token:abc')).toBe(
      'password=[redacted] token:[redacted]',
    )
  })

  test('returns a bounded runtime-state diagnostic for malformed JSON', () => {
    const root = createStation([])
    const runtimeDir = join(root, 'local-command-station', 'personaplex-runtime')
    mkdirSync(runtimeDir, { recursive: true })
    const runtimePath = join(runtimeDir, 'runtime.json')
    writeFileSync(runtimePath, '{"token":', 'utf8')

    expect(readRuntimeState(runtimePath)).toMatchObject({
      status: 'unreadable',
      error: expect.stringContaining('runtime_state_unreadable'),
    })
  })

  test('reports invalid runtime URLs as structured probe errors', async () => {
    const result = await probePersonaPlexRuntime({
      json: true,
      allowRemote: false,
      timeoutMs: 1000,
      runtimeUrl: 'not a url',
      textPrompt: 'hello',
      voicePrompt: 'NATF2.pt',
    })

    expect(result.ready).toBe(false)
    expect(result.status).toBe('error')
    expect(result.error).toContain('Invalid PersonaPlex runtime URL')
    expect(result.repair.status).toBe('start_required')
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
