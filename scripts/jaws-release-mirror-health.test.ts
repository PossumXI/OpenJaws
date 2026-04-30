import { describe, expect, test } from 'bun:test'
import {
  JAWS_RELEASE_API_URL,
  JAWS_RELEASE_ASSETS,
  JAWS_RELEASE_BASE_URL,
  JAWS_RELEASE_MIRRORS,
  JAWS_RELEASE_TAG,
  JAWS_RELEASE_VERSION,
  parseArgs,
  runJawsReleaseMirrorHealth,
} from './jaws-release-mirror-health.ts'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function htmlResponse(body = '<title>JAWS Desktop</title>'): Response {
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/html' },
  })
}

function redirectResponse(location: string): Response {
  return new Response('', {
    status: 302,
    headers: { location },
  })
}

function requiredAssetNames(): string[] {
  const names = new Set<string>()
  for (const asset of JAWS_RELEASE_ASSETS) {
    names.add(asset.file)
    if (asset.requiresSignature) {
      names.add(`${asset.file}.sig`)
    }
  }
  return [...names]
}

function createFetchMock(overrides: Record<string, Response> = {}) {
  return async (input: string | URL): Promise<Response> => {
    const url = input.toString()
    const override = overrides[url]
    if (override) {
      return override.clone()
    }
    if (JAWS_RELEASE_MIRRORS.some(mirror => mirror.pageUrl === url)) {
      return htmlResponse()
    }
    for (const mirror of JAWS_RELEASE_MIRRORS) {
      for (const asset of JAWS_RELEASE_ASSETS.filter(asset => asset.route)) {
        if (url === `${mirror.routeBaseUrl}/${asset.route}`) {
          return redirectResponse(`${JAWS_RELEASE_BASE_URL}/${asset.file}`)
        }
      }
    }
    if (url === JAWS_RELEASE_API_URL) {
      return jsonResponse({
        tag_name: JAWS_RELEASE_TAG,
        draft: false,
        assets: requiredAssetNames().map(name => ({
          name,
          size: name.endsWith('.sig') ? 412 : 1024,
        })),
      })
    }
    if (url === `${JAWS_RELEASE_BASE_URL}/latest.json`) {
      return jsonResponse({
        version: JAWS_RELEASE_VERSION,
        platforms: {
          'windows-x86_64': {
            signature: 'signed-windows',
            url: `${JAWS_RELEASE_BASE_URL}/JAWS_0.1.2_x64-setup.exe`,
          },
          'darwin-x86_64': {
            signature: 'signed-darwin',
            url: `${JAWS_RELEASE_BASE_URL}/JAWS.app.tar.gz`,
          },
        },
      })
    }
    return new Response('not found', { status: 404 })
  }
}

describe('jaws release mirror health', () => {
  test('passes when mirrors, GitHub assets, and updater manifest are aligned', async () => {
    const report = await runJawsReleaseMirrorHealth({
      fetchImpl: createFetchMock(),
      now: new Date('2026-04-30T00:00:00.000Z'),
      env: {},
    })

    expect(report.ok).toBe(true)
    expect(report.failures).toEqual([])
    expect(report.release.tag).toBe(JAWS_RELEASE_TAG)
    expect(report.checks.length).toBeGreaterThan(20)
  })

  test('fails closed when a public mirror route points at the wrong asset', async () => {
    const qlineWindowsUrl = `${JAWS_RELEASE_MIRRORS[0]!.routeBaseUrl}/windows`
    const report = await runJawsReleaseMirrorHealth({
      fetchImpl: createFetchMock({
        [qlineWindowsUrl]: redirectResponse(`${JAWS_RELEASE_BASE_URL}/wrong.exe`),
      }),
      env: {},
    })

    expect(report.ok).toBe(false)
    expect(report.failures).toContainEqual(
      expect.objectContaining({
        id: 'qline:windows',
        summary: expect.stringContaining('targets the wrong asset'),
        expected: `${JAWS_RELEASE_BASE_URL}/JAWS_0.1.2_x64-setup.exe`,
        actual: `${JAWS_RELEASE_BASE_URL}/wrong.exe`,
      }),
    )
  })

  test('fails closed when the updater manifest drops a required signature', async () => {
    const report = await runJawsReleaseMirrorHealth({
      fetchImpl: createFetchMock({
        [`${JAWS_RELEASE_BASE_URL}/latest.json`]: jsonResponse({
          version: JAWS_RELEASE_VERSION,
          platforms: {
            'windows-x86_64': {
              url: `${JAWS_RELEASE_BASE_URL}/JAWS_0.1.2_x64-setup.exe`,
            },
            'darwin-x86_64': {
              signature: 'signed-darwin',
              url: `${JAWS_RELEASE_BASE_URL}/JAWS.app.tar.gz`,
            },
          },
        }),
      }),
      env: {},
    })

    expect(report.ok).toBe(false)
    expect(report.failures).toContainEqual(
      expect.objectContaining({
        id: 'manifest:platform:windows-x86_64',
        summary: expect.stringContaining('missing URL or signature'),
      }),
    )
  })

  test('parses CLI receipt and timeout options', () => {
    expect(parseArgs(['--json', '--out', '.tmp/receipt.json', '--timeout-ms', '5000']))
      .toEqual({
        json: true,
        outPath: expect.stringContaining('receipt.json'),
        timeoutMs: 5000,
      })
  })
})
