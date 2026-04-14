import { createPrivateKey, createPublicKey, sign, verify } from 'node:crypto'

export const OPENJAWS_RELEASE_MANIFEST_KEY_ID = 'openjaws-release-2026-04'

export const OPENJAWS_RELEASE_MANIFEST_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAPWpMVzhhLsNxqL3k0YlzDDfq5Mg6rSFqOxKPXyBPXyQ=
-----END PUBLIC KEY-----`

export type ReleaseManifestSignatureBlock = {
  algorithm: 'ed25519'
  keyId: string
  value: string
}

type JsonPrimitive = string | number | boolean | null
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }

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

export function serializeReleaseManifestPayload(
  manifest: Record<string, unknown>,
): string {
  const { signature: _signature, ...unsignedManifest } = manifest
  return JSON.stringify(sortJsonValue(unsignedManifest as JsonValue))
}

export function signReleaseManifestPayload(args: {
  manifest: Record<string, unknown>
  privateKeyPem: string
  keyId?: string
}): ReleaseManifestSignatureBlock {
  const payload = serializeReleaseManifestPayload(args.manifest)
  const privateKey = createPrivateKey(args.privateKeyPem)
  const value = sign(null, Buffer.from(payload, 'utf8'), privateKey).toString(
    'base64',
  )
  return {
    algorithm: 'ed25519',
    keyId: args.keyId ?? OPENJAWS_RELEASE_MANIFEST_KEY_ID,
    value,
  }
}

export function verifyReleaseManifestSignature(args: {
  manifest: Record<string, unknown>
  publicKeyPem?: string
}): { valid: boolean; reason: string | null } {
  const signature = args.manifest.signature as ReleaseManifestSignatureBlock | undefined
  if (!signature) {
    return { valid: false, reason: 'missing_signature' }
  }
  if (signature.algorithm !== 'ed25519') {
    return { valid: false, reason: 'unsupported_algorithm' }
  }
  if (signature.keyId !== OPENJAWS_RELEASE_MANIFEST_KEY_ID) {
    return { valid: false, reason: 'unexpected_key_id' }
  }

  try {
    const payload = serializeReleaseManifestPayload(args.manifest)
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
