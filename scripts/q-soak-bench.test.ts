import { describe, expect, test } from 'bun:test'
import {
  buildOciProbeCheck,
  resolveOciProbeModel,
} from './q-soak-bench.ts'

describe('q-soak-bench OCI probe selection', () => {
  test('probes direct OCI Q when the direct lane is enabled', () => {
    expect(
      resolveOciProbeModel({
        modes: ['openjaws', 'oci-q'],
        openjawsModel: 'openai:gpt-5.4',
      }),
    ).toBe('oci:Q')
  })

  test('reuses the OpenJaws OCI model when the direct lane is disabled', () => {
    expect(
      resolveOciProbeModel({
        modes: ['openjaws'],
        openjawsModel: 'oci:Q',
      }),
    ).toBe('oci:Q')
  })

  test('skips OCI provider probing when no OCI-backed lane is requested', () => {
    expect(
      resolveOciProbeModel({
        modes: ['openjaws'],
        openjawsModel: 'openai:gpt-5.4',
      }),
    ).toBeNull()
  })
})

describe('q-soak-bench OCI probe checks', () => {
  test('maps missing-key OCI probes to failed preflight checks', () => {
    const check = buildOciProbeCheck({
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
    })

    expect(check).toEqual({
      name: 'oci-q-runtime',
      status: 'failed',
      summary: 'OCI:Q blocked · key missing',
    })
  })
})
