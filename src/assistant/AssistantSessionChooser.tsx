import * as React from 'react'
import { Box, Text } from '../ink.js'
import { Select } from '../components/CustomSelect/select.js'
import { PermissionDialog } from '../components/permissions/PermissionDialog.js'

type AssistantSessionLike = {
  id?: string
  title?: string
  cwd?: string
  updatedAt?: string
}

type Props = {
  sessions: AssistantSessionLike[]
  onSelect: (id: string) => void
  onCancel: () => void
}

function getSessionId(session: AssistantSessionLike, index: number): string {
  return session.id ?? `session-${index + 1}`
}

export function AssistantSessionChooser({
  sessions,
  onSelect,
  onCancel,
}: Props): React.ReactNode {
  return (
    <PermissionDialog title="Assistant Sessions" titleColor="primary">
      <Box flexDirection="column" paddingX={2} paddingY={1}>
        <Box marginBottom={1}>
          <Text dimColor>Choose a session to attach to.</Text>
        </Box>
        <Box>
          <Select
            options={sessions.map((session, index) => {
              const id = getSessionId(session, index)
              return {
                label: session.title ? `${session.title} (${id})` : id,
                value: id,
                description: session.cwd,
              }
            })}
            onChange={value => onSelect(String(value))}
            onCancel={onCancel}
          />
        </Box>
      </Box>
    </PermissionDialog>
  )
}
