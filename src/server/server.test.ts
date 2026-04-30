import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { existsSync } from 'fs'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { startServer, type DirectConnectServerHandle } from './server.js'
import type { SessionManager } from './sessionManager.js'
import type { ServerLogger } from './serverLog.js'

const originalClaudeConfigDir = process.env.CLAUDE_CONFIG_DIR
const originalOpenJawsConfigDir = process.env.OPENJAWS_CONFIG_DIR

const logger: ServerLogger = {
  info() {},
  warn() {},
  error() {},
}

function createSessionManagerStub(): SessionManager {
  return {
    listSessions: () => [],
    createSession: async () => {
      throw new Error('session creation is not used by browser preview tests')
    },
    attachWebSocket: () => false,
    detachWebSocket: () => {},
    sendToSession: () => false,
  } as unknown as SessionManager
}

describe('Direct Connect browser preview API', () => {
  let configDir: string
  let server: DirectConnectServerHandle | null
  let baseUrl: string

  beforeEach(async () => {
    configDir = await mkdtemp(join(tmpdir(), 'openjaws-browser-server-'))
    process.env.CLAUDE_CONFIG_DIR = configDir
    process.env.OPENJAWS_CONFIG_DIR = configDir
    server = startServer(
      {
        host: '127.0.0.1',
        port: 0,
        authToken: 'test-token',
      },
      createSessionManagerStub(),
      logger,
    )
    baseUrl = `http://127.0.0.1:${server.port}`
  })

  afterEach(async () => {
    server?.stop(true)
    server = null
    if (originalClaudeConfigDir === undefined) {
      delete process.env.CLAUDE_CONFIG_DIR
    } else {
      process.env.CLAUDE_CONFIG_DIR = originalClaudeConfigDir
    }
    if (originalOpenJawsConfigDir === undefined) {
      delete process.env.OPENJAWS_CONFIG_DIR
    } else {
      process.env.OPENJAWS_CONFIG_DIR = originalOpenJawsConfigDir
    }
    await rm(configDir, { recursive: true, force: true })
  })

  function authHeaders(extra?: HeadersInit): HeadersInit {
    return {
      authorization: 'Bearer test-token',
      ...(extra ?? {}),
    }
  }

  test('keeps browser preview endpoints behind Direct Connect auth', async () => {
    const response = await fetch(`${baseUrl}/browser/capabilities`)

    expect(response.status).toBe(401)
  })

  test('serves browser capabilities through the authenticated backend API', async () => {
    const response = await fetch(`${baseUrl}/browser/capabilities`, {
      headers: authHeaders(),
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.data.endpoints.demoHarness).toBe('POST /browser/demo-harness')
  })

  test('rejects wrong methods and invalid browser action values', async () => {
    const wrongMethod = await fetch(`${baseUrl}/browser/open`, {
      headers: authHeaders(),
    })
    expect(wrongMethod.status).toBe(400)
    expect(await wrongMethod.json()).toMatchObject({
      error: 'bad_request',
      message: 'open requires POST.',
    })

    const invalidIntent = await fetch(`${baseUrl}/browser/open`, {
      method: 'POST',
      headers: authHeaders({ 'content-type': 'application/json' }),
      body: JSON.stringify({
        url: 'https://example.com',
        intent: 'sideways',
      }),
    })
    expect(invalidIntent.status).toBe(400)
    expect((await invalidIntent.json()).message).toContain(
      'Unsupported browser preview intent "sideways"',
    )
  })

  test('writes Playwright demo harness packages from the backend API', async () => {
    const outputDir = join(configDir, 'api-demo')
    const response = await fetch(`${baseUrl}/browser/demo-harness`, {
      method: 'POST',
      headers: authHeaders({ 'content-type': 'application/json' }),
      body: JSON.stringify({
        url: 'localhost:5173',
        name: 'Backend Browser Preview Demo',
        outputDir,
      }),
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.data.harness.outputDir).toBe(outputDir)
    expect(existsSync(join(outputDir, 'playwright.config.ts'))).toBe(true)
    expect(existsSync(join(outputDir, 'tests', 'demo.spec.ts'))).toBe(true)
  })
})
