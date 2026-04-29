import { describe, expect, test } from 'bun:test'
import {
  executeCommandWithHardTimeout,
  inspectFeatureSourceModules,
  inspectRequiredProjectFiles,
  normalizeJsonCommandStatus,
} from './system-check.ts'

describe('system-check JSON status normalization', () => {
  test('promotes nested warning reports to warning checks', () => {
    expect(
      normalizeJsonCommandStatus({
        status: 'passed',
        summary: 'runtime coherence passed',
        details: { status: 'warning' },
      }),
    ).toEqual({
      status: 'warning',
      summary: 'runtime coherence passed; JSON reported warning',
    })
  })

  test('promotes nested failures unless the check explicitly allows failure', () => {
    expect(
      normalizeJsonCommandStatus({
        status: 'passed',
        summary: 'runtime coherence passed',
        details: { overallStatus: 'failed' },
      }),
    ).toEqual({
      status: 'failed',
      summary: 'runtime coherence passed; JSON reported failure',
    })

    expect(
      normalizeJsonCommandStatus({
        status: 'passed',
        summary: 'runtime coherence passed',
        details: { overallStatus: 'failed' },
        allowFailure: true,
      }),
    ).toEqual({
      status: 'warning',
      summary: 'runtime coherence passed; JSON reported allowed failure',
    })
  })
})

describe('system-check feature source inspection', () => {
  test('maps bundled .js specifiers back to TypeScript source files', () => {
    const importerPath = 'D:\\repo\\src\\main.tsx'
    const present = new Set([
      'D:\\repo\\src\\server\\parseConnectUrl.ts',
      'D:\\repo\\src\\server\\server.ts',
    ])

    expect(
      inspectFeatureSourceModules({
        importerPath,
        specifiers: [
          './server/parseConnectUrl.js',
          './server/server.js',
          './server/backends/dangerousBackend.js',
        ],
        exists: path => present.has(path),
      }),
    ).toEqual([
      {
        specifier: './server/parseConnectUrl.js',
        sourcePath: 'D:\\repo\\src\\server\\parseConnectUrl.ts',
        present: true,
      },
      {
        specifier: './server/server.js',
        sourcePath: 'D:\\repo\\src\\server\\server.ts',
        present: true,
      },
      {
        specifier: './server/backends/dangerousBackend.js',
        sourcePath: 'D:\\repo\\src\\server\\backends\\dangerousBackend.ts',
        present: false,
      },
    ])
  })

  test('reports required operator release files by project-relative path', () => {
    const rootPath = 'D:\\repo'
    const present = new Set([
      'D:\\repo\\scripts\\discord-agent-auth-preflight.ts',
      'D:\\repo\\src\\utils\\discordGovernedWeb.ts',
    ])

    expect(
      inspectRequiredProjectFiles({
        rootPath,
        relativePaths: [
          'scripts/discord-agent-auth-preflight.ts',
          'src/utils/discordGovernedWeb.ts',
          'src/utils/discordRoundtableRuntime.ts',
        ],
        exists: path => present.has(path),
      }),
    ).toEqual([
      {
        relativePath: 'scripts/discord-agent-auth-preflight.ts',
        path: 'D:\\repo\\scripts\\discord-agent-auth-preflight.ts',
        present: true,
      },
      {
        relativePath: 'src/utils/discordGovernedWeb.ts',
        path: 'D:\\repo\\src\\utils\\discordGovernedWeb.ts',
        present: true,
      },
      {
        relativePath: 'src/utils/discordRoundtableRuntime.ts',
        path: 'D:\\repo\\src\\utils\\discordRoundtableRuntime.ts',
        present: false,
      },
    ])
  })
})

describe('system-check command execution', () => {
  test('hard timeout terminates a hanging command', async () => {
    const result = await executeCommandWithHardTimeout(
      'bun',
      ['-e', 'setInterval(() => {}, 1000)'],
      { timeoutMs: 100 },
    )

    expect(result).toMatchObject({
      timedOut: true,
      exitCode: null,
    })
    expect(result.stderr).toContain('Command timed out')
  })
})
