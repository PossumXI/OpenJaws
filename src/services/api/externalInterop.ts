import { randomUUID } from 'crypto'

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

export type SystemBlock = {
  text: string
}

export type ExternalConversationMessageLike = {
  type: 'user' | 'assistant'
  message: {
    content: unknown
  }
}

export type OpenAICompatibleAssistantContentBlock =
  | {
      type: 'text'
      text: string
    }
  | {
      type: 'tool_use'
      id: string
      name: string
      input: Record<string, unknown>
      extra_content?: OpenAICompatibleToolCall['extra_content']
    }

export function renderBlockAsText(block: Record<string, unknown>): string {
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

export function renderToolResultContent(content: unknown): string {
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
  const seenPayloads = new Set<string>()
  const seenLegacyPayloads = new Set<string>()

  const pushToolCall = (toolCall: OpenAICompatibleToolCall | null) => {
    if (!toolCall?.function?.name) {
      return
    }
    const payloadSignature = [
      toolCall.function.name,
      typeof toolCall.function.arguments === 'string'
        ? toolCall.function.arguments
        : JSON.stringify(toolCall.function.arguments ?? {}),
    ].join('|')
    const signature = [
      toolCall.id ?? '',
      payloadSignature,
    ].join('|')

    if (!toolCall.id) {
      if (seenPayloads.has(payloadSignature)) {
        return
      }
      seenLegacyPayloads.add(payloadSignature)
    } else if (seenLegacyPayloads.has(payloadSignature)) {
      return
    }

    if (seen.has(signature)) {
      return
    }
    seen.add(signature)
    seenPayloads.add(payloadSignature)
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
  messages: ExternalConversationMessageLike[]
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
): 'tool_use' | 'max_tokens' | 'end_turn' | null {
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

export function buildOpenAICompatibleAssistantContent(
  payload: OpenAICompatibleResponse,
): OpenAICompatibleAssistantContentBlock[] {
  const choice = payload.choices?.[0]
  const contentBlocks: OpenAICompatibleAssistantContentBlock[] = []
  const content = extractOpenAICompatibleTextContent(choice?.message)

  if (content) {
    contentBlocks.push({
      type: 'text',
      text: content,
    })
  }

  for (const toolCall of getOpenAICompatibleToolCalls(choice?.message)) {
    const name = toolCall.function?.name
    if (!name) {
      continue
    }
    const extraContent = normalizeOpenAICompatibleToolCallExtraContent(
      toolCall.extra_content,
    )

    contentBlocks.push({
      type: 'tool_use',
      id: toolCall.id ?? randomUUID(),
      name,
      input: normalizeToolArguments(toolCall.function.arguments),
      ...(extraContent ? { extra_content: extraContent } : {}),
    })
  }

  return contentBlocks
}
