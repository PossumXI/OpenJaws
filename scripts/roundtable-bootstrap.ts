import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import {
  bootstrapDiscordRoundtableRuntime,
  getDiscordRoundtableQueueStatePath,
  getDiscordRoundtableSessionStatePath,
} from '../src/utils/discordRoundtableRuntime.js'
import {
  DEFAULT_ROUNDTABLE_WINDOW_HOURS,
  resolveRoundtableDurationHours,
} from '../src/utils/discordRoundtableScheduler.js'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

type CliOptions = {
  channelName: string | null
  durationHours: number
  json: boolean
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    channelName: process.env.DISCORD_ROUNDTABLE_CHANNEL_NAME?.trim() || null,
    durationHours: resolveRoundtableDurationHours({
      rawValue: process.env.DISCORD_ROUNDTABLE_DURATION_HOURS,
      fallbackHours: DEFAULT_ROUNDTABLE_WINDOW_HOURS,
    }),
    json: false,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    if (!value) {
      continue
    }
    switch (value) {
      case '--channel':
        options.channelName = argv[index + 1]?.trim() || null
        index += 1
        break
      case '--duration-hours':
        options.durationHours = resolveRoundtableDurationHours({
          rawValue: argv[index + 1] ?? undefined,
          fallbackHours: options.durationHours,
        })
        index += 1
        break
      case '--json':
        options.json = true
        break
    }
  }
  return options
}

function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv)
  const result = bootstrapDiscordRoundtableRuntime({
    root: REPO_ROOT,
    roundtableChannelName: options.channelName,
    durationHours: options.durationHours,
  })
  if (options.json) {
    console.log(
      JSON.stringify(
        {
          queueStatePath: getDiscordRoundtableQueueStatePath(REPO_ROOT),
          sessionStatePath: getDiscordRoundtableSessionStatePath(REPO_ROOT),
          status: result.state.status,
          channelName: result.sessionState.roundtableChannelName,
          startedAt: result.sessionState.startedAt,
          endsAt: result.sessionState.endsAt,
          legacyRuntimeDirs: result.legacyRuntimeDirs,
          clearedLogPaths: result.clearedLogPaths,
        },
        null,
        2,
      ),
    )
    return
  }

  console.log(
    [
      `Roundtable bootstrap: ${result.state.status}`,
      `Queue path: ${getDiscordRoundtableQueueStatePath(REPO_ROOT)}`,
      `Session path: ${getDiscordRoundtableSessionStatePath(REPO_ROOT)}`,
      `Channel: ${result.sessionState.roundtableChannelName ?? 'unassigned'}`,
      `Started: ${result.sessionState.startedAt ?? 'none'}`,
      `Ends: ${result.sessionState.endsAt ?? 'none'}`,
      `Legacy runtimes: ${result.legacyRuntimeDirs.length}`,
      `Cleared logs: ${result.clearedLogPaths.length}`,
    ].join('\n'),
  )
}

main()
