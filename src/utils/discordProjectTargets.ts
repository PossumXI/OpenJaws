export type DiscordProjectRootDescriptor = {
  label: string
  path: string
  aliases: string[]
}

export type DiscordProjectTargetCapability = 'branch_worktree' | 'read_only'

export type DiscordProjectTargetDescriptor = DiscordProjectRootDescriptor & {
  gitRoot: string | null
  capability: DiscordProjectTargetCapability
  capabilityReason: string
}

type ClassifyDiscordProjectTargetsOptions = {
  findGitRoot?: (path: string) => string | null
}

export function classifyDiscordProjectTargets(
  roots: DiscordProjectRootDescriptor[],
  options?: ClassifyDiscordProjectTargetsOptions,
): DiscordProjectTargetDescriptor[] {
  const findGitRoot = options?.findGitRoot ?? (() => null)
  return roots.map(root => {
    const gitRoot = findGitRoot(root.path)
    return {
      ...root,
      gitRoot,
      capability: gitRoot ? 'branch_worktree' : 'read_only',
      capabilityReason: gitRoot
        ? 'git-backed root is eligible for isolated branch/worktree execution'
        : 'no git repository detected; restrict this root to read-only or manual operator flows',
    }
  })
}

export function filterDiscordWritableProjectTargets(
  targets: DiscordProjectTargetDescriptor[],
): DiscordProjectTargetDescriptor[] {
  return targets.filter(target => target.capability === 'branch_worktree')
}

export function isDiscordProjectWritableTarget(
  target: Pick<DiscordProjectTargetDescriptor, 'capability'>,
): boolean {
  return target.capability === 'branch_worktree'
}
