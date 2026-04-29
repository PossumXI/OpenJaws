import { existsSync, mkdirSync, realpathSync } from 'fs'
import { basename, isAbsolute, join, relative, resolve } from 'path'
import { spawnSync } from 'child_process'
import { buildDiscordOperatorArtifactPrompt } from './discordOperatorArtifactPrompt.js'
import { type DiscordQOperatorAction } from './discordOperatorTypes.js'

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

const OPERATOR_APEX_APPS_ALIASES = new Set([
  'apex apps',
  'apex-apps',
  'apex workspace',
])
const OPERATOR_ASGARD_ALIASES = new Set([
  'arobi',
  'arobi network',
  'asgard',
  'asgard root',
])

const OPERATOR_PLAIN_ENGLISH_DEFAULT_WORKSPACE = 'openjaws-d'

const OPERATOR_PROJECT_WORKSPACE_HINTS = [
  {
    pattern: /\b(?:apex[-\s]?apps?|apex workspace)\b/i,
    workspace: 'apex-apps',
  },
  {
    pattern: /\bimmaculate\b/i,
    workspace: 'immaculate-c',
  },
  {
    pattern: /\b(?:asgard|arobi(?: network)?)\b/i,
    workspace: 'asgard',
  },
  {
    pattern: /\b(?:openjaws|qline|qline\.site|website|site|tui)\b/i,
    workspace: OPERATOR_PLAIN_ENGLISH_DEFAULT_WORKSPACE,
  },
] as const

const OPERATOR_PLAIN_ENGLISH_WORK_VERBS =
  /^(?:please\s+)?(?:(?:can|could|would)\s+you\s+)?(?:q\s+)?(?:fix|debug|diagnose|investigate|audit|review|inspect|research|look\s+into|look\s+up|search|browse|google|find\s+online|check\s+online|check(?:\s+logs?)?|verify|trace|figure\s+out|why\s+(?:is|are|does|do|did|can|can't|cannot|won't)|run|build|test|update|improve|continue|complete|implement|ship|harden|optimi[sz]e|use\s+(?:the\s+)?internet|use\s+(?:my\s+)?(?:local\s+)?computer|use\s+tools?|openjaws\s+(?:please\s+)?(?:fix|debug|diagnose|investigate|audit|review|inspect|research|look\s+into|look\s+up|search|browse|check|verify|trace|run|build|test|update|improve|continue|complete|implement|ship|harden|optimi[sz]e))\b/i
const OPERATOR_PLAIN_ENGLISH_PROJECT_CONTEXT =
  /\b(?:repo|repository|project|codebase|app|apps|site|website|qline|openjaws|immaculate|asgard|arobi|apex|discord|agent|agents|voice|voice\s+channel|viola|blackbeak|meme|tui|browser|internet|web|local\s+computer|terminal|shell|command|commands|log|logs|file|files|pdf|docx|markdown|md|artifact|deliverable|route|endpoint|api|service|backend|frontend|test|tests|build|security|vulnerability|dead\s+code|audit|integration|flow|flows|workflow|harness|orchestration|docs|documentation|benchmark|benchmarks|leaderboard)\b/i

function normalizeWorkspaceAlias(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function resolveKnownWorkspaceAlias(
  requested: string,
  workspaces: DiscordOperatorWorkspace[],
): string | null {
  const alias = normalizeWorkspaceAlias(requested)
  const wantsApexApps = OPERATOR_APEX_APPS_ALIASES.has(alias)
  const wantsAsgard = OPERATOR_ASGARD_ALIASES.has(alias)

  for (const workspace of workspaces) {
    const workspacePath = normalizeAbsolutePath(workspace.path)
    if (!workspacePath) {
      continue
    }
    const candidates = wantsApexApps
      ? [
          workspacePath,
          join(workspacePath, 'ignite', 'apex-os-project', 'apps'),
          join(workspacePath, 'apex-os-project', 'apps'),
        ]
      : wantsAsgard
        ? [workspacePath, join(workspacePath, 'Asgard')]
        : []
    for (const candidate of candidates) {
      if (!existsSync(candidate)) {
        continue
      }
      const normalizedCandidate = candidate.replace(/\\/g, '/').toLowerCase()
      if (wantsApexApps && (
          normalizedCandidate.includes('/ignite/apex-os-project/apps') ||
          normalizedCandidate.endsWith('/apex-os-project/apps')
        )) {
        return candidate
      }
      if (wantsAsgard && normalizedCandidate.endsWith('/asgard')) {
        return candidate
      }
    }
  }

  return null
}

function inferPlainEnglishOperatorWorkspace(content: string): string | null {
  for (const hint of OPERATOR_PROJECT_WORKSPACE_HINTS) {
    if (hint.pattern.test(content)) {
      return hint.workspace
    }
  }
  return null
}

function parsePlainEnglishOperatorWorkRequest(
  trimmed: string,
): DiscordOperatorParsedCommand | null {
  if (!OPERATOR_PLAIN_ENGLISH_WORK_VERBS.test(trimmed)) {
    return null
  }
  if (!OPERATOR_PLAIN_ENGLISH_PROJECT_CONTEXT.test(trimmed)) {
    return null
  }

  return {
    action: 'ask-openjaws',
    cwd:
      inferPlainEnglishOperatorWorkspace(trimmed) ??
      OPERATOR_PLAIN_ENGLISH_DEFAULT_WORKSPACE,
    text: trimmed,
  }
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
  let normalizedRoot: string
  let normalizedCandidate: string
  try {
    normalizedRoot = realpathSync.native(resolve(root))
    normalizedCandidate = realpathSync.native(resolve(candidate))
  } catch {
    return null
  }
  if (process.platform === 'win32') {
    normalizedRoot = normalizedRoot.toLowerCase()
    normalizedCandidate = normalizedCandidate.toLowerCase()
  }
  if (normalizedCandidate === normalizedRoot) {
    return '.'
  }
  const relativePath = relative(normalizedRoot, normalizedCandidate)
  if (
    !relativePath ||
    relativePath.startsWith('..') ||
    isAbsolute(relativePath)
  ) {
    return null
  }
  return relativePath
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
  const naturalArtifactMatch = trimmed.match(
    /^(?:create|make|generate|draft|write|build|deliver|post|send)\s+(?:a|an|the)?\s*(?:(pdf|docx|pptx|powerpoint|slides?|slide\s+deck|xlsx|excel|spreadsheet|workbook|csv|json|markdown|md|html|txt|text)\s+)?(?:file|document|doc|report|brief|handoff|artifact)(?:\s+(?:in|inside|on|for(?: project| workspace)?)\s+(.+?))?(?:\s+(?:about|covering|on|for)\s+(.+))$/i,
  )
  if (naturalArtifactMatch) {
    const format = naturalArtifactMatch[1]?.trim().toLowerCase() || null
    const workspace = naturalArtifactMatch[2]?.trim() || null
    const topic = naturalArtifactMatch[3]?.trim() || null
    if (topic) {
      return {
        action: 'ask-openjaws',
        cwd: workspace,
        text: buildDiscordOperatorArtifactPrompt({ topic, format }),
      }
    }
  }
  const directImmaculateBridgeMatch = trimmed.match(
    /^(?:use\s+)?(?:the\s+)?immaculate(?:\s+harness)?\s+(tools|tool-capabilities|fetch|search|artifact|receipts|receipt)\b\s*(.*)$/i,
  )
  if (directImmaculateBridgeMatch) {
    const subcommand = directImmaculateBridgeMatch[1]?.trim() ?? 'tools'
    const tail = directImmaculateBridgeMatch[2]?.trim() ?? ''
    return {
      action: 'ask-openjaws',
      cwd: 'immaculate-c',
      text: [
        `Run the governed Immaculate bridge for: /immaculate ${subcommand}${tail ? ` ${tail}` : ''}.`,
        'Use ImmaculateHarness directly, keep the raw API key out of shell/history, and report the returned receipt ids or capability status.',
      ].join(' '),
    }
  }
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
  const naturalOpenJawsDefaultMatch = trimmed.match(
    /^(?:use|run|ask)\s+openjaws\s+to\s+(.+)$|^have\s+openjaws\s+(?:to\s+)?(.+)$/i,
  )
  if (naturalOpenJawsDefaultMatch) {
    const prompt =
      naturalOpenJawsDefaultMatch[1]?.trim() ||
      naturalOpenJawsDefaultMatch[2]?.trim() ||
      null
    return {
      action: 'ask-openjaws',
      cwd: prompt ? inferPlainEnglishOperatorWorkspace(prompt) ?? OPERATOR_PLAIN_ENGLISH_DEFAULT_WORKSPACE : null,
      text: prompt,
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
  const plainEnglishOperatorWork = parsePlainEnglishOperatorWorkRequest(trimmed)
  if (plainEnglishOperatorWork) {
    return plainEnglishOperatorWork
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
    case 'artifact':
    case 'deliver':
    case 'delivery':
    case 'report': {
      const artifactTail = remainder
        .replace(/^(?:artifact|deliver|delivery|report)\b/i, '')
        .trim()
      if (!artifactTail) {
        return { action: 'ask-openjaws', cwd: null, text: null }
      }
      if (artifactTail.includes('::')) {
        const [workspace, topic] = artifactTail.split('::', 2)
        return {
          action: 'ask-openjaws',
          cwd: workspace?.trim() || null,
          text: topic?.trim()
            ? buildDiscordOperatorArtifactPrompt({ topic: topic.trim() })
            : null,
        }
      }
      const artifactTokens = tokenizeDirectOperatorCommand(artifactTail)
      const topic = artifactTokens.slice(1).join(' ').trim()
      return {
        action: 'ask-openjaws',
        cwd: artifactTokens[0]?.trim() || null,
        text: topic ? buildDiscordOperatorArtifactPrompt({ topic }) : null,
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
  const knownAliasPath = resolveKnownWorkspaceAlias(requested, args.workspaces)
  const aliased =
    args.workspaces.find(
      workspace =>
        workspace.id.toLowerCase() === requested.toLowerCase() ||
        workspace.label.toLowerCase() === requested.toLowerCase() ||
        basename(workspace.path).toLowerCase() === requested.toLowerCase() ||
        workspace.label.toLowerCase().startsWith(`${requested.toLowerCase()} `),
    ) ?? null
  const resolved = normalizeAbsolutePath(knownAliasPath ?? aliased?.path ?? requested)
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
