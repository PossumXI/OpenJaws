import { describe, expect, test } from 'bun:test'
import { generateKeyPairSync } from 'crypto'
import {
  serializeBenchmarkReceiptPayload,
  signBenchmarkReceipt,
  verifyBenchmarkReceiptSignature,
} from './benchmarkReceiptSignature.js'

describe('benchmarkReceiptSignature', () => {
  test('serializes receipt payload deterministically without the signature block', () => {
    expect(
      serializeBenchmarkReceiptPayload({
        z: 1,
        a: { c: 3, b: 2 },
        signature: {
          algorithm: 'ed25519',
          keyId: 'x',
          value: 'y',
        },
      }),
    ).toBe('{"a":{"b":2,"c":3},"z":1}')
  })

  test('canonicalizes arrays and negative zero consistently', () => {
    expect(
      serializeBenchmarkReceiptPayload({
        numbers: [-0, 1.5, 1e3],
        nested: [{ z: 2, a: 1 }],
      }),
    ).toBe('{"nested":[{"a":1,"z":2}],"numbers":[0,1.5,1000]}')
  })

  test('signs and verifies a receipt payload', () => {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519')
    const receipt = {
      kind: 'benchmark',
      runId: 'run-1',
      reportSha256: 'abc',
    }
    const signature = signBenchmarkReceipt({
      receipt,
      privateKeyPem: privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(),
    })

    expect(
      verifyBenchmarkReceiptSignature({
        receipt: { ...receipt, signature },
        publicKeyPem: publicKey.export({ format: 'pem', type: 'spki' }).toString(),
      }),
    ).toEqual({
      valid: true,
      reason: null,
    })
  })
})
