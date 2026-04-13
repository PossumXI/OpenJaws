type TranscriptContentPart = {
  type?: string
  text?: string
  [key: string]: unknown
}

type TranscriptMessageEnvelope = {
  role?: string
  content?: unknown
  model?: string
}

export type MinimalTranscriptEntry = {
  type?: string
  isMeta?: boolean
  isSidechain?: boolean
  isApiErrorMessage?: boolean
  sessionId?: string
  cwd?: string
  timestamp?: string
  message?: TranscriptMessageEnvelope
}

export type OpenJawsSftSample = {
  messages: [
    {
      role: 'user'
      content: string
    },
    {
      role: 'assistant'
      content: string
    },
  ]
  metadata: {
    sessionId: string | null
    cwd: string | null
    transcriptPath: string
    userTimestamp: string | null
    assistantTimestamp: string | null
    assistantModel: string | null
    isSidechain: boolean
  }
}

const LOCAL_COMMAND_MARKERS = [
  '<command-name>',
  '<command-message>',
  '<command-args>',
  '<local-command-stdout>',
  '<local-command-stderr>',
  '<local-command-caveat>',
]

const ANSI_ESCAPE_PATTERN =
  /\u001B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g

const LOW_SIGNAL_USER_PROMPTS = new Set([
  'hello',
  'hello there',
  'hey',
  'hey there',
  'hi',
  'sup',
  'test',
  'testing',
  'whats up',
  'yo',
])

function normalizeText(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(ANSI_ESCAPE_PATTERN, '').trim()
}

export function extractVisibleTranscriptText(content: unknown): string {
  if (typeof content === 'string') {
    return normalizeText(content)
  }

  if (Array.isArray(content)) {
    const textParts = content
      .map(part => {
        if (!part || typeof part !== 'object') return null
        const contentPart = part as TranscriptContentPart
        return contentPart.type === 'text' && typeof contentPart.text === 'string'
          ? normalizeText(contentPart.text)
          : null
      })
      .filter((value): value is string => Boolean(value))

    return textParts.join('\n\n').trim()
  }

  if (
    content &&
    typeof content === 'object' &&
    'type' in content &&
    'text' in content &&
    (content as TranscriptContentPart).type === 'text' &&
    typeof (content as TranscriptContentPart).text === 'string'
  ) {
    return normalizeText((content as TranscriptContentPart).text!)
  }

  return ''
}

function isLocalCommandNoise(text: string): boolean {
  return LOCAL_COMMAND_MARKERS.some(marker => text.includes(marker))
}

function isLowSignalUserPrompt(text: string): boolean {
  const normalized = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
  return LOW_SIGNAL_USER_PROMPTS.has(normalized)
}

function getMessageRole(entry: MinimalTranscriptEntry): string {
  return entry.message?.role ?? entry.type ?? ''
}

function getVisibleEntryText(entry: MinimalTranscriptEntry): string {
  return extractVisibleTranscriptText(entry.message?.content)
}

export function buildOpenJawsSftSamples(
  entries: MinimalTranscriptEntry[],
  transcriptPath: string,
  options: {
    includeSidechains?: boolean
    includeLowSignal?: boolean
  } = {},
): OpenJawsSftSample[] {
  const samples: OpenJawsSftSample[] = []
  let pendingUser:
    | {
        content: string
        sessionId: string | null
        cwd: string | null
        timestamp: string | null
        isSidechain: boolean
      }
    | null = null

  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue
    if (entry.isMeta === true) continue
    if (!options.includeSidechains && entry.isSidechain === true) continue
    if (entry.isApiErrorMessage === true) continue

    const role = getMessageRole(entry)
    const text = getVisibleEntryText(entry)
    if (!text) continue

    if (role === 'user') {
      if (isLocalCommandNoise(text)) continue
      if (!options.includeLowSignal && isLowSignalUserPrompt(text)) continue
      pendingUser = {
        content: text,
        sessionId: entry.sessionId ?? null,
        cwd: entry.cwd ?? null,
        timestamp: entry.timestamp ?? null,
        isSidechain: entry.isSidechain === true,
      }
      continue
    }

    if (role !== 'assistant' || pendingUser === null) {
      continue
    }

    samples.push({
      messages: [
        {
          role: 'user',
          content: pendingUser.content,
        },
        {
          role: 'assistant',
          content: text,
        },
      ],
      metadata: {
        sessionId: entry.sessionId ?? pendingUser.sessionId,
        cwd: entry.cwd ?? pendingUser.cwd,
        transcriptPath,
        userTimestamp: pendingUser.timestamp,
        assistantTimestamp: entry.timestamp ?? null,
        assistantModel:
          typeof entry.message?.model === 'string' ? entry.message.model : null,
        isSidechain: pendingUser.isSidechain || entry.isSidechain === true,
      },
    })
    pendingUser = null
  }

  return samples
}
