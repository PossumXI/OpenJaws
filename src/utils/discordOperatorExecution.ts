import { existsSync, mkdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { execa } from 'execa'
import { type DiscordOperatorRunContext } from './discordOperatorWork.js'

export type OperatorDeliveryBundle = {
  markdownPath: string | null
  textPath: string | null
  htmlPath: string | null
  docxPath: string | null
  pdfPath: string | null
  workspaceFiles?: Array<{
    path: string
    name?: string | null
    relativePath?: string | null
  }> | null
}

export type DiscordOperatorVerificationResult = {
  attempted: boolean
  passed: boolean
  summary: string
  command: string | null
  stdout: string | null
  stderr: string | null
}

export type DiscordOperatorApprovalCandidate = {
  id: string
  branchName: string
  worktreePath: string
  workspacePath: string
  changedFiles: string[]
  summary: string
  verificationSummary?: string | null
  commitSha?: string | null
}

export type DiscordOperatorExecutionResult = {
  runContext: DiscordOperatorRunContext
  outputDir: string
  result: {
    startedAt?: string
    completedAt?: string
    workspace?: string
    model?: string
    prompt?: string
    outputDir?: string
    stdoutPath?: string
    stderrPath?: string
    deliveryPath?: string
    exitCode?: number
  }
  delivery: OperatorDeliveryBundle | null
  changedFiles: string[]
  verification: DiscordOperatorVerificationResult
  commitSha: string | null
}

export function summarizeChangedFiles(changedFiles: string[]): string {
  if (changedFiles.length === 0) {
    return 'No changed files were detected.'
  }
  if (changedFiles.length <= 6) {
    return changedFiles.join(', ')
  }
  return `${changedFiles.slice(0, 6).join(', ')} +${changedFiles.length - 6} more`
}

export function findApprovalCandidate<T extends { id: string; branchName: string }>(
  candidates: T[],
  target: string | null,
): T | null {
  const normalized = target?.trim().toLowerCase()
  if (!normalized) {
    return candidates.at(-1) ?? null
  }
  return (
    candidates.find(
      candidate =>
        candidate.id.toLowerCase() === normalized ||
        candidate.branchName.toLowerCase() === normalized,
    ) ?? null
  )
}

export function formatApprovalCandidateSummary(
  candidate: DiscordOperatorApprovalCandidate,
): string {
  return [
    `Job: ${candidate.id}`,
    `Branch: ${candidate.branchName}`,
    `Workspace: ${candidate.workspacePath}`,
    `Changed: ${summarizeChangedFiles(candidate.changedFiles)}`,
    `Tests: ${candidate.verificationSummary ?? 'not recorded'}`,
    `Summary: ${candidate.summary}`,
  ].join('\n')
}

export async function pushApprovalCandidateToOrigin(args: {
  branchName: string
  worktreePath: string
  commitSha?: string | null
}): Promise<string> {
  await validateApprovalCandidatePushState({
    branchName: args.branchName,
    worktreePath: args.worktreePath,
    commitSha: args.commitSha ?? null,
  })
  const result = await execa(
    'git',
    ['-C', args.worktreePath, 'push', '-u', 'origin', args.branchName],
    {
      reject: false,
      windowsHide: true,
      timeout: 5 * 60_000,
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: '0',
        GIT_ASKPASS: '',
      },
    },
  )
  if (result.exitCode !== 0) {
    throw new Error(
      result.stderr.trim() || result.stdout.trim() || `Push failed for ${args.branchName}.`,
    )
  }
  return `Pushed ${args.branchName} to origin.`
}

export async function validateApprovalCandidatePushState(args: {
  branchName: string
  worktreePath: string
  commitSha?: string | null
}): Promise<{
  currentBranch: string
  currentCommitSha: string
}> {
  const branchResult = await execa(
    'git',
    ['-C', args.worktreePath, 'symbolic-ref', '--quiet', '--short', 'HEAD'],
    {
      reject: false,
      windowsHide: true,
      timeout: 30_000,
    },
  )
  const currentBranch = branchResult.stdout.trim()
  if (branchResult.exitCode !== 0 || !currentBranch) {
    throw new Error('Approval push validation failed: worktree is not on a local branch.')
  }
  if (currentBranch !== args.branchName) {
    throw new Error(
      `Approval push validation failed: expected branch ${args.branchName} but worktree is on ${currentBranch}.`,
    )
  }

  const headResult = await execa(
    'git',
    ['-C', args.worktreePath, 'rev-parse', '--verify', 'HEAD'],
    {
      reject: false,
      windowsHide: true,
      timeout: 30_000,
    },
  )
  const currentCommitSha = headResult.stdout.trim()
  if (headResult.exitCode !== 0 || !currentCommitSha) {
    throw new Error('Approval push validation failed: unable to resolve HEAD commit.')
  }
  if (args.commitSha?.trim() && currentCommitSha !== args.commitSha.trim()) {
    throw new Error(
      `Approval push validation failed: expected commit ${args.commitSha.trim()} but worktree HEAD is ${currentCommitSha}.`,
    )
  }
  return {
    currentBranch,
    currentCommitSha,
  }
}

export async function runScriptedOpenJawsOperatorJob(args: {
  runContext: DiscordOperatorRunContext
  prompt: string
  runnerScriptPath: string
  model: string
  outputDir: string
  addDirs?: string[]
  promptFooter?: string | null
  transientConfigDir?: string | null
  timeoutMs?: number
  commitAuthorName?: string
  commitAuthorEmail?: string
  commitMessage?: string
  commitWhen?: (args: {
    changedFiles: string[]
    verification: DiscordOperatorVerificationResult
  }) => boolean
}): Promise<DiscordOperatorExecutionResult> {
  mkdirSync(args.outputDir, { recursive: true })
  const transientConfigDir =
    args.transientConfigDir?.trim() || join(args.outputDir, '.openjaws-config')
  mkdirSync(transientConfigDir, { recursive: true })

  const launch = await execa(
    'powershell',
    [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      args.runnerScriptPath,
      '-Workspace',
      args.runContext.workspacePath,
      '-Prompt',
      args.prompt,
      '-OutputDir',
      args.outputDir,
      '-TransientConfigDir',
      transientConfigDir,
      '-Model',
      args.model,
      ...(args.promptFooter?.trim()
        ? ['-PromptFooter', args.promptFooter.trim()]
        : []),
      ...((args.addDirs ?? [])
        .map(dir => dir.trim())
        .filter(Boolean)
        .flatMap(dir => ['-AddDir', dir])),
    ],
    {
      reject: false,
      windowsHide: true,
      timeout: args.timeoutMs ?? 12 * 60_000,
    },
  )

  const resultPath = join(args.outputDir, 'result.json')
  const deliveryPath = join(args.outputDir, 'delivery.json')
  const result = readJsonFile<DiscordOperatorExecutionResult['result']>(resultPath)
  const delivery = readJsonFile<OperatorDeliveryBundle>(deliveryPath)

  if (!result) {
    throw new Error(
      launch.stderr.trim() ||
        launch.stdout.trim() ||
        'OpenJaws scripted operator job did not produce a result receipt.',
    )
  }

  const changedFiles =
    args.runContext.worktreePath
      ? readGitChangedFiles(args.runContext.worktreePath)
      : []
  const verification =
    changedFiles.length > 0
      ? await verifyOperatorWorkspace(args.runContext.workspacePath)
      : {
          attempted: false,
          passed: true,
          summary: 'No file changes were detected, so no verification run was required.',
          command: null,
          stdout: null,
          stderr: null,
        }
  const shouldCommit =
    changedFiles.length > 0 &&
    verification.passed &&
    (args.commitWhen
      ? args.commitWhen({
          changedFiles,
          verification,
        })
      : true)
  const commitSha =
    args.runContext.worktreePath && shouldCommit
      ? commitOperatorWorktree({
          worktreePath: args.runContext.worktreePath,
          prompt: args.prompt,
          authorName: args.commitAuthorName ?? 'Discord Q Agent',
          authorEmail: args.commitAuthorEmail ?? 'discord-q-agent@local.invalid',
          commitMessage: args.commitMessage ?? null,
        })
      : null

  return {
    runContext: args.runContext,
    outputDir: result.outputDir ?? args.outputDir,
    result,
    delivery,
    changedFiles,
    verification,
    commitSha,
  }
}

function resolveOperatorVerificationCommand(
  workspacePath: string,
): { cmd: string[]; summary: string } | null {
  if (existsSync(join(workspacePath, 'package.json'))) {
    if (
      existsSync(join(workspacePath, 'bun.lock')) ||
      existsSync(join(workspacePath, 'bun.lockb'))
    ) {
      return {
        cmd: ['bun', 'run', 'build'],
        summary: 'bun run build',
      }
    }
    return {
      cmd: ['npm', 'run', 'build'],
      summary: 'npm run build',
    }
  }
  const cargoManifest = join(workspacePath, 'Cargo.toml')
  if (existsSync(cargoManifest)) {
    return {
      cmd: ['cargo', 'check', '--manifest-path', cargoManifest],
      summary: 'cargo check',
    }
  }
  return null
}

async function verifyOperatorWorkspace(
  workspacePath: string,
): Promise<DiscordOperatorVerificationResult> {
  const command = resolveOperatorVerificationCommand(workspacePath)
  if (!command) {
    return {
      attempted: false,
      passed: true,
      summary: 'No repo-specific verification command was detected for this workspace.',
      command: null,
      stdout: null,
      stderr: null,
    }
  }
  const result = await execa(command.cmd[0]!, command.cmd.slice(1), {
    cwd: workspacePath,
    reject: false,
    windowsHide: true,
    timeout: 15 * 60_000,
  })
  const stdout = result.stdout.trim() || null
  const stderr = result.stderr.trim() || null
  return {
    attempted: true,
    passed: result.exitCode === 0,
    summary:
      result.exitCode === 0
        ? `Verification passed: ${command.summary}`
        : `Verification failed: ${command.summary}`,
    command: command.summary,
    stdout,
    stderr,
  }
}

function readGitChangedFiles(worktreePath: string): string[] {
  const result = Bun.spawnSync({
    cmd: ['git', '-C', worktreePath, 'status', '--short'],
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const stdout = new TextDecoder().decode(result.stdout).trim()
  return stdout
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => line.replace(/^[A-Z? ]+/, '').trim())
    .filter(Boolean)
}

function commitOperatorWorktree(args: {
  worktreePath: string
  prompt: string
  authorName: string
  authorEmail: string
  commitMessage: string | null
}): string | null {
  const addResult = Bun.spawnSync({
    cmd: ['git', '-C', args.worktreePath, 'add', '-A'],
    stdout: 'pipe',
    stderr: 'pipe',
  })
  if ((addResult.exitCode ?? 1) !== 0) {
    const stderr = new TextDecoder().decode(addResult.stderr).trim()
    const stdout = new TextDecoder().decode(addResult.stdout).trim()
    throw new Error(stderr || stdout || 'Failed to stage operator worktree changes.')
  }
  const commitResult = Bun.spawnSync({
    cmd: [
      'git',
      '-C',
      args.worktreePath,
      '-c',
      `user.name=${args.authorName}`,
      '-c',
      `user.email=${args.authorEmail}`,
      'commit',
      '-m',
      args.commitMessage ?? args.prompt.slice(0, 72),
    ],
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: '0',
      GIT_ASKPASS: '',
    },
  })
  if ((commitResult.exitCode ?? 1) !== 0) {
    const stderr = new TextDecoder().decode(commitResult.stderr).trim()
    const stdout = new TextDecoder().decode(commitResult.stdout).trim()
    throw new Error(stderr || stdout || 'Failed to commit operator worktree changes.')
  }
  const shaResult = Bun.spawnSync({
    cmd: ['git', '-C', args.worktreePath, 'rev-parse', 'HEAD'],
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const sha = new TextDecoder().decode(shaResult.stdout).trim()
  return sha || null
}

function readJsonFile<T>(path: string): T | null {
  if (!existsSync(path)) {
    return null
  }
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T
  } catch {
    return null
  }
}
