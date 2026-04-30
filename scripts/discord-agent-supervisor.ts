import { existsSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'

export type DiscordAgentSupervisorAction = 'repair' | 'install-tasks'
export type DiscordAgentSupervisorAgent = 'Q' | 'Viola' | 'Blackbeak'

export type DiscordAgentSupervisorOptions = {
  action: DiscordAgentSupervisorAction
  agent: DiscordAgentSupervisorAgent
  root: string
  dryRun: boolean
  json: boolean
}

export type DiscordAgentSupervisorPlan = {
  action: DiscordAgentSupervisorAction
  agent: DiscordAgentSupervisorAgent
  root: string
  stationRoot: string
  scriptPath: string
  envFilePath: string | null
  command: string
  args: string[]
  missing: string[]
}

const AGENTS: Record<
  DiscordAgentSupervisorAgent,
  { envFile: string; label: DiscordAgentSupervisorAgent }
> = {
  Q: { envFile: 'discord-q-agent.env.ps1', label: 'Q' },
  Viola: { envFile: 'discord-viola.env.ps1', label: 'Viola' },
  Blackbeak: { envFile: 'discord-blackbeak.env.ps1', label: 'Blackbeak' },
}

function getRepoRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), '..')
}

function normalizeAgent(value: string | null | undefined): DiscordAgentSupervisorAgent {
  const normalized = value?.trim().toLowerCase()
  if (!normalized || normalized === 'q') {
    return 'Q'
  }
  if (normalized === 'viola') {
    return 'Viola'
  }
  if (normalized === 'blackbeak') {
    return 'Blackbeak'
  }
  throw new Error('agent must be one of Q, Viola, or Blackbeak.')
}

export function parseArgs(
  argv: string[],
  defaults: { root?: string } = {},
): DiscordAgentSupervisorOptions {
  const [rawAction, ...rest] = argv
  const action =
    rawAction === 'install-tasks'
      ? 'install-tasks'
      : rawAction === 'repair' || !rawAction || rawAction.startsWith('--')
        ? 'repair'
        : null
  if (!action) {
    throw new Error('usage: bun scripts/discord-agent-supervisor.ts <repair|install-tasks> [--agent Q|Viola|Blackbeak]')
  }

  const args = rawAction?.startsWith('--') ? argv : rest
  let agent: DiscordAgentSupervisorAgent = 'Q'
  let root = defaults.root ?? getRepoRoot()
  let dryRun = false
  let json = false

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--agent') {
      agent = normalizeAgent(args[index + 1])
      index += 1
      continue
    }
    if (arg === '--root') {
      const value = args[index + 1]?.trim()
      if (!value) {
        throw new Error('--root requires a path.')
      }
      root = resolve(value)
      index += 1
      continue
    }
    if (arg === '--dry-run') {
      dryRun = true
      continue
    }
    if (arg === '--json') {
      json = true
      continue
    }
    if (arg && !arg.startsWith('--') && action === 'repair') {
      agent = normalizeAgent(arg)
      continue
    }
    throw new Error(`unknown argument: ${arg}`)
  }

  return {
    action,
    agent,
    root: resolve(root),
    dryRun,
    json,
  }
}

export function buildDiscordAgentSupervisorPlan(
  options: DiscordAgentSupervisorOptions,
): DiscordAgentSupervisorPlan {
  const stationRoot = join(options.root, 'local-command-station')
  const scriptPath =
    options.action === 'install-tasks'
      ? join(stationRoot, 'install-q-agent-tasks.ps1')
      : join(stationRoot, 'repair-q-agent.ps1')
  const envFilePath =
    options.action === 'repair'
      ? join(stationRoot, AGENTS[options.agent].envFile)
      : null
  const args =
    options.action === 'install-tasks'
      ? ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath]
      : [
          '-NoProfile',
          '-ExecutionPolicy',
          'Bypass',
          '-File',
          scriptPath,
          '-EnvFile',
          envFilePath!,
          '-AgentLabel',
          AGENTS[options.agent].label,
        ]
  const missing = [
    ...(!existsSync(scriptPath) ? [scriptPath] : []),
    ...(envFilePath && !existsSync(envFilePath) ? [envFilePath] : []),
  ]
  return {
    action: options.action,
    agent: options.agent,
    root: options.root,
    stationRoot,
    scriptPath,
    envFilePath,
    command: 'pwsh',
    args,
    missing,
  }
}

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_./:\\-]+$/.test(value)) {
    return value
  }
  return `"${value.replace(/"/g, '\\"')}"`
}

export function formatSupervisorCommand(plan: DiscordAgentSupervisorPlan): string {
  return [plan.command, ...plan.args].map(shellQuote).join(' ')
}

async function main(argv = process.argv.slice(2)): Promise<number> {
  let options: DiscordAgentSupervisorOptions
  try {
    options = parseArgs(argv)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    return 2
  }

  const plan = buildDiscordAgentSupervisorPlan(options)
  const payload = {
    status: plan.missing.length === 0 ? 'ok' : 'missing_local_supervisor_files',
    action: plan.action,
    agent: plan.agent,
    command: formatSupervisorCommand(plan),
    missing: plan.missing,
  }

  if (options.dryRun || plan.missing.length > 0) {
    if (options.json) {
      console.log(JSON.stringify(payload, null, 2))
    } else if (plan.missing.length > 0) {
      console.error(
        [
          'Discord agent supervisor files are missing.',
          ...plan.missing.map(item => `- ${item}`),
          'Run this from the configured OpenJaws operator machine, or restore local-command-station before launching 24/7 agents.',
        ].join('\n'),
      )
    } else {
      console.log(payload.command)
    }
    return plan.missing.length > 0 ? 1 : 0
  }

  const child = Bun.spawn([plan.command, ...plan.args], {
    cwd: options.root,
    stdout: 'inherit',
    stderr: 'inherit',
    stdin: 'inherit',
  })
  return await child.exited
}

if (import.meta.main) {
  process.exit(await main())
}
