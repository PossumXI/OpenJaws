import * as React from 'react'
import { Box, Text } from '../../ink.js'
import { Select } from '../CustomSelect/select.js'
import { PermissionDialog } from '../permissions/PermissionDialog.js'

type Props = {
  agentType: string
  scope: unknown
  snapshotTimestamp: string
  onComplete: (choice: 'merge' | 'keep' | 'replace') => void
  onCancel: () => void
}

export function buildMergePrompt(agentType: string, _scope: unknown): string {
  return `Merge the latest ${agentType} memory snapshot into the current working memory. Preserve useful existing context and fold in any new facts that still matter.`
}

export function SnapshotUpdateDialog({
  agentType,
  scope,
  snapshotTimestamp,
  onComplete,
  onCancel,
}: Props): React.ReactNode {
  const scopeLabel =
    typeof scope === 'string' && scope.length > 0 ? scope : 'agent memory'

  return (
    <PermissionDialog title="Snapshot Update" titleColor="primary">
      <Box flexDirection="column" paddingX={2} paddingY={1}>
        <Box marginBottom={1}>
          <Text dimColor>
            {agentType} has a newer snapshot for {scopeLabel}.
          </Text>
        </Box>
        <Box>
          <Text dimColor>Snapshot time:</Text>
          <Text> {snapshotTimestamp}</Text>
        </Box>
        <Box marginTop={1}>
          <Text>How should OpenJaws apply it?</Text>
        </Box>
        <Box>
          <Select
            options={[
              { label: 'Merge snapshot', value: 'merge' },
              { label: 'Keep current memory', value: 'keep' },
              { label: 'Replace current memory', value: 'replace' },
            ]}
            onChange={value => {
              if (
                value === 'merge' ||
                value === 'keep' ||
                value === 'replace'
              ) {
                onComplete(value)
              }
            }}
            onCancel={onCancel}
          />
        </Box>
      </Box>
    </PermissionDialog>
  )
}
