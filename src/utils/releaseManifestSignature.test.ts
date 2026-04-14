import { describe, expect, test } from 'bun:test'
import { generateKeyPairSync } from 'node:crypto'
import {
  OPENJAWS_RELEASE_MANIFEST_KEY_ID,
  serializeReleaseManifestPayload,
  signReleaseManifestPayload,
  verifyReleaseManifestSignature,
} from './releaseManifestSignature.js'

describe('releaseManifestSignature', () => {
  test('serializes manifest payload deterministically without the signature block', () => {
    const payload = serializeReleaseManifestPayload({
      version: '2.1.90',
      platforms: {
        'win32-x64': {
          checksum: 'abc',
          bytes: 123,
          assetName: 'openjaws-win32-x64.exe',
        },
      },
      signature: {
        algorithm: 'ed25519',
        keyId: OPENJAWS_RELEASE_MANIFEST_KEY_ID,
        value: 'ignore-me',
      },
    })

    expect(payload).toBe(
      '{"platforms":{"win32-x64":{"assetName":"openjaws-win32-x64.exe","bytes":123,"checksum":"abc"}},"version":"2.1.90"}',
    )
  })

  test('signs and verifies a release manifest payload', () => {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519')
    const manifest = {
      version: '2.1.90',
      releasedAt: '2026-04-14T00:00:00.000Z',
      source: 'github_release',
      repo: 'PossumXI/OpenJaws',
      originalBinary: 'openjaws.exe',
      platforms: {
        'win32-x64': {
          assetName: 'openjaws-win32-x64.exe',
          checksum: 'abc123',
          bytes: 456,
        },
      },
    }

    const signature = signReleaseManifestPayload({
      manifest,
      privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    })

    expect(
      verifyReleaseManifestSignature({
        manifest: { ...manifest, signature },
        publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
      }),
    ).toEqual({
      valid: true,
      reason: null,
    })
  })

  test('rejects tampered payloads', () => {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519')
    const manifest = {
      version: '2.1.90',
      platforms: {
        'win32-x64': {
          assetName: 'openjaws-win32-x64.exe',
          checksum: 'abc123',
          bytes: 456,
        },
      },
    }

    const signature = signReleaseManifestPayload({
      manifest,
      privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    })

    expect(
      verifyReleaseManifestSignature({
        manifest: {
          ...manifest,
          platforms: {
            'win32-x64': {
              assetName: 'openjaws-win32-x64.exe',
              checksum: 'tampered',
              bytes: 456,
            },
          },
          signature,
        },
        publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
      }),
    ).toEqual({
      valid: false,
      reason: 'signature_mismatch',
    })
  })
})
