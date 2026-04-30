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
    expect(JSON.stringify(result.data.data)).toContain('/browser/demo-run')
  })

  test('accepts demo run controls in the tool schema', () => {
    const parsed = WebBrowserTool.inputSchema.safeParse({
      action: 'demo_run',
      url: 'http://localhost:5173',
      timeoutMs: 60_000,
      installBrowsers: false,
      headed: false,
      dryRun: true,
    })

    expect(parsed.success).toBe(true)
  })
})
