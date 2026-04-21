import {
  formatDiscordRoundtableTransitionReceipt,
  getDiscordRoundtableStatePath,
  processDiscordRoundtableRuntime,
} from '../src/utils/discordRoundtableRuntime.js'

type CliOptions = {
  handoffPaths: string[]
  allowRoots: string[]
  loop: boolean
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

async function runIteration(options: CliOptions) {
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
  const result = await processDiscordRoundtableRuntime({
    root: process.cwd(),
    allowedRoots: resolveAllowedRoots(options.allowRoots),
    handoffPaths: options.handoffPaths,
    maxActionsPerRun: options.maxActionsPerRun,
    durationHours,
    approvalTtlHours,
    model: process.env.DISCORD_Q_MODEL?.trim() || process.env.Q_AGENT_MODEL?.trim() || 'oci:Q',
    runnerScriptPath: `${process.cwd()}\\local-command-station\\launch-openjaws-visible.ps1`,
    worktreeRoot: `${process.cwd()}\\local-command-station\\openjaws-operator-worktrees`,
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
