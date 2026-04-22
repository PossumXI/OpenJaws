import { randomUUID } from 'crypto'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { readFileSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { getOpenJawsConfigHomeDir } from './envUtils.js'

export type ApexOperatorActivityApp =
  | 'mail'
  | 'chat'
  | 'store'
  | 'chrono'
  | 'browser'

export type ApexOperatorActivityStatus = 'ok' | 'failed'

export type ApexOperatorActivityEntry = {
  id: string
  timestamp: string
  app: ApexOperatorActivityApp
  action: string
  status: ApexOperatorActivityStatus
  summary: string
  operatorActions: string[]
  artifacts: string[]
}

export type ApexOperatorActivityReceipt = {
  version: 1
  updatedAt: string
  lastActivityId: string | null
  activities: ApexOperatorActivityEntry[]
}

export type ApexOperatorActivitySummary = {
  headline: string
  details: string[]
}

const APEX_OPERATOR_ACTIVITY_DIR = 'apex-operator-activity'
const APEX_OPERATOR_ACTIVITY_RECEIPT = 'receipt.json'
const MAX_APEX_OPERATOR_ACTIVITY_ENTRIES = 20

function createEmptyReceipt(): ApexOperatorActivityReceipt {
  return {
    version: 1,
    updatedAt: new Date(0).toISOString(),
    lastActivityId: null,
    activities: [],
  }
}

function sanitizeInlineText(
  value: string | null | undefined,
  maxLength = 280,
): string | null {
  if (!value) {
    return null
  }
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (!normalized) {
    return null
  }
  if (normalized.length <= maxLength) {
    return normalized
  }
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`
}

function normalizeOperatorAction(
  value: string | null | undefined,
): string | null {
  const sanitized = sanitizeInlineText(value, 64)
  if (!sanitized) {
    return null
  }
  const normalized = sanitized
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return normalized || null
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(
      values
        .map(value => sanitizeInlineText(value, 72))
        .filter((value): value is string => Boolean(value)),
    ),
  )
}

function normalizeTimestamp(value: string | null | undefined): string {
  const parsed = value ? Date.parse(value) : Number.NaN
  return Number.isFinite(parsed)
    ? new Date(parsed).toISOString()
    : new Date().toISOString()
}

function isApexOperatorActivityApp(
  value: unknown,
): value is ApexOperatorActivityApp {
  return (
    value === 'mail' ||
    value === 'chat' ||
    value === 'store' ||
    value === 'chrono' ||
    value === 'browser'
  )
}

function isApexOperatorActivityStatus(
  value: unknown,
): value is ApexOperatorActivityStatus {
  return value === 'ok' || value === 'failed'
}

function isApexOperatorActivityEntry(
  value: unknown,
): value is ApexOperatorActivityEntry {
  if (!value || typeof value !== 'object') {
    return false
  }
  const record = value as Partial<ApexOperatorActivityEntry>
  return (
    typeof record.id === 'string' &&
    typeof record.timestamp === 'string' &&
    isApexOperatorActivityApp(record.app) &&
    typeof record.action === 'string' &&
    isApexOperatorActivityStatus(record.status) &&
    typeof record.summary === 'string' &&
    Array.isArray(record.operatorActions) &&
    Array.isArray(record.artifacts)
  )
}

function parseReceipt(raw: string): ApexOperatorActivityReceipt {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return createEmptyReceipt()
  }

  if (!parsed || typeof parsed !== 'object') {
    return createEmptyReceipt()
  }

  const record = parsed as Partial<ApexOperatorActivityReceipt>
  const activities = Array.isArray(record.activities)
    ? record.activities.filter(isApexOperatorActivityEntry)
    : []

  return {
    version: 1,
    updatedAt:
      typeof record.updatedAt === 'string'
        ? normalizeTimestamp(record.updatedAt)
        : createEmptyReceipt().updatedAt,
    lastActivityId:
      typeof record.lastActivityId === 'string' ? record.lastActivityId : null,
    activities,
  }
}

function appLabel(app: ApexOperatorActivityApp): string {
  switch (app) {
    case 'mail':
      return 'Aegis Mail'
    case 'chat':
      return 'Shadow Chat'
    case 'store':
      return 'App Store'
    case 'chrono':
      return 'Chrono'
    case 'browser':
      return 'Browser'
  }
}

function humanizeAction(action: string): string {
  return action.replace(/[_-]+/g, ' ').trim()
}

function summarizeActivity(entry: ApexOperatorActivityEntry): string {
  return `${appLabel(entry.app)} ${humanizeAction(entry.action)}`
}

async function writeReceipt(receipt: ApexOperatorActivityReceipt): Promise<void> {
  const outputPath = getApexOperatorActivityReceiptPath()
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, JSON.stringify(receipt, null, 2) + '\n', 'utf8')
}

export function getApexOperatorActivityReceiptPath(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const configured = env.OPENJAWS_APEX_OPERATOR_ACTIVITY_FILE?.trim()
  if (configured) {
    return resolve(configured)
  }
  return join(
    getOpenJawsConfigHomeDir(),
    APEX_OPERATOR_ACTIVITY_DIR,
    APEX_OPERATOR_ACTIVITY_RECEIPT,
  )
}

export async function readApexOperatorActivityReceipt(): Promise<ApexOperatorActivityReceipt> {
  try {
    const raw = await readFile(getApexOperatorActivityReceiptPath(), 'utf8')
    return parseReceipt(raw)
  } catch {
    return createEmptyReceipt()
  }
}

export function readApexOperatorActivityReceiptSync(): ApexOperatorActivityReceipt {
  try {
    const raw = readFileSync(getApexOperatorActivityReceiptPath(), 'utf8')
    return parseReceipt(raw)
  } catch {
    return createEmptyReceipt()
  }
}

export async function recordApexOperatorActivity(input: {
  app: ApexOperatorActivityApp
  action: string
  status: ApexOperatorActivityStatus
  summary: string
  operatorActions?: Array<string | null | undefined>
  artifacts?: Array<string | null | undefined>
  timestamp?: string | null
}): Promise<ApexOperatorActivityReceipt> {
  const action =
    normalizeOperatorAction(input.action) ??
    normalizeOperatorAction(`${input.app}_action`) ??
    `${input.app}_action`
  const summary =
    sanitizeInlineText(input.summary, 320) ??
    `${appLabel(input.app)} ${humanizeAction(action)} ${input.status === 'ok' ? 'completed' : 'failed'} through the bounded Apex operator lane.`
  const entry: ApexOperatorActivityEntry = {
    id: `apex-operator-${action}-${randomUUID()}`,
    timestamp: normalizeTimestamp(input.timestamp),
    app: input.app,
    action,
    status: input.status,
    summary,
    operatorActions: uniqueStrings([
      ...(
        input.operatorActions?.map(value => normalizeOperatorAction(value)) ?? []
      ),
      action,
      `${input.app}_operator_activity`,
      'apex_operator_activity',
    ]),
    artifacts: uniqueStrings([
      ...(input.artifacts ?? []),
      `apex:${input.app}-${action}`,
    ]),
  }

  const receipt = await readApexOperatorActivityReceipt()
  const next: ApexOperatorActivityReceipt = {
    version: 1,
    updatedAt: entry.timestamp,
    lastActivityId: entry.id,
    activities: [entry, ...receipt.activities].slice(
      0,
      MAX_APEX_OPERATOR_ACTIVITY_ENTRIES,
    ),
  }
  await writeReceipt(next)
  return next
}

export function summarizeApexOperatorActivityReceipt(
  receipt: ApexOperatorActivityReceipt | null,
): ApexOperatorActivitySummary {
  if (!receipt || receipt.activities.length === 0) {
    return {
      headline: 'No recent accountable Apex operator actions recorded yet.',
      details: [
        'Bounded /apex mail, chat, store, chrono, and browser actions will land here when the operator lane performs real work.',
      ],
    }
  }

  const [latest, ...rest] = receipt.activities
  return {
    headline: `${summarizeActivity(latest)} · ${latest.status}`,
    details: [
      latest.summary,
      latest.timestamp,
      ...rest.slice(0, 3).map(entry => `${summarizeActivity(entry)} · ${entry.timestamp}`),
    ],
  }
}
