import { describe, expect, test } from 'bun:test'
import { WebBrowserTool } from './WebBrowserTool.js'

describe('WebBrowserTool', () => {
  test('loads and exposes browser preview capabilities', async () => {
    const parsed = WebBrowserTool.inputSchema.safeParse({
      action: 'capabilities',
    })
    expect(parsed.success).toBe(true)

    const result = await WebBrowserTool.call(
      {
        action: 'capabilities',
      },
      {} as never,
    )

    expect(result.data.ok).toBe(true)
    expect(result.data.action).toBe('capabilities')
    expect(JSON.stringify(result.data.data)).toContain('/browser/open')
  })
})
