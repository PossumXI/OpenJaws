import { mkdir } from 'fs/promises'
import { homedir } from 'os'
import { join } from 'path'
import * as React from 'react'
import { Box, Text } from '../../ink.js'
import { Select } from '../../components/CustomSelect/select.js'
import { PermissionDialog } from '../../components/permissions/PermissionDialog.js'

type NewInstallWizardProps = {
  defaultDir: string
  onInstalled: (dir: string) => void
  onCancel: () => void
  onError: (message: string) => void
}

export async function computeDefaultInstallDir(): Promise<string> {
  return join(homedir(), '.openjaws', 'assistant')
}

export function NewInstallWizard({
  defaultDir,
  onInstalled,
  onCancel,
  onError,
}: NewInstallWizardProps): React.ReactNode {
  async function handleInstall(): Promise<void> {
    try {
      await mkdir(defaultDir, { recursive: true })
      onInstalled(defaultDir)
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Install failed')
    }
  }

  return (
    <PermissionDialog title="Assistant Install" titleColor="primary">
      <Box flexDirection="column" paddingX={2} paddingY={1}>
        <Box marginBottom={1}>
          <Text dimColor>
            This compatibility installer prepares the default assistant
            directory so branding and future enhancements can continue.
          </Text>
        </Box>
        <Box>
          <Text dimColor>Install path:</Text>
          <Text> {defaultDir}</Text>
        </Box>
        <Box marginTop={1}>
          <Select
            options={[
              { label: 'Prepare assistant directory', value: 'install' },
              { label: 'Cancel', value: 'cancel' },
            ]}
            onChange={value => {
              if (value === 'install') {
                void handleInstall()
              } else {
                onCancel()
              }
            }}
            onCancel={onCancel}
          />
        </Box>
      </Box>
    </PermissionDialog>
  )
}
