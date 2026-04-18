import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdir, rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  getBrowserPreviewReceiptPath,
  readBrowserPreviewReceipt,
  summarizeBrowserPreviewReceipt,
} from './browserPreview.js'

const originalConfigDir = process.env.CLAUDE_CONFIG_DIR

describe('browserPreview', () => {
  let configDir: string

  beforeEach(async () => {
    configDir = join(tmpdir(), `openjaws-browser-preview-${Date.now()}`)
    process.env.CLAUDE_CONFIG_DIR = configDir
    await mkdir(configDir, { recursive: true })
  })

  afterEach(async () => {
    if (originalConfigDir === undefined) {
      delete process.env.CLAUDE_CONFIG_DIR
    } else {
      process.env.CLAUDE_CONFIG_DIR = originalConfigDir
    }
    await rm(configDir, { recursive: true, force: true })
  })

  test('returns an empty receipt when no sessions were recorded', async () => {
    const receipt = await readBrowserPreviewReceipt()
    expect(receipt.sessions).toHaveLength(0)
    expect(receipt.lastSessionId).toBeNull()
    expect(getBrowserPreviewReceiptPath()).toContain('browser-preview')
  })

  test('summarizes the latest accountable preview session', () => {
    const summary = summarizeBrowserPreviewReceipt({
      version: 1,
      updatedAt: '2026-04-18T22:00:00.000Z',
      lastSessionId: 'session-1',
      sessions: [
        {
          id: 'session-1',
          action: 'open_url',
          intent: 'preview',
          rationale: 'Verify the local app after the latest edit.',
          requestedBy: 'user',
          startedAt: '2026-04-18T22:00:00.000Z',
          handler: 'chrome',
          opened: true,
          note: 'Opened in Chrome-compatible preview lane.',
          url: 'http://127.0.0.1:3000/',
        },
        {
          id: 'session-0',
          action: 'launch_apex_browser',
          intent: 'watch',
          rationale: 'Need a longer unsupervised session for a stream.',
          requestedBy: 'agent',
          startedAt: '2026-04-18T21:00:00.000Z',
          handler: 'apex-browser',
          opened: true,
          note: 'Opened the Apex browser shell.',
        },
      ],
    })

    expect(summary.headline).toContain('preview · chrome · http://127.0.0.1:3000/')
    expect(summary.details).toContain(
      'why Verify the local app after the latest edit.',
    )
    expect(summary.details.some(item => item.includes('watch · apex-browser'))).toBe(
      true,
    )
  })
})
