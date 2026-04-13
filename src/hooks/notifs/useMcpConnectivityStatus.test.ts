import { describe, expect, it } from 'bun:test'
import type { MCPServerConnection, ScopedMcpServerConfig } from '../../services/mcp/types.js'
import {
  getMcpConnectivityNoticeCounts,
} from './mcpConnectivityNoticeCounts.js'

function makeConfig(
  type: ScopedMcpServerConfig['type'],
): ScopedMcpServerConfig {
  switch (type) {
    case 'stdio':
      return {
        type,
        command: 'node',
        args: [],
        scope: 'user',
      }
    case 'sse':
      return {
        type,
        url: 'https://example.com/sse',
        scope: 'user',
      }
    case 'http':
      return {
        type,
        url: 'https://example.com/http',
        scope: 'user',
      }
    case 'ws':
      return {
        type,
        url: 'wss://example.com/ws',
        scope: 'user',
      }
    case 'sdk':
      return {
        type,
        name: 'sdk-server',
        scope: 'user',
      }
    case 'sse-ide':
      return {
        type,
        url: 'https://example.com/ide',
        ideName: 'VS Code',
        scope: 'user',
      }
    case 'ws-ide':
      return {
        type,
        url: 'wss://example.com/ide',
        ideName: 'VS Code',
        scope: 'user',
      }
    case 'claudeai-proxy':
      return {
        type,
        url: 'https://example.com/claudeai',
        id: 'proxy-1',
        scope: 'claudeai',
      }
  }
}

function makeConnection(
  name: string,
  type: MCPServerConnection['type'],
  configType: ScopedMcpServerConfig['type'],
): MCPServerConnection {
  if (type === 'failed') {
    return {
      name,
      type,
      config: makeConfig(configType),
      error: 'boom',
    }
  }

  if (type === 'needs-auth') {
    return {
      name,
      type,
      config: makeConfig(configType),
    }
  }

  throw new Error(`Unsupported test connection type: ${type}`)
}

describe('getMcpConnectivityNoticeCounts', () => {
  it('separates local failures from IDE and openjaws.dev connectors', () => {
    const counts = getMcpConnectivityNoticeCounts([
      makeConnection('local-stdio', 'failed', 'stdio'),
      makeConnection('local-http', 'failed', 'http'),
      makeConnection('ide-sse', 'failed', 'sse-ide'),
      makeConnection('ide-ws', 'failed', 'ws-ide'),
      makeConnection('cloud-proxy', 'failed', 'claudeai-proxy'),
    ])

    expect(counts.failedLocalClients).toBe(2)
    expect(counts.needsAuthLocalServers).toBe(0)
  })

  it('counts local needs-auth servers separately from openjaws.dev connectors', () => {
    const counts = getMcpConnectivityNoticeCounts([
      makeConnection('stdio-auth', 'needs-auth', 'stdio'),
      makeConnection('http-auth', 'needs-auth', 'http'),
      makeConnection('cloud-auth', 'needs-auth', 'claudeai-proxy'),
    ])

    expect(counts.failedLocalClients).toBe(0)
    expect(counts.needsAuthLocalServers).toBe(2)
  })

  it('only counts openjaws.dev connectors that have previously connected', () => {
    const counts = getMcpConnectivityNoticeCounts(
      [
        makeConnection('cloud-failed', 'failed', 'claudeai-proxy'),
        makeConnection('cloud-auth', 'needs-auth', 'claudeai-proxy'),
      ],
      name => name === 'cloud-failed' || name === 'cloud-auth',
    )

    expect(counts.failedOpenJawsAccountClients).toBe(1)
    expect(counts.needsAuthOpenJawsAccountServers).toBe(1)
  })
})
