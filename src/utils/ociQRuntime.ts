import { existsSync, readFileSync } from 'fs'
import { homedir } from 'os'
import { resolve } from 'path'
import { getExternalProviderDefaults } from './model/externalProviders.js'

export const DEFAULT_OCI_Q_PROFILE = 'DEFAULT'
export const DEFAULT_OCI_Q_UPSTREAM_MODEL = 'openai.gpt-oss-120b'

export type OciQAuthMode = 'bearer' | 'iam' | 'unconfigured'

export type ResolvedOciQRuntime = {
  authMode: OciQAuthMode
  ready: boolean
  baseURL: string
  baseURLSource: string | null
  model: string
  modelSource: string | null
  configFile: string | null
  configFileSource: string | null
  profile: string
  profileSource: string | null
  region: string | null
  regionSource: string | null
  projectId: string | null
  projectIdSource: string | null
  compartmentId: string | null
  compartmentIdSource: string | null
  apiKeySource: string | null
  missing: string[]
  summary: string
}

function normalizeOptionalValue(value: string | null | undefined): string | null {
  if (!value) {
    return null
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function resolveEnvChain(
  env: NodeJS.ProcessEnv,
  names: readonly string[],
): { value: string | null; source: string | null } {
  for (const name of names) {
    const value = normalizeOptionalValue(env[name])
    if (value) {
      return { value, source: name }
    }
  }
  return { value: null, source: null }
}

export function buildOciOpenAIBaseUrl(region: string): string {
  return `https://inference.generativeai.${region}.oci.oraclecloud.com/openai/v1`
}

export function resolveEffectiveOciBaseUrl(args: {
  baseURL?: string | null
  baseURLSource?: string | null
  env?: NodeJS.ProcessEnv
} = {}): string {
  if (args.baseURLSource && args.baseURL?.trim()) {
    return args.baseURL.trim()
  }
  return resolveOciQRuntime(args.env).baseURL
}

function resolveDefaultOciConfigFile(): string | null {
  const candidate = resolve(homedir(), '.oci', 'config')
  return existsSync(candidate) ? candidate : null
}

function readOciConfigValue(args: {
  configFile: string | null
  profile: string
  key: string
}): string | null {
  if (!args.configFile || !existsSync(args.configFile)) {
    return null
  }

  const contents = readFileSync(args.configFile, 'utf8')
  let currentProfile = DEFAULT_OCI_Q_PROFILE
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#') || line.startsWith(';')) {
      continue
    }
    const sectionMatch = line.match(/^\[(.+)\]$/)
    if (sectionMatch) {
      currentProfile = sectionMatch[1]!.trim()
      continue
    }
    if (currentProfile !== args.profile) {
      continue
    }
    const separatorIndex = line.indexOf('=')
    if (separatorIndex <= 0) {
      continue
    }
    const key = line.slice(0, separatorIndex).trim()
    if (key !== args.key) {
      continue
    }
    const value = line.slice(separatorIndex + 1).trim()
    return value.length > 0 ? value : null
  }

  return null
}

function buildSummary(runtime: ResolvedOciQRuntime): string {
  if (runtime.authMode === 'bearer') {
    return `OCI bearer ready for ${runtime.model} via ${runtime.baseURL}`
  }
  if (runtime.authMode === 'iam' && runtime.ready) {
    return `OCI IAM ready for ${runtime.model} via ${runtime.baseURL} (${runtime.profile})`
  }
  if (runtime.authMode === 'iam') {
    return `OCI IAM incomplete: missing ${runtime.missing.join(', ')}`
  }
  return `OCI Q is not configured: missing ${runtime.missing.join(', ')}`
}

export function resolveOciQRuntime(
  env: NodeJS.ProcessEnv = process.env,
): ResolvedOciQRuntime {
  const defaults = getExternalProviderDefaults('oci')
  const apiKey = resolveEnvChain(env, defaults.apiKeyEnvVars)
  const model = resolveEnvChain(env, ['Q_MODEL', 'OCI_MODEL'])
  const configFile = resolveEnvChain(env, ['OCI_CONFIG_FILE'])
  const profile = resolveEnvChain(env, ['OCI_PROFILE'])
  const projectId = resolveEnvChain(env, ['OCI_GENAI_PROJECT_ID'])
  const compartmentId = resolveEnvChain(env, ['OCI_COMPARTMENT_ID'])
  const explicitRegion = resolveEnvChain(env, ['OCI_REGION'])

  const resolvedConfigFile = configFile.value ?? resolveDefaultOciConfigFile()
  const resolvedConfigFileSource = configFile.source ?? (resolvedConfigFile ? 'default ~/.oci/config' : null)
  const resolvedProfile = profile.value ?? DEFAULT_OCI_Q_PROFILE
  const resolvedProfileSource = profile.source ?? (resolvedProfile ? 'default DEFAULT' : null)
  const configRegion = readOciConfigValue({
    configFile: resolvedConfigFile,
    profile: resolvedProfile,
    key: 'region',
  })
  const resolvedRegion = explicitRegion.value ?? configRegion
  const resolvedRegionSource =
    explicitRegion.source ?? (configRegion ? `${resolvedConfigFileSource}:${resolvedProfile}.region` : null)

  const explicitBaseURL = resolveEnvChain(env, defaults.baseURLEnvVars)
  const resolvedBaseURL =
    explicitBaseURL.value ??
    (resolvedRegion ? buildOciOpenAIBaseUrl(resolvedRegion) : defaults.baseURL)
  const resolvedBaseURLSource =
    explicitBaseURL.source ??
    (resolvedRegion ? (resolvedRegionSource ?? 'OCI region') : null)

  const resolvedModel = model.value ?? DEFAULT_OCI_Q_UPSTREAM_MODEL
  const resolvedModelSource = model.source ?? 'default openai.gpt-oss-120b'

  if (apiKey.value) {
    const runtime: ResolvedOciQRuntime = {
      authMode: 'bearer',
      ready: true,
      baseURL: resolvedBaseURL,
      baseURLSource: resolvedBaseURLSource,
      model: resolvedModel,
      modelSource: resolvedModelSource,
      configFile: resolvedConfigFile,
      configFileSource: resolvedConfigFileSource,
      profile: resolvedProfile,
      profileSource: resolvedProfileSource,
      region: resolvedRegion,
      regionSource: resolvedRegionSource,
      projectId: projectId.value,
      projectIdSource: projectId.source,
      compartmentId: compartmentId.value,
      compartmentIdSource: compartmentId.source,
      apiKeySource: apiKey.source,
      missing: [],
      summary: '',
    }
    runtime.summary = buildSummary(runtime)
    return runtime
  }

  const missing: string[] = []
  if (!resolvedConfigFile) {
    missing.push('OCI_CONFIG_FILE')
  }
  if (!compartmentId.value) {
    missing.push('OCI_COMPARTMENT_ID')
  }
  if (!projectId.value) {
    missing.push('OCI_GENAI_PROJECT_ID')
  }

  const authMode: OciQAuthMode =
    resolvedConfigFile || compartmentId.value || projectId.value ? 'iam' : 'unconfigured'
  const ready = authMode === 'iam' && missing.length === 0

  const runtime: ResolvedOciQRuntime = {
    authMode,
    ready,
    baseURL: resolvedBaseURL,
    baseURLSource: resolvedBaseURLSource,
    model: resolvedModel,
    modelSource: resolvedModelSource,
    configFile: resolvedConfigFile,
    configFileSource: resolvedConfigFileSource,
    profile: resolvedProfile,
    profileSource: resolvedProfileSource,
    region: resolvedRegion,
    regionSource: resolvedRegionSource,
    projectId: projectId.value,
    projectIdSource: projectId.source,
    compartmentId: compartmentId.value,
    compartmentIdSource: compartmentId.source,
    apiKeySource: apiKey.source,
    missing,
    summary: '',
  }
  runtime.summary = buildSummary(runtime)
  return runtime
}
