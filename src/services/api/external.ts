import type {
  BetaContentBlock,
  BetaJSONOutputFormat,
  BetaStopReason,
  BetaToolUnion,
} from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import { APIUserAbortError } from '@anthropic-ai/sdk/error'
import { randomUUID } from 'crypto'
import { appendFile } from 'fs/promises'
import type { AssistantMessage, UserMessage } from '../../types/message.js'
import { createAssistantMessage, createUserMessage } from '../../utils/messages.js'
import { createAxiosInstance } from '../../utils/proxy.js'
import type { ResolvedExternalModelConfig } from '../../utils/model/externalProviders.js'
import type { SystemPrompt } from '../../utils/systemPromptType.js'
import {
  buildOpenAICompatibleAssistantContent as buildOpenAICompatibleAssistantContentInterop,
  buildOpenAICompatibleMessages as buildOpenAICompatibleMessagesInterop,
  mapOpenAICompatibleStopReason as mapOpenAICompatibleStopReasonInterop,
} from './externalInterop.js'
import { EMPTY_USAGE, type NonNullableUsage } from './logging.js'

export type OpenAICompatibleToolCall = {
  id?: string
  type?: 'function'
  extra_content?: {
    google?: {
      thought_signature?: string
    }
  }
  function?: {
    name?: string
    arguments?: string
  }
}

export type OpenAICompatibleContentPart = {
  type?: string
  text?: string
  id?: string
  name?: string
  arguments?: string | Record<string, unknown> | null
  extra_content?: OpenAICompatibleToolCall['extra_content']
  function?: {
    name?: string
    arguments?: string | Record<string, unknown> | null
  }
  function_call?: {
    name?: string
    arguments?: string | Record<string, unknown> | null
  }
}

export type OpenAICompatibleMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content?: string | null | OpenAICompatibleContentPart[]
  tool_calls?: OpenAICompatibleToolCall[]
  function_call?: {
    name?: string
    arguments?: string | Record<string, unknown> | null
  }
  tool_call_id?: string
  name?: string
}

export type OpenAICompatibleResponse = {
  id?: string
  model?: string
  choices?: Array<{
    finish_reason?: string | null
    message?: OpenAICompatibleMessage
  }>
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
  }
}

type OllamaTool = {
  type: 'function'
  function: {
    name: string
    description?: string
    parameters?: Record<string, unknown>
  }
}

type OllamaToolCall = {
  type?: 'function'
  function?: {
    name?: string
    arguments?: Record<string, unknown> | string
  }
}

type OllamaMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  images?: string[]
  tool_calls?: OllamaToolCall[]
  tool_name?: string
}

type OllamaResponse = {
  model?: string
  message?: {
    role?: 'assistant'
    content?: string
    thinking?: string
    tool_calls?: OllamaToolCall[]
    images?: string[]
  }
  done?: boolean
  done_reason?: string
  prompt_eval_count?: number
  eval_count?: number
}

type QueryExternalToolLoopResult = {
  assistantMessage: AssistantMessage
  usage: NonNullableUsage
  stopReason: BetaStopReason | null
  headers: Headers
  model?: string
}

type SystemBlock = {
  text: string
}

type ExternalConversationMessage = UserMessage | AssistantMessage

const ollamaHttpClient = createAxiosInstance()

async function writeOllamaDebugLog(message: string): Promise<void> {
  const debugFile = process.env.OPENJAWS_OLLAMA_DEBUG_FILE?.trim()
  if (!debugFile) {
    return
  }

  try {
    await appendFile(debugFile, `${new Date().toISOString()} ${message}\n`)
  } catch {
    // Best-effort diagnostics only.
  }
}

function buildChatCompletionsUrl(baseURL: string): string {
  return baseURL.endsWith('/chat/completions')
    ? baseURL
    : `${baseURL}/chat/completions`
}

function buildOllamaChatUrl(baseURL: string): string {
  return baseURL.endsWith('/api/chat') ? baseURL : `${baseURL}/api/chat`
}

function extractTextContent(payload: OpenAICompatibleResponse): string {
  return extractOpenAICompatibleTextContent(payload.choices?.[0]?.message)
}

function buildMessages(
  systemPrompt: SystemPrompt,
  userPrompt: string,
): OpenAICompatibleMessage[] {
  const messages: OpenAICompatibleMessage[] = []
  if (systemPrompt.length > 0) {
    messages.push({
      role: 'system',
      content: systemPrompt.join('\n\n'),
    })
  }
  messages.push({
    role: 'user',
    content: userPrompt,
  })
  return messages
}

function buildHeaders(
  config: ResolvedExternalModelConfig,
): Record<string, string> {
  if (
    config.provider !== 'ollama' &&
    !config.apiKey &&
    !config.headers.Authorization
  ) {
    throw new Error(
      `No API key configured for ${config.label}. Set ${config.apiKeySource ?? `${config.provider.toUpperCase()}_API_KEY`} or configure llmProviders in settings.`,
    )
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...config.headers,
  }

  if (!headers.Authorization && config.apiKey) {
    headers.Authorization = `Bearer ${config.apiKey}`
  }

  return headers
}

function toOllamaFormat(
  outputFormat?: BetaJSONOutputFormat,
): 'json' | Record<string, unknown> | undefined {
  if (!outputFormat) {
    return undefined
  }
  if (typeof outputFormat === 'object' && outputFormat !== null) {
    return outputFormat as Record<string, unknown>
  }
  return 'json'
}

function renderBlockAsText(block: Record<string, unknown>): string {
  switch (block.type) {
    case 'text':
      return typeof block.text === 'string' ? block.text : ''
    case 'tool_reference':
      return typeof block.tool_name === 'string'
        ? `[Referenced tool: ${block.tool_name}]`
        : '[Referenced tool]'
    case 'search_result':
      return '[Search result omitted for external model provider]'
    case 'image':
      return '[Image input attached]'
    case 'document':
      return '[Document input attached]'
    default:
      return ''
  }
}

function renderToolResultContent(content: unknown): string {
  if (typeof content === 'string') {
    return content
  }
  if (!Array.isArray(content)) {
    return ''
  }
  return content
    .map(item => renderBlockAsText(item as Record<string, unknown>))
    .filter(Boolean)
    .join('\n\n')
}

export function normalizeToolArguments(
  value: Record<string, unknown> | string | null | undefined,
): Record<string, unknown> {
  if (!value) {
    return {}
  }
  if (typeof value === 'string') {
    return normalizeToolArgumentsFromString(value)
  }
  return value
}

export function normalizeToolArgumentsFromString(
  value: string,
): Record<string, unknown> {
  const raw = value.trim()
  if (!raw) {
    return {}
  }

  const candidates = new Set<string>()
  const queue = [raw]

  const enqueue = (candidate: string | null | undefined) => {
    if (!candidate) {
      return
    }
    const normalized = candidate.trim()
    if (!normalized || candidates.has(normalized)) {
      return
    }
    candidates.add(normalized)
    queue.push(normalized)
  }

  enqueue(stripMarkdownCodeFence(raw))
  enqueue(extractFirstBalancedJsonObject(raw))

  while (queue.length > 0) {
    const candidate = queue.shift()!
    const parsed = tryParseLooseJson(candidate)
    const objectResult = coerceParsedToolArguments(parsed)
    if (objectResult) {
      return objectResult
    }

    if (typeof parsed === 'string') {
      enqueue(parsed)
      enqueue(stripMarkdownCodeFence(parsed))
      enqueue(extractFirstBalancedJsonObject(parsed))
    }
  }

  return {}
}

function stripMarkdownCodeFence(value: string): string {
  const trimmed = value.trim()
  const fencedMatch = trimmed.match(/^```[a-zA-Z0-9_-]*\s*([\s\S]*?)\s*```$/)
  return fencedMatch?.[1]?.trim() ?? trimmed
}

function tryParseLooseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown
  } catch {
    try {
      return JSON.parse(value.replace(/,\s*([}\]])/g, '$1')) as unknown
    } catch {
      return undefined
    }
  }
}

function coerceParsedToolArguments(
  value: unknown,
): Record<string, unknown> | null {
  if (isObjectRecord(value)) {
    return value
  }
  if (Array.isArray(value) && value.length === 1 && isObjectRecord(value[0])) {
    return value[0]
  }
  return null
}

function extractFirstBalancedJsonObject(value: string): string | null {
  const start = value.indexOf('{')
  if (start < 0) {
    return null
  }

  let depth = 0
  let inString = false
  let quoteChar = ''
  let escaped = false

  for (let i = start; i < value.length; i++) {
    const char = value[i]!

    if (escaped) {
      escaped = false
      continue
    }

    if (inString) {
      if (char === '\\') {
        escaped = true
      } else if (char === quoteChar) {
        inString = false
        quoteChar = ''
      }
      continue
    }

    if (char === '"' || char === "'") {
      inString = true
      quoteChar = char
      continue
    }

    if (char === '{') {
      depth++
      continue
    }

    if (char === '}') {
      depth--
      if (depth === 0) {
        return value.slice(start, i + 1)
      }
    }
  }

  return null
}

function isObjectRecord(
  value: unknown,
): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function normalizeOpenAICompatibleToolCallExtraContent(
  value: unknown,
): OpenAICompatibleToolCall['extra_content'] | undefined {
  if (!isObjectRecord(value)) {
    return undefined
  }

  const google = isObjectRecord(value.google) ? value.google : null
  if (!google || typeof google.thought_signature !== 'string') {
    return undefined
  }

  return {
    google: {
      thought_signature: google.thought_signature,
    },
  }
}

function normalizeOpenAICompatibleToolCall(
  value: unknown,
): OpenAICompatibleToolCall | null {
  if (!isObjectRecord(value)) {
    return null
  }

  const functionPayload = isObjectRecord(value.function)
    ? value.function
    : isObjectRecord(value.function_call)
      ? value.function_call
      : value

  const name =
    typeof functionPayload.name === 'string'
      ? functionPayload.name
      : typeof value.name === 'string'
        ? value.name
        : undefined

  if (!name) {
    return null
  }

  const rawArguments =
    typeof functionPayload.arguments === 'string' ||
    isObjectRecord(functionPayload.arguments)
      ? functionPayload.arguments
      : typeof value.arguments === 'string' || isObjectRecord(value.arguments)
        ? value.arguments
        : undefined

  const extraContent = normalizeOpenAICompatibleToolCallExtraContent(
    value.extra_content,
  )

  return {
    id: typeof value.id === 'string' ? value.id : undefined,
    type: 'function',
    ...(extraContent ? { extra_content: extraContent } : {}),
    function: {
      name,
      ...(rawArguments !== undefined ? { arguments: rawArguments } : {}),
    },
  }
}

export function getOpenAICompatibleToolCalls(
  message: OpenAICompatibleMessage | undefined,
): OpenAICompatibleToolCall[] {
  if (!message) {
    return []
  }

  const result: OpenAICompatibleToolCall[] = []
  const seen = new Set<string>()

  const pushToolCall = (toolCall: OpenAICompatibleToolCall | null) => {
    if (!toolCall?.function?.name) {
      return
    }
    const signature = [
      toolCall.id ?? '',
      toolCall.function.name,
      typeof toolCall.function.arguments === 'string'
        ? toolCall.function.arguments
        : JSON.stringify(toolCall.function.arguments ?? {}),
    ].join('|')
    if (seen.has(signature)) {
      return
    }
    seen.add(signature)
    result.push(toolCall)
  }

  for (const toolCall of message.tool_calls ?? []) {
    pushToolCall(normalizeOpenAICompatibleToolCall(toolCall))
  }

  pushToolCall(normalizeOpenAICompatibleToolCall(message.function_call))

  if (Array.isArray(message.content)) {
    for (const part of message.content) {
      if (part.type === 'text') {
        continue
      }
      pushToolCall(normalizeOpenAICompatibleToolCall(part))
    }
  }

  return result
}

function extractOpenAICompatibleTextContent(
  message: OpenAICompatibleMessage | undefined,
): string {
  const content = message?.content
  if (typeof content === 'string') {
    return content
  }
  if (!Array.isArray(content)) {
    return ''
  }
  return content
    .map(part =>
      (part.type === undefined || part.type === 'text') &&
      typeof part.text === 'string'
        ? part.text
        : '',
    )
    .join('')
    .trim()
}

function appendOllamaUserMessage(
  target: OllamaMessage[],
  content: unknown,
  toolNameByUseId: Map<string, string>,
): void {
  const blocks = Array.isArray(content)
    ? (content as Record<string, unknown>[])
    : [{ type: 'text', text: String(content ?? '') }]

  const pendingText: string[] = []
  const pendingImages: string[] = []

  const flushPending = () => {
    if (pendingText.length === 0 && pendingImages.length === 0) {
      return
    }
    target.push({
      role: 'user',
      content: pendingText.join('\n\n'),
      ...(pendingImages.length > 0 ? { images: [...pendingImages] } : {}),
    })
    pendingText.length = 0
    pendingImages.length = 0
  }

  for (const block of blocks) {
    if (block.type === 'tool_result') {
      flushPending()
      const toolUseId =
        typeof block.tool_use_id === 'string' ? block.tool_use_id : undefined
      const toolName =
        (toolUseId ? toolNameByUseId.get(toolUseId) : undefined) ??
        'unknown_tool'
      target.push({
        role: 'tool',
        tool_name: toolName,
        content: renderToolResultContent(block.content),
      })
      continue
    }

    if (
      block.type === 'image' &&
      typeof block.source === 'object' &&
      block.source !== null &&
      (block.source as { type?: string }).type === 'base64' &&
      typeof (block.source as { data?: unknown }).data === 'string'
    ) {
      pendingImages.push((block.source as { data: string }).data)
      continue
    }

    const text = renderBlockAsText(block)
    if (text) {
      pendingText.push(text)
    }
  }

  flushPending()
}

function buildOllamaMessages({
  system,
  messages,
}: {
  system: SystemBlock[]
  messages: ExternalConversationMessage[]
}): OllamaMessage[] {
  const result: OllamaMessage[] = []
  const systemText = system.map(block => block.text).filter(Boolean).join('\n\n')
  const toolNameByUseId = new Map<string, string>()

  if (systemText) {
    result.push({
      role: 'system',
      content: systemText,
    })
  }

  for (const message of messages) {
    if (message.type === 'user') {
      appendOllamaUserMessage(
        result,
        message.message.content,
        toolNameByUseId,
      )
      continue
    }

    const content = message.message.content
    const blocks = Array.isArray(content)
      ? (content as Record<string, unknown>[])
      : [{ type: 'text', text: String(content ?? '') }]
    const textParts: string[] = []
    const toolCalls: OllamaToolCall[] = []

    for (const block of blocks) {
      if (block.type === 'tool_use') {
        const name = typeof block.name === 'string' ? block.name : undefined
        if (!name) {
          continue
        }
        if (typeof block.id === 'string') {
          toolNameByUseId.set(block.id, name)
        }
        toolCalls.push({
          type: 'function',
          function: {
            name,
            arguments: normalizeToolArguments(
              block.input as Record<string, unknown> | string | undefined,
            ),
          },
        })
        continue
      }

      const text = renderBlockAsText(block)
      if (text) {
        textParts.push(text)
      }
    }

    if (textParts.length === 0 && toolCalls.length === 0) {
      continue
    }

    result.push({
      role: 'assistant',
      content: textParts.join('\n\n'),
      ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
    })
  }

  return result
}

function appendOpenAICompatibleUserMessages(
  target: OpenAICompatibleMessage[],
  content: unknown,
  toolNameByUseId: Map<string, string>,
): void {
  const blocks = Array.isArray(content)
    ? (content as Record<string, unknown>[])
    : [{ type: 'text', text: String(content ?? '') }]

  const pendingText: string[] = []

  const flushPending = () => {
    if (pendingText.length === 0) {
      return
    }

    target.push({
      role: 'user',
      content: pendingText.join('\n\n'),
    })
    pendingText.length = 0
  }

  for (const block of blocks) {
    if (block.type === 'tool_result') {
      flushPending()
      const toolUseId =
        typeof block.tool_use_id === 'string' ? block.tool_use_id : undefined
      const toolName = toolUseId
        ? toolNameByUseId.get(toolUseId)
        : undefined
      target.push({
        role: 'tool',
        tool_call_id: toolUseId,
        ...(toolName ? { name: toolName } : {}),
        content: renderToolResultContent(block.content),
      })
      continue
    }

    const text = renderBlockAsText(block)
    if (text) {
      pendingText.push(text)
    }
  }

  flushPending()
}

export function buildOpenAICompatibleMessages({
  system,
  messages,
}: {
  system: SystemBlock[]
  messages: ExternalConversationMessage[]
}): OpenAICompatibleMessage[] {
  const result: OpenAICompatibleMessage[] = []
  const systemText = system.map(block => block.text).filter(Boolean).join('\n\n')
  const toolNameByUseId = new Map<string, string>()

  if (systemText) {
    result.push({
      role: 'system',
      content: systemText,
    })
  }

  for (const message of messages) {
    if (message.type === 'user') {
      appendOpenAICompatibleUserMessages(
        result,
        message.message.content,
        toolNameByUseId,
      )
      continue
    }

    const content = message.message.content
    const blocks = Array.isArray(content)
      ? (content as Record<string, unknown>[])
      : [{ type: 'text', text: String(content ?? '') }]
    const textParts: string[] = []
    const toolCalls: OpenAICompatibleToolCall[] = []

    for (const block of blocks) {
      if (block.type === 'tool_use') {
        const name = typeof block.name === 'string' ? block.name : undefined
        if (!name) {
          continue
        }
        const toolUseId =
          typeof block.id === 'string' ? block.id : randomUUID()
        const extraContent = normalizeOpenAICompatibleToolCallExtraContent(
          block.extra_content,
        )
        toolNameByUseId.set(toolUseId, name)
        toolCalls.push({
          id: toolUseId,
          type: 'function',
          ...(extraContent ? { extra_content: extraContent } : {}),
          function: {
            name,
            arguments: JSON.stringify(
              normalizeToolArguments(
                block.input as Record<string, unknown> | string | undefined,
              ),
            ),
          },
        })
        continue
      }

      const text = renderBlockAsText(block)
      if (text) {
        textParts.push(text)
      }
    }

    if (textParts.length === 0 && toolCalls.length === 0) {
      continue
    }

    result.push({
      role: 'assistant',
      content: textParts.length > 0 ? textParts.join('\n\n') : '',
      ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
    })
  }

  return result
}

export function mapOpenAICompatibleStopReason(
  payload: OpenAICompatibleResponse,
): BetaStopReason | null {
  const choice = payload.choices?.[0]

  if (getOpenAICompatibleToolCalls(choice?.message).length > 0) {
    return 'tool_use'
  }

  switch (choice?.finish_reason) {
    case 'length':
      return 'max_tokens'
    default:
      return 'end_turn'
  }
}

export function buildOpenAICompatibleAssistantMessage(
  payload: OpenAICompatibleResponse,
  usage: NonNullableUsage,
): AssistantMessage {
  const contentBlocks = buildOpenAICompatibleAssistantContentInterop(
    payload,
  ) as BetaContentBlock[]

  return createAssistantMessage({
    content: contentBlocks.length > 0 ? contentBlocks : '',
    usage,
  })
}

function buildOllamaTools(tools: BetaToolUnion[]): OllamaTool[] {
  return tools.flatMap(tool => {
    const candidate = tool as Record<string, unknown>
    if (
      typeof candidate.name !== 'string' ||
      typeof candidate.description !== 'string' ||
      typeof candidate.input_schema !== 'object' ||
      candidate.input_schema === null ||
      Array.isArray(candidate.input_schema)
    ) {
      return []
    }

    return [
      {
        type: 'function' as const,
        function: {
          name: candidate.name,
          description: candidate.description,
          parameters: candidate.input_schema as Record<string, unknown>,
        },
      },
    ]
  })
}

function mapOllamaStopReason(payload: OllamaResponse): BetaStopReason | null {
  if ((payload.message?.tool_calls?.length ?? 0) > 0) {
    return 'tool_use'
  }

  switch (payload.done_reason) {
    case 'length':
      return 'max_tokens'
    case 'stop':
    case 'load':
    case 'unload':
    default:
      return 'end_turn'
  }
}

function buildOllamaAssistantMessage(
  payload: OllamaResponse,
  usage: NonNullableUsage,
): AssistantMessage {
  const contentBlocks: BetaContentBlock[] = []
  const content = payload.message?.content?.trim()

  if (content) {
    contentBlocks.push({
      type: 'text',
      text: content,
    } as BetaContentBlock)
  }

  for (const toolCall of payload.message?.tool_calls ?? []) {
    const name = toolCall.function?.name
    if (!name) {
      continue
    }
    contentBlocks.push({
      type: 'tool_use',
      id: randomUUID(),
      name,
      input: normalizeToolArguments(toolCall.function.arguments),
    } as BetaContentBlock)
  }

  return createAssistantMessage({
    content: contentBlocks.length > 0 ? contentBlocks : '',
    usage,
  })
}

async function fetchJson(
  input: string,
  init: RequestInit,
  signal: AbortSignal,
): Promise<Response> {
  try {
    return await fetch(input, init)
  } catch (error) {
    if (signal.aborted) {
      throw new APIUserAbortError()
    }
    throw error
  }
}

function normalizeResponseHeaders(
  headers: Record<string, unknown>,
): Headers {
  const normalized = new Headers()

  for (const [name, value] of Object.entries(headers)) {
    if (Array.isArray(value)) {
      normalized.set(name, value.map(item => String(item)).join(', '))
      continue
    }
    if (value !== undefined && value !== null) {
      normalized.set(name, String(value))
    }
  }

  return normalized
}

function renderErrorPayload(payload: unknown): string {
  if (typeof payload === 'string') {
    return payload.trim()
  }

  if (payload === undefined || payload === null) {
    return ''
  }

  try {
    return JSON.stringify(payload)
  } catch {
    return String(payload)
  }
}

async function postExternalJson<T>({
  url,
  body,
  headers,
  signal,
}: {
  url: string
  body: Record<string, unknown>
  headers: Record<string, string>
  signal: AbortSignal
}): Promise<{
  status: number
  statusText: string
  headers: Headers
  data: T
}> {
  try {
    const response = await ollamaHttpClient.post<T>(url, body, {
      headers,
      signal,
      validateStatus: () => true,
    })

    return {
      status: response.status,
      statusText: response.statusText,
      headers: normalizeResponseHeaders(
        response.headers as Record<string, unknown>,
      ),
      data: response.data,
    }
  } catch (error) {
    if (signal.aborted) {
      throw new APIUserAbortError()
    }
    throw error
  }
}

export async function queryExternalToolLoopModel({
  config,
  system,
  messages,
  tools,
  signal,
  maxOutputTokens,
  temperature,
  outputFormat,
}: {
  config: ResolvedExternalModelConfig
  system: SystemBlock[]
  messages: ExternalConversationMessage[]
  tools: BetaToolUnion[]
  signal: AbortSignal
  maxOutputTokens?: number
  temperature?: number
  outputFormat?: BetaJSONOutputFormat
}): Promise<QueryExternalToolLoopResult> {
  const headers = buildHeaders(config)
  const ollamaMessages = buildOllamaMessages({ system, messages })
  const ollamaTools = buildOllamaTools(tools)
  const runtimeOptions: Record<string, unknown> = {}

  if (typeof maxOutputTokens === 'number') {
    runtimeOptions.num_predict = maxOutputTokens
  }
  if (typeof temperature === 'number') {
    runtimeOptions.temperature = temperature
  }

  if (config.provider !== 'ollama') {
    const requestPayload = {
      model: config.model,
      messages: buildOpenAICompatibleMessagesInterop({ system, messages }),
      stream: false,
      ...(tools.length > 0 ? { tools: buildOllamaTools(tools) } : {}),
      ...(typeof maxOutputTokens === 'number'
        ? { max_tokens: maxOutputTokens }
        : {}),
      ...(typeof temperature === 'number' ? { temperature } : {}),
      ...(outputFormat ? { response_format: { type: 'json_object' } } : {}),
    }

    const response = await postExternalJson<OpenAICompatibleResponse>({
      url: buildChatCompletionsUrl(config.baseURL),
      body: requestPayload,
      headers,
      signal,
    })

    if (response.status < 200 || response.status >= 300) {
      const errorText = renderErrorPayload(response.data)
      throw new Error(
        `${config.label} request failed (${response.status} ${response.statusText})${errorText ? `: ${errorText}` : ''}`,
      )
    }

    const payload = response.data
    const usage: NonNullableUsage = {
      ...EMPTY_USAGE,
      input_tokens: payload.usage?.prompt_tokens ?? 0,
      output_tokens: payload.usage?.completion_tokens ?? 0,
    }

    return {
      assistantMessage: buildOpenAICompatibleAssistantMessage(payload, usage),
      usage,
      stopReason: mapOpenAICompatibleStopReasonInterop(payload),
      headers: response.headers,
      model: payload.model,
    }
  }
  const requestUrl = buildOllamaChatUrl(config.baseURL)
  const requestPayload = {
    model: config.model,
    messages: ollamaMessages,
    stream: false,
    think: false,
    ...(ollamaTools.length > 0 ? { tools: ollamaTools } : {}),
    ...(Object.keys(runtimeOptions).length > 0
      ? { options: runtimeOptions }
      : {}),
    ...(toOllamaFormat(outputFormat)
      ? { format: toOllamaFormat(outputFormat) }
      : {}),
  }
  const requestBody = JSON.stringify(requestPayload)

  const anthropicMessageSummary = messages
    .map(message => {
      const content = message.message.content
      if (!Array.isArray(content)) {
        return `${message.type}:text`
      }

      const blockTypes = content
        .map(block =>
          typeof block === 'object' &&
          block !== null &&
          'type' in block &&
          typeof block.type === 'string'
            ? block.type
            : 'unknown',
        )
        .join('+')
      return `${message.type}:${blockTypes}`
    })
    .join('|')
  const ollamaMessageSummary = ollamaMessages
    .map(message => message.role)
    .join('|')

  await writeOllamaDebugLog(
    `[request] model=${config.model} url=${requestUrl} bodyChars=${requestBody.length} anthropicMessages=${messages.length} anthropicSummary=${anthropicMessageSummary} ollamaMessages=${ollamaMessages.length} ollamaSummary=${ollamaMessageSummary} tools=${ollamaTools.length} signalAborted=${signal.aborted}`,
  )

  const response = await postExternalJson<OllamaResponse>({
    url: requestUrl,
    body: requestPayload,
    headers,
    signal,
  })

  await writeOllamaDebugLog(
    `[response] status=${response.status} statusText=${response.statusText}` ,
  )

  if (response.status < 200 || response.status >= 300) {
    const errorText = renderErrorPayload(response.data)
    throw new Error(
      `${config.label} request failed (${response.status} ${response.statusText})${errorText ? `: ${errorText}` : ''}`,
    )
  }

  const payload = response.data
  await writeOllamaDebugLog(
    `[payload] done=${String(payload.done)} reason=${payload.done_reason ?? 'unknown'} contentChars=${payload.message?.content?.length ?? 0} toolCalls=${payload.message?.tool_calls?.length ?? 0} promptEval=${payload.prompt_eval_count ?? 0} eval=${payload.eval_count ?? 0}`,
  )
  const usage: NonNullableUsage = {
    ...EMPTY_USAGE,
    input_tokens: payload.prompt_eval_count ?? 0,
    output_tokens: payload.eval_count ?? 0,
  }

  return {
    assistantMessage: buildOllamaAssistantMessage(payload, usage),
    usage,
    stopReason: mapOllamaStopReason(payload),
    headers: response.headers,
    model: payload.model,
  }
}

export async function queryExternalModel({
  config,
  systemPrompt,
  userPrompt,
  signal,
  maxOutputTokens,
  temperature,
  outputFormat,
}: {
  config: ResolvedExternalModelConfig
  systemPrompt: SystemPrompt
  userPrompt: string
  signal: AbortSignal
  maxOutputTokens?: number
  temperature?: number
  outputFormat?: BetaJSONOutputFormat
}): Promise<AssistantMessage> {
  if (config.provider === 'ollama') {
    const result = await queryExternalToolLoopModel({
      config,
      system: systemPrompt.map(text => ({ text })),
      messages: [
        createUserMessage({
          content: userPrompt,
        }),
      ],
      tools: [],
      signal,
      maxOutputTokens,
      temperature,
      outputFormat,
    })
    return result.assistantMessage
  }

  const headers = buildHeaders(config)
  const response = await fetchJson(
    buildChatCompletionsUrl(config.baseURL),
    {
      method: 'POST',
      headers,
      signal,
      body: JSON.stringify({
        model: config.model,
        messages: buildMessages(systemPrompt, userPrompt),
        stream: false,
        ...(typeof maxOutputTokens === 'number'
          ? { max_tokens: maxOutputTokens }
          : {}),
        ...(typeof temperature === 'number'
          ? { temperature }
          : {}),
        ...(outputFormat ? { response_format: { type: 'json_object' } } : {}),
      }),
    },
    signal,
  )

  if (!response.ok) {
    const errorText = (await response.text()).trim()
    throw new Error(
      `${config.label} request failed (${response.status} ${response.statusText})${errorText ? `: ${errorText}` : ''}`,
    )
  }

  const payload = (await response.json()) as OpenAICompatibleResponse
  const text = extractTextContent(payload)
  return createAssistantMessage({
    content: text,
  })
}









