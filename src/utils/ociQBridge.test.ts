import { describe, expect, test } from 'bun:test'
import {
  parseOciBridgeProcessResult,
  resolveOciBridgeModel,
} from './ociQBridge.js'

describe('ociQBridge process parsing', () => {
  test('accepts a successful bridge JSON payload even when the Python process exits nonzero', () => {
    const result = parseOciBridgeProcessResult(
      {
        exitCode: 1,
        stderr: '',
        stdout: JSON.stringify({
          ok: true,
          text: 'OK',
          model: 'openai.gpt-oss-120b',
          base_url: 'http://127.0.0.1:9999',
          auth_mode: 'bearer',
          profile: null,
        }),
      },
      'fallback failure',
    )

    expect(result.ok).toBe(true)
    expect(result.text).toBe('OK')
  })

  test('throws the structured bridge error when the payload is an explicit failure', () => {
    expect(() =>
      parseOciBridgeProcessResult(
        {
          exitCode: 0,
          stderr: '',
          stdout: JSON.stringify({
            ok: false,
            error: '401 Unauthorized',
          }),
        },
        'fallback failure',
      ),
    ).toThrow('401 Unauthorized')
  })

  test('resolves provider-prefixed Q aliases to the configured OCI upstream model', () => {
    const previousQModel = process.env.Q_MODEL
    const previousOciModel = process.env.OCI_MODEL
    try {
      delete process.env.Q_MODEL
      process.env.OCI_MODEL = 'openai.gpt-oss-120b'

      expect(resolveOciBridgeModel('Q')).toBe('openai.gpt-oss-120b')
      expect(resolveOciBridgeModel('oci:Q')).toBe('openai.gpt-oss-120b')
      expect(resolveOciBridgeModel(' OCI:q ')).toBe('openai.gpt-oss-120b')
      expect(resolveOciBridgeModel('oci:openai.gpt-oss-120b')).toBe(
        'openai.gpt-oss-120b',
      )
    } finally {
      if (previousQModel === undefined) {
        delete process.env.Q_MODEL
      } else {
        process.env.Q_MODEL = previousQModel
      }
      if (previousOciModel === undefined) {
        delete process.env.OCI_MODEL
      } else {
        process.env.OCI_MODEL = previousOciModel
      }
    }
  })
})
