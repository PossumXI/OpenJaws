import { resetContextCollapse } from './index.js'

export function restoreFromEntries(
  _commits: unknown[],
  _snapshot?: unknown,
): void {
  resetContextCollapse()
}
