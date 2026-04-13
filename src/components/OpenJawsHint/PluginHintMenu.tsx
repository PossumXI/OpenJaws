import * as React from 'react'
import { Box, Text } from '../../ink.js'
import { Select } from '../CustomSelect/select.js'
import { PermissionDialog } from '../permissions/PermissionDialog.js'
import type { PluginHintResponse } from '../../hooks/useOpenJawsHintRecommendation.js'

type Props = {
  pluginName: string
  pluginDescription?: string
  marketplaceName: string
  sourceCommand: string
  onResponse: (response: PluginHintResponse) => void
}

const AUTO_DISMISS_MS = 30_000

export function PluginHintMenu({
  pluginName,
  pluginDescription,
  marketplaceName,
  sourceCommand,
  onResponse,
}: Props): React.ReactNode {
  const onResponseRef = React.useRef(onResponse)
  onResponseRef.current = onResponse

  React.useEffect(() => {
    const timeoutId = setTimeout(ref => ref.current('no'), AUTO_DISMISS_MS, onResponseRef)
    return () => clearTimeout(timeoutId)
  }, [])

  const options = [
    {
      label: (
        <Text>
          Install <Text bold>{pluginName}</Text>
        </Text>
      ),
      value: 'yes',
    },
    {
      label: 'Not now',
      value: 'no',
    },
    {
      label: 'Disable plugin hints',
      value: 'disable',
    },
  ] as const

  function onSelect(value: string): void {
    if (value === 'yes' || value === 'no' || value === 'disable') {
      onResponse(value)
    }
  }

  return (
    <PermissionDialog title="OpenJaws Plugin Hint" titleColor="primary">
      <Box flexDirection="column" paddingX={2} paddingY={1}>
        <Box marginBottom={1}>
          <Text dimColor>
            A tool surfaced an OpenJaws plugin hint that can extend this shell.
          </Text>
        </Box>
        <Box>
          <Text dimColor>Plugin:</Text>
          <Text> {pluginName}</Text>
        </Box>
        {pluginDescription ? (
          <Box>
            <Text dimColor>{pluginDescription}</Text>
          </Box>
        ) : null}
        <Box>
          <Text dimColor>Marketplace:</Text>
          <Text> {marketplaceName}</Text>
        </Box>
        <Box>
          <Text dimColor>Triggered by:</Text>
          <Text> {sourceCommand}</Text>
        </Box>
        <Box marginTop={1}>
          <Text>Install this plugin for OpenJaws?</Text>
        </Box>
        <Box>
          <Select
            options={options}
            onChange={onSelect}
            onCancel={() => onResponse('no')}
          />
        </Box>
      </Box>
    </PermissionDialog>
  )
}
