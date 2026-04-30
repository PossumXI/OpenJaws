import { describe, expect, test } from 'bun:test'
import {
  MissingNetlifyAuthTokenError,
  NetlifyApiError,
  shouldFallbackToPublicLiveCheck,
} from './deploy-qline-site.ts'

describe('deploy-qline-site live-check fallback policy', () => {
  test('allows read-only live checks to continue when Netlify metadata is unavailable', () => {
    expect(
      shouldFallbackToPublicLiveCheck(new MissingNetlifyAuthTokenError('missing token')),
    ).toBe(true)
    expect(
      shouldFallbackToPublicLiveCheck(
        new NetlifyApiError('/sites/site-id', 429, 'Too Many Requests'),
      ),
    ).toBe(true)
    expect(
      shouldFallbackToPublicLiveCheck(
        new NetlifyApiError('/sites/site-id', 503, 'Unavailable'),
      ),
    ).toBe(true)
  })

  test('keeps operator mistakes and auth failures strict', () => {
    expect(
      shouldFallbackToPublicLiveCheck(
        new NetlifyApiError('/sites/site-id', 401, 'Unauthorized'),
      ),
    ).toBe(false)
    expect(shouldFallbackToPublicLiveCheck(new Error('wrong Netlify site id'))).toBe(false)
  })
})
