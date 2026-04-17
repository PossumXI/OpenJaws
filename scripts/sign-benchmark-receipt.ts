import { basename, dirname, extname, join, resolve } from 'path'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'fs'
import {
  buildImmaculateTraceReference,
  type ImmaculateTraceReference,
} from '../src/utils/immaculateTraceReceipt.js'
import {
  resolveBenchmarkSigningPrivateKey,
  signBenchmarkReceipt,
  verifyBenchmarkReceiptSignature,
} from '../src/utils/benchmarkReceiptSignature.js'

type CliOptions = {
  reportPath: string | null
  tracePaths: string[]
  outPath: string | null
  verifyReceiptPath: string | null
  keyFilePath: string | null
  publicKeyFilePath: string | null
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    reportPath: null,
    tracePaths: [],
    outPath: null,
    verifyReceiptPath: null,
    keyFilePath: null,
    publicKeyFilePath: null,
  }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--report' && argv[i + 1]) {
      options.reportPath = resolve(argv[++i]!)
      continue
    }
    if (arg === '--trace' && argv[i + 1]) {
      options.tracePaths.push(resolve(argv[++i]!))
      continue
    }
    if (arg === '--out' && argv[i + 1]) {
      options.outPath = resolve(argv[++i]!)
      continue
    }
    if (arg === '--verify' && argv[i + 1]) {
      options.verifyReceiptPath = resolve(argv[++i]!)
      continue
    }
    if (arg === '--key-file' && argv[i + 1]) {
      options.keyFilePath = resolve(argv[++i]!)
      continue
    }
    if (arg === '--public-key-file' && argv[i + 1]) {
      options.publicKeyFilePath = resolve(argv[++i]!)
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
      'Usage: bun scripts/sign-benchmark-receipt.ts [options]',
      '',
      'Options:',
      '  --report <path>           Benchmark report JSON to hash and package',
      '  --trace <path>            Typed Immaculate trace JSONL to reference (repeatable)',
      '  --out <path>              Output receipt path (defaults next to the report)',
      '  --key-file <path>         PEM private key file for Ed25519 signing',
      '  --public-key-file <path>  PEM public key file for receipt verification',
      '  --verify <path>           Verify an existing receipt instead of writing one',
      '  -h, --help                Show this help',
    ].join('\n'),
  )
  process.exit(0)
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T
}

function resolveReceiptPath(reportPath: string, outPath: string | null): string {
  if (outPath) {
    return outPath
  }
  const dir = dirname(reportPath)
  const ext = extname(reportPath)
  const base = basename(reportPath, ext)
  const receiptBase = base.endsWith('-report')
    ? `${base.slice(0, -'-report'.length)}-receipt`
    : `${base}-receipt`
  return join(dir, `${receiptBase}${ext || '.json'}`)
}

function resolveTraceReferences(
  report: Record<string, unknown>,
  tracePaths: string[],
  reportPath: string,
): ImmaculateTraceReference[] {
  if (tracePaths.length > 0) {
    return tracePaths
      .filter(existsSync)
      .map(path => buildImmaculateTraceReference(path))
  }
  const existing = report.traceReferences
  if (!Array.isArray(existing)) {
    const siblingTracePaths = readdirSync(dirname(reportPath), {
      withFileTypes: true,
    })
      .filter(
        entry => entry.isFile() && entry.name.toLowerCase().endsWith('.trace.jsonl'),
      )
      .map(entry => join(dirname(reportPath), entry.name))
      .filter(existsSync)
      .sort()
    return siblingTracePaths.map(path => buildImmaculateTraceReference(path))
  }
  return existing.filter(
    (entry): entry is ImmaculateTraceReference =>
      Boolean(entry) &&
      typeof entry === 'object' &&
      typeof (entry as ImmaculateTraceReference).path === 'string' &&
      typeof (entry as ImmaculateTraceReference).sha256 === 'string',
  )
}

function sha256Text(value: string): string {
  return new Bun.CryptoHasher('sha256').update(value).digest('hex')
}

async function main() {
  const options = parseArgs(process.argv.slice(2))

  if (options.verifyReceiptPath) {
    const receipt = readJson<Record<string, unknown>>(options.verifyReceiptPath)
    const verification = verifyBenchmarkReceiptSignature({
      receipt,
      publicKeyPem: options.publicKeyFilePath
        ? readFileSync(options.publicKeyFilePath, 'utf8')
        : undefined,
    })
    console.log(
      JSON.stringify(
        {
          status: verification.valid ? 'ok' : 'failed',
          receiptPath: options.verifyReceiptPath,
          verification,
        },
        null,
        2,
      ),
    )
    process.exit(verification.valid ? 0 : 1)
  }

  if (!options.reportPath) {
    throw new Error('Missing --report <path>.')
  }

  if (!existsSync(options.reportPath)) {
    throw new Error(`Benchmark report not found: ${options.reportPath}`)
  }

  const report = readJson<Record<string, unknown>>(options.reportPath)
  const reportText = `${JSON.stringify(report, null, 2)}\n`
  const traceReferences = resolveTraceReferences(
    report,
    options.tracePaths,
    options.reportPath,
  )
  const receiptPath = resolveReceiptPath(options.reportPath, options.outPath)
  const privateKeyPem = options.keyFilePath
    ? readFileSync(options.keyFilePath, 'utf8')
    : resolveBenchmarkSigningPrivateKey()
  const receipt: Record<string, unknown> = {
    kind: 'openjaws_benchmark_receipt',
    generatedAt: new Date().toISOString(),
    reportPath: options.reportPath,
    reportSha256: sha256Text(reportText),
    reportGeneratedAt:
      typeof report.generatedAt === 'string' ? report.generatedAt : null,
    benchmarkId:
      typeof report.benchmarkId === 'string'
        ? report.benchmarkId
        : typeof report.runId === 'string'
          ? report.runId
          : null,
    traceReferences,
    signature: null,
  }

  if (privateKeyPem) {
    receipt.signature = signBenchmarkReceipt({
      receipt,
      privateKeyPem,
    })
  }

  writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8')

  console.log(
    JSON.stringify(
      {
        status: 'ok',
        reportPath: options.reportPath,
        receiptPath,
        signed: Boolean(receipt.signature),
        traceCount: traceReferences.length,
      },
      null,
      2,
    ),
  )
}

await main()
