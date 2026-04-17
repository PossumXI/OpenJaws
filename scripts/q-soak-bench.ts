import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'
import { execa } from 'execa'
import {
  closeBenchmarkTraceWriter,
  createBenchmarkTraceWriter,
  appendBenchmarkTraceEvent,
} from '../src/immaculate/benchmarkTrace.js'
import {
  buildQProviderProbeCheck,
  probeQProviderModel,
  type QPreflightCheck as PreflightCheck,
} from '../src/q/runtime.js'
import {
  buildQSoakSummary,
  type QSoakProbeMode as ProbeMode,
  type QSoakProbeResult as SoakProbeResult,
  type QSoakProbeStatus as ProbeStatus,
} from '../src/q/soak.js'
import {
  resolveBenchmarkSigningPrivateKey,
  signBenchmarkReceipt,
} from '../src/utils/benchmarkReceiptSignature.js'
import {
  buildImmaculateTraceReference,
  sha256File,
} from '../src/utils/immaculateTraceReceipt.js'
import { queryOciQViaPython } from '../src/utils/ociQBridge.js'
import { resolveOciQRuntime } from '../src/utils/ociQRuntime.js'

type CliOptions = {
  root: string
  outputDir: string | null
  modes: ProbeMode[]
  durationMinutes: number
  intervalMs: number
  timeoutMs: number
  maxProbes: number | null
  openjawsModel: string
  prompt: string
  systemPrompt: string
  dryRun: boolean
}

function parseOptionalInt(value: string | undefined): number | null {
  if (!value) {
    return null
  }
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : null
}

function parseOptionalFloat(value: string | undefined): number | null {
  if (!value) {
    return null
  }
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : null
}

function normalizeMode(value: string): ProbeMode | null {
  const normalized = value.trim().toLowerCase()
  if (normalized === 'openjaws' || normalized === 'oci-q') {
    return normalized
  }
  if (normalized === 'both' || normalized === 'all') {
    return null
  }
  return null
}

function parseModeList(value: string): ProbeMode[] {
  const modes: ProbeMode[] = []
  for (const token of value.split(',')) {
    const normalized = normalizeMode(token)
    if (normalized) {
      modes.push(normalized)
    }
  }
  return modes
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    root: process.cwd(),
    outputDir: null,
    modes: ['openjaws', 'oci-q'],
    durationMinutes: 30,
    intervalMs: 60_000,
    timeoutMs: 120_000,
    maxProbes: null,
    openjawsModel: 'oci:Q',
    prompt: 'Reply with the single word OK.',
    systemPrompt: 'Reply briefly and operationally.',
    dryRun: false,
  }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--root' && argv[i + 1]) {
      options.root = resolve(argv[++i]!)
      continue
    }
    if ((arg === '--out-dir' || arg === '--output-dir') && argv[i + 1]) {
      options.outputDir = resolve(argv[++i]!)
      continue
    }
    if (arg === '--mode' && argv[i + 1]) {
      const parsedModes = parseModeList(argv[++i]!)
      if (parsedModes.length > 0) {
        options.modes = parsedModes
      }
      continue
    }
    if (arg === '--duration-minutes' && argv[i + 1]) {
      const parsed = parseOptionalFloat(argv[++i]!)
      if (parsed !== null && parsed > 0) {
        options.durationMinutes = parsed
      }
      continue
    }
    if (arg === '--interval-ms' && argv[i + 1]) {
      const parsed = parseOptionalInt(argv[++i]!)
      if (parsed !== null && parsed >= 0) {
        options.intervalMs = parsed
      }
      continue
    }
    if (arg === '--timeout-ms' && argv[i + 1]) {
      const parsed = parseOptionalInt(argv[++i]!)
      if (parsed !== null && parsed > 0) {
        options.timeoutMs = parsed
      }
      continue
    }
    if (arg === '--max-probes' && argv[i + 1]) {
      const parsed = parseOptionalInt(argv[++i]!)
      if (parsed !== null && parsed > 0) {
        options.maxProbes = parsed
      }
      continue
    }
    if (arg === '--openjaws-model' && argv[i + 1]) {
      options.openjawsModel = argv[++i]!
      continue
    }
    if (arg === '--prompt' && argv[i + 1]) {
      options.prompt = argv[++i]!
      continue
    }
    if (arg === '--system-prompt' && argv[i + 1]) {
      options.systemPrompt = argv[++i]!
      continue
    }
    if (arg === '--dry-run') {
      options.dryRun = true
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
      'Usage: bun scripts/q-soak-bench.ts [options]',
      '',
      'Options:',
      '  --mode <name>             openjaws | oci-q | both | all (default both)',
      '  --duration-minutes <n>    Target soak duration in minutes (default 30)',
      '  --interval-ms <n>         Delay between probe cycles in milliseconds (default 60000)',
      '  --timeout-ms <n>          Per-probe timeout in milliseconds (default 120000)',
      '  --max-probes <n>          Optional cap on total probe attempts',
      '  --openjaws-model <name>   Model passed to the OpenJaws binary (default oci:Q)',
      '  --prompt <text>           Prompt used for each probe',
      '  --system-prompt <text>    System prompt used for direct OCI-Q probes',
      '  --out-dir <path>          Output directory for the report artifact',
      '  --dry-run                 Emit a CI-safe plan/report without launching probes',
      '  -h, --help                Show this help',
    ].join('\n'),
  )
  process.exit(0)
}

function makeRunId(): string {
  return `q-soakbench-${new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '')}`
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function tailText(text: string, maxLines = 25, maxChars = 3000): string {
  const trimmed = text.trim()
  if (!trimmed) {
    return ''
  }
  const tailLines = trimmed.split(/\r?\n/).slice(-maxLines).join('\n')
  return tailLines.length > maxChars
    ? tailLines.slice(tailLines.length - maxChars)
    : tailLines
}

function quoteArg(value: string): string {
  if (/^[A-Za-z0-9_./:-]+$/.test(value)) {
    return value
  }
  return `"${value.replace(/"/g, '\\"')}"`
}

function buildOpenJawsBinary(root: string): string {
  return resolve(
    root,
    'dist',
    process.platform === 'win32' ? 'openjaws.exe' : 'openjaws',
  )
}

function buildOpenJawsCommand(args: {
  root: string
  model: string
  prompt: string
}): { binary: string; command: string; argv: string[] } {
  const binary = buildOpenJawsBinary(args.root)
  const argv = [
    '-p',
    '--output-format',
    'json',
    '--bare',
    '--max-turns',
    '1',
    '--model',
    args.model,
    args.prompt,
  ]
  return {
    binary,
    command: [quoteArg(binary), ...argv.map(quoteArg)].join(' '),
    argv,
  }
}

async function probeOpenJaws(args: {
  root: string
  model: string
  prompt: string
  timeoutMs: number
}): Promise<Omit<SoakProbeResult, 'index' | 'mode' | 'startedAt' | 'endedAt'>> {
  const { binary, command, argv } = buildOpenJawsCommand({
    root: args.root,
    model: args.model,
    prompt: args.prompt,
  })

  if (!existsSync(binary)) {
    return {
      status: 'failed',
      latencyMs: null,
      command,
      exitCode: null,
      responseText: null,
      error: `Compiled OpenJaws binary not found at ${binary}. Run bun run build:native first.`,
    }
  }

  const started = Date.now()
  const result = await execa(binary, argv, {
    cwd: args.root,
    reject: false,
    timeout: args.timeoutMs,
    windowsHide: true,
  })
  const latencyMs = Date.now() - started
  const stdout = result.stdout.trim()
  const lastLine = stdout ? stdout.split(/\r?\n/).slice(-1)[0] ?? stdout : ''
  let payload: Record<string, unknown> | null = null
  if (lastLine) {
    try {
      payload = JSON.parse(lastLine) as Record<string, unknown>
    } catch {
      payload = null
    }
  }

  const responseText =
    (payload && typeof payload.result === 'string' && payload.result.trim()) ||
    lastLine ||
    stdout
  const success =
    result.exitCode === 0 &&
    (!payload || payload.is_error !== true) &&
    responseText.length > 0

  return {
    status: success ? 'ok' : 'failed',
    latencyMs,
    command,
    exitCode: result.exitCode,
    responseText: responseText || null,
    error: success
      ? null
      : tailText(result.stderr || result.stdout) ||
        'OpenJaws probe failed without a structured response.',
  }
}

async function probeOciQ(args: {
  prompt: string
  systemPrompt: string
  timeoutMs: number
}): Promise<Omit<SoakProbeResult, 'index' | 'mode' | 'startedAt' | 'endedAt'>> {
  const runtime = resolveOciQRuntime()
  const command = `direct OCI-Q bridge via scripts/oci-q-response.py (${runtime.summary})`
  try {
    const started = Date.now()
    const response = await queryOciQViaPython({
      prompt: args.prompt,
      systemPrompt: args.systemPrompt,
      maxOutputTokens: 64,
      timeoutMs: args.timeoutMs,
    })
    const latencyMs = Date.now() - started
    return {
      status: response.text.trim().length > 0 ? 'ok' : 'failed',
      latencyMs,
      command,
      exitCode: 0,
      responseText: response.text.trim() || null,
      error: response.text.trim().length > 0 ? null : 'OCI-Q probe returned an empty response.',
    }
  } catch (error) {
    const latencyMs = null
    return {
      status: 'failed',
      latencyMs,
      command,
      exitCode: 1,
      responseText: null,
      error: error instanceof Error ? error.message : 'Unknown OCI-Q probe error.',
    }
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const runId = makeRunId()
  const outputDir =
    options.outputDir ?? resolve(options.root, 'artifacts', 'q-soak-bench', runId)
  mkdirSync(outputDir, { recursive: true })

  const startAt = new Date()
  const deadlineMs = startAt.getTime() + options.durationMinutes * 60_000
  const traceWriter = createBenchmarkTraceWriter({
    outputDir,
    sessionId: runId,
  })
  const checks: PreflightCheck[] = []
  const openjawsBinary = buildOpenJawsBinary(options.root)
  checks.push({
    name: 'openjaws-binary',
    status: existsSync(openjawsBinary) ? 'passed' : 'warning',
    summary: existsSync(openjawsBinary)
      ? `Compiled OpenJaws binary found at ${openjawsBinary}.`
      : `Compiled OpenJaws binary not found at ${openjawsBinary}.`,
  })
  const providerProbe = await probeQProviderModel({
    preferDirectQ: options.modes.includes('oci-q'),
    model: options.openjawsModel,
    timeoutMs: Math.min(options.timeoutMs, 15_000),
  })
  if (providerProbe) {
    checks.push(
      buildQProviderProbeCheck({
        name: 'oci-q-runtime',
        result: providerProbe,
      }),
    )
  }
  appendBenchmarkTraceEvent(traceWriter, 'route.dispatched', {
    routeId: `${runId}-preflight`,
    runId,
    provider: 'oci',
    model: options.openjawsModel,
    queueDepth: options.maxProbes,
    projectRoot: options.root,
  })

  const plannedCycleCount =
    options.maxProbes !== null
      ? options.maxProbes
      : Math.max(1, Math.ceil((options.durationMinutes * 60_000) / Math.max(1, options.intervalMs)))

  const report: Record<string, unknown> = {
    runId,
    generatedAt: new Date().toISOString(),
    outputDir,
    root: options.root,
    modes: options.modes,
    durationMinutes: options.durationMinutes,
    intervalMs: options.intervalMs,
    timeoutMs: options.timeoutMs,
    maxProbes: options.maxProbes,
    openjawsModel: options.openjawsModel,
    prompt: options.prompt,
    systemPrompt: options.systemPrompt,
    dryRun: options.dryRun,
    plannedCycleCount,
    checks,
    honestyBoundary:
      'This is a bounded local soak lane for OpenJaws and OCI Q. It measures repeated probe latency and failures for in-repo verification, not public leaderboard claims.',
  }

  const results: SoakProbeResult[] = []
  const latencySamples: number[] = []
  const modeSummary: Record<ProbeMode, { total: number; ok: number; failed: number; dryRun: number; latencies: number[] }> = {
    openjaws: { total: 0, ok: 0, failed: 0, dryRun: 0, latencies: [] },
    'oci-q': { total: 0, ok: 0, failed: 0, dryRun: 0, latencies: [] },
  }

  if (!options.dryRun) {
    let probeIndex = 0
    while (Date.now() < deadlineMs) {
      for (const mode of options.modes) {
        if (Date.now() >= deadlineMs) {
          break
        }
        if (options.maxProbes !== null && probeIndex >= options.maxProbes) {
          break
        }

        const startedAt = new Date()
        const remainingMs = deadlineMs - startedAt.getTime()
        const probeTimeoutMs = Math.max(1_000, Math.min(options.timeoutMs, remainingMs))

        const routeId = `${runId}-${mode}-${probeIndex}`
        appendBenchmarkTraceEvent(traceWriter, 'route.dispatched', {
          routeId,
          runId,
          provider: mode === 'openjaws' ? 'openjaws' : 'oci',
          model: mode === 'openjaws' ? options.openjawsModel : 'oci:Q',
          projectRoot: options.root,
          queueDepth: options.maxProbes,
        })
        let probeOutcome:
          | Omit<SoakProbeResult, 'index' | 'mode' | 'startedAt' | 'endedAt'>
          | null = null
        try {
          probeOutcome =
            mode === 'openjaws'
              ? await probeOpenJaws({
                  root: options.root,
                  model: options.openjawsModel,
                  prompt: options.prompt,
                  timeoutMs: probeTimeoutMs,
                })
              : await probeOciQ({
                  prompt: options.prompt,
                  systemPrompt: options.systemPrompt,
                  timeoutMs: probeTimeoutMs,
                })
        } catch (error) {
          probeOutcome = {
            status: 'failed',
            latencyMs: null,
            command: `${mode} probe failed before launch`,
            exitCode: 1,
            responseText: null,
            error: error instanceof Error ? error.message : 'Unknown probe error.',
          }
        }

        const endedAt = new Date()
        const result: SoakProbeResult = {
          index: probeIndex,
          mode,
          status: probeOutcome.status,
          startedAt: startedAt.toISOString(),
          endedAt: endedAt.toISOString(),
          latencyMs: probeOutcome.latencyMs,
          command: probeOutcome.command,
          exitCode: probeOutcome.exitCode,
          responseText: probeOutcome.responseText,
          error: probeOutcome.error,
        }

        results.push(result)
        appendBenchmarkTraceEvent(
          traceWriter,
          mode === 'openjaws' ? 'reflex.sampled' : 'cognitive.sampled',
          {
            sampleId: routeId,
            workerId: mode,
            latencyMs: Math.max(
              0,
              probeOutcome.latencyMs ??
                endedAt.getTime() - startedAt.getTime(),
            ),
            tokenCount: null,
            status:
              probeOutcome.status === 'ok'
                ? 'completed'
                : probeOutcome.error?.toLowerCase().includes('timeout')
                  ? 'timeout'
                  : 'failed',
          },
        )
        modeSummary[mode].total++
        if (probeOutcome.status === 'ok') {
          modeSummary[mode].ok++
          if (typeof probeOutcome.latencyMs === 'number') {
            modeSummary[mode].latencies.push(probeOutcome.latencyMs)
            latencySamples.push(probeOutcome.latencyMs)
          }
        } else {
          modeSummary[mode].failed++
        }
        probeIndex++
      }

      if (options.maxProbes !== null && probeIndex >= options.maxProbes) {
        break
      }

      const delayMs = Math.min(options.intervalMs, Math.max(0, deadlineMs - Date.now()))
      if (delayMs <= 0) {
        break
      }
      await sleep(delayMs)
    }
  } else {
    for (let index = 0; index < plannedCycleCount; index++) {
      for (const mode of options.modes) {
        const routeId = `${runId}-${mode}-${index}`
        appendBenchmarkTraceEvent(traceWriter, 'route.dispatched', {
          routeId,
          runId,
          provider: mode === 'openjaws' ? 'openjaws' : 'oci',
          model: mode === 'openjaws' ? options.openjawsModel : 'oci:Q',
          projectRoot: options.root,
          queueDepth: plannedCycleCount,
        })
        const result: SoakProbeResult = {
          index: results.length,
          mode,
          status: 'dry_run',
          startedAt: startAt.toISOString(),
          endedAt: startAt.toISOString(),
          latencyMs: null,
          command:
            mode === 'openjaws'
              ? buildOpenJawsCommand({
                  root: options.root,
                  model: options.openjawsModel,
                  prompt: options.prompt,
                }).command
              : `direct OCI-Q bridge via scripts/oci-q-response.py (${ociRuntime.summary})`,
          exitCode: null,
          responseText: null,
          error: null,
        }
        results.push(result)
        modeSummary[mode].total++
        modeSummary[mode].dryRun++
      }
    }
  }

  const successCount = results.filter(result => result.status === 'ok').length
  const errorCount = results.filter(result => result.status === 'failed').length
  const dryRunCount = results.filter(result => result.status === 'dry_run').length

  report.summary = {
    ...buildQSoakSummary({
      total: results.length,
      ok: successCount,
      failed: errorCount,
      dryRun: dryRunCount,
      latencies: latencySamples,
    }),
    byMode: {
      openjaws: buildQSoakSummary(modeSummary.openjaws),
      'oci-q': buildQSoakSummary(modeSummary['oci-q']),
    },
  }
  report.results = results
  report.reportPath = join(outputDir, 'q-soak-report.json')

  const reportPath = report.reportPath as string
  closeBenchmarkTraceWriter(traceWriter)
  report.traceReferences = [buildImmaculateTraceReference(traceWriter.path)]
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  const receipt: Record<string, unknown> = {
    kind: 'q_soak_benchmark_receipt',
    runId,
    generatedAt: new Date().toISOString(),
    reportPath,
    reportSha256: sha256File(reportPath),
    traceReferences: report.traceReferences,
    summary: report.summary,
  }
  const signingKey = resolveBenchmarkSigningPrivateKey()
  if (signingKey) {
    receipt.signature = signBenchmarkReceipt({
      receipt,
      privateKeyPem: signingKey,
    })
  } else {
    receipt.signature = null
  }
  const receiptPath = join(outputDir, 'q-soak-receipt.json')
  writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8')

  console.log(
    JSON.stringify(
      {
        status: 'ok',
        runId,
        reportPath,
        receiptPath,
        summary:
          options.dryRun
            ? `Q soak dry run prepared for ${options.durationMinutes} minute${options.durationMinutes === 1 ? '' : 's'} across ${options.modes.join(', ')}.`
            : `Q soak completed with ${successCount} success${successCount === 1 ? '' : 'es'} and ${errorCount} error${errorCount === 1 ? '' : 's'}.`,
        counts: {
          total: results.length,
          success: successCount,
          error: errorCount,
          dryRun: dryRunCount,
        },
      },
      null,
      2,
    ),
  )
}

if (import.meta.main) {
  await main()
}
