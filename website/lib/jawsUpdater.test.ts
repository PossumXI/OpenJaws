import { describe, expect, test } from 'bun:test'
import {
  isVersionNewer,
  resolveJawsUpdaterResult,
} from './jawsUpdater'

function jsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  }
}

describe('JAWS updater API helpers', () => {
  test('compares semver and prerelease versions', () => {
    expect(isVersionNewer('0.2.0', '0.1.9')).toBe(true)
    expect(isVersionNewer('0.2.0', '0.2.0')).toBe(false)
    expect(isVersionNewer('0.2.0', '0.2.0-beta.1')).toBe(true)
    expect(isVersionNewer('0.2.0-beta.2', '0.2.0-beta.1')).toBe(true)
  })

  test('returns a Tauri dynamic update payload for a newer signed platform', async () => {
    const requestedUrls: string[] = []
    const result = await resolveJawsUpdaterResult(
      {
        target: 'windows',
        arch: 'x86_64',
        current_version: '0.1.0',
      },
      {
        env: {
          JAWS_UPDATER_MANIFEST_URL: 'https://qline.site/downloads/jaws/latest.json',
        },
        fetcher: async url => {
          requestedUrls.push(url)
          return jsonResponse({
            version: '0.2.0',
            notes: 'Signed update',
            pub_date: '2026-04-29T00:00:00.000Z',
            platforms: {
              'windows-x86_64': {
                url: 'https://qline.site/downloads/jaws/JAWS_0.2.0_x64-setup.exe',
                signature: 'sig-windows',
              },
            },
          })
        },
      },
    )

    expect(requestedUrls).toEqual(['https://qline.site/downloads/jaws/latest.json'])
    expect(result.status).toBe(200)
    expect(result.body).toEqual({
      version: '0.2.0',
      url: 'https://qline.site/downloads/jaws/JAWS_0.2.0_x64-setup.exe',
      signature: 'sig-windows',
      notes: 'Signed update',
      pub_date: '2026-04-29T00:00:00.000Z',
    })
  })

  test('returns 204 when the requesting install is current', async () => {
    const result = await resolveJawsUpdaterResult(
      {
        target: 'windows',
        arch: 'x86_64',
        current_version: '0.2.0',
      },
      {
        env: {
          JAWS_UPDATER_MANIFEST_URL: 'https://qline.site/downloads/jaws/latest.json',
        },
        fetcher: async () =>
          jsonResponse({
            version: '0.2.0',
            platforms: {
              'windows-x86_64': {
                url: 'https://qline.site/downloads/jaws/JAWS_0.2.0_x64-setup.exe',
                signature: 'sig-windows',
              },
            },
          }),
      },
    )

    expect(result.status).toBe(204)
    expect(result.body).toBeNull()
  })

  test('discovers the latest non-prerelease jaws-v GitHub manifest asset', async () => {
    const requestedUrls: string[] = []
    const result = await resolveJawsUpdaterResult(
      {
        target: 'linux',
        arch: 'x86_64',
        current_version: '0.1.0',
      },
      {
        env: {
          JAWS_UPDATER_GITHUB_REPO: 'PossumXI/OpenJaws',
        },
        fetcher: async url => {
          requestedUrls.push(url)
          if (url.includes('/releases?per_page=25')) {
            return jsonResponse([
              {
                tag_name: 'v2.1.86',
                draft: false,
                prerelease: false,
                assets: [
                  {
                    name: 'latest.json',
                    browser_download_url: 'https://example.com/cli.json',
                  },
                ],
              },
              {
                tag_name: 'jaws-v0.2.0',
                draft: false,
                prerelease: false,
                assets: [
                  {
                    name: 'latest.json',
                    browser_download_url: 'https://example.com/jaws.json',
                  },
                ],
              },
            ])
          }
          return jsonResponse({
            version: '0.2.0',
            platforms: {
              'linux-x86_64': {
                url: 'https://example.com/JAWS_0.2.0_amd64.AppImage',
                signature: 'sig-linux',
              },
            },
          })
        },
      },
    )

    expect(requestedUrls).toEqual([
      'https://api.github.com/repos/PossumXI/OpenJaws/releases?per_page=25',
      'https://example.com/jaws.json',
    ])
    expect(result.status).toBe(200)
  })

  test('fails closed for malformed platform artifacts', async () => {
    const result = await resolveJawsUpdaterResult(
      {
        target: 'darwin',
        arch: 'x86_64',
        current_version: '0.1.0',
      },
      {
        env: {
          JAWS_UPDATER_MANIFEST_URL: 'https://qline.site/downloads/jaws/latest.json',
        },
        fetcher: async () =>
          jsonResponse({
            version: '0.2.0',
            platforms: {
              'darwin-x86_64': {
                url: 'http://insecure.example.com/JAWS.app.tar.gz',
                signature: 'sig-darwin',
              },
            },
          }),
      },
    )

    expect(result.status).toBe(503)
    expect(result.body?.code).toBe('invalid_manifest')
  })
})
