import http from 'node:http'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import type {
  LocalJSXCommandContext,
  LocalJSXCommandOnDone,
} from '../src/commands.js'
import { call as providerCommand } from '../src/commands/provider/provider.js'
import { getDefaultAppState, type AppState } from '../src/state/AppStateStore.js'
import { enableConfigs } from '../src/utils/config.js'

async function startProviderServer(expectedApiKey: string): Promise<{
  url: string
  close: () => Promise<void>
}> {
  const server = http.createServer((req, res) => {
    if (req.url === '/models') {
      if (req.headers.authorization !== `Bearer ${expectedApiKey}`) {
        res.statusCode = 401
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify({ message: 'Unauthorized' }))
        return
      }

      res.statusCode = 200
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ data: [{ id: 'Q' }, { id: 'Q-coder' }] }))
      return
    }

    res.statusCode = 404
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ message: 'not found' }))
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })

  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('Failed to start provider probe server')
  }

  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close(error => {
          if (error) {
            reject(error)
            return
          }
          resolve()
        })
      }),
  }
}

async function main(): Promise<void> {
  const expectedApiKey = 'sk-q-live-test'
  const server = await startProviderServer(expectedApiKey)
  const tempConfigDir = mkdtempSync(join(tmpdir(), 'openjaws-provider-probe-'))
  const previousConfigDir = process.env.CLAUDE_CONFIG_DIR
  const previousQBaseUrl = process.env.Q_BASE_URL
  const previousQApiKey = process.env.Q_API_KEY
  const previousOciApiKey = process.env.OCI_API_KEY
  const previousOciGenAiApiKey = process.env.OCI_GENAI_API_KEY

  process.env.CLAUDE_CONFIG_DIR = tempConfigDir
  process.env.Q_BASE_URL = server.url
  delete process.env.Q_API_KEY
  delete process.env.OCI_API_KEY
  delete process.env.OCI_GENAI_API_KEY

  try {
    enableConfigs()

    const messages: string[] = []
    let appState: AppState = getDefaultAppState()
    const onDone: LocalJSXCommandOnDone = message => {
      messages.push(typeof message === 'string' ? message : String(message))
    }
    const context = {
      getAppState: () => appState,
      setAppState: (updater: (prev: AppState) => AppState) => {
        appState = updater(appState)
      },
      setMessages: () => {},
      onChangeAPIKey: () => {},
      options: {},
    } as unknown as LocalJSXCommandContext

    await providerCommand(onDone, context, `key oci ${expectedApiKey}`)
    await providerCommand(onDone, context, 'use oci Q')
    await providerCommand(onDone, context, 'test oci Q')

    const probe = appState.externalProviderProbe
    const output = messages.at(-1) ?? ''

    if (!probe?.ok || probe.modelRef !== 'oci:Q') {
      throw new Error(
        `Provider probe did not populate app state correctly.\n${JSON.stringify({ probe, output }, null, 2)}`,
      )
    }

    if (!output.includes('Provider test: OCI:Q reachable')) {
      throw new Error(
        `Provider probe output did not report reachability.\n${output}`,
      )
    }

    console.log(
      JSON.stringify(
        {
          status: 'ok',
          probe: {
            ok: probe.ok,
            code: probe.code,
            modelRef: probe.modelRef,
            endpoint: probe.endpoint,
            modelCount: probe.modelCount,
          },
          output,
        },
        null,
        2,
      ),
    )
  } finally {
    if (previousConfigDir === undefined) {
      delete process.env.CLAUDE_CONFIG_DIR
    } else {
      process.env.CLAUDE_CONFIG_DIR = previousConfigDir
    }
    if (previousQBaseUrl === undefined) {
      delete process.env.Q_BASE_URL
    } else {
      process.env.Q_BASE_URL = previousQBaseUrl
    }
    if (previousQApiKey === undefined) {
      delete process.env.Q_API_KEY
    } else {
      process.env.Q_API_KEY = previousQApiKey
    }
    if (previousOciApiKey === undefined) {
      delete process.env.OCI_API_KEY
    } else {
      process.env.OCI_API_KEY = previousOciApiKey
    }
    if (previousOciGenAiApiKey === undefined) {
      delete process.env.OCI_GENAI_API_KEY
    } else {
      process.env.OCI_GENAI_API_KEY = previousOciGenAiApiKey
    }
    await server.close()
    rmSync(tempConfigDir, { recursive: true, force: true })
  }
}

await main()
