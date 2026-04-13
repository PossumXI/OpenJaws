import { mkdir, readFile, writeFile } from 'fs/promises'
import { dirname, resolve } from 'path'
import {
  prepareOpenJawsSftDataset,
  type PreparedOpenJawsSftSample,
} from '../src/utils/openjawsSftPreparation.js'
import {
  buildOpenJawsSftBundleManifest,
  groupPreparedSamplesByLanguage,
  groupPreparedSamplesByTag,
} from '../src/utils/openjawsSftBundles.js'
import type { OpenJawsSftSample } from '../src/utils/openjawsSftDataset.js'

type CliOptions = {
  inputPath: string
  outDir: string
  evalRatio: number
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    inputPath: resolve(process.cwd(), 'data', 'sft', 'openjaws-sft.jsonl'),
    outDir: resolve(process.cwd(), 'data', 'sft', 'prepared'),
    evalRatio: 0.05,
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
    if (arg === '--eval-ratio' && argv[i + 1]) {
      const parsed = Number.parseFloat(argv[++i]!)
      if (Number.isFinite(parsed) && parsed > 0 && parsed < 1) {
        options.evalRatio = parsed
      }
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
      'Usage: bun scripts/prepare-openjaws-sft.ts [options]',
      '',
      'Options:',
      '  --in <path>           Input JSONL from export:sft',
      '  --out-dir <path>      Output directory for prepared files',
      '  --eval-ratio <n>      Eval split ratio, default 0.05',
      '  -h, --help            Show this help',
    ].join('\n'),
  )
  process.exit(0)
}

async function loadSamples(path: string): Promise<OpenJawsSftSample[]> {
  const content = await readFile(path, 'utf8')
  return content
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .flatMap(line => {
      try {
        return [JSON.parse(line) as OpenJawsSftSample]
      } catch {
        return []
      }
    })
}

async function writeJsonl(path: string, rows: PreparedOpenJawsSftSample[]) {
  const payload =
    rows.length > 0 ? `${rows.map(row => JSON.stringify(row)).join('\n')}\n` : ''
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, payload, 'utf8')
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const input = await loadSamples(options.inputPath)
  const prepared = prepareOpenJawsSftDataset(input, {
    evalRatio: options.evalRatio,
  })
  const train = prepared.samples.filter(sample => sample.split === 'train')
  const evalRows = prepared.samples.filter(sample => sample.split === 'eval')

  await mkdir(options.outDir, { recursive: true })
  await writeJsonl(resolve(options.outDir, 'all.jsonl'), prepared.samples)
  await writeJsonl(resolve(options.outDir, 'train.jsonl'), train)
  await writeJsonl(resolve(options.outDir, 'eval.jsonl'), evalRows)
  const tagGroups = groupPreparedSamplesByTag(prepared.samples)
  const languageGroups = groupPreparedSamplesByLanguage(prepared.samples)
  for (const [tag, group] of Object.entries(tagGroups)) {
    await writeJsonl(resolve(options.outDir, 'tags', tag, 'all.jsonl'), group.all)
    await writeJsonl(
      resolve(options.outDir, 'tags', tag, 'train.jsonl'),
      group.train,
    )
    await writeJsonl(
      resolve(options.outDir, 'tags', tag, 'eval.jsonl'),
      group.eval,
    )
  }
  for (const [language, group] of Object.entries(languageGroups)) {
    await writeJsonl(
      resolve(options.outDir, 'languages', language, 'all.jsonl'),
      group.all,
    )
    await writeJsonl(
      resolve(options.outDir, 'languages', language, 'train.jsonl'),
      group.train,
    )
    await writeJsonl(
      resolve(options.outDir, 'languages', language, 'eval.jsonl'),
      group.eval,
    )
  }
  await writeFile(
    resolve(options.outDir, 'manifest.json'),
    `${JSON.stringify(prepared.manifest, null, 2)}\n`,
    'utf8',
  )
  const bundleManifest = buildOpenJawsSftBundleManifest({
    bundleId: `prepared-${Date.now()}`,
    sourcePath: options.inputPath,
    outDir: options.outDir,
    preparedManifest: prepared.manifest,
    samples: prepared.samples,
  })
  await writeFile(
    resolve(options.outDir, 'bundle-manifest.json'),
    `${JSON.stringify(bundleManifest, null, 2)}\n`,
    'utf8',
  )

  console.log(
    JSON.stringify(
      {
        inputPath: options.inputPath,
        outDir: options.outDir,
        evalRatio: options.evalRatio,
        ...prepared.manifest,
        bundleManifest: resolve(options.outDir, 'bundle-manifest.json'),
      },
      null,
      2,
    ),
  )
}

await main()
