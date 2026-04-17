import { createPrivateKey, createPublicKey, sign, verify } from 'crypto'
import {
  OPENJAWS_RELEASE_MANIFEST_PUBLIC_KEY_PEM,
  type ReleaseManifestSignatureBlock,
} from './releaseManifestSignature.js'

type JsonPrimitive = string | number | boolean | null
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }

export const OPENJAWS_BENCHMARK_RECEIPT_KEY_ID =
  'openjaws-benchmark-2026-04'

export type BenchmarkReceiptSignatureBlock = ReleaseManifestSignatureBlock

function sortJsonValue(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return value.map(item => sortJsonValue(item))
  }
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce<{ [key: string]: JsonValue }>((acc, key) => {
        acc[key] = sortJsonValue((value as Record<string, JsonValue>)[key]!)
        return acc
      }, {})
  }
  return value
}

export function serializeBenchmarkReceiptPayload(
  receipt: Record<string, unknown>,
): string {
  const { signature: _signature, ...unsignedReceipt } = receipt
  return JSON.stringify(sortJsonValue(unsignedReceipt as JsonValue))
}

export function signBenchmarkReceipt(args: {
  receipt: Record<string, unknown>
  privateKeyPem: string
  keyId?: string
}): BenchmarkReceiptSignatureBlock {
  const payload = serializeBenchmarkReceiptPayload(args.receipt)
  const privateKey = createPrivateKey(args.privateKeyPem)
  const value = sign(null, Buffer.from(payload, 'utf8'), privateKey).toString(
    'base64',
  )
  return {
    algorithm: 'ed25519',
    keyId: args.keyId ?? OPENJAWS_BENCHMARK_RECEIPT_KEY_ID,
    value,
  }
}

export function verifyBenchmarkReceiptSignature(args: {
  receipt: Record<string, unknown>
  publicKeyPem?: string
}): { valid: boolean; reason: string | null } {
  const signature = args.receipt.signature as
    | BenchmarkReceiptSignatureBlock
    | undefined
  if (!signature) {
    return { valid: false, reason: 'missing_signature' }
  }
  if (signature.algorithm !== 'ed25519') {
    return { valid: false, reason: 'unsupported_algorithm' }
  }
  if (signature.keyId !== OPENJAWS_BENCHMARK_RECEIPT_KEY_ID) {
    return { valid: false, reason: 'unexpected_key_id' }
  }

  try {
    const payload = serializeBenchmarkReceiptPayload(args.receipt)
    const publicKey = createPublicKey(
      args.publicKeyPem ?? OPENJAWS_RELEASE_MANIFEST_PUBLIC_KEY_PEM,
    )
    const valid = verify(
      null,
      Buffer.from(payload, 'utf8'),
      publicKey,
      Buffer.from(signature.value, 'base64'),
    )
    return { valid, reason: valid ? null : 'signature_mismatch' }
  } catch {
    return { valid: false, reason: 'verification_error' }
  }
}

export function resolveBenchmarkSigningPrivateKey(): string | null {
  return (
    process.env.OPENJAWS_BENCHMARK_SIGNING_PRIVATE_KEY?.trim() ||
    process.env.OPENJAWS_RELEASE_SIGNING_PRIVATE_KEY?.trim() ||
    null
  )
}
