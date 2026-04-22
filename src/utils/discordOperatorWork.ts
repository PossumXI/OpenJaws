import { existsSync, mkdirSync } from 'fs'
import { basename, isAbsolute, join, relative, resolve } from 'path'
import { spawnSync } from 'child_process'
import { type DiscordQOperatorAction } from './discordQAgent.js'

export type DiscordOperatorWorkspace = {
  id: string
  label: string
  path: string
}

export type DiscordOperatorParsedCommand = {
  action: DiscordQOperatorAction
  cwd: string | null
  text: string | null
}

export type DiscordOperatorRunContext = {
  jobId: string
  requestedWorkspace: string
  gitRoot: string | null
  gitRelativePath: string | null
  branchName: string | null
  worktreePath: string | null
  workspacePath: string
  repoLabel: string | null
}

export function normalizeAbsolutePath(
  value: string | null | undefined,
): string | null {
  if (!value?.trim()) {
    return null
  }
  const trimmed = value.trim()
  return isAbsolute(trimmed) ? resolve(trimmed) : resolve(process.cwd(), trimmed)
}

export function sanitizeBranchSegment(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return normalized.length > 0 ? normalized.slice(0, 32) : 'task'
}

function branchExists(gitRoot: string, branchName: string): boolean {
  const result = spawnSync(
    'git',
    ['-C', gitRoot, 'branch', '--list', branchName],
    {
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: '0',
        GIT_ASKPASS: '',
      },
      encoding: 'utf8',
    },
  )
  if ((result.status ?? 1) !== 0) {
    return false
  }
  return Boolean(result.stdout?.trim())
}

function allocateUniqueOperatorBranch(args: {
  gitRoot: string
  repoWorktreesDir: string
  baseBranchName: string
}): { branchName: string; worktreePath: string } {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const suffix = attempt === 0 ? '' : `-${(attempt + 1).toString(36)}`
    const branchName = `${args.baseBranchName}${suffix}`.slice(0, 92)
    const worktreePath = join(args.repoWorktreesDir, branchName)
    if (!existsSync(worktreePath) && !branchExists(args.gitRoot, branchName)) {
      return { branchName, worktreePath }
    }
  }
  throw new Error(
    `Failed to allocate a unique isolated worktree branch for ${args.baseBranchName}.`,
  )
}

export function relativeWithinRoot(
  root: string,
  candidate: string,
): string | null {
  const normalizedRoot = resolve(root).toLowerCase()
  const normalizedCandidate = resolve(candidate).toLowerCase()
  if (normalizedCandidate === normalizedRoot) {
    return '.'
  }
  if (!normalizedCandidate.startsWith(`${normalizedRoot}\\`)) {
    return null
  }
  return relative(root, candidate) || '.'
}

export function findGitRoot(path: string): string | null {
  let current = resolve(path)
  while (true) {
    if (existsSync(join(current, '.git'))) {
      return current
    }
    const parent = resolve(current, '..')
    if (parent === current) {
      return null
    }
    current = parent
  }
}

export function tokenizeDirectOperatorCommand(content: string): string[] {
  return (
    content.match(/"[^"]*"|'[^']*'|\S+/g)?.map(token => {
      if (
        (token.startsWith('"') && token.endsWith('"')) ||
        (token.startsWith("'") && token.endsWith("'"))
      ) {
        return token.slice(1, -1)
      }
      return token
    }) ?? []
  )
}

export function parseDirectOperatorChatCommand(
  content: string,
): DiscordOperatorParsedCommand | null {
  const trimmed = content.trim()
  const normalized = trimmed.toLowerCase()
  const naturalStartMatch = trimmed.match(
    /^start (?:an )?openjaws session(?: for project)?\s+(.+?)(?:\s+and\s+(.+))?$/i,
  )
  if (naturalStartMatch) {
    const workspace = naturalStartMatch[1]?.trim() || null
    const followUp = naturalStartMatch[2]?.trim() || null
    if (workspace && followUp) {
      return {
        action: 'ask-openjaws',
        cwd: workspace,
        text: followUp,
      }
    }
    if (workspace) {
      return {
        action: 'start-openjaws',
        cwd: workspace,
        text: null,
      }
    }
  }
  const naturalAskMatch = trimmed.match(
    /^(?:use|run)\s+openjaws(?:\s+in|\s+on|\s+for(?: project)?)?\s+(.+?)\s+(?:to|and)\s+(.+)$/i,
  )
  if (naturalAskMatch) {
    return {
      action: 'ask-openjaws',
      cwd: naturalAskMatch[1]?.trim() || null,
      text: naturalAskMatch[2]?.trim() || null,
    }
  }
  if (
    /^(?:show|check|list)\s+(?:the\s+)?(?:openjaws\s+)?workspaces\b/i.test(
      trimmed,
    )
  ) {
    return {
      action: 'workspaces',
      cwd: null,
      text: null,
    }
  }
  if (
    /^(?:show|check|what(?:'s| is))\s+(?:the\s+)?openjaws status\b/i.test(
      trimmed,
    )
  ) {
    return {
      action: 'openjaws-status',
      cwd: null,
      text: null,
    }
  }
  if (
    /^(?:show|check|what(?:'s| is))\s+(?:the\s+)?roundtable status\b/i.test(
      trimmed,
    )
  ) {
    return {
      action: 'roundtable-status',
      cwd: null,
      text: null,
    }
  }
  if (
    /^(?:show|check|list)\s+(?:the\s+)?(?:pending\s+)?push(?:es)?\b/i.test(
      trimmed,
    )
  ) {
    return {
      action: 'pending-pushes',
      cwd: null,
      text: null,
    }
  }
  const confirmMatch = trimmed.match(
    /^(?:confirm|approve)\s+push(?:\s+for)?\s+(.+)$/i,
  )
  if (confirmMatch) {
    return {
      action: 'confirm-push',
      cwd: null,
      text: confirmMatch[1]?.trim() || null,
    }
  }
  if (normalized === 'what can openjaws do' || normalized === 'what can openjaws do?') {
    return {
      action: 'workspaces',
      cwd: null,
      text: null,
    }
  }
  if (!/^openjaws\b/i.test(trimmed)) {
    return null
  }
  const remainder = trimmed.replace(/^openjaws\b/i, '').trim()
  if (!remainder) {
    return {
      action: 'workspaces',
      cwd: null,
      text: null,
    }
  }
  const tokens = tokenizeDirectOperatorCommand(remainder)
  const action = tokens[0]?.toLowerCase() ?? 'workspaces'
  switch (action) {
    case 'workspaces':
    case 'roots':
    case 'list':
      return { action: 'workspaces', cwd: null, text: null }
    case 'status':
      return { action: 'openjaws-status', cwd: null, text: null }
    case 'roundtable':
    case 'roundtable-status':
      return { action: 'roundtable-status', cwd: null, text: null }
    case 'stop':
      return { action: 'stop-openjaws', cwd: null, text: null }
    case 'pending':
    case 'pushes':
      return { action: 'pending-pushes', cwd: null, text: null }
    case 'github-status':
    case 'github':
    case 'remote-status': {
      const cwd = tokens.slice(1).join(' ').trim()
      return { action: 'github-status', cwd: cwd || null, text: null }
    }
    case 'confirm': {
      const target = tokens.slice(1).join(' ').trim()
      return { action: 'confirm-push', cwd: null, text: target || null }
    }
    case 'start': {
      const cwd = tokens.slice(1).join(' ').trim()
      return { action: 'start-openjaws', cwd: cwd || null, text: null }
    }
    case 'ask-github': {
      const askTail = remainder.replace(/^ask-github\b/i, '').trim()
      if (!askTail) {
        return { action: 'ask-github-openjaws', cwd: null, text: null }
      }
      if (askTail.includes('::')) {
        const [workspace, prompt] = askTail.split('::', 2)
        return {
          action: 'ask-github-openjaws',
          cwd: workspace?.trim() || null,
          text: prompt?.trim() || null,
        }
      }
      const askTokens = tokenizeDirectOperatorCommand(askTail)
      return {
        action: 'ask-github-openjaws',
        cwd: askTokens[0]?.trim() || null,
        text: askTokens.slice(1).join(' ').trim() || null,
      }
    }
    case 'ask': {
      const askTail = remainder.replace(/^ask\b/i, '').trim()
      if (!askTail) {
        return { action: 'ask-openjaws', cwd: null, text: null }
      }
      if (askTail.includes('::')) {
        const [workspace, prompt] = askTail.split('::', 2)
        return {
          action: 'ask-openjaws',
          cwd: workspace?.trim() || null,
          text: prompt?.trim() || null,
        }
      }
      const askTokens = tokenizeDirectOperatorCommand(askTail)
      return {
        action: 'ask-openjaws',
        cwd: askTokens[0]?.trim() || null,
        text: askTokens.slice(1).join(' ').trim() || null,
      }
    }
    default:
      return null
  }
}

export function resolveOperatorWorkspacePath(args: {
  input: string | null
  workspaces: DiscordOperatorWorkspace[]
  allowedRoots: string[]
}): string {
  if (!args.input?.trim()) {
    throw new Error('operator actions require --cwd or a workspace path.')
  }
  const requested = args.input.trim()
  const aliased =
    args.workspaces.find(
      workspace =>
        workspace.id.toLowerCase() === requested.toLowerCase() ||
        workspace.label.toLowerCase() === requested.toLowerCase() ||
        basename(workspace.path).toLowerCase() === requested.toLowerCase() ||
        workspace.label.toLowerCase().startsWith(`${requested.toLowerCase()} `),
    ) ?? null
  const resolved = normalizeAbsolutePath(aliased?.path ?? requested)
  if (!resolved || !existsSync(resolved)) {
    throw new Error(`Workspace path not found: ${args.input}`)
  }
  if (
    !args.allowedRoots.some(root => relativeWithinRoot(root, resolved) !== null)
  ) {
    throw new Error(
      `Workspace path is outside the approved operator roots. Allowed roots: ${args.allowedRoots.join(', ')}`,
    )
  }
  return resolved
}

export function createOperatorRunContext(args: {
  workspace: string
  jobId: string
  profileName: string
  worktreeRoot: string
}): DiscordOperatorRunContext {
  const gitRoot = findGitRoot(args.workspace)
  if (!gitRoot) {
    return {
      jobId: args.jobId,
      requestedWorkspace: args.workspace,
      gitRoot: null,
      gitRelativePath: null,
      branchName: null,
      worktreePath: null,
      workspacePath: args.workspace,
      repoLabel: null,
    }
  }

  const gitRelativePath = relativeWithinRoot(gitRoot, args.workspace) ?? '.'
  const repoLabel = sanitizeBranchSegment(basename(gitRoot) || 'repo')
  const baseBranchName = `discord-${sanitizeBranchSegment(args.profileName)}-${sanitizeBranchSegment(
    basename(args.workspace) || repoLabel,
  )}-${sanitizeBranchSegment(args.jobId)}`.slice(0, 92)
  const repoWorktreesDir = join(args.worktreeRoot, repoLabel)
  mkdirSync(repoWorktreesDir, { recursive: true })
  const { branchName, worktreePath } = allocateUniqueOperatorBranch({
    gitRoot,
    repoWorktreesDir,
    baseBranchName,
  })
  const addResult = spawnSync(
    'git',
    ['-C', gitRoot, 'worktree', 'add', '-b', branchName, worktreePath, 'HEAD'],
    {
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: '0',
        GIT_ASKPASS: '',
      },
      encoding: 'utf8',
    },
  )
  if ((addResult.status ?? 1) !== 0) {
    throw new Error(
      addResult.stderr?.trim() ||
        addResult.stdout?.trim() ||
        `Failed to create isolated worktree for ${args.workspace}.`,
    )
  }

  return {
    jobId: args.jobId,
    requestedWorkspace: args.workspace,
    gitRoot,
    gitRelativePath,
    branchName,
    worktreePath,
    workspacePath:
      gitRelativePath === '.' ? worktreePath : join(worktreePath, gitRelativePath),
    repoLabel,
  }
}
