import { existsSync, readFileSync } from 'fs'
import { join, resolve } from 'path'
import {
  getPublicShowcaseActivityMirrorPath,
  getPublicShowcaseActivityPath,
} from '../src/utils/publicShowcaseActivity.js'

export type PublicShowcaseCopyCheckTarget = {
  label: string
  path: string
  required: boolean
}

export type PublicShowcaseCopyViolation = {
  label: string
  path: string
  pattern: string
  line: number
  snippet: string
}

export type PublicShowcaseCopyCheckResult = {
  ok: boolean
  checked: PublicShowcaseCopyCheckTarget[]
  missingRequired: PublicShowcaseCopyCheckTarget[]
  violations: PublicShowcaseCopyViolation[]
}

type PublicShowcaseCopyCheckOptions = {
  json: boolean
  strictMissing: boolean
}

export const PUBLIC_SHOWCASE_COPY_BANNED_PATTERNS: RegExp[] = [
  /#dev_support/i,
  /[A-Za-z]:[\\/](?:Users|cheeks|openjaws|Windows|ProgramData)[\\/]/i,
  /\/(?:Users|home|mnt|var|etc|root)\//i,
  /\b(?:manifestPath|deliveryArtifactManifestPath|latestJobReceiptPath|latestJobDeliveryArtifacts|deliveryArtifacts|receiptPath|sourcePath|runSummaryPath|metricsSummaryPath|outputDir|workspacePath|worktreePath|branchName|commitSha|latestJobBranchName|latestJobCommitSha|latestJobId|jobId|job_id|taskId|task_id|agentId|agent_id|repoPath|queuePath|specPath|trainFile|evalFile|runStatePath|manifestVersion|manifestUrl|manifest_url|metadata)\b/i,
  /["']?\broot["']?\s*[:=]/i,
  /\b(?:route-request|result|delivery-artifacts\.manifest)\.json\b/i,
  /bounded action receipts/i,
  /\b2\/3 bot receipts\b/i,
  /TerminalBench completed with errors/i,
  /TerminalBench needs scorer follow-up before leaderboard publication/i,
  /W&B publishing is waiting on credentials/i,
  /\b0 failed assertions\b/i,
  /\b\d+\/\d+ assertions failed\b/i,
  /Remaining warnings/i,
  /roundtable-error/i,
  /"status"\s*:\s*"warning"/i,
  /"status"\s*:\s*"failed"/i,
  /raw chain-of-thought/i,
  /chain-of-thought exposure/i,
  /No bounded governed spend actions/i,
  /current window\.\./i,
  /no active bounded task/i,
  /sealed-lane/i,
  /Legacy lane/i,
]

function homeDir(env: NodeJS.ProcessEnv): string | null {
  return env.USERPROFILE?.trim() || env.HOME?.trim() || null
}

function asOptionalPath(value: string | undefined): string | null {
  const normalized = value?.trim()
  return normalized ? resolve(normalized) : null
}

export function resolvePublicShowcaseCopyCheckTargets(
  root = process.cwd(),
  env: NodeJS.ProcessEnv = process.env,
): PublicShowcaseCopyCheckTarget[] {
  const home = homeDir(env)
  const explicitWebsitesSnapshot =
    asOptionalPath(env.ASGARD_PUBLIC_SHOWCASE_SNAPSHOT_FILE) ??
    asOptionalPath(env.OPENJAWS_PUBLIC_SHOWCASE_SNAPSHOT_FILE)
  const defaultWindowsWebsitesSnapshot = resolve(
    'D:\\',
    'cheeks',
    'Asgard',
    'Websites',
    'netlify',
    'functions',
    '_lib',
    'publicShowcaseSnapshot.generated.ts',
  )

  const targets: Array<PublicShowcaseCopyCheckTarget | null> = [
    home
      ? {
          label: 'arobi-public status',
          path: resolve(home, '.arobi-public', 'showcase-status.json'),
          required: false,
        }
      : null,
    home
      ? {
          label: 'arobi-public guard',
          path: resolve(home, '.arobi-public', 'showcase-guard.json'),
          required: false,
        }
      : null,
    {
      label: 'arobi-public activity',
      path: getPublicShowcaseActivityPath(env),
      required: false,
    },
    {
      label: 'openjaws public activity mirror',
      path: getPublicShowcaseActivityMirrorPath(root, env),
      required: true,
    },
    explicitWebsitesSnapshot
      ? {
          label: 'websites bundled showcase snapshot',
          path: explicitWebsitesSnapshot,
          required: false,
        }
      : null,
    !explicitWebsitesSnapshot && existsSync(defaultWindowsWebsitesSnapshot)
      ? {
          label: 'websites bundled showcase snapshot',
          path: defaultWindowsWebsitesSnapshot,
          required: false,
        }
      : null,
  ]

  const seen = new Set<string>()
  return targets
    .filter((target): target is PublicShowcaseCopyCheckTarget => Boolean(target))
    .filter((target) => {
      const key = target.path.toLowerCase()
      if (seen.has(key)) {
        return false
      }
      seen.add(key)
      return true
    })
}

function snippetForLine(line: string): string {
  const normalized = line.replace(/\s+/g, ' ').trim()
  return normalized.length <= 220
    ? normalized
    : `${normalized.slice(0, 219).trimEnd()}…`
}

export function checkPublicShowcaseCopyText(
  text: string,
  target: PublicShowcaseCopyCheckTarget,
): PublicShowcaseCopyViolation[] {
  const violations: PublicShowcaseCopyViolation[] = []
  const lines = text.split(/\r?\n/)
  for (const [index, line] of lines.entries()) {
    for (const pattern of PUBLIC_SHOWCASE_COPY_BANNED_PATTERNS) {
      if (!pattern.test(line)) {
        continue
      }
      violations.push({
        label: target.label,
        path: target.path,
        pattern: pattern.source,
        line: index + 1,
        snippet: snippetForLine(line),
      })
    }
  }
  return violations
}

export function runPublicShowcaseCopyCheck(args: {
  root?: string
  env?: NodeJS.ProcessEnv
  strictMissing?: boolean
} = {}): PublicShowcaseCopyCheckResult {
  const root = args.root ?? process.cwd()
  const env = args.env ?? process.env
  const checked: PublicShowcaseCopyCheckTarget[] = []
  const missingRequired: PublicShowcaseCopyCheckTarget[] = []
  const violations: PublicShowcaseCopyViolation[] = []

  for (const target of resolvePublicShowcaseCopyCheckTargets(root, env)) {
    if (!existsSync(target.path)) {
      if (target.required || args.strictMissing) {
        missingRequired.push(target)
      }
      continue
    }
    checked.push(target)
    violations.push(
      ...checkPublicShowcaseCopyText(readFileSync(target.path, 'utf8'), target),
    )
  }

  return {
    ok: violations.length === 0 && missingRequired.length === 0,
    checked,
    missingRequired,
    violations,
  }
}

export function parseArgs(argv: string[]): PublicShowcaseCopyCheckOptions {
  return {
    json: argv.includes('--json'),
    strictMissing: argv.includes('--strict-missing'),
  }
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  const options = parseArgs(argv)
  const result = runPublicShowcaseCopyCheck({
    root: process.cwd(),
    strictMissing: options.strictMissing,
  })

  if (options.json) {
    console.log(JSON.stringify(result, null, 2))
  } else if (result.ok) {
    console.log(`Public showcase copy check passed (${result.checked.length} file(s)).`)
  } else {
    for (const violation of result.violations) {
      console.error(
        `${violation.label}:${violation.line}: banned public copy (${violation.pattern}) in ${violation.path}`,
      )
      console.error(`  ${violation.snippet}`)
    }
    for (const target of result.missingRequired) {
      console.error(`Missing required public showcase copy target: ${target.path}`)
    }
  }

  return result.ok ? 0 : 1
}

if (import.meta.main) {
  const exitCode = await main()
  process.exit(exitCode)
}
