import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  buildQProviderProbeCheck,
  resolveQProviderProbeModel,
  runOpenJawsProviderPreflight,
} from './runtime.js'

const tempDirs: string[] = []

afterEach(() => {
  while (tempDirs.length > 0) {
    const path = tempDirs.pop()
    if (path) {
      rmSync(path, { force: true, recursive: true })
    }
  }
})

describe('q runtime provider helpers', () => {
  test('prefers the direct OCI Q lane when requested', () => {
    expect(
      resolveQProviderProbeModel({
        preferDirectQ: true,
        model: 'openai:gpt-5.4',
      }),
    ).toBe('oci:Q')
  })

  test('reuses the configured OCI model when it already points at OCI', () => {
    expect(
      resolveQProviderProbeModel({
        preferDirectQ: false,
        model: 'oci:Q',
      }),
    ).toBe('oci:Q')
  })

  test('keeps missing-key probes as hard failures by default', () => {
    expect(
      buildQProviderProbeCheck({
        name: 'oci-q-runtime',
        result: {
          ok: false,
          code: 'missing_key',
          provider: 'oci',
          label: 'OCI',
          model: 'Q',
          modelRef: 'oci:Q',
          baseURL: 'https://example.com/openai/v1',
          baseURLSource: null,
          apiKeySource: null,
          endpoint: 'https://example.com/openai/v1/responses',
          endpointLabel: '/responses',
          method: 'POST',
          checkedAt: 0,
          summary: 'OCI:Q blocked · key missing',
        },
      }).status,
    ).toBe('failed')
  })

  test('fails closed when the OpenJaws binary is missing', async () => {
    const root = mkdtempSync(join(tmpdir(), 'openjaws-q-runtime-'))
    tempDirs.push(root)

    const result = await runOpenJawsProviderPreflight({
      root,
      model: null,
      checkName: 'openjaws-provider-preflight',
      warnOnFailure: true,
    })

    expect(result.status).toBe('failed')
    expect(result.summary).toContain('Run bun run build:native first')
  })
})
