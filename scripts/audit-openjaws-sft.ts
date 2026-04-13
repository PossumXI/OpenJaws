import { mkdir, readFile, writeFile } from 'fs/promises'
import { dirname, resolve } from 'path'
import {
  auditOpenJawsSftSamples,
  filterCleanPreparedOpenJawsSftSamples,
} from '../src/utils/openjawsSftQuality.js'
import type { PreparedOpenJawsSftSample } from '../src/utils/openjawsSftPreparation.js'

type CliOptions = {
  inputPath: string
  outDir: string
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    inputPath: resolve(process.cwd(), 'data', 'sft', 'prepared', 'all.jsonl'),
    outDir: resolve(process.cwd(), 'data', 'sft', 'audited'),
  }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--in' && argv[i + 1]) {
      options.inputPath = resolve(argv[++i]!)
      continue
    }
    if (arg === '--out-dir' && argv[i + 1]) {
      options.outDir = resolve(argv[++i]!)
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
      'Usage: bun scripts/audit-openjaws-sft.ts [options]',
      '',
      'Options:',
      '  --in <path>         Prepared all.jsonl path',
      '  --out-dir <path>    Output directory for audit report and cleaned splits',
      '  -h, --help          Show this help',
    ].join('\n'),
  )
  process.exit(0)
}

async function loadPreparedSamples(path: string): Promise<PreparedOpenJawsSftSample[]> {
  const content = await readFile(path, 'utf8')
  return content
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .flatMap(line => {
      try {
        return [JSON.parse(line) as PreparedOpenJawsSftSample]
      } catch {
        return []
      }
    })
}

async function writeJsonl(path: string, rows: PreparedOpenJawsSftSample[]) {
  await mkdir(dirname(path), { recursive: true })
  const payload =
    rows.length > 0 ? `${rows.map(row => JSON.stringify(row)).join('\n')}\n` : ''
  await writeFile(path, payload, 'utf8')
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const samples = await loadPreparedSamples(options.inputPath)
  const audit = auditOpenJawsSftSamples(samples)
  const cleanSamples = filterCleanPreparedOpenJawsSftSamples(samples)
  const cleanTrain = cleanSamples.filter(sample => sample.split === 'train')
  const cleanEval = cleanSamples.filter(sample => sample.split === 'eval')
  const flagged = audit.results
    .filter(result => result.issues.length > 0)
    .map(result => ({
      signature: (result.sample as PreparedOpenJawsSftSample).signature ?? null,
      split: (result.sample as PreparedOpenJawsSftSample).split ?? null,
      tags: (result.sample as PreparedOpenJawsSftSample).tags ?? [],
      prompt: result.sample.messages[0].content,
      assistant: result.sample.messages[1].content,
      issues: result.issues,
    }))

  await mkdir(options.outDir, { recursive: true })
  await writeJsonl(resolve(options.outDir, 'all.jsonl'), cleanSamples)
  await writeJsonl(resolve(options.outDir, 'train.jsonl'), cleanTrain)
  await writeJsonl(resolve(options.outDir, 'eval.jsonl'), cleanEval)
  await writeFile(
    resolve(options.outDir, 'audit-report.json'),
    `${JSON.stringify(
      {
        inputPath: options.inputPath,
        outputDir: options.outDir,
        cleanCounts: {
          all: cleanSamples.length,
          train: cleanTrain.length,
          eval: cleanEval.length,
        },
        ...audit.summary,
        flaggedSamples: flagged,
      },
      null,
      2,
    )}\n`,
    'utf8',
  )

  console.log(
    JSON.stringify(
      {
        inputPath: options.inputPath,
        outDir: options.outDir,
        cleanCounts: {
          all: cleanSamples.length,
          train: cleanTrain.length,
          eval: cleanEval.length,
        },
        ...audit.summary,
      },
      null,
      2,
    ),
  )
}

await main()
