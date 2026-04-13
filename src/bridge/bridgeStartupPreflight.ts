import {
  getBridgeDisabledReason,
  checkBridgeMinVersion,
  isEnvLessBridgeEnabled,
} from './bridgeEnabled.js'
import { checkEnvLessBridgeMinVersion } from './envLessBridgeConfig.js'
import {
  isPolicyAllowed,
  waitForPolicyLimitsToLoad,
} from '../services/policyLimits/index.js'

export async function getRemoteControlStartupPreflightIssue(): Promise<string | null> {
  const versionIssue = isEnvLessBridgeEnabled()
    ? await checkEnvLessBridgeMinVersion()
    : checkBridgeMinVersion()
  if (versionIssue) {
    return versionIssue
  }

  const bridgeIssue = await getBridgeDisabledReason()
  if (bridgeIssue) {
    return bridgeIssue
  }

  await waitForPolicyLimitsToLoad()
  if (!isPolicyAllowed('allow_remote_control')) {
    return "Remote Control is disabled by your organization's policy."
  }

  return null
}
