import { existsSync } from 'fs'
import { resolve } from 'path'
import { execa } from 'execa'
import {
  buildSkippedQProviderProbeCheck,
  buildQProviderProbeCheck,
  isDedicatedLocalQModelRef,
  probeQProviderModel,
  runOpenJawsProviderPreflight,
  type QPreflightCheck,
} from './runtime.js'

export const DEFAULT_Q_BENCHMARK_SEED = 42
export const DEFAULT_CLOCK_SKEW_MAX_MS = 30_000

export type QPreflightRequirement =
  | 'openjaws-binary'
  | 'q-provider-runtime'
  | 'oci-q-runtime'
  | 'openjaws-provider-preflight'
  | 'bundle-manifest'
  | 'python-runtime'
  | 'harbor'
  | 'docker'
  | 'clock-skew'

export type QPreflightRunOptions = {
  root: string
  requirements: readonly QPreflightRequirement[]
  model?: string | null
  preferDirectQ?: boolean
  bundleDir?: string | null
  python?: string | null
  harborCommand?: string | null
  timeoutMs?: number
  warnOnProviderFailure?: boolean
  clockSkewUrl?: string | null
  maxClockSkewMs?: number | null
}

export type QPreflightBenchName = 'bridgebench' | 'soak' | 'terminalbench'

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

function buildOpenJawsBinary(root: string): string {
  return process.platform === 'win32'
    ? resolve(root, 'dist', 'openjaws.exe')
    : resolve(root, 'dist', 'openjaws')
}

export function resolveDefaultHarborCommand(): string {
  const configured = process.env.OPENJAWS_HARBOR_COMMAND
  if (configured) {
    return configured
  }

  const harborExecutable = process.platform === 'win32' ? 'harbor.exe' : 'harbor'
  const localHarborCandidates = [
    ...(process.platform === 'win32'
      ? [resolve(process.cwd(), 'scripts', 'harbor-cli.cmd')]
      : []),
    resolve(process.cwd(), '.tools', 'harbor-venv', 'Scripts', harborExecutable),
    resolve(process.cwd(), '.venv-gemma4', 'Scripts', harborExecutable),
    resolve(process.cwd(), '.venv', 'Scripts', harborExecutable),
    resolve(process.cwd(), '.tools', 'harbor-venv', 'bin', harborExecutable),
    resolve(process.cwd(), '.venv-gemma4', 'bin', harborExecutable),
    resolve(process.cwd(), '.venv', 'bin', harborExecutable),
  ]
  for (const candidate of localHarborCandidates) {
    if (existsSync(candidate)) {
      return candidate
    }
  }

  return 'harbor'
}

function readParsedSeed(value: string | undefined): number | null {
  if (!value) {
    return null
  }
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : null
}

async function runCommandCheck(args: {
  name: string
  command: string
  argv: string[]
  cwd?: string
  timeoutMs?: number
}): Promise<QPreflightCheck> {
  const result = await execa(args.command, args.argv, {
    cwd: args.cwd,
    reject: false,
    windowsHide: true,
    timeout: args.timeoutMs ?? 120_000,
  })
  return {
    name: args.name,
    status: result.exitCode === 0 ? 'passed' : 'failed',
    summary:
      result.exitCode === 0
        ? `${args.name} reachable`
        : tailText(result.stderr || result.stdout) || `${args.name} failed`,
  }
}

async function runClockSkewCheck(args: {
  url?: string | null
  timeoutMs?: number
  maxClockSkewMs?: number | null
}): Promise<QPreflightCheck> {
  const url = args.url?.trim() || 'https://www.cloudflare.com'
  const maxClockSkewMs = args.maxClockSkewMs ?? DEFAULT_CLOCK_SKEW_MAX_MS
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), args.timeoutMs ?? 10_000)
    try {
      const response = await fetch(url, {
        method: 'HEAD',
        signal: controller.signal,
      })
      const dateHeader = response.headers.get('date')
      if (!dateHeader) {
        return {
          name: 'clock-skew',
          status: 'warning',
          summary: `Clock skew probe at ${url} returned no Date header.`,
        }
      }
      const remoteMs = Date.parse(dateHeader)
      if (!Number.isFinite(remoteMs)) {
        return {
          name: 'clock-skew',
          status: 'warning',
          summary: `Clock skew probe at ${url} returned an invalid Date header.`,
        }
      }
      const skewMs = Math.abs(Date.now() - remoteMs)
      return {
        name: 'clock-skew',
        status: skewMs <= maxClockSkewMs ? 'passed' : 'warning',
        summary:
          skewMs <= maxClockSkewMs
            ? `Clock skew within tolerance (${skewMs}ms <= ${maxClockSkewMs}ms).`
            : `Clock skew above tolerance (${skewMs}ms > ${maxClockSkewMs}ms) versus ${url}.`,
      }
    } finally {
      clearTimeout(timer)
    }
  } catch (error) {
    return {
      name: 'clock-skew',
      status: 'warning',
      summary:
        error instanceof Error
          ? `Clock skew probe failed: ${error.message}`
          : 'Clock skew probe failed.',
    }
  }
}

export function resolveDeterministicSeed(value?: number | null): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  const explicitEnv =
    readParsedSeed(process.env.OPENJAWS_BENCHMARK_SEED) ??
    readParsedSeed(process.env.SEED)
  return explicitEnv ?? DEFAULT_Q_BENCHMARK_SEED
}

export function buildBenchmarkSeedEnv(seed: number): Record<string, string> {
  const normalizedSeed = String(resolveDeterministicSeed(seed))
  return {
    OPENJAWS_BENCHMARK_SEED: normalizedSeed,
    SEED: normalizedSeed,
    PYTHONHASHSEED: normalizedSeed,
  }
}

export function resolveQPreflightRequirementsForBench(
  bench: QPreflightBenchName,
): readonly QPreflightRequirement[] {
  switch (bench) {
    case 'bridgebench':
      return ['bundle-manifest', 'python-runtime', 'q-provider-runtime']
    case 'soak':
      return ['openjaws-binary', 'q-provider-runtime']
    case 'terminalbench':
      return ['harbor', 'docker', 'openjaws-provider-preflight', 'clock-skew']
    default:
      return []
  }
}

export async function runQPreflightChecks(
  options: QPreflightRunOptions,
): Promise<QPreflightCheck[]> {
  const timeoutMs = options.timeoutMs ?? 30_000
  const checks: QPreflightCheck[] = []
  const requirements = [...new Set(options.requirements)]

  for (const requirement of requirements) {
    switch (requirement) {
      case 'openjaws-binary': {
        const openjawsBinary = buildOpenJawsBinary(options.root)
        checks.push({
          name: 'openjaws-binary',
          status: existsSync(openjawsBinary) ? 'passed' : 'warning',
          summary: existsSync(openjawsBinary)
            ? `Compiled OpenJaws binary found at ${openjawsBinary}.`
            : `Compiled OpenJaws binary not found at ${openjawsBinary}.`,
        })
        break
      }
      case 'q-provider-runtime':
      case 'oci-q-runtime': {
        const checkName =
          requirement === 'oci-q-runtime' ? 'oci-q-runtime' : 'q-provider-runtime'
        const providerProbe = await probeQProviderModel({
          preferDirectQ: options.preferDirectQ,
          model: options.model,
          timeoutMs: Math.min(timeoutMs, 15_000),
        })
        if (providerProbe) {
          checks.push(
            buildQProviderProbeCheck({
              name: checkName,
              result: providerProbe,
              warnOnFailure: options.warnOnProviderFailure,
            }),
          )
        } else if (
          checkName === 'q-provider-runtime' &&
          !options.preferDirectQ &&
          isDedicatedLocalQModelRef(options.model)
        ) {
          checks.push(
            buildSkippedQProviderProbeCheck({
              name: checkName,
              model: options.model!,
            }),
          )
        }
        break
      }
      case 'openjaws-provider-preflight':
        checks.push(
          await runOpenJawsProviderPreflight({
            root: options.root,
            model: options.model ?? null,
            checkName: 'openjaws-provider-preflight',
            timeoutMs,
            warnOnFailure: options.warnOnProviderFailure,
          }),
        )
        break
      case 'bundle-manifest': {
        const bundleManifestPath = options.bundleDir
          ? resolve(options.bundleDir, 'bundle-manifest.json')
          : null
        checks.push({
          name: 'bundle-manifest',
          status:
            bundleManifestPath && existsSync(bundleManifestPath) ? 'passed' : 'failed',
          summary:
            bundleManifestPath && existsSync(bundleManifestPath)
              ? `Bundle manifest found at ${bundleManifestPath}.`
              : `Bundle manifest missing${bundleManifestPath ? ` at ${bundleManifestPath}` : '.'}`,
        })
        break
      }
      case 'python-runtime':
        checks.push(
          await runCommandCheck({
            name: 'python-runtime',
            command: options.python ?? 'python',
            argv: ['--version'],
            cwd: options.root,
            timeoutMs,
          }),
        )
        break
      case 'harbor':
        checks.push(
          await runCommandCheck({
            name: 'harbor',
            command: options.harborCommand ?? 'harbor',
            argv: ['--help'],
            cwd: options.root,
            timeoutMs,
          }),
        )
        break
      case 'docker':
        checks.push(
          await runCommandCheck({
            name: 'docker',
            command: 'docker',
            argv: ['version', '--format', '{{.Server.Version}}'],
            cwd: options.root,
            timeoutMs,
          }),
        )
        break
      case 'clock-skew':
        checks.push(
          await runClockSkewCheck({
            url: options.clockSkewUrl,
            timeoutMs,
            maxClockSkewMs: options.maxClockSkewMs,
          }),
        )
        break
    }
  }

  return checks
}
