import { mkdirSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'

export type GeminiMediaDefaults = {
  apiKeyEnv: string
  baseURL: string
  imageModel: string
  videoModel: string
}

export type GeminiMediaKind = 'image' | 'video'

export type GeminiMediaErrorKind =
  | 'api_key_missing'
  | 'auth_failed'
  | 'quota_blocked'
  | 'model_not_found'
  | 'unsupported'
  | 'request_failed'

export type GeminiMediaErrorClassification = {
  kind: GeminiMediaErrorKind
  statusCode: number | null
  status: string | null
  message: string
  raw: string
}

export type GeminiMediaProbeResult = {
  kind: GeminiMediaKind
  model: string
  apiKeyEnv: string
  baseURL: string
  configured: boolean
  listed: boolean
  ready: boolean
  reason: 'ready' | GeminiMediaErrorKind
  knownModels: string[]
  statusCode: number | null
  message: string | null
}

export type GeminiImageArtifact = {
  path: string
  bytes: number
}

export type GeminiImageGenerationResult = {
  model: string
  prompt: string
  artifacts: GeminiImageArtifact[]
}

export type GeminiVideoGenerationResult = {
  model: string
  prompt: string
  operationId: string
  status: string
  url: string | null
  artifactPath: string | null
}

type GeminiImageResponse = {
  data?: Array<{
    b64_json?: string
  }>
}

type GeminiVideoCreateResponse = {
  id?: string
  status?: string
}

type GeminiVideoStatusResponse = {
  id?: string
  status?: string
  url?: string
  error?: unknown
}

type GeminiOpenAIModelsResponse = {
  data?: Array<{
    id?: string
  }>
}

function normalizeBaseURL(baseURL: string): string {
  return baseURL.trim().replace(/\/+$/, '')
}

function getEnvValue(name: string): string | null {
  const value = process.env[name]
  return value && value.trim().length > 0 ? value.trim() : null
}

function ensureDir(path: string) {
  mkdirSync(path, { recursive: true })
}

function decodeBase64Media(value: string): Uint8Array {
  return Buffer.from(value, 'base64')
}

function detectBinaryExtension(bytes: Uint8Array): string {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return 'png'
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'jpg'
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'webp'
  }
  if (
    bytes.length >= 12 &&
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70
  ) {
    return 'mp4'
  }
  return 'bin'
}

export function getGeminiMediaDefaults(): GeminiMediaDefaults {
  return {
    apiKeyEnv: getEnvValue('GEMINI_API_KEY')
      ? 'GEMINI_API_KEY'
      : getEnvValue('GOOGLE_API_KEY')
        ? 'GOOGLE_API_KEY'
        : 'GEMINI_API_KEY',
    baseURL: normalizeBaseURL(
      getEnvValue('GEMINI_BASE_URL') ??
        'https://generativelanguage.googleapis.com/v1beta/openai',
    ),
    imageModel: getEnvValue('GEMINI_IMAGE_MODEL') ?? 'gemini-2.5-flash-image',
    videoModel: getEnvValue('GEMINI_VIDEO_MODEL') ?? 'veo-3.1-generate-preview',
  }
}

export function resolveGeminiMediaApiKey(): string {
  const apiKey = getEnvValue('GEMINI_API_KEY') ?? getEnvValue('GOOGLE_API_KEY')
  if (!apiKey) {
    throw new Error(
      'No Gemini API key configured. Set GEMINI_API_KEY or GOOGLE_API_KEY before generating media.',
    )
  }
  return apiKey
}

function normalizeListedModelId(id: string): string {
  return id.replace(/^models\//, '').trim()
}

function buildAuthHeaders(): HeadersInit {
  return {
    Authorization: `Bearer ${resolveGeminiMediaApiKey()}`,
  }
}

function buildOutputDir(root: string | null | undefined, kind: 'image' | 'video'): string {
  const targetRoot =
    root && root.trim().length > 0
      ? resolve(root)
      : resolve(process.cwd(), 'artifacts', 'gemini-media')
  const dir = join(
    targetRoot,
    `${kind}-${new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '')}`,
  )
  ensureDir(dir)
  return dir
}

function extractGeminiJson(text: string): unknown {
  const start = text.indexOf('{')
  if (start === -1) {
    return null
  }
  try {
    return JSON.parse(text.slice(start))
  } catch {
    return null
  }
}

export function classifyGeminiMediaError(error: unknown): GeminiMediaErrorClassification {
  const raw = error instanceof Error ? error.message : String(error)
  if (/No Gemini API key configured/i.test(raw)) {
    return {
      kind: 'api_key_missing',
      statusCode: null,
      status: null,
      message: raw,
      raw,
    }
  }
  const payload = extractGeminiJson(raw) as
    | {
        error?: {
          code?: number
          status?: string
          message?: string
        }
      }
    | null
  const statusCode = payload?.error?.code ?? Number.parseInt(raw.match(/\b(\d{3})\b/)?.[1] ?? '', 10)
  const normalizedStatusCode = Number.isFinite(statusCode) ? statusCode : null
  const status = payload?.error?.status?.trim() ?? null
  const message = payload?.error?.message?.trim() || raw
  if (normalizedStatusCode === 401 || normalizedStatusCode === 403) {
    return {
      kind: 'auth_failed',
      statusCode: normalizedStatusCode,
      status,
      message,
      raw,
    }
  }
  if (
    normalizedStatusCode === 429 ||
    status === 'RESOURCE_EXHAUSTED' ||
    /quota|billing|resource_exhausted/i.test(message)
  ) {
    return {
      kind: 'quota_blocked',
      statusCode: normalizedStatusCode,
      status,
      message,
      raw,
    }
  }
  if (normalizedStatusCode === 404 || status === 'NOT_FOUND') {
    return {
      kind: 'model_not_found',
      statusCode: normalizedStatusCode,
      status,
      message,
      raw,
    }
  }
  if (normalizedStatusCode === 400 || status === 'INVALID_ARGUMENT') {
    return {
      kind: 'unsupported',
      statusCode: normalizedStatusCode,
      status,
      message,
      raw,
    }
  }
  return {
    kind: 'request_failed',
    statusCode: normalizedStatusCode,
    status,
    message,
    raw,
  }
}

async function throwGeminiApiError(prefix: string, response: Response): Promise<never> {
  const text = await response.text()
  throw new Error(`${prefix}: ${response.status} ${text}`)
}

export async function listGeminiOpenAIModels(): Promise<string[]> {
  const defaults = getGeminiMediaDefaults()
  const response = await fetch(`${defaults.baseURL}/models`, {
    method: 'GET',
    headers: buildAuthHeaders(),
  })
  if (!response.ok) {
    await throwGeminiApiError('Gemini model listing failed', response)
  }
  const payload = (await response.json()) as GeminiOpenAIModelsResponse
  return (payload.data ?? [])
    .map(entry => normalizeListedModelId(entry.id ?? ''))
    .filter(model => model.length > 0)
}

export async function probeGeminiMediaModel(args: {
  kind: GeminiMediaKind
  model?: string | null
}): Promise<GeminiMediaProbeResult> {
  const defaults = getGeminiMediaDefaults()
  const model =
    args.model?.trim() ||
    (args.kind === 'image' ? defaults.imageModel : defaults.videoModel)
  try {
    resolveGeminiMediaApiKey()
  } catch (error) {
    const classification = classifyGeminiMediaError(error)
    return {
      kind: args.kind,
      model,
      apiKeyEnv: defaults.apiKeyEnv,
      baseURL: defaults.baseURL,
      configured: false,
      listed: false,
      ready: false,
      reason: classification.kind,
      knownModels: [],
      statusCode: classification.statusCode,
      message: classification.message,
    }
  }
  try {
    const knownModels = await listGeminiOpenAIModels()
    const listed = knownModels.includes(model)
    return {
      kind: args.kind,
      model,
      apiKeyEnv: defaults.apiKeyEnv,
      baseURL: defaults.baseURL,
      configured: true,
      listed,
      ready: listed,
      reason: listed ? 'ready' : 'model_not_found',
      knownModels,
      statusCode: null,
      message: listed ? null : `${model} is not listed by the Gemini OpenAI-compat models endpoint.`,
    }
  } catch (error) {
    const classification = classifyGeminiMediaError(error)
    return {
      kind: args.kind,
      model,
      apiKeyEnv: defaults.apiKeyEnv,
      baseURL: defaults.baseURL,
      configured: true,
      listed: false,
      ready: false,
      reason: classification.kind,
      knownModels: [],
      statusCode: classification.statusCode,
      message: classification.message,
    }
  }
}

export async function generateGeminiImages(args: {
  prompt: string
  model?: string | null
  outDir?: string | null
  count?: number
  size?: string | null
}): Promise<GeminiImageGenerationResult> {
  const defaults = getGeminiMediaDefaults()
  const model = args.model?.trim() || defaults.imageModel
  const outputDir = buildOutputDir(args.outDir, 'image')
  const response = await fetch(`${defaults.baseURL}/images/generations`, {
    method: 'POST',
    headers: {
      ...buildAuthHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      prompt: args.prompt,
      response_format: 'b64_json',
      n: Math.max(1, Math.min(args.count ?? 1, 4)),
      ...(args.size?.trim() ? { size: args.size.trim() } : {}),
    }),
  })
  if (!response.ok) {
    await throwGeminiApiError('Gemini image generation failed', response)
  }
  const payload = (await response.json()) as GeminiImageResponse
  const artifacts = (payload.data ?? []).flatMap((image, index) => {
    if (!image.b64_json) {
      return []
    }
    const bytes = decodeBase64Media(image.b64_json)
    const extension = detectBinaryExtension(bytes)
    const path = join(outputDir, `image-${index + 1}.${extension}`)
    writeFileSync(path, bytes)
    return [{ path, bytes: bytes.byteLength }]
  })
  if (artifacts.length === 0) {
    throw new Error('Gemini image generation returned no image data.')
  }
  return {
    model,
    prompt: args.prompt,
    artifacts,
  }
}

async function pollGeminiVideoStatus(args: {
  baseURL: string
  operationId: string
  pollMs: number
  timeoutMs: number
}): Promise<GeminiVideoStatusResponse> {
  const startedAt = Date.now()
  while (true) {
    const response = await fetch(`${args.baseURL}/videos/${args.operationId}`, {
      method: 'GET',
      headers: buildAuthHeaders(),
    })
    if (!response.ok) {
      await throwGeminiApiError('Gemini video status failed', response)
    }
    const payload = (await response.json()) as GeminiVideoStatusResponse
    if (payload.status === 'completed' || payload.status === 'failed') {
      return payload
    }
    if (Date.now() - startedAt > args.timeoutMs) {
      throw new Error(
        `Gemini video generation timed out after ${Math.round(args.timeoutMs / 1000)}s while polling operation ${args.operationId}.`,
      )
    }
    await Bun.sleep(args.pollMs)
  }
}

export async function generateGeminiVideo(args: {
  prompt: string
  model?: string | null
  outDir?: string | null
  pollMs?: number
  timeoutMs?: number
}): Promise<GeminiVideoGenerationResult> {
  const defaults = getGeminiMediaDefaults()
  const model = args.model?.trim() || defaults.videoModel
  const outputDir = buildOutputDir(args.outDir, 'video')
  const form = new FormData()
  form.append('model', model)
  form.append('prompt', args.prompt)
  const createResponse = await fetch(`${defaults.baseURL}/videos`, {
    method: 'POST',
    headers: buildAuthHeaders(),
    body: form,
  })
  if (!createResponse.ok) {
    await throwGeminiApiError('Gemini video generation failed', createResponse)
  }
  const created = (await createResponse.json()) as GeminiVideoCreateResponse
  const operationId = created.id?.trim()
  if (!operationId) {
    throw new Error('Gemini video generation did not return an operation id.')
  }
  const status = await pollGeminiVideoStatus({
    baseURL: defaults.baseURL,
    operationId,
    pollMs: Math.max(5_000, args.pollMs ?? 10_000),
    timeoutMs: Math.max(60_000, args.timeoutMs ?? 20 * 60_000),
  })
  if (status.status !== 'completed' || !status.url) {
    throw new Error(
      `Gemini video generation did not complete successfully: ${status.status ?? 'unknown'}${status.error ? ` ${JSON.stringify(status.error)}` : ''}`,
    )
  }
  const mediaResponse = await fetch(status.url)
  if (!mediaResponse.ok) {
    await throwGeminiApiError('Gemini video download failed', mediaResponse)
  }
  const buffer = new Uint8Array(await mediaResponse.arrayBuffer())
  const extension = detectBinaryExtension(buffer)
  const artifactPath = join(outputDir, `video.${extension === 'bin' ? 'mp4' : extension}`)
  writeFileSync(artifactPath, buffer)
  return {
    model,
    prompt: args.prompt,
    operationId,
    status: status.status ?? 'completed',
    url: status.url,
    artifactPath,
  }
}
