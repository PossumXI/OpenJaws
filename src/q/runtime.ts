import { existsSync } from 'fs'
import { resolve } from 'path'
import { execa } from 'execa'
import {
  mapExternalProviderProbeToCheckStatus,
  probeExternalProviderModel,
  type ExternalProviderProbeResult,
} from '../utils/externalProviderProbe.js'
import { resolveExternalModelRef } from '../utils/model/externalProviders.js'

export type QPreflightCheckStatus = 'passed' | 'warning' | 'failed'

export type QPreflightCheck = {
  name: string
  status: QPreflightCheckStatus
  summary: string
}

export type ProbeQProviderOptions = {
  preferDirectQ?: boolean
  model: string | null | undefined
  timeoutMs?: number
}

export type OpenJawsProviderPreflightOptions = {
  root: string
  model: string | null
  checkName?: string
  prompt?: string
  timeoutMs?: number
  warnOnFailure?: boolean
}

const DEFAULT_OPENJAWS_PREFLIGHT_PROMPT = 'Reply with the single word OK.'

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

export function isOciModelRef(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim().toLowerCase().startsWith('oci:')
}

export function isDedicatedLocalQModelRef(
  value: string | null | undefined,
): boolean {
  if (!value) {
    return false
  }

  const modelRef = resolveExternalModelRef(value)
  if (!modelRef || modelRef.provider !== 'ollama') {
    return false
  }

  const normalizedModel = modelRef.model.trim().toLowerCase()
  return normalizedModel === 'q' || normalizedModel === 'q:latest'
}

export function resolveQProviderProbeModel(options: ProbeQProviderOptions): string | null {
  if (options.preferDirectQ) {
    return 'oci:Q'
  }

  if (!options.model) {
    return null
  }

  const modelRef = resolveExternalModelRef(options.model)
  return modelRef?.provider === 'oci' ? modelRef.rawModel : null
}

export async function probeQProviderModel(
  options: ProbeQProviderOptions,
): Promise<ExternalProviderProbeResult | null> {
  const modelRef = resolveQProviderProbeModel(options)
  if (!modelRef) {
    return null
  }

  return probeExternalProviderModel(modelRef, {
    timeoutMs: options.timeoutMs,
  })
}

export function buildQProviderProbeCheck(args: {
  name: string
  result: ExternalProviderProbeResult
  warnOnFailure?: boolean
}): QPreflightCheck {
  return {
    name: args.name,
    status: mapExternalProviderProbeToCheckStatus(args.result, {
      warnOnFailure: args.warnOnFailure,
    }),
    summary: args.result.summary,
  }
}

export function buildSkippedQProviderProbeCheck(args: {
  name: string
  model: string
}): QPreflightCheck {
  return {
    name: args.name,
    status: 'passed',
    summary: `Local Q lane ${args.model} selected; separate OCI probe not required.`,
  }
}

export async function runOpenJawsProviderPreflight(
  options: OpenJawsProviderPreflightOptions,
): Promise<QPreflightCheck> {
  const checkName = options.checkName ?? 'openjaws-provider-preflight'
  let providerProbeSummary: string | null = null
  const providerProbe = await probeQProviderModel({
    model: options.model,
    timeoutMs: 15_000,
  })

  if (providerProbe) {
    if (!providerProbe.ok) {
      return buildQProviderProbeCheck({
        name: checkName,
        result: providerProbe,
        warnOnFailure: options.warnOnFailure,
      })
    }
    providerProbeSummary = providerProbe.summary
  }

  const binary = buildOpenJawsBinary(options.root)
  if (!existsSync(binary)) {
    return {
      name: checkName,
      status: 'failed',
      summary: `Compiled OpenJaws binary not found at ${binary}. Run bun run build:native first.`,
    }
  }

  const args = [
    '-p',
    '--output-format',
    'json',
    '--bare',
    '--max-turns',
    '1',
  ]
  if (options.model) {
    args.push('--model', options.model)
  }
  args.push(options.prompt ?? DEFAULT_OPENJAWS_PREFLIGHT_PROMPT)

  const result = await execa(binary, args, {
    cwd: options.root,
    reject: false,
    windowsHide: true,
    timeout: options.timeoutMs ?? 180_000,
  })

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

  if (result.exitCode === 0 && payload && payload.is_error === false) {
    return {
      name: checkName,
      status: 'passed',
      summary: providerProbeSummary
        ? `${providerProbeSummary} · OpenJaws local provider preflight succeeded.`
        : 'OpenJaws local provider preflight succeeded.',
    }
  }

  const summary =
    (payload && typeof payload.result === 'string' && payload.result) ||
    tailText(result.stderr || result.stdout) ||
    'OpenJaws provider preflight failed.'

  return {
    name: checkName,
    status: options.warnOnFailure ? 'warning' : 'failed',
    summary,
  }
}
