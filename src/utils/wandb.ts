import { existsSync, readFileSync } from 'fs'

export type WandbResolutionStatus = 'enabled' | 'disabled' | 'incomplete'
export type WandbResolutionSource = 'cli' | 'env' | 'mixed' | 'none'

export type WandbResolution = {
  project: string | null
  entity: string | null
  enabled: boolean
  status: WandbResolutionStatus
  source: WandbResolutionSource
  missing: ('project' | 'entity')[]
  apiKeyPresent: boolean
  url: string | null
  summary: string
}

type ResolveWandbConfigArgs = {
  project: string | null
  entity: string | null
}

function normalizeOptionalValue(value: string | null | undefined): string | null {
  if (!value) {
    return null
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function resolveOptionalFileValue(pathValue: string | null | undefined): string | null {
  const normalizedPath = normalizeOptionalValue(pathValue)
  if (!normalizedPath || !existsSync(normalizedPath)) {
    return null
  }
  try {
    return normalizeOptionalValue(readFileSync(normalizedPath, 'utf8'))
  } catch {
    return null
  }
}

function resolveApiKeyPresence(env: NodeJS.ProcessEnv): boolean {
  return Boolean(
    normalizeOptionalValue(env.IMMACULATE_WANDB_API_KEY) ??
      normalizeOptionalValue(env.WANDB_API_KEY) ??
      resolveOptionalFileValue(env.IMMACULATE_WANDB_API_KEY_FILE) ??
      resolveOptionalFileValue(env.WANDB_API_KEY_FILE),
  )
}

function buildWandbUrl(
  project: string | null,
  entity: string | null,
): string | null {
  if (!project || !entity) {
    return null
  }
  return `https://wandb.ai/${entity}/${project}`
}

function buildWandbSummary(args: {
  project: string | null
  entity: string | null
  status: WandbResolutionStatus
  source: WandbResolutionSource
  missing: ('project' | 'entity')[]
  url: string | null
}): string {
  if (args.status === 'enabled') {
    const target = args.entity && args.project
      ? `${args.entity}/${args.project}`
      : 'project'
    return args.url
      ? `enabled via ${args.source} for ${target} (${args.url})`
      : `enabled via ${args.source} for ${target}`
  }
  if (args.status === 'incomplete') {
    return `incomplete via ${args.source}; missing ${args.missing.join(', ')}`
  }
  return 'disabled'
}

export function resolveWandbConfig(
  args: ResolveWandbConfigArgs,
  env: NodeJS.ProcessEnv = process.env,
): WandbResolution {
  const cliProject = normalizeOptionalValue(args.project)
  const cliEntity = normalizeOptionalValue(args.entity)
  const envProject =
    normalizeOptionalValue(env.IMMACULATE_WANDB_PROJECT) ??
    normalizeOptionalValue(env.WANDB_PROJECT)
  const envEntity =
    normalizeOptionalValue(env.IMMACULATE_WANDB_ENTITY) ??
    normalizeOptionalValue(env.WANDB_ENTITY)

  const project = cliProject ?? envProject
  const entity = cliEntity ?? envEntity
  const missing: ('project' | 'entity')[] = []

  if (project && !entity) {
    missing.push('entity')
  }
  if (entity && !project) {
    missing.push('project')
  }

  const enabled = Boolean(project && entity)
  let source: WandbResolutionSource = 'none'
  if (cliProject || cliEntity) {
    source = envProject || envEntity ? 'mixed' : 'cli'
  } else if (envProject || envEntity) {
    source = 'env'
  }

  const status = enabled ? 'enabled' : missing.length > 0 ? 'incomplete' : 'disabled'
  const url = buildWandbUrl(project, entity)

  return {
    project,
    entity,
    enabled,
    status,
    source,
    missing,
    apiKeyPresent: resolveApiKeyPresence(env),
    url,
    summary: buildWandbSummary({
      project,
      entity,
      status,
      source,
      missing,
      url,
    }),
  }
}
