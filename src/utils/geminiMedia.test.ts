import { afterEach, describe, expect, it } from 'bun:test'
import {
  classifyGeminiMediaError,
  listGeminiOpenAIModels,
  probeGeminiMediaModel,
} from './geminiMedia.js'

const originalFetch = globalThis.fetch
const originalGeminiApiKey = process.env.GEMINI_API_KEY
const originalGoogleApiKey = process.env.GOOGLE_API_KEY

afterEach(() => {
  globalThis.fetch = originalFetch
  if (originalGeminiApiKey === undefined) {
    delete process.env.GEMINI_API_KEY
  } else {
    process.env.GEMINI_API_KEY = originalGeminiApiKey
  }
  if (originalGoogleApiKey === undefined) {
    delete process.env.GOOGLE_API_KEY
  } else {
    process.env.GOOGLE_API_KEY = originalGoogleApiKey
  }
})

describe('geminiMedia', () => {
  it('classifies quota-blocked upstream failures', () => {
    const classification = classifyGeminiMediaError(
      new Error(
        'Gemini image generation failed: 429 {"error":{"code":429,"message":"You exceeded your current quota, please check your plan and billing details.","status":"RESOURCE_EXHAUSTED"}}',
      ),
    )
    expect(classification.kind).toBe('quota_blocked')
    expect(classification.statusCode).toBe(429)
    expect(classification.status).toBe('RESOURCE_EXHAUSTED')
  })

  it('lists and normalizes Gemini OpenAI model ids', async () => {
    process.env.GEMINI_API_KEY = 'test-key'
    delete process.env.GOOGLE_API_KEY
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          data: [{ id: 'models/gemini-2.5-flash-image' }, { id: 'veo-3.1-generate-preview' }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )) as typeof fetch

    await expect(listGeminiOpenAIModels()).resolves.toEqual([
      'gemini-2.5-flash-image',
      'veo-3.1-generate-preview',
    ])
  })

  it('reports missing models through the probe surface', async () => {
    process.env.GEMINI_API_KEY = 'test-key'
    delete process.env.GOOGLE_API_KEY
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          data: [{ id: 'models/gemini-2.5-flash-image' }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )) as typeof fetch

    await expect(
      probeGeminiMediaModel({
        kind: 'video',
        model: 'veo-3.1-fast-generate-preview',
      }),
    ).resolves.toMatchObject({
      ready: false,
      listed: false,
      reason: 'model_not_found',
      model: 'veo-3.1-fast-generate-preview',
    })
  })
})
