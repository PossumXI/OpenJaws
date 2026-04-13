import { randomUUID } from 'crypto'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import { getErrnoCode } from './errors.js'
import { getSessionMemoryDir } from './permissions/filesystem.js'

export type NoteDeckEntry = {
  id: string
  text: string
  createdAt: string
}

type NoteDeckFile = {
  entries: NoteDeckEntry[]
}

export type NoteDeckStatus = {
  count: number
  latestSummary?: string
}

const NOTE_DECK_FILENAME = 'note-deck.json'
const MAX_NOTE_TEXT_CHARS = 2000
const MAX_CONTEXT_NOTES = 12
const MAX_CONTEXT_CHARS = 4000

export function getNoteDeckPath(): string {
  return join(getSessionMemoryDir(), NOTE_DECK_FILENAME)
}

function normalizeNoteText(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, MAX_NOTE_TEXT_CHARS)
}

async function readNoteDeckFile(): Promise<NoteDeckFile> {
  try {
    const raw = await readFile(getNoteDeckPath(), 'utf8')
    const parsed = JSON.parse(raw) as Partial<NoteDeckFile>
    const entries = Array.isArray(parsed.entries)
      ? parsed.entries
          .filter(
            (entry): entry is NoteDeckEntry =>
              entry != null &&
              typeof entry.id === 'string' &&
              typeof entry.text === 'string' &&
              typeof entry.createdAt === 'string',
          )
          .map(entry => ({
            id: entry.id,
            text: normalizeNoteText(entry.text),
            createdAt: entry.createdAt,
          }))
          .filter(entry => entry.text.length > 0)
      : []
    return { entries }
  } catch (error) {
    if (getErrnoCode(error) === 'ENOENT') {
      return { entries: [] }
    }
    throw error
  }
}

async function writeNoteDeckFile(file: NoteDeckFile): Promise<void> {
  const noteDeckPath = getNoteDeckPath()
  await mkdir(dirname(noteDeckPath), { recursive: true })
  await writeFile(noteDeckPath, JSON.stringify(file, null, 2), 'utf8')
}

export async function getNoteDeckEntries(): Promise<NoteDeckEntry[]> {
  const file = await readNoteDeckFile()
  return [...file.entries].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export async function addNoteDeckEntry(text: string): Promise<NoteDeckEntry> {
  const normalized = normalizeNoteText(text)
  if (!normalized) {
    throw new Error('Note text cannot be empty.')
  }

  const file = await readNoteDeckFile()
  const entry: NoteDeckEntry = {
    id: randomUUID(),
    text: normalized,
    createdAt: new Date().toISOString(),
  }
  await writeNoteDeckFile({
    entries: [...file.entries, entry],
  })
  return entry
}

export async function clearNoteDeck(): Promise<void> {
  await writeNoteDeckFile({ entries: [] })
}

export function summarizeNoteText(text: string, maxChars = 72): string {
  const normalized = normalizeNoteText(text)
  if (normalized.length <= maxChars) {
    return normalized
  }
  return `${normalized.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`
}

export async function loadNoteDeckStatus(): Promise<NoteDeckStatus> {
  const entries = await getNoteDeckEntries()
  return {
    count: entries.length,
    latestSummary:
      entries.length > 0 ? summarizeNoteText(entries[0]!.text, 96) : undefined,
  }
}

export async function getNoteDeckContext(): Promise<string | null> {
  const entries = await getNoteDeckEntries()
  if (entries.length === 0) {
    return null
  }

  const lines: string[] = [
    'Session note deck: user supervision notes that may be added while work is in progress. Treat the latest notes as steering for future turns and newly spawned openckeek agents.',
  ]

  for (const entry of entries.slice(0, MAX_CONTEXT_NOTES)) {
    const timestamp = entry.createdAt.replace('T', ' ').replace(/\.\d+Z$/, 'Z')
    lines.push(`- ${timestamp}: ${entry.text}`)
  }

  let context = lines.join('\n')
  if (context.length > MAX_CONTEXT_CHARS) {
    context =
      context.slice(0, MAX_CONTEXT_CHARS).trimEnd() +
      '\n- … older notes omitted for length'
  }
  return context
}
