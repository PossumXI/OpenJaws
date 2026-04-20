import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdir, rm, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import { tmpdir } from 'os'
import {
  assessBrowserPreviewMutationAccess,
  getBrowserPreviewReceiptPath,
  normalizeBrowserPreviewUrl,
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
          requestedBy: 'agent',
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

  test('filters non-accountable user sessions out of persisted receipts', async () => {
    const receiptPath = getBrowserPreviewReceiptPath()
    await mkdir(dirname(receiptPath), { recursive: true })
    await writeFile(
      receiptPath,
      JSON.stringify(
        {
          version: 1,
          updatedAt: '2026-04-18T22:00:00.000Z',
          lastSessionId: 'session-1',
          sessions: [
            {
              id: 'session-1',
              action: 'open_url',
              intent: 'preview',
              rationale: 'User opened a local app preview.',
              requestedBy: 'user',
              startedAt: '2026-04-18T22:00:00.000Z',
              handler: 'openjaws-browser',
              opened: true,
              note: 'Opened in the OpenJaws browser lane.',
              url: 'http://127.0.0.1:3000/',
            },
            {
              id: 'session-0',
              action: 'open_url',
              intent: 'research',
              rationale: 'Agent checked deployment docs.',
              requestedBy: 'agent',
              startedAt: '2026-04-18T21:00:00.000Z',
              handler: 'openjaws-browser',
              opened: true,
              note: 'Opened in the OpenJaws browser lane.',
              url: 'https://docs.example.com/',
            },
          ],
        },
        null,
        2,
      ),
      'utf8',
    )

    const receipt = await readBrowserPreviewReceipt()
    expect(receipt.sessions).toHaveLength(1)
    expect(receipt.sessions[0]?.requestedBy).toBe('agent')
    expect(receipt.sessions[0]?.url).toBe('https://docs.example.com/')
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

    expect(summary.headline).toBe('Private user session · ready · native tui preview')
    expect(summary.details[0]).toContain('native TUI preview lane')
    expect(summary.details[1]).toContain(
      'Private user browsing stays inside the TUI and is redacted from shared status surfaces.',
    )
    expect(summary.details[2]).toContain('preview · private user session')
  })

  test('allows private-network URLs for preview intent', () => {
    expect(
      normalizeBrowserPreviewUrl('http://127.0.0.1:3000/', 'preview'),
    ).toBe('http://127.0.0.1:3000/')
  })

  test('blocks private-network URLs for non-preview intents', () => {
    expect(() =>
      normalizeBrowserPreviewUrl('http://127.0.0.1:3000/', 'watch'),
    ).toThrow(
      'Private-network browser targets are only allowed for preview intent.',
    )
  })

  test('blocks agent mutations when the live browser summary is unavailable', () => {
    const access = assessBrowserPreviewMutationAccess({
      sessionId: 'session-1',
      requestedBy: 'agent',
      summary: null,
      runtimeMessage: 'Browser bridge offline right now.',
    })

    expect(access.ok).toBe(false)
    expect(access.message).toBe('Browser bridge offline right now.')
  })

  test('blocks agent mutations against private user sessions', () => {
    const access = assessBrowserPreviewMutationAccess({
      sessionId: 'session-1',
      requestedBy: 'agent',
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
            rationale: 'User is checking a local build.',
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

    expect(access.ok).toBe(false)
    expect(access.message).toContain(
      'Agent browser mutations cannot navigate or close private user sessions.',
    )
  })

  test('allows agent mutations for accountable agent sessions', () => {
    const access = assessBrowserPreviewMutationAccess({
      sessionId: 'session-2',
      requestedBy: 'agent',
      summary: {
        mode: 'live',
        renderMode: 'tui',
        activeSessionId: 'session-2',
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
            id: 'session-2',
            intent: 'research',
            rationale: 'Q is verifying docs on the user’s behalf.',
            requestedBy: 'agent',
            recordHistory: true,
            title: 'Provider docs',
            url: 'https://docs.example.com/',
            state: 'ready',
            openedAt: '2026-04-18T22:05:00.000Z',
            updatedAt: '2026-04-18T22:05:03.000Z',
            excerpt: 'Provider docs',
            statusCode: 200,
            loadTimeMs: 92,
            imageCount: 1,
            metadata: {
              description: 'Docs',
              keywords: ['docs'],
              author: null,
              contentType: 'text/html',
            },
            links: [],
          },
        ],
      },
    })

    expect(access.ok).toBe(true)
    expect(access.session?.id).toBe('session-2')
  })
})
