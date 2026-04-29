import { describe, expect, test } from 'bun:test'
import { hasOciQBridgeWebEvidenceTool } from './ociQBridge.js'

describe('OCI Q bridge freshness tool detection', () => {
  test('does not mark unrelated tools as live web evidence', () => {
    expect(hasOciQBridgeWebEvidenceTool(undefined)).toBe(false)
    expect(
      hasOciQBridgeWebEvidenceTool([
        { type: 'function', function: { name: 'read_file' } },
        { name: 'Bash' },
        { type: 'computer_use_preview' },
      ]),
    ).toBe(false)
  })

  test('marks explicit web, search, fetch, and browser tools as live evidence', () => {
    expect(hasOciQBridgeWebEvidenceTool([{ name: 'WebSearch' }])).toBe(true)
    expect(hasOciQBridgeWebEvidenceTool([{ type: 'web_search_preview' }])).toBe(
      true,
    )
    expect(
      hasOciQBridgeWebEvidenceTool([
        { type: 'function', function: { name: 'WebFetch' } },
      ]),
    ).toBe(true)
    expect(
      hasOciQBridgeWebEvidenceTool([
        { name: 'mcp__claude-in-chrome__tabs_context_mcp' },
      ]),
    ).toBe(true)
  })
})
