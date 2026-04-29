import { describe, expect, it } from 'bun:test'
import {
  buildDiscordGovernedWebContext,
  extractDiscordGovernedFetchUrls,
  type DiscordGovernedHarnessCall,
  type DiscordGovernedHarnessCallInput,
} from './discordGovernedWeb.js'
import type { ImmaculateHarnessResult } from './immaculateHarness.js'

function harnessResult(
  input: DiscordGovernedHarnessCallInput,
  body: Record<string, unknown>,
  status = 200,
): ImmaculateHarnessResult {
  return {
    status,
    route:
      input.action === 'tool_capabilities'
        ? '/api/tools/capabilities'
        : input.action === 'tool_fetch'
          ? '/api/tools/fetch'
          : input.action === 'tool_search'
            ? '/api/tools/search'
            : '/api/artifacts/package',
    summary: status >= 400 ? 'failed' : 'ok',
    json: JSON.stringify(body),
    governance: null,
  }
}

describe('discordGovernedWeb', () => {
  it('extracts bounded public URLs from Discord text', () => {
    expect(
      extractDiscordGovernedFetchUrls(
        'read <https://qline.site/releases>, then compare https://iorch.net/docs. https://qline.site/releases',
      ),
    ).toEqual(['https://qline.site/releases', 'https://iorch.net/docs'])
  })

  it('fails closed when governed search is not configured', async () => {
    const calls: DiscordGovernedHarnessCallInput[] = []
    const callHarness: DiscordGovernedHarnessCall = async input => {
      calls.push(input)
      return harnessResult(input, {
        capabilities: {
          internet: {
            search: {
              status: 'not-configured',
              reason: 'Set IMMACULATE_SEARCH_PROVIDER and provider key.',
            },
          },
        },
      })
    }

    const result = await buildDiscordGovernedWebContext({
      prompt: 'look up current BridgeBench docs',
      query: 'current BridgeBench docs',
      shouldSearch: true,
      callHarness,
    })

    expect(result.attempted).toBe(true)
    expect(result.liveEvidence).toBe(false)
    expect(result.context).toContain('Governed search is not configured')
    expect(result.context).toContain('Do not claim live search was performed')
    expect(calls.map(call => call.action)).toEqual(['tool_capabilities'])
  })

  it('uses governed fetch receipts and packages successful context', async () => {
    const calls: DiscordGovernedHarnessCallInput[] = []
    const callHarness: DiscordGovernedHarnessCall = async input => {
      calls.push(input)
      if (input.action === 'tool_capabilities') {
        return harnessResult(input, {
          capabilities: {
            internet: {
              search: {
                status: 'not-configured',
              },
            },
          },
        })
      }
      if (input.action === 'tool_fetch') {
        return harnessResult(input, {
          receipt: {
            id: 'fetch-123',
            url: input.toolFetch?.url,
            status: 200,
            statusText: 'OK',
            byteLength: 42,
            truncated: false,
            bodyPreview: 'Current release notes for Q.',
            receiptHash: 'hash-fetch',
          },
        })
      }
      return harnessResult(input, {
        receipt: {
          id: 'artifact-123',
          name: 'discord-q-web-context.md',
          format: 'markdown',
          byteLength: 128,
        },
      })
    }

    const result = await buildDiscordGovernedWebContext({
      prompt: 'read https://qline.site/releases and summarize it',
      query: null,
      shouldSearch: false,
      callHarness,
    })

    expect(result.liveEvidence).toBe(true)
    expect(result.receiptIds).toEqual(['fetch-123'])
    expect(result.artifactReceiptId).toBe('artifact-123')
    expect(result.context).toContain('Fetch receipt: fetch-123')
    expect(result.context).toContain('Artifact receipt: artifact-123')
    expect(calls.map(call => call.action)).toEqual([
      'tool_capabilities',
      'tool_fetch',
      'artifact_package',
    ])
  })

  it('uses governed search receipts when the provider is available', async () => {
    const calls: DiscordGovernedHarnessCallInput[] = []
    const callHarness: DiscordGovernedHarnessCall = async input => {
      calls.push(input)
      if (input.action === 'tool_capabilities') {
        return harnessResult(input, {
          capabilities: {
            internet: {
              search: {
                status: 'available',
                provider: 'brave',
              },
            },
          },
        })
      }
      if (input.action === 'tool_search') {
        return harnessResult(input, {
          receipt: {
            id: 'search-123',
            query: input.toolSearch?.query,
            provider: 'brave',
            searchedAt: '2026-04-26T00:00:00.000Z',
            resultCount: 1,
            receiptHash: 'hash-search',
            results: [
              {
                title: 'BridgeBench docs',
                url: 'https://example.com/bridgebench',
                snippet: 'Current benchmark guidance.',
              },
            ],
          },
        })
      }
      return harnessResult(input, {
        receipt: {
          id: 'artifact-456',
          name: 'discord-q-web-context.md',
          format: 'markdown',
          byteLength: 128,
        },
      })
    }

    const result = await buildDiscordGovernedWebContext({
      prompt: 'look up current BridgeBench docs',
      query: 'current BridgeBench docs',
      shouldSearch: true,
      callHarness,
    })

    expect(result.liveEvidence).toBe(true)
    expect(result.receiptIds).toEqual(['search-123'])
    expect(result.context).toContain('Search receipt: search-123')
    expect(result.context).toContain('BridgeBench docs')
    expect(calls.map(call => call.action)).toEqual([
      'tool_capabilities',
      'tool_search',
      'artifact_package',
    ])
  })
})
