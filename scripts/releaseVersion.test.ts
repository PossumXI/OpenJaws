import { describe, expect, test } from 'bun:test'
import { getOpenJawsReleaseVersion } from './releaseVersion.ts'

describe('getOpenJawsReleaseVersion', () => {
  test('returns the package version by default', () => {
    expect(
      getOpenJawsReleaseVersion({
        packageVersion: '2.1.86',
        env: {},
      }),
    ).toBe('2.1.86')
  })

  test('uses the git tag version when it matches package.json', () => {
    expect(
      getOpenJawsReleaseVersion({
        packageVersion: '2.1.86',
        env: {
          GITHUB_REF_TYPE: 'tag',
          GITHUB_REF_NAME: 'v2.1.86',
        } as NodeJS.ProcessEnv,
      }),
    ).toBe('2.1.86')
  })

  test('ignores JAWS desktop tags for OpenJaws sidecar builds', () => {
    expect(
      getOpenJawsReleaseVersion({
        packageVersion: '2.1.86',
        env: {
          GITHUB_REF_TYPE: 'tag',
          GITHUB_REF_NAME: 'jaws-v2.1.86',
          CI: 'true',
          GITHUB_SHA: 'abcdef1234567890',
        } as NodeJS.ProcessEnv,
      }),
    ).toBe('2.1.86+sha.abcdef1')
  })

  test('adds CI sha build metadata for non-tag builds', () => {
    expect(
      getOpenJawsReleaseVersion({
        packageVersion: '2.1.86',
        env: {
          CI: 'true',
          GITHUB_SHA: 'abcdef1234567890',
        } as NodeJS.ProcessEnv,
      }),
    ).toBe('2.1.86+sha.abcdef1')
  })

  test('throws on tag/package mismatch by default', () => {
    expect(() =>
      getOpenJawsReleaseVersion({
        packageVersion: '2.1.86',
        env: {
          GITHUB_REF_TYPE: 'tag',
          GITHUB_REF_NAME: 'v2.1.90',
        } as NodeJS.ProcessEnv,
      }),
    ).toThrow('does not match package.json version')
  })

  test('allows explicit mismatches when enabled', () => {
    expect(
      getOpenJawsReleaseVersion({
        packageVersion: '2.1.86',
        env: {
          OPENJAWS_RELEASE_VERSION: '2.1.90',
          OPENJAWS_ALLOW_VERSION_MISMATCH: 'true',
        } as NodeJS.ProcessEnv,
      }),
    ).toBe('2.1.90')
  })
})
