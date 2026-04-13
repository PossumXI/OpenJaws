import React from 'react'
import { readFile } from 'fs/promises'
import stripAnsi from 'strip-ansi'
import { PassThrough } from 'stream'
import type { AppStateStore } from '../src/state/AppStateStore.js'
import type { ToolUseContext } from '../src/Tool.js'
import type { LocalJSXCommandContext } from '../src/types/command.js'
import type { Message } from '../src/types/message.js'
import type { FileStateCache } from '../src/utils/fileStateCache.js'
import type { ThinkingConfig } from '../src/utils/thinking.js'

const SYNC_START = '\x1B[?2026h'
const SYNC_END = '\x1B[?2026l'

export const WALKTHROUGH_TIMEOUT_MS = 20_000

export class FakeTTYInput extends PassThrough {
  override isTTY = true
  isRaw = false

  constructor() {
    super()
    this.setEncoding('utf8')
  }

  setRawMode(mode: boolean): void {
    this.isRaw = mode
  }

  ref(): this {
    return this
  }

  unref(): this {
    return this
  }
}

export class CaptureOutput extends PassThrough {
  override isTTY = false
  columns = 120
  rows = 40
}

export async function setMacroVersionFromPackageJson(): Promise<string> {
  const packageJson = JSON.parse(
    await readFile(new URL('../package.json', import.meta.url), 'utf8'),
  ) as { version: string }
  ;(globalThis as { MACRO?: { VERSION: string } }).MACRO = {
    VERSION: packageJson.version,
  }
  return packageJson.version
}

function extractLastFrame(output: string): string {
  let cursor = 0
  let lastFrame: string | null = null
  while (true) {
    const start = output.indexOf(SYNC_START, cursor)
    if (start === -1) {
      break
    }
    const contentStart = start + SYNC_START.length
    const end = output.indexOf(SYNC_END, contentStart)
    if (end === -1) {
      break
    }
    lastFrame = output.slice(contentStart, end)
    cursor = end + SYNC_END.length
  }
  return lastFrame ?? output
}

export function normalizeFrame(output: string): string {
  return stripAnsi(extractLastFrame(output)).replace(/\r/g, '').trimEnd()
}

export function compactFrame(frame: string, maxLines = 18): string {
  return frame
    .split('\n')
    .map(line => line.trimEnd())
    .filter(Boolean)
    .slice(0, maxLines)
    .join('\n')
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function waitForFrame(
  readFrame: () => string,
  predicate: (frame: string) => boolean,
  timeoutMs: number,
  failureMessage: string,
): Promise<string> {
  const startedAt = Date.now()
  let lastFrame = readFrame()
  while (Date.now() - startedAt < timeoutMs) {
    lastFrame = readFrame()
    if (predicate(lastFrame)) {
      return lastFrame
    }
    await sleep(25)
  }
  throw new Error(
    `${failureMessage}\nLast frame:\n${lastFrame.slice(-4000) || '<empty>'}`,
  )
}

type HarnessContextOverrides = Partial<ToolUseContext & LocalJSXCommandContext> & {
  options?: Partial<(ToolUseContext & LocalJSXCommandContext)['options']>
}

export function buildHarnessContext(
  store: AppStateStore,
  messages: Message[],
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>,
  overrides: HarnessContextOverrides = {},
): ToolUseContext & LocalJSXCommandContext {
  const thinkingConfig: ThinkingConfig = { type: 'disabled' }
  const baseOptions: (ToolUseContext & LocalJSXCommandContext)['options'] = {
    commands: [],
    debug: false,
    mainLoopModel: 'openai:gpt-5.4',
    tools: [],
    verbose: false,
    thinkingConfig,
    mcpClients: [],
    mcpResources: {},
    ideInstallationStatus: null,
    isNonInteractiveSession: false,
    agentDefinitions: { activeAgents: [], allAgents: [] },
    theme: 'opencheeks-light',
  }
  const baseContext: ToolUseContext & LocalJSXCommandContext = {
    messages,
    setMessages: updater => setMessages(prev => updater(prev)),
    onChangeAPIKey: () => {},
    options: baseOptions,
    abortController: new AbortController(),
    readFileState: {} as FileStateCache,
    getAppState: () => store.getState(),
    setAppState: store.setState,
    nestedMemoryAttachmentTriggers: new Set<string>(),
    loadedNestedMemoryPaths: new Set<string>(),
    dynamicSkillDirTriggers: new Set<string>(),
    discoveredSkillNames: new Set<string>(),
    setInProgressToolUseIDs: () => {},
    setResponseLength: () => {},
    updateFileHistoryState: updater =>
      store.setState(prev => ({
        ...prev,
        fileHistory: updater(prev.fileHistory),
      })),
    updateAttributionState: updater =>
      store.setState(prev => ({
        ...prev,
        attribution: updater(prev.attribution),
      })),
  }

  return {
    ...baseContext,
    ...overrides,
    options: {
      ...baseOptions,
      ...overrides.options,
    },
  }
}
