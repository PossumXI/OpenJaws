import { existsSync } from 'fs'
import { mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'
import { execa } from 'execa'
import { resolveOciQRuntime } from './ociQRuntime.js'

export type OciQBridgeAuthMode = 'bearer' | 'iam'

export type OciQBridgeResponse = {
  ok: boolean
  text: string
  model: string
  base_url: string
  auth_mode: OciQBridgeAuthMode
  profile: string | null
  response?: Record<string, unknown> | null
}

export type OciQBridgeRuntimeOverride =
  | {
      authMode: 'bearer'
      apiKey: string
      baseURL: string
      model: string
      projectId?: string | null
      compartmentId?: string | null
    }
  | {
      authMode: 'iam'
      configFile: string
      profile: string
      baseURL: string
      projectId: string
      compartmentId: string
      model: string
    }

type OciQBridgeProcessResult = {
  exitCode: number | null
  stdout: string
  stderr: string
}

export function resolveOciBridgeModel(model: string): string {
  const trimmed = model.trim()
  const providerPrefixed = /^oci:(.+)$/i.exec(trimmed)?.[1]?.trim()
  const providerLocalModel = providerPrefixed || trimmed
  return providerLocalModel.toLowerCase() === 'q'
    ? resolveOciQRuntime().model
    : providerLocalModel
}

function parseBridgeJson(stdout: string): OciQBridgeResponse | null {
  const trimmed = stdout.trim()
  if (!trimmed) {
    return null
  }
  try {
    const parsed = JSON.parse(trimmed) as Partial<OciQBridgeResponse> & {
      error?: unknown
    }
    if (typeof parsed.ok === 'boolean') {
      return parsed as OciQBridgeResponse
    }
  } catch {
    // Fall through to the caller's normal failure message.
  }
  return null
}

export function parseOciBridgeProcessResult(
  result: OciQBridgeProcessResult,
  fallbackFailure: string,
): OciQBridgeResponse {
  const parsed = parseBridgeJson(result.stdout)
  if (result.exitCode === 0 && parsed) {
    if (parsed.ok === false) {
      const error =
        typeof (parsed as { error?: unknown }).error === 'string'
          ? (parsed as { error: string }).error
          : fallbackFailure
      throw new Error(error)
    }
    return parsed
  }

  if (parsed?.ok === true) {
    return parsed
  }

  throw new Error(
    result.stderr.trim() ||
      (parsed && typeof (parsed as { error?: unknown }).error === 'string'
        ? String((parsed as { error: string }).error)
        : result.stdout.trim()) ||
      fallbackFailure,
  )
}

function resolveOciQPythonInvocation(): {
  command: string
  prefixArgs: string[]
} {
  const configured = process.env.OCI_Q_PYTHON?.trim()
  if (configured) {
    return {
      command: configured,
      prefixArgs: [],
    }
  }

  if (process.platform === 'win32') {
    return {
      command: 'py',
      prefixArgs: ['-3.13'],
    }
  }

  return {
    command: 'python3',
    prefixArgs: [],
  }
}

function resolveOciQBridgeScriptPath(): string {
  const moduleDir = dirname(fileURLToPath(import.meta.url))
  const configured = process.env.OPENJAWS_OCI_BRIDGE_SCRIPT?.trim()
  const candidates = [
    configured,
    resolve(process.cwd(), 'scripts', 'oci-q-response.py'),
    resolve(process.cwd(), '..', 'scripts', 'oci-q-response.py'),
    resolve(moduleDir, '..', '..', 'scripts', 'oci-q-response.py'),
  ].filter((candidate): candidate is string => Boolean(candidate))

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate
    }
  }

  throw new Error(
    `OCI Q bridge helper not found. Checked: ${candidates.join(', ')}`,
  )
}

async function withBridgeTempDir<T>(
  callback: (tempDir: string) => Promise<T>,
): Promise<T> {
  const tempDir = await mkdtemp(join(tmpdir(), 'openjaws-oci-q-'))
  try {
    return await callback(tempDir)
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
}

async function writeBridgeTextFile(
  tempDir: string,
  filename: string,
  content: string,
): Promise<string> {
  const path = join(tempDir, filename)
  await writeFile(path, content, 'utf8')
  return path
}

export async function queryOciQViaPython(args: {
  prompt: string
  systemPrompt?: string
  maxOutputTokens?: number
  timeoutMs?: number
  env?: NodeJS.ProcessEnv
  runtimeOverride?: OciQBridgeRuntimeOverride
}): Promise<OciQBridgeResponse> {
  let runtimeOverride = args.runtimeOverride
  if (!runtimeOverride) {
    const runtime = resolveOciQRuntime(args.env)
    if (runtime.authMode === 'bearer' && runtime.apiKeySource) {
      const apiKey =
        args.env?.[runtime.apiKeySource] ?? process.env[runtime.apiKeySource]
      if (!apiKey?.trim()) {
        throw new Error(
          `OCI bearer runtime is missing ${runtime.apiKeySource}.`,
        )
      }
      runtimeOverride = {
        authMode: 'bearer',
        apiKey: apiKey.trim(),
        baseURL: runtime.baseURL,
        model: runtime.model,
        projectId: runtime.projectId,
        compartmentId: runtime.compartmentId,
      }
    } else if (runtime.authMode === 'iam' && runtime.ready) {
      runtimeOverride = {
        authMode: 'iam',
        configFile: runtime.configFile!,
        profile: runtime.profile,
        baseURL: runtime.baseURL,
        projectId: runtime.projectId!,
        compartmentId: runtime.compartmentId!,
        model: runtime.model,
      }
    } else {
      throw new Error(
        `OCI runtime is not ready for Q: ${runtime.missing.join(', ') || 'missing auth'}`,
      )
    }
  }

  const scriptPath = resolveOciQBridgeScriptPath()

  const pythonInvocation = resolveOciQPythonInvocation()
  return withBridgeTempDir(async tempDir => {
    const promptFile = await writeBridgeTextFile(tempDir, 'prompt.txt', args.prompt)
    const cliArgs = [
      ...pythonInvocation.prefixArgs,
      scriptPath,
      '--base-url',
      runtimeOverride.baseURL,
      '--model',
      runtimeOverride.model,
      '--prompt-file',
      promptFile,
    ]

    if (runtimeOverride.authMode === 'bearer') {
      cliArgs.push('--api-key', runtimeOverride.apiKey)
      if (runtimeOverride.projectId) {
        cliArgs.push('--project-id', runtimeOverride.projectId)
      }
      if (runtimeOverride.compartmentId) {
        cliArgs.push('--compartment-id', runtimeOverride.compartmentId)
      }
    } else {
      cliArgs.push(
        '--config-file',
        runtimeOverride.configFile,
        '--profile',
        runtimeOverride.profile,
        '--project-id',
        runtimeOverride.projectId,
        '--compartment-id',
        runtimeOverride.compartmentId,
      )
    }

    if (args.systemPrompt?.trim()) {
      const systemFile = await writeBridgeTextFile(
        tempDir,
        'system.txt',
        args.systemPrompt.trim(),
      )
      cliArgs.push('--system-file', systemFile)
    }
    if (typeof args.maxOutputTokens === 'number') {
      cliArgs.push('--max-output-tokens', String(args.maxOutputTokens))
    }

    const result = await execa(pythonInvocation.command, cliArgs, {
      reject: false,
      windowsHide: true,
      timeout: args.timeoutMs ?? 60_000,
      env: args.env,
    })

    return parseOciBridgeProcessResult(result, 'OCI Q bridge failed.')
  })
}

export async function queryOciResponsesViaPython(args: {
  input: unknown
  instructions?: string
  tools?: unknown[]
  maxOutputTokens?: number
  temperature?: number
  timeoutMs?: number
  env?: NodeJS.ProcessEnv
  runtimeOverride?: OciQBridgeRuntimeOverride
}): Promise<OciQBridgeResponse> {
  let runtimeOverride = args.runtimeOverride
  if (!runtimeOverride) {
    const runtime = resolveOciQRuntime(args.env)
    if (runtime.authMode === 'bearer' && runtime.apiKeySource) {
      const apiKey =
        args.env?.[runtime.apiKeySource] ?? process.env[runtime.apiKeySource]
      if (!apiKey?.trim()) {
        throw new Error(
          `OCI bearer runtime is missing ${runtime.apiKeySource}.`,
        )
      }
      runtimeOverride = {
        authMode: 'bearer',
        apiKey: apiKey.trim(),
        baseURL: runtime.baseURL,
        model: runtime.model,
        projectId: runtime.projectId,
        compartmentId: runtime.compartmentId,
      }
    } else if (runtime.authMode === 'iam' && runtime.ready) {
      runtimeOverride = {
        authMode: 'iam',
        configFile: runtime.configFile!,
        profile: runtime.profile,
        baseURL: runtime.baseURL,
        projectId: runtime.projectId!,
        compartmentId: runtime.compartmentId!,
        model: runtime.model,
      }
    } else {
      throw new Error(
        `OCI runtime is not ready for Q: ${runtime.missing.join(', ') || 'missing auth'}`,
      )
    }
  }

  const scriptPath = resolveOciQBridgeScriptPath()

  const pythonInvocation = resolveOciQPythonInvocation()
  return withBridgeTempDir(async tempDir => {
    const inputFile = await writeBridgeTextFile(
      tempDir,
      'input.json',
      JSON.stringify(args.input),
    )
    const cliArgs = [
      ...pythonInvocation.prefixArgs,
      scriptPath,
      '--base-url',
      runtimeOverride.baseURL,
      '--model',
      runtimeOverride.model,
      '--input-file',
      inputFile,
    ]

    if (runtimeOverride.authMode === 'bearer') {
      cliArgs.push('--api-key', runtimeOverride.apiKey)
      if (runtimeOverride.projectId) {
        cliArgs.push('--project-id', runtimeOverride.projectId)
      }
      if (runtimeOverride.compartmentId) {
        cliArgs.push('--compartment-id', runtimeOverride.compartmentId)
      }
    } else {
      cliArgs.push(
        '--config-file',
        runtimeOverride.configFile,
        '--profile',
        runtimeOverride.profile,
        '--project-id',
        runtimeOverride.projectId,
        '--compartment-id',
        runtimeOverride.compartmentId,
      )
    }

    if (args.instructions?.trim()) {
      const instructionsFile = await writeBridgeTextFile(
        tempDir,
        'instructions.txt',
        args.instructions.trim(),
      )
      cliArgs.push('--instructions-file', instructionsFile)
    }
    if (Array.isArray(args.tools) && args.tools.length > 0) {
      const toolsFile = await writeBridgeTextFile(
        tempDir,
        'tools.json',
        JSON.stringify(args.tools),
      )
      cliArgs.push('--tools-file', toolsFile)
    }
    if (typeof args.maxOutputTokens === 'number') {
      cliArgs.push('--max-output-tokens', String(args.maxOutputTokens))
    }
    if (typeof args.temperature === 'number') {
      cliArgs.push('--temperature', String(args.temperature))
    }

    const result = await execa(pythonInvocation.command, cliArgs, {
      reject: false,
      windowsHide: true,
      timeout: args.timeoutMs ?? 60_000,
      env: args.env,
    })

    return parseOciBridgeProcessResult(result, 'OCI Responses bridge failed.')
  })
}
