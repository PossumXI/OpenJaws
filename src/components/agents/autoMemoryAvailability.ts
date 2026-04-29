import { isAutoMemoryEnabled } from '../../memdir/paths.js'

export function isAgentMemoryFeatureAvailable(): boolean {
  try {
    return isAutoMemoryEnabled()
  } catch {
    return false
  }
}
