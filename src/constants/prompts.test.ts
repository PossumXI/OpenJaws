import { describe, expect, test } from 'bun:test'
import { WEB_FETCH_TOOL_NAME } from '../tools/WebFetchTool/prompt.js'
import { WEB_SEARCH_TOOL_NAME } from '../tools/WebSearchTool/prompt.js'
import { computeSimpleEnvInfo } from './prompts.js'

describe('Q prompt freshness in environment info', () => {
  test('marks Q web research available when web tools are enabled', async () => {
    const prompt = await computeSimpleEnvInfo(
      'oci:Q',
      [],
      new Set([WEB_SEARCH_TOOL_NAME, WEB_FETCH_TOOL_NAME]),
    )

    expect(prompt).toContain('# Q Freshness')
    expect(prompt).toContain('Current runtime date/time:')
    expect(prompt).toContain('June 2024')
    expect(prompt).toContain('Live web verification is available')
    expect(prompt).toContain('do not guess')
  })

  test('marks Q web research unavailable when web tools are absent', async () => {
    const prompt = await computeSimpleEnvInfo('oci:Q', [], new Set())

    expect(prompt).toContain('# Q Freshness')
    expect(prompt).toContain('No live web research output or browser tool is available')
    expect(prompt).toContain('unverified')
  })
})
