import { mkdirSync, writeFileSync } from 'fs'
import { basename, join } from 'path'
import {
  createOperatorRunContext,
  findGitRoot,
  type DiscordOperatorRunContext,
} from './discordOperatorWork.js'
import {
  runScriptedOpenJawsOperatorJob,
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

  const job = await runScriptedOpenJawsOperatorJob({
    runContext,
    prompt: args.action.prompt,
    runnerScriptPath: args.runnerScriptPath,
    model: args.model,
    outputDir,
    transientConfigDir,
    timeoutMs: args.timeoutMs,
    commitAuthorName: `${args.personaName} Roundtable`,
    commitAuthorEmail: `${args.personaId}-roundtable@local.invalid`,
    commitMessage: `[roundtable/${args.personaId}] ${args.action.title}`,
  })

  const receiptPath = join(outputDir, 'receipt.json')
  writeFileSync(
    receiptPath,
    `${JSON.stringify(
      {
        version: 1,
        personaId: args.personaId,
        personaName: args.personaName,
        title: args.action.title,
        reason: args.action.reason,
        targetRoot:
          findRoundtableRootDescriptor(targetPath, args.roots)?.label ??
          basename(targetPath),
        targetPath,
        gitRoot,
        branchName: runContext.branchName,
        worktreePath: runContext.worktreePath,
        workspacePath: runContext.workspacePath,
        outputDir,
        startedAt: job.result.startedAt ?? new Date().toISOString(),
        completedAt: job.result.completedAt ?? new Date().toISOString(),
        changedFiles: job.changedFiles,
        commitSha: job.commitSha,
        verificationSummary: job.verification.summary,
        artifacts: {
          stdoutPath: join(outputDir, 'stdout.txt'),
          markdownPath: join(outputDir, 'openjaws-output.md'),
          resultPath: join(outputDir, 'result.json'),
          deliveryPath: join(outputDir, 'delivery.json'),
        },
      },
      null,
      2,
    )}\n`,
    'utf8',
  )

  return {
    targetRootLabel:
      findRoundtableRootDescriptor(targetPath, args.roots)?.label ??
      basename(targetPath),
    gitRoot,
    runContext,
    outputDir,
    receiptPath,
    job,
  }
}
