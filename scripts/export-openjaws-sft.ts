import { mkdir, readdir, readFile, writeFile } from 'fs/promises'
import { dirname, join, resolve } from 'path'
import { homedir } from 'os'
import {
  buildOpenJawsSftSamples,
  type MinimalTranscriptEntry,
  type OpenJawsSftSample,
} from '../src/utils/openjawsSftDataset.js'

type CliOptions = {
  rootDir: string
  outputPath: string
  projectFilter: string | null
  limit: number | null
  includeSidechains: boolean
  includeLowSignal: boolean
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    rootDir: resolve(homedir(), '.openjaws', 'projects'),
    outputPath: resolve(process.cwd(), 'data', 'sft', 'openjaws-sft.jsonl'),
    projectFilter: null,
    limit: null,
    includeSidechains: false,
    includeLowSignal: false,
  }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--root' && argv[i + 1]) {
      options.rootDir = resolve(argv[++i]!)
      continue
    }
    if (arg === '--out' && argv[i + 1]) {
      options.outputPath = resolve(argv[++i]!)
      continue
    }
    if (arg === '--project' && argv[i + 1]) {
      options.projectFilter = argv[++i]!.toLowerCase()
      continue
    }
    if (arg === '--limit' && argv[i + 1]) {
      const parsed = Number.parseInt(argv[++i]!, 10)
      if (Number.isFinite(parsed) && parsed > 0) {
        options.limit = parsed
      }
      continue
    }
    if (arg === '--include-sidechains') {
      options.includeSidechains = true
      continue
    }
    if (arg === '--include-low-signal') {
      options.includeLowSignal = true
      continue
    }
    if (arg === '--help' || arg === '-h') {
      printHelpAndExit()
    }
  }

  return options
}

function printHelpAndExit(): never {
  console.log(
    [
      'Usage: bun scripts/export-openjaws-sft.ts [options]',
      '',
      'Options:',
      '  --out <path>                Output JSONL path',
      '  --root <path>               Transcript root directory',
      '  --project <substring>       Filter transcripts by cwd/path substring',
      '  --limit <n>                 Stop after writing n samples',
      '  --include-sidechains        Include agent/subagent transcripts',
      '  --include-low-signal        Keep greeting/test chatter instead of filtering it',
      '  -h, --help                  Show this help',
    ].join('\n'),
  )
  process.exit(0)
}

async function listJsonlFiles(rootDir: string): Promise<string[]> {
  const found: string[] = []
  const stack = [rootDir]

  while (stack.length > 0) {
    const current = stack.pop()!
    let dirEntries
    try {
      dirEntries = await readdir(current, { withFileTypes: true })
    } catch {
      continue
    }

    for (const entry of dirEntries) {
      const fullPath = join(current, entry.name)
      if (entry.isDirectory()) {
        stack.push(fullPath)
        continue
      }
      if (entry.isFile() && entry.name.endsWith('.jsonl')) {
        found.push(fullPath)
      }
    }
  }

  return found.sort()
}

async function loadTranscriptEntries(
  transcriptPath: string,
): Promise<MinimalTranscriptEntry[]> {
  const content = await readFile(transcriptPath, 'utf8')
  return content
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .flatMap(line => {
      try {
        return [JSON.parse(line) as MinimalTranscriptEntry]
      } catch {
        return []
      }
    })
}

function matchesProjectFilter(
  transcriptPath: string,
  samples: OpenJawsSftSample[],
  projectFilter: string | null,
): boolean {
  if (!projectFilter) return true
  const loweredPath = transcriptPath.toLowerCase()
  if (loweredPath.includes(projectFilter)) return true
  return samples.some(sample =>
    (sample.metadata.cwd ?? '').toLowerCase().includes(projectFilter),
  )
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  const transcriptPaths = await listJsonlFiles(options.rootDir)
  const outputLines: string[] = []
  let transcriptCount = 0

  for (const transcriptPath of transcriptPaths) {
    const entries = await loadTranscriptEntries(transcriptPath)
    const samples = buildOpenJawsSftSamples(entries, transcriptPath, {
      includeSidechains: options.includeSidechains,
      includeLowSignal: options.includeLowSignal,
    })

    if (!matchesProjectFilter(transcriptPath, samples, options.projectFilter)) {
      continue
    }

    if (samples.length === 0) continue
    transcriptCount++

    for (const sample of samples) {
      outputLines.push(JSON.stringify(sample))
      if (options.limit !== null && outputLines.length >= options.limit) {
        break
      }
    }

    if (options.limit !== null && outputLines.length >= options.limit) {
      break
    }
  }

  await mkdir(dirname(options.outputPath), { recursive: true })
  const payload = outputLines.length > 0 ? `${outputLines.join('\n')}\n` : ''
  await writeFile(options.outputPath, payload, 'utf8')

  console.log(
    JSON.stringify(
      {
        outputPath: options.outputPath,
        rootDir: options.rootDir,
        transcriptsScanned: transcriptPaths.length,
        transcriptsIncluded: transcriptCount,
        samplesWritten: outputLines.length,
        includeSidechains: options.includeSidechains,
        includeLowSignal: options.includeLowSignal,
        projectFilter: options.projectFilter,
      },
      null,
      2,
    ),
  )
}

await main()
