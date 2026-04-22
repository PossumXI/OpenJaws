import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import {
  runDiscordRoundtableSteadyStatePass,
} from '../src/utils/discordRoundtableSteadyState.js'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

type CliOptions = {
  follow: boolean
  intervalSeconds: number
  json: boolean
  quiet: boolean
}

function resolvePlannerRoots(): string[] {
  const operatorRoots = (process.env.DISCORD_OPERATOR_ALLOWED_ROOTS ?? '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean)
  const knowledgeRoots = (process.env.ROUNDTABLE_KNOWLEDGE_ROOTS ?? '')
    .split('|')
    .map(value => value.trim())
    .filter(Boolean)
  return Array.from(new Set([...operatorRoots, ...knowledgeRoots, REPO_ROOT]))
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
  const result = runDiscordRoundtableSteadyStatePass({
    root: REPO_ROOT,
    allowedRoots: resolvePlannerRoots(),
  })
  if (json) {
    return JSON.stringify(
      {
        queueStatePath: result.queueStatePath,
        sessionStatePath: result.sessionStatePath,
        changed: result.sync.changed,
        status: result.status,
        channelName: result.channelName,
        turnCount: result.turnCount,
        lastSummary: result.lastSummary,
        planner: result.planner,
      },
      null,
      2,
    )
  }

  return [
    `Roundtable sync: ${result.sync.changed ? 'updated' : 'no changes'}`,
    `Queue path: ${result.queueStatePath}`,
    `Session path: ${result.sessionStatePath}`,
    `Status: ${result.status}`,
    `Channel: ${result.channelName ?? 'unassigned'}`,
    `Turns: ${result.turnCount ?? 0}`,
    `Summary: ${result.lastSummary ?? 'none'}`,
    `Planner: ${result.planner.reason}`,
    ...(result.planner.handoffPath
      ? [`Planner handoff: ${result.planner.handoffPath}`]
      : []),
  ].join('\n')
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv)

  if (!options.follow) {
    if (!options.quiet) {
      console.log(formatResult(options.json))
    } else {
      runDiscordRoundtableSteadyStatePass({
        root: REPO_ROOT,
        allowedRoots: resolvePlannerRoots(),
      })
    }
    return
  }

  for (;;) {
    if (!options.quiet) {
      console.log(formatResult(options.json))
    } else {
      runDiscordRoundtableSteadyStatePass({
        root: REPO_ROOT,
        allowedRoots: resolvePlannerRoots(),
      })
    }
    await Bun.sleep(options.intervalSeconds * 1000)
  }
}

await main()
