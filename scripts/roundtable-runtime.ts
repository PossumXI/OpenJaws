import {
  ensureDiscordRoundtableProgressionSession,
  formatDiscordRoundtableTransitionReceipt,
  getDiscordRoundtableStatePath,
  processDiscordRoundtableRuntime,
  type DiscordRoundtableProgressionSessionResult,
} from '../src/utils/discordRoundtableRuntime.js'
import {
  planDiscordRoundtableFollowThrough,
  type DiscordRoundtablePlannerResult,
} from '../src/utils/discordRoundtablePlanner.js'

type CliOptions = {
  handoffPaths: string[]
  allowRoots: string[]
  loop: boolean
  steadyState: boolean | null
  intervalMs: number
  maxActionsPerRun: number
  durationHours: number | undefined
  approvalTtlHours: number | undefined
  channelName: string | null
  json: boolean
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    handoffPaths: [],
    allowRoots: [],
    loop: false,
    steadyState: null,
    intervalMs: 60_000,
    maxActionsPerRun: 1,
    durationHours: undefined,
    approvalTtlHours: undefined,
    channelName: process.env.DISCORD_ROUNDTABLE_CHANNEL_NAME?.trim() || 'q-roundtable',
    json: false,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    if (!value) {
      continue
    }
    switch (value) {
      case '--handoff':
        if (argv[index + 1]) {
          options.handoffPaths.push(argv[index + 1]!)
          index += 1
        }
        break
      case '--allow-root':
        if (argv[index + 1]) {
          options.allowRoots.push(argv[index + 1]!)
          index += 1
        }
        break
      case '--loop':
        options.loop = true
        break
      case '--steady-state':
        options.steadyState = true
        break
      case '--no-steady-state':
        options.steadyState = false
        break
      case '--interval-ms':
        if (argv[index + 1]) {
          const parsed = Number.parseInt(argv[index + 1]!, 10)
          if (Number.isFinite(parsed) && parsed > 0) {
            options.intervalMs = parsed
          }
          index += 1
        }
        break
      case '--max-actions':
        if (argv[index + 1]) {
          const parsed = Number.parseInt(argv[index + 1]!, 10)
          if (Number.isFinite(parsed) && parsed > 0) {
            options.maxActionsPerRun = parsed
          }
          index += 1
        }
        break
      case '--duration-hours':
        if (argv[index + 1]) {
          const parsed = Number.parseFloat(argv[index + 1]!)
          if (Number.isFinite(parsed) && parsed > 0) {
            options.durationHours = parsed
          }
          index += 1
        }
        break
      case '--approval-ttl-hours':
        if (argv[index + 1]) {
          const parsed = Number.parseFloat(argv[index + 1]!)
          if (Number.isFinite(parsed) && parsed > 0) {
            options.approvalTtlHours = parsed
          }
          index += 1
        }
        break
      case '--channel':
        options.channelName = argv[index + 1]?.trim() || null
        index += 1
        break
      case '--json':
        options.json = true
        break
    }
  }
  return options
}

function resolveAllowedRoots(cliRoots: string[]): string[] {
  const envRoots = (process.env.DISCORD_OPERATOR_ALLOWED_ROOTS ?? '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean)
  return Array.from(new Set([...cliRoots, ...envRoots, process.cwd()]))
}

function resolveRoundtableWorktreeRoot(): string {
  const configured =
    process.env.DISCORD_OPERATOR_WORKTREE_ROOT?.trim() ||
    process.env.OPENJAWS_OPERATOR_WORKTREE_ROOT?.trim()
  if (configured) {
    return configured
  }
  if (process.platform === 'win32') {
    return `${process.cwd().slice(0, 3)}ojwt`
  }
  return `${process.cwd()}/local-command-station/openjaws-operator-worktrees`
}

function summarizePlannerResult(
  planner: DiscordRoundtablePlannerResult | null,
): Record<string, unknown> | null {
  if (!planner) {
    return null
  }
  return {
    staged: planner.staged,
    reason: planner.reason,
    handoffPath: planner.handoffPath,
    targetPath: planner.targetPath,
    workKey: planner.workKey,
    repoLabel: planner.repoLabel,
    personaName: planner.personaName,
  }
}

function summarizeProgressionResult(
  progression: DiscordRoundtableProgressionSessionResult | null,
): Record<string, unknown> | null {
  if (!progression) {
    return null
  }
  return {
    bootstrapped: progression.bootstrapped,
    reason: progression.reason,
    status: progression.sessionState.status,
    channelName: progression.sessionState.roundtableChannelName,
    startedAt: progression.sessionState.startedAt,
    endsAt: progression.sessionState.endsAt,
  }
}

async function runIteration(options: CliOptions) {
  const allowedRoots = resolveAllowedRoots(options.allowRoots)
  const steadyStateEnabled = options.steadyState ?? options.loop
  const durationHours =
    options.durationHours ??
    (process.env.DISCORD_ROUNDTABLE_DURATION_HOURS
      ? Number.parseFloat(process.env.DISCORD_ROUNDTABLE_DURATION_HOURS)
      : undefined)
  const approvalTtlHours =
    options.approvalTtlHours ??
    (process.env.DISCORD_ROUNDTABLE_APPROVAL_TTL_HOURS
      ? Number.parseFloat(process.env.DISCORD_ROUNDTABLE_APPROVAL_TTL_HOURS)
      : undefined)
  const progression = steadyStateEnabled
    ? ensureDiscordRoundtableProgressionSession({
        root: process.cwd(),
        roundtableChannelName: options.channelName,
        durationHours,
      })
    : null
  const planner = steadyStateEnabled
    ? planDiscordRoundtableFollowThrough({
        root: process.cwd(),
        allowedRoots,
      })
    : null
  const result = await processDiscordRoundtableRuntime({
    root: process.cwd(),
    allowedRoots,
    handoffPaths: options.handoffPaths,
    maxActionsPerRun: options.maxActionsPerRun,
    durationHours,
    approvalTtlHours,
    model: process.env.DISCORD_Q_MODEL?.trim() || process.env.Q_AGENT_MODEL?.trim() || 'oci:Q',
    // Roundtable execution needs the receipt-producing runner, not the detached
    // visible launcher wrapper.
    runnerScriptPath: `${process.cwd()}\\local-command-station\\run-openjaws-visible.ps1`,
    worktreeRoot: resolveRoundtableWorktreeRoot(),
    outputRoot: `${process.cwd()}\\local-command-station\\openjaws-operator-outputs`,
    roundtableChannelName: options.channelName,
  })
  const output = options.json
    ? JSON.stringify(
        {
          statePath: getDiscordRoundtableStatePath(process.cwd()),
          ingestedCount: result.ingestedCount,
          executedCount: result.executedCount,
          queuedCount: result.queuedCount,
          awaitingApprovalCount: result.awaitingApprovalCount,
          durationHours: result.durationHours,
          approvalTtlHours: result.approvalTtlHours,
          transitionReceipts: result.transitionReceipts,
          status: result.state.status,
          summary: result.state.lastSummary,
          error: result.state.lastError,
          progression: summarizeProgressionResult(progression),
          steadyStatePlanner: summarizePlannerResult(planner),
        },
        null,
        2,
      )
    : [
        `Roundtable status: ${result.state.status}`,
        `State path: ${getDiscordRoundtableStatePath(process.cwd())}`,
        `Ingested: ${result.ingestedCount}`,
        `Executed: ${result.executedCount}`,
        `Queued: ${result.queuedCount}`,
        `Awaiting approval: ${result.awaitingApprovalCount}`,
        `Duration hours: ${result.durationHours}`,
        `Approval TTL hours: ${result.approvalTtlHours}`,
        ...(progression
          ? [`Progression: ${progression.reason}`]
          : ['Progression: disabled']),
        ...(planner
          ? [
              `Planner: ${planner.reason}`,
              ...(planner.staged && planner.handoffPath
                ? [`Planner handoff: ${planner.handoffPath}`]
                : []),
            ]
          : ['Planner: disabled']),
        `Summary: ${result.state.lastSummary ?? 'none'}`,
        ...(result.state.lastError ? [`Error: ${result.state.lastError}`] : []),
        ...(result.transitionReceipts.length > 0
          ? [
              'Transitions:',
              ...result.transitionReceipts.map(receipt =>
                formatDiscordRoundtableTransitionReceipt(receipt),
              ),
            ]
          : []),
      ].join('\n')
  console.log(output)
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv)
  if (!options.loop) {
    await runIteration(options)
    return
  }
  while (true) {
    await runIteration(options)
    await new Promise(resolvePromise => setTimeout(resolvePromise, options.intervalMs))
  }
}

await main()
