import { existsSync, readFileSync, readdirSync } from 'fs'
import { resolve } from 'path'

export type HostedQProvisioningStatus = 'ready' | 'blocked'
export type HostedQProvisioningCheckStatus = 'passed' | 'blocked'

export type HostedQProvisioningCheck = {
  id: string
  status: HostedQProvisioningCheckStatus
  summary: string
  missing?: string[]
  details?: Record<string, unknown>
  nextActions?: string[]
}

export type HostedQProvisioningPreflightReport = {
  status: HostedQProvisioningStatus
  checkedAt: string
  root: string
  wranglerConfigPath: string
  counts: Record<HostedQProvisioningCheckStatus, number>
  checks: HostedQProvisioningCheck[]
  missingByCheck: Record<string, string[]>
  blockedActions: string[]
  commands: string[]
}

export type HostedQProvisioningPreflightOptions = {
  root?: string
  env?: NodeJS.ProcessEnv
  now?: Date
}

type ParsedWranglerConfig = {
  present: boolean
  databaseName: string
  databaseId: string | null
  databaseIdConfigured: boolean
  routePatternsConfigured: boolean
  workersDev: boolean | null
}

type CliOptions = {
  root?: string
  json: boolean
  allowBlocked: boolean
}

const WORKER_ROOT = 'services/cloudflare-hosted-q'
const WRANGLER_CONFIG = `${WORKER_ROOT}/wrangler.toml`
const WORKER_ENTRYPOINT = `${WORKER_ROOT}/src/worker.ts`
const MIGRATIONS_DIR = `${WORKER_ROOT}/migrations`
const PLACEHOLDER_PATTERN = /^(?:REPLACE_|YOUR_|CHANGE_ME|TODO|TBD)/i
const REQUIRED_CLOUDFLARE_ENV = ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN'] as const
const REQUIRED_WORKER_SECRETS = [
  'SERVICE_TOKEN',
  'RESEND_API_KEY',
  'RESEND_FROM_EMAIL',
  'STRIPE_SECRET_KEY',
  'STRIPE_PRICE_BUILDER',
  'STRIPE_PRICE_OPERATOR',
  'STRIPE_SUCCESS_URL',
  'STRIPE_CANCEL_URL',
] as const
const REQUIRED_PUBLIC_SITE_ENV = [
  'Q_HOSTED_SERVICE_BASE_URL',
  'Q_HOSTED_SERVICE_TOKEN',
] as const

function isConcreteConfigValue(value: string | null | undefined): value is string {
  const trimmed = value?.trim()
  return Boolean(trimmed && !PLACEHOLDER_PATTERN.test(trimmed))
}

function configuredEnvKeys(
  env: NodeJS.ProcessEnv,
  keys: readonly string[],
): string[] {
  return keys.filter(key => isConcreteConfigValue(env[key]))
}

function missingEnvKeys(env: NodeJS.ProcessEnv, keys: readonly string[]): string[] {
  const configured = new Set(configuredEnvKeys(env, keys))
  return keys.filter(key => !configured.has(key))
}

function readTextIfPresent(path: string): string | null {
  if (!existsSync(path)) {
    return null
  }
  return readFileSync(path, 'utf8')
}

function uncommentedTomlLines(config: string): string[] {
  return config
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'))
}

function readTomlStringValue(config: string, key: string): string | null {
  const pattern = new RegExp(`^\\s*${key}\\s*=\\s*"([^"]*)"`, 'm')
  return config.match(pattern)?.[1]?.trim() ?? null
}

function readTomlBooleanValue(config: string, key: string): boolean | null {
  const match = config.match(new RegExp(`^\\s*${key}\\s*=\\s*(true|false)`, 'm'))
  return match ? match[1] === 'true' : null
}

function parseWranglerConfig(root: string): ParsedWranglerConfig {
  const path = resolve(root, WRANGLER_CONFIG)
  const config = readTextIfPresent(path)
  if (!config) {
    return {
      present: false,
      databaseName: 'openjaws-hosted-q',
      databaseId: null,
      databaseIdConfigured: false,
      routePatternsConfigured: false,
      workersDev: null,
    }
  }

  const lines = uncommentedTomlLines(config)
  const databaseName = readTomlStringValue(config, 'database_name') ?? 'openjaws-hosted-q'
  const databaseId = readTomlStringValue(config, 'database_id')
  return {
    present: true,
    databaseName,
    databaseId: isConcreteConfigValue(databaseId) ? databaseId : null,
    databaseIdConfigured: isConcreteConfigValue(databaseId),
    routePatternsConfigured:
      lines.some(line => /^routes\s*=/.test(line)) ||
      lines.some(line => /\bpattern\s*=/.test(line)),
    workersDev: readTomlBooleanValue(config, 'workers_dev'),
  }
}

function countMigrations(root: string): number {
  const migrationsPath = resolve(root, MIGRATIONS_DIR)
  if (!existsSync(migrationsPath)) {
    return 0
  }
  return readdirSync(migrationsPath).filter(file => file.endsWith('.sql')).length
}

function check(
  args: Omit<HostedQProvisioningCheck, 'status'> & { passed: boolean },
): HostedQProvisioningCheck {
  const { passed, ...rest } = args
  return {
    ...rest,
    status: passed ? 'passed' : 'blocked',
  }
}

function buildCommands(databaseName: string): string[] {
  const configArg = '--config services/cloudflare-hosted-q/wrangler.toml'
  return [
    'bun run services:backend:test',
    `bunx wrangler d1 migrations apply ${databaseName} --remote ${configArg}`,
    ...REQUIRED_WORKER_SECRETS.map(
      secret => `bunx wrangler secret put ${secret} ${configArg}`,
    ),
    'bun run services:backend:deploy',
    'Set Q_HOSTED_SERVICE_BASE_URL and Q_HOSTED_SERVICE_TOKEN on qline.site and iorch.net',
    'bun run service:routes',
  ]
}

function uniqueValues(values: string[]): string[] {
  return [...new Set(values.filter(value => value.trim().length > 0))]
}

export function buildHostedQProvisioningPreflight(
  options: HostedQProvisioningPreflightOptions = {},
): HostedQProvisioningPreflightReport {
  const root = resolve(options.root ?? process.cwd())
  const env = options.env ?? process.env
  const wrangler = parseWranglerConfig(root)
  const migrationCount = countMigrations(root)
  const workerEntrypointPresent = existsSync(resolve(root, WORKER_ENTRYPOINT))
  const missingCloudflareEnv = missingEnvKeys(env, REQUIRED_CLOUDFLARE_ENV)
  const missingWorkerSecrets = missingEnvKeys(env, REQUIRED_WORKER_SECRETS)
  const missingPublicSiteEnv = missingEnvKeys(env, REQUIRED_PUBLIC_SITE_ENV)
  const checks: HostedQProvisioningCheck[] = [
    check({
      id: 'worker-package',
      passed: wrangler.present && workerEntrypointPresent && migrationCount > 0,
      summary:
        wrangler.present && workerEntrypointPresent && migrationCount > 0
          ? 'Hosted-Q worker package, wrangler config, and D1 migrations are present.'
          : 'Hosted-Q worker package is incomplete in this checkout.',
      details: {
        workerEntrypointPresent,
        wranglerConfigPresent: wrangler.present,
        migrationCount,
      },
      missing: [
        ...(!workerEntrypointPresent ? [WORKER_ENTRYPOINT] : []),
        ...(!wrangler.present ? [WRANGLER_CONFIG] : []),
        ...(migrationCount === 0 ? [MIGRATIONS_DIR] : []),
      ],
    }),
    check({
      id: 'cloudflare-auth',
      passed: missingCloudflareEnv.length === 0,
      summary:
        missingCloudflareEnv.length === 0
          ? 'Cloudflare account id and API token are available to this operator shell.'
          : 'Cloudflare deploy auth is missing from this operator shell.',
      missing: missingCloudflareEnv,
      nextActions:
        missingCloudflareEnv.length === 0
          ? []
          : ['Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN before remote D1/deploy commands.'],
    }),
    check({
      id: 'd1-binding',
      passed: wrangler.databaseIdConfigured,
      summary: wrangler.databaseIdConfigured
        ? 'wrangler.toml contains a concrete D1 database id.'
        : 'wrangler.toml still has no concrete D1 database id.',
      missing: wrangler.databaseIdConfigured
        ? []
        : ['services/cloudflare-hosted-q/wrangler.toml database_id'],
      details: {
        databaseName: wrangler.databaseName,
        databaseIdConfigured: wrangler.databaseIdConfigured,
      },
      nextActions: wrangler.databaseIdConfigured
        ? []
        : [
            'Create the Cloudflare D1 database, then replace REPLACE_WITH_CLOUDFLARE_D1_DATABASE_ID in wrangler.toml.',
          ],
    }),
    check({
      id: 'worker-routes',
      passed: wrangler.routePatternsConfigured,
      summary: wrangler.routePatternsConfigured
        ? 'wrangler.toml contains an uncommented production route pattern.'
        : 'wrangler.toml has no uncommented production route pattern.',
      missing: wrangler.routePatternsConfigured ? [] : ['wrangler routes'],
      details: {
        routePatternsConfigured: wrangler.routePatternsConfigured,
        workersDev: wrangler.workersDev,
      },
      nextActions: wrangler.routePatternsConfigured
        ? []
        : [
            'Uncomment or add Cloudflare routes for the public hosted-Q worker origin before deploy.',
          ],
    }),
    check({
      id: 'worker-secrets',
      passed: missingWorkerSecrets.length === 0,
      summary:
        missingWorkerSecrets.length === 0
          ? 'Required worker secrets are present in this operator shell for wrangler secret put.'
          : 'Required worker secrets are missing from this operator shell.',
      missing: missingWorkerSecrets,
      details: {
        requiredKeys: [...REQUIRED_WORKER_SECRETS],
        configuredKeys: configuredEnvKeys(env, REQUIRED_WORKER_SECRETS),
      },
      nextActions:
        missingWorkerSecrets.length === 0
          ? []
          : ['Populate the missing keys locally, then run the generated wrangler secret put commands.'],
    }),
    check({
      id: 'public-site-env',
      passed: missingPublicSiteEnv.length === 0,
      summary:
        missingPublicSiteEnv.length === 0
          ? 'Public site proxy env is present for qline/iorch hosted-Q calls.'
          : 'Public site proxy env is missing for qline/iorch hosted-Q calls.',
      missing: missingPublicSiteEnv,
      details: {
        requiredKeys: [...REQUIRED_PUBLIC_SITE_ENV],
        configuredKeys: configuredEnvKeys(env, REQUIRED_PUBLIC_SITE_ENV),
      },
      nextActions:
        missingPublicSiteEnv.length === 0
          ? []
          : [
              'Set Q_HOSTED_SERVICE_BASE_URL to the deployed worker origin and Q_HOSTED_SERVICE_TOKEN to the worker service token on qline.site and iorch.net.',
            ],
    }),
  ]
  const counts = checks.reduce(
    (acc, item) => {
      acc[item.status] += 1
      return acc
    },
    { passed: 0, blocked: 0 } as Record<HostedQProvisioningCheckStatus, number>,
  )
  const blockedChecks = checks.filter(item => item.status === 'blocked')
  const missingByCheck = Object.fromEntries(
    blockedChecks
      .filter(item => item.missing?.length)
      .map(item => [item.id, uniqueValues(item.missing ?? [])]),
  )
  const blockedActions = uniqueValues(
    blockedChecks.flatMap(item => item.nextActions ?? []),
  )

  return {
    status: counts.blocked > 0 ? 'blocked' : 'ready',
    checkedAt: (options.now ?? new Date()).toISOString(),
    root,
    wranglerConfigPath: resolve(root, WRANGLER_CONFIG),
    counts,
    checks,
    missingByCheck,
    blockedActions,
    commands: buildCommands(wrangler.databaseName),
  }
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    json: false,
    allowBlocked: false,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--json') {
      options.json = true
      continue
    }
    if (arg === '--allow-blocked') {
      options.allowBlocked = true
      continue
    }
    if (arg === '--root') {
      const value = argv[index + 1]?.trim()
      if (!value) {
        throw new Error('--root requires a path.')
      }
      options.root = value
      index += 1
      continue
    }
    throw new Error(`unknown argument: ${arg}`)
  }
  return options
}

function formatHumanReport(report: HostedQProvisioningPreflightReport): string {
  const lines = [
    `Hosted-Q provisioning preflight: ${report.status}`,
    `Root: ${report.root}`,
    `Wrangler config: ${report.wranglerConfigPath}`,
    '',
    ...report.checks.flatMap(item => [
      `${item.status === 'passed' ? 'PASS' : 'BLOCK'} ${item.id}: ${item.summary}`,
      ...(item.missing?.length ? [`  Missing: ${item.missing.join(', ')}`] : []),
      ...(item.nextActions?.length ? item.nextActions.map(action => `  Next: ${action}`) : []),
    ]),
    ...(report.blockedActions.length
      ? [
          '',
          'Blocked action contract:',
          ...report.blockedActions.map(action => `  ${action}`),
        ]
      : []),
    '',
    'Safe command sequence:',
    ...report.commands.map(command => `  ${command}`),
  ]
  return lines.join('\n')
}

async function main(argv = process.argv.slice(2)): Promise<number> {
  let options: CliOptions
  try {
    options = parseArgs(argv)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    return 2
  }

  const report = buildHostedQProvisioningPreflight({ root: options.root })
  if (options.json) {
    console.log(JSON.stringify(report, null, 2))
  } else {
    console.log(formatHumanReport(report))
  }
  return report.status === 'ready' || options.allowBlocked ? 0 : 1
}

if (import.meta.main) {
  process.exit(await main())
}
