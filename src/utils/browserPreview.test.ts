import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdir, rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  getBrowserPreviewReceiptPath,
  readBrowserPreviewReceipt,
  summarizeBrowserPreviewReceipt,
  summarizeBrowserPreviewRuntime,
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
          handler: 'openjaws-browser',
          opened: true,
          note: 'Opened in the OpenJaws browser lane.',
          url: 'http://127.0.0.1:3000/',
        },
        {
          id: 'session-0',
          action: 'launch_apex_browser',
          intent: 'watch',
          rationale: 'Need a longer unsupervised session for a stream.',
          requestedBy: 'agent',
          startedAt: '2026-04-18T21:00:00.000Z',
          handler: 'openjaws-browser',
          opened: true,
          note: 'Opened the native browser lane.',
        },
      ],
    })

    expect(summary.headline).toContain(
      'preview · openjaws-browser · http://127.0.0.1:3000/',
    )
    expect(summary.details).toContain(
      'why Verify the local app after the latest edit.',
    )
    expect(
      summary.details.some(item => item.includes('watch · openjaws-browser')),
    ).toBe(true)
  })

  test('summarizes the native in-TUI browser runtime distinctly from the external shell', () => {
    const summary = summarizeBrowserPreviewRuntime({
      configured: true,
      bridgePath: 'C:\\Apex\\browser',
      bridgeReady: true,
      launchReady: true,
      health: {
        status: 'ok',
        service: 'browser-bridge',
        version: '0.2.0',
        timestamp: '2026-04-18T22:05:03.000Z',
      },
      message:
        'OpenJaws browser bridge ready with SEALED demo in the native TUI preview lane.',
      summary: {
        mode: 'live',
        renderMode: 'tui',
        activeSessionId: 'session-1',
        sessionCount: 1,
        privacy: {
          doNotTrack: true,
          blockThirdPartyCookies: true,
          clearOnExit: true,
          userHistoryPersisted: false,
          agentHistoryPersisted: true,
        },
        sessions: [
          {
            id: 'session-1',
            intent: 'preview',
            rationale: 'Check the local app in the native browser lane.',
            requestedBy: 'user',
            recordHistory: false,
            title: 'SEALED demo',
            url: 'http://127.0.0.1:3000/',
            state: 'ready',
            openedAt: '2026-04-18T22:05:00.000Z',
            updatedAt: '2026-04-18T22:05:03.000Z',
            excerpt: 'Digital clock preview',
            statusCode: 200,
            loadTimeMs: 92,
            imageCount: 3,
            metadata: {
              description: 'Clock preview',
              keywords: ['clock', 'preview'],
              author: null,
              contentType: 'text/html',
            },
            links: [],
          },
        ],
      },
    })

    expect(summary.headline).toContain('native tui preview')
    expect(summary.details[0]).toContain('native TUI preview lane')
    expect(summary.details[1]).toContain('preview · user · http://127.0.0.1:3000/')
  })
})
