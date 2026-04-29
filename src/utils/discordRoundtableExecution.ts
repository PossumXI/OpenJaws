import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { basename, join } from 'path'
import {
  createOperatorRunContext,
  findGitRoot,
  type DiscordOperatorRunContext,
} from './discordOperatorWork.js'
import {
  collectDiscordOperatorDeliveryArtifacts,
  runScriptedOpenJawsOperatorJob,
  type DiscordOperatorDeliveryArtifact,
  type DiscordOperatorExecutionResult,
} from './discordOperatorExecution.js'

export type DiscordRoundtableRootDescriptor = {
  label: string
  path: string
  aliases: string[]
}

export type DiscordRoundtableExecutableAction = {
  id: string
  title: string
  reason: string
  targetPath: string | null
  prompt: string | null
  gitRoot?: string | null
}

export type DiscordRoundtableExecutionResult = {
  targetRootLabel: string | null
  gitRoot: string
  runContext: DiscordOperatorRunContext
  outputDir: string
  receiptPath: string
  job: DiscordOperatorExecutionResult
  hasCodeChanges: boolean
  artifactOnly: boolean
  hasDisallowedChanges: boolean
  verificationPassed: boolean
  mergeable: boolean
}

export type DiscordRoundtableReceipt = {
  version: 1
  personaId: string
  personaName: string
  title: string
  reason: string
  targetRoot: string
  targetPath: string
  gitRoot: string
  branchName: string | null
  worktreePath: string | null
  workspacePath: string
  outputDir: string
  startedAt: string
  completedAt: string
  changedFiles: string[]
  commitSha: string | null
  verificationSummary: string
  executionQuality: {
    hasCodeChanges: boolean
    artifactOnly: boolean
    hasDisallowedChanges: boolean
    verificationPassed: boolean
    mergeable: boolean
  }
  artifacts: {
    stdoutPath: string
    markdownPath: string
    resultPath: string
    deliveryPath: string
    deliveryArtifactManifestPath: string | null
    deliveryArtifacts: DiscordOperatorDeliveryArtifact[]
  }
}

export function buildDiscordRoundtableOperatorPromptFooter(args: {
  action: DiscordRoundtableExecutableAction
  personaName: string
  targetPath: string
  gitRoot: string
  targetRootLabel: string | null
  runContext: DiscordOperatorRunContext
}): string {
  const now = new Date()
  return [
    'Discord roundtable execution context:',
    `- runtime date/time: ${now.toISOString()}`,
    `- persona: ${args.personaName}`,
    `- target root: ${args.targetRootLabel ?? basename(args.targetPath)}`,
    `- target path: ${args.targetPath}`,
    `- canonical git root: ${args.gitRoot}`,
    `- isolated worktree: ${args.runContext.worktreePath ?? 'not materialized'}`,
    `- branch: ${args.runContext.branchName ?? 'none'}`,
    `- action id: ${args.action.id}`,
    'Freshness boundary: base Q model knowledge is current only through June 2024. Any current/latest/recent/status/version/benchmark/date-sensitive fact requires local receipts, tool output, or governed web research; if verification is unavailable, say so instead of guessing.',
    'Produce scoped, code-bearing changes when the request is implementation work. Avoid PASS/no-diff/audit-only output unless the safest correct result is no code change.',
    'Keep generated receipts and artifacts in the run output; do not commit output receipts, stdout/stderr, or delivery artifacts into the project branch.',
  ].join('\n')
}

function resolveRoundtableOperatorAddDirs(args: {
  targetPath: string
  gitRoot: string
  runContext: DiscordOperatorRunContext
}): string[] {
  return Array.from(
    new Set(
      [
        args.gitRoot,
        args.runContext.workspacePath,
        args.targetPath,
      ].filter((value): value is string => Boolean(value && existsSync(value))),
    ),
  )
}

const CODE_PATH_PREFIXES = ['src/', 'apps/', 'packages/', 'scripts/', 'internal/']
const CODE_FILE_EXTENSIONS = [
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.go',
  '.rs',
  '.py',
  '.ps1',
  '.sh',
  '.toml',
  '.json',
  '.yaml',
  '.yml',
  '.sql',
]
const NON_MERGEABLE_PATH_PATTERNS = [
  /^artifacts\//i,
  /^_AUDIT/i,
  /^_NOTE/i,
  /^AUDIT/i,
  /^docs\/wiki\/Audit/i,
  /(?:^|[\\/])(receipt|result|delivery)\.json$/i,
  /(?:^|[\\/])stdout\.txt$/i,
  /(?:^|[\\/])stderr\.txt$/i,
  /(?:^|[\\/])openjaws-output\.md$/i,
  /(?:^|[\\/])\.openjaws-config[\\/]/i,
]

function isNonMergeablePath(path: string): boolean {
  return NON_MERGEABLE_PATH_PATTERNS.some(pattern => pattern.test(path))
}

function isCodeChangePath(path: string): boolean {
  const lower = path.toLowerCase()
  return (
    CODE_PATH_PREFIXES.some(prefix => lower.startsWith(prefix)) ||
    CODE_FILE_EXTENSIONS.some(ext => lower.endsWith(ext))
  )
}

export function inspectDiscordRoundtableExecution(args: {
  changedFiles: string[]
  verificationPassed: boolean
}): {
  hasCodeChanges: boolean
  artifactOnly: boolean
  hasDisallowedChanges: boolean
  verificationPassed: boolean
  commitAllowed: boolean
} {
  const normalized = args.changedFiles
    .map(path => path.replace(/\\/g, '/').replace(/^\.\//, '').trim())
    .filter(Boolean)
  const hasDisallowedChanges = normalized.some(isNonMergeablePath)
  const hasCodeChanges = normalized.some(
    path => isCodeChangePath(path) && !isNonMergeablePath(path),
  )
  const artifactOnly =
    normalized.length > 0 && normalized.every(path => isNonMergeablePath(path))
  const verificationPassed = args.verificationPassed
  return {
    hasCodeChanges,
    artifactOnly,
    hasDisallowedChanges,
    verificationPassed,
    commitAllowed:
      verificationPassed &&
      hasCodeChanges &&
      !artifactOnly &&
      !hasDisallowedChanges,
  }
}

export function classifyDiscordRoundtableExecution(args: {
  changedFiles: string[]
  verificationPassed: boolean
  commitSha: string | null
}): {
  hasCodeChanges: boolean
  artifactOnly: boolean
  hasDisallowedChanges: boolean
  verificationPassed: boolean
  mergeable: boolean
} {
  const inspected = inspectDiscordRoundtableExecution({
    changedFiles: args.changedFiles,
    verificationPassed: args.verificationPassed,
  })
  return {
    hasCodeChanges: inspected.hasCodeChanges,
    artifactOnly: inspected.artifactOnly,
    hasDisallowedChanges: inspected.hasDisallowedChanges,
    verificationPassed: inspected.verificationPassed,
    mergeable: Boolean(args.commitSha) && inspected.commitAllowed,
  }
}

export function buildDiscordRoundtableReceipt(args: {
  personaId: string
  personaName: string
  action: DiscordRoundtableExecutableAction
  targetPath: string
  gitRoot: string
  targetRootLabel: string
  runContext: Pick<DiscordOperatorRunContext, 'branchName' | 'worktreePath' | 'workspacePath'>
  outputDir: string
  job: Pick<
    DiscordOperatorExecutionResult,
    'changedFiles' | 'commitSha' | 'delivery' | 'verification'
  > & {
    result: Pick<DiscordOperatorExecutionResult['result'], 'startedAt' | 'completedAt'>
  }
  executionQuality: {
    hasCodeChanges: boolean
    artifactOnly: boolean
    hasDisallowedChanges: boolean
    verificationPassed: boolean
    mergeable: boolean
  }
  timestampIso: string
}): DiscordRoundtableReceipt {
  return {
    version: 1,
    personaId: args.personaId,
    personaName: args.personaName,
    title: args.action.title,
    reason: args.action.reason,
    targetRoot: args.targetRootLabel,
    targetPath: args.targetPath,
    gitRoot: args.gitRoot,
    branchName: args.runContext.branchName,
    worktreePath: args.runContext.worktreePath,
    workspacePath: args.runContext.workspacePath,
    outputDir: args.outputDir,
    startedAt: args.job.result.startedAt ?? args.timestampIso,
    completedAt: args.job.result.completedAt ?? args.timestampIso,
    changedFiles: args.job.changedFiles,
    commitSha: args.job.commitSha,
    verificationSummary: args.job.verification.summary,
    executionQuality: args.executionQuality,
    artifacts: {
      stdoutPath: join(args.outputDir, 'stdout.txt'),
      markdownPath: join(args.outputDir, 'openjaws-output.md'),
      resultPath: join(args.outputDir, 'result.json'),
      deliveryPath: join(args.outputDir, 'delivery.json'),
      deliveryArtifactManifestPath: args.job.deliveryArtifactManifestPath,
      deliveryArtifacts: collectDiscordOperatorDeliveryArtifacts({
        delivery: args.job.delivery ?? null,
        outputDir: args.outputDir,
        workspacePath: args.runContext.workspacePath,
      }),
    },
  }
}

function findRoundtableRootDescriptor(
  targetPath: string,
  roots: DiscordRoundtableRootDescriptor[],
): DiscordRoundtableRootDescriptor | null {
  const normalizedTarget = targetPath.toLowerCase()
  return (
    roots.find(root => {
      const normalizedRoot = root.path.toLowerCase()
      return (
        normalizedTarget === normalizedRoot ||
        normalizedTarget.startsWith(`${normalizedRoot}\\`)
      )
    }) ?? null
  )
}

export async function executeDiscordRoundtableAction(args: {
  action: DiscordRoundtableExecutableAction
  personaId: string
  personaName: string
  roots: DiscordRoundtableRootDescriptor[]
  runnerScriptPath: string
  model: string
  worktreeRoot: string
  outputRoot: string
  timeoutMs: number
}): Promise<DiscordRoundtableExecutionResult> {
  const targetPath = args.action.targetPath
  if (!targetPath || !args.action.prompt) {
    throw new Error('Queued roundtable action is missing its target path or prompt.')
  }
  const gitRoot = args.action.gitRoot ?? findGitRoot(targetPath)
  if (!gitRoot) {
    throw new Error(`No git repository found for ${targetPath}.`)
  }

  const runContext = createOperatorRunContext({
    workspace: targetPath,
    jobId: args.action.id,
    profileName: `roundtable-${args.personaId}`,
    worktreeRoot: args.worktreeRoot,
  })
  const outputDir = join(
    args.outputRoot,
    `${runContext.branchName ?? args.action.id}-${Date.now().toString(36)}`,
  )
  const transientConfigDir = join(outputDir, '.openjaws-config')
  mkdirSync(outputDir, { recursive: true })
  const targetRootLabel =
    findRoundtableRootDescriptor(targetPath, args.roots)?.label ?? basename(targetPath)

  const job = await runScriptedOpenJawsOperatorJob({
    runContext,
    prompt: args.action.prompt,
    runnerScriptPath: args.runnerScriptPath,
    model: args.model,
    outputDir,
    transientConfigDir,
    addDirs: resolveRoundtableOperatorAddDirs({
      targetPath,
      gitRoot,
      runContext,
    }),
    promptFooter: buildDiscordRoundtableOperatorPromptFooter({
      action: args.action,
      personaName: args.personaName,
      targetPath,
      gitRoot,
      targetRootLabel,
      runContext,
    }),
    timeoutMs: args.timeoutMs,
    commitAuthorName: `${args.personaName} Roundtable`,
    commitAuthorEmail: `${args.personaId}-roundtable@local.invalid`,
    commitMessage: `[roundtable/${args.personaId}] ${args.action.title}`,
    commitWhen: ({ changedFiles, verification }) =>
      inspectDiscordRoundtableExecution({
        changedFiles,
        verificationPassed: verification.passed,
      }).commitAllowed,
  })

  const receiptPath = join(outputDir, 'receipt.json')
  const executionQuality = classifyDiscordRoundtableExecution({
    changedFiles: job.changedFiles,
    verificationPassed: job.verification.passed,
    commitSha: job.commitSha,
  })
  const receipt = buildDiscordRoundtableReceipt({
    personaId: args.personaId,
    personaName: args.personaName,
    action: args.action,
    targetPath,
    gitRoot,
    targetRootLabel,
    runContext: {
      branchName: runContext.branchName,
      worktreePath: runContext.worktreePath,
      workspacePath: runContext.workspacePath,
    },
    outputDir,
    job,
    executionQuality,
    timestampIso: new Date().toISOString(),
  })
  writeFileSync(
    receiptPath,
    `${JSON.stringify(receipt, null, 2)}\n`,
    'utf8',
  )

  return {
    targetRootLabel,
    gitRoot,
    runContext,
    outputDir,
    receiptPath,
    job,
    ...executionQuality,
  }
}
