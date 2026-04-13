import * as React from 'react'
import { use } from 'react'
import { Box } from '../ink.js'
import { useAppState } from '../state/AppState.js'
import type { AgentDefinitionsResult } from '../tools/AgentTool/loadAgentsDir.js'
import { getGlobalConfig } from '../utils/config.js'
import { getImmaculateHarnessStatus } from '../utils/immaculateHarness.js'
import { getMemoryFiles } from '../utils/openjawsmd.js'
import { getEnvironmentSelectionInfo } from '../utils/teleport/environmentSelection.js'
import {
  getActiveNotices,
  type StatusNoticeContext,
} from '../utils/statusNoticeDefinitions.js'

type Props = {
  agentDefinitions?: AgentDefinitionsResult
}

/**
 * StatusNotices contains the information displayed to users at startup. We have
 * moved neutral or positive status to src/components/Status.tsx instead, which
 * users can access through /status.
 */
export function StatusNotices({ agentDefinitions }: Props = {}): React.ReactNode {
  const replBridgeEnabled = useAppState(s => s.replBridgeEnabled)
  const replBridgeExplicit = useAppState(s => s.replBridgeExplicit)
  const replBridgeStartupIssue = useAppState(s => s.replBridgeStartupIssue)

  const context: StatusNoticeContext = {
    config: getGlobalConfig(),
    agentDefinitions,
    memoryFiles: use(getMemoryFiles()),
    environmentSelection: use(getEnvironmentSelectionInfo().catch(() => null)),
    immaculateHarnessStatus: use(getImmaculateHarnessStatus().catch(() => null)),
    bridge: {
      enabled: replBridgeEnabled,
      explicit: replBridgeExplicit,
      startupIssue: replBridgeStartupIssue,
    },
  }

  const activeNotices = getActiveNotices(context)
  if (activeNotices.length === 0) {
    return null
  }

  return (
    <Box flexDirection="column" paddingLeft={1}>
      {activeNotices.map(notice => (
        <React.Fragment key={notice.id}>{notice.render(context)}</React.Fragment>
      ))}
    </Box>
  )
}
