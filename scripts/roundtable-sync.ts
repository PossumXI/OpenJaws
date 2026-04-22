import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import {
  getDiscordRoundtableQueueStatePath,
  getDiscordRoundtableSessionStatePath,
  syncDiscordRoundtableRuntimeState,
} from '../src/utils/discordRoundtableRuntime.js'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

type CliOptions = {
  follow: boolean
  intervalSeconds: number
  json: boolean
  quiet: boolean
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    follow: false,
    intervalSeconds: 15,
    json: false,
    quiet: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    if (!value) {
      continue
    }
    switch (value) {
      case '--follow':
        options.follow = true
        break
      case '--interval-seconds': {
        const parsed = Number.parseInt(argv[index + 1] ?? '', 10)
        if (Number.isFinite(parsed) && parsed > 0) {
          options.intervalSeconds = parsed
        }
        index += 1
        break
      }
      case '--json':
        options.json = true
        break
      case '--quiet':
        options.quiet = true
        break
    }
  }

  return options
}

function formatResult(json: boolean) {
  const result = syncDiscordRoundtableRuntimeState(REPO_ROOT)
  if (json) {
    return JSON.stringify(
      {
        queueStatePath: getDiscordRoundtableQueueStatePath(REPO_ROOT),
        sessionStatePath: getDiscordRoundtableSessionStatePath(REPO_ROOT),
        changed: result.changed,
        status: result.sessionState?.status ?? result.state.status,
        channelName:
          result.sessionState?.roundtableChannelName ??
          result.state.roundtableChannelName,
        turnCount: result.sessionState?.turnCount ?? null,
        lastSummary:
          result.sessionState?.lastSummary ?? result.state.lastSummary,
      },
      null,
      2,
    )
  }

  return [
    `Roundtable sync: ${result.changed ? 'updated' : 'no changes'}`,
    `Queue path: ${getDiscordRoundtableQueueStatePath(REPO_ROOT)}`,
    `Session path: ${getDiscordRoundtableSessionStatePath(REPO_ROOT)}`,
    `Status: ${result.sessionState?.status ?? result.state.status}`,
    `Channel: ${
      result.sessionState?.roundtableChannelName ??
      result.state.roundtableChannelName ??
      'unassigned'
    }`,
    `Turns: ${result.sessionState?.turnCount ?? 0}`,
    `Summary: ${result.sessionState?.lastSummary ?? result.state.lastSummary ?? 'none'}`,
  ].join('\n')
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv)

  if (!options.follow) {
    if (!options.quiet) {
      console.log(formatResult(options.json))
    } else {
      syncDiscordRoundtableRuntimeState(REPO_ROOT)
    }
    return
  }

  for (;;) {
    if (!options.quiet) {
      console.log(formatResult(options.json))
    } else {
      syncDiscordRoundtableRuntimeState(REPO_ROOT)
    }
    await Bun.sleep(options.intervalSeconds * 1000)
  }
}

await main()
