/**
 * Worktree mode is now unconditionally enabled for all users.
 *
 * Previously gated by GrowthBook flag 'jaws_worktree_mode', but the
 * CACHED_MAY_BE_STALE pattern returns the default (false) on first launch
 * before the cache is populated, silently swallowing --worktree.
 * A stale cache on first launch previously swallowed --worktree.
 */
export function isWorktreeModeEnabled(): boolean {
  return true
}
