// biome-ignore-all assist/source/organizeImports: JAWS-ONLY import markers must not be reordered
import * as React from 'react'
import { Suspense, useMemo, useState } from 'react'
import { useKeybinding } from '../../keybindings/useKeybinding.js'
import { useExitOnCtrlCDWithKeybindings } from '../../hooks/useExitOnCtrlCDWithKeybindings.js'
import { useTerminalSize } from '../../hooks/useTerminalSize.js'
import {
  useIsInsideModal,
  useModalOrTerminalSize,
} from '../../context/modalContext.js'
import { Text } from '../../ink.js'
import { Pane } from '../design-system/Pane.js'
import { Tab, Tabs } from '../design-system/Tabs.js'
import { type CommandResultDisplay, type LocalJSXCommandContext } from '../../commands.js'
import { Status, buildDiagnostics } from './Status.js'
import {
  APPEARANCE_SETTING_IDS,
  Config,
  PRIVACY_SETTING_IDS,
} from './Config.js'
import { Usage } from './Usage.js'

type Props = {
  onClose: (
    result?: string,
    options?: {
      display?: CommandResultDisplay
    },
  ) => void
  context: LocalJSXCommandContext
  defaultTab:
    | 'Status'
    | 'Appearance'
    | 'Privacy'
    | 'Config'
    | 'Usage'
    | 'Gates'
}

export function Settings({
  onClose,
  context,
  defaultTab,
}: Props): React.ReactNode {
  const initialTab = defaultTab === 'Gates' ? 'Status' : defaultTab
  const [selectedTab, setSelectedTab] = useState<string>(initialTab)
  const [tabsHidden, setTabsHidden] = useState(false)
  const [configOwnsEsc, setConfigOwnsEsc] = useState(false)
  const [gatesOwnsEsc] = useState(false)
  const insideModal = useIsInsideModal()
  const { rows } = useModalOrTerminalSize(useTerminalSize())
  const contentHeight = insideModal
    ? rows + 1
    : Math.max(15, Math.min(Math.floor(rows * 0.8), 30))
  const [diagnosticsPromise] = useState(() =>
    buildDiagnostics().catch(() => []),
  )

  useExitOnCtrlCDWithKeybindings()

  const handleEscape = () => {
    if (tabsHidden) {
      return
    }

    onClose('Status dialog dismissed', { display: 'system' })
  }

  useKeybinding('confirm:no', handleEscape, {
    context: 'Settings',
    isActive:
      !tabsHidden &&
      !(
        (selectedTab === 'Config' ||
          selectedTab === 'Appearance' ||
          selectedTab === 'Privacy') &&
        configOwnsEsc
      ) &&
      !(selectedTab === 'Gates' && gatesOwnsEsc),
  })

  const tabs = useMemo(() => {
    const gateTabs: React.ReactNode[] = false ? [] : []

    return [
      <Tab key="status" title="Status">
        <Suspense fallback={<Text dimColor>Loading status…</Text>}>
          <Status context={context} diagnosticsPromise={diagnosticsPromise} />
        </Suspense>
      </Tab>,
      <Tab key="appearance" title="Appearance">
        <Suspense fallback={null}>
          <Config
            context={context}
            onClose={onClose}
            setTabsHidden={setTabsHidden}
            onIsSearchModeChange={setConfigOwnsEsc}
            contentHeight={contentHeight}
            visibleSettingIds={APPEARANCE_SETTING_IDS}
          />
        </Suspense>
      </Tab>,
      <Tab key="privacy" title="Privacy">
        <Suspense fallback={null}>
          <Config
            context={context}
            onClose={onClose}
            setTabsHidden={setTabsHidden}
            onIsSearchModeChange={setConfigOwnsEsc}
            contentHeight={contentHeight}
            visibleSettingIds={PRIVACY_SETTING_IDS}
          />
        </Suspense>
      </Tab>,
      <Tab key="config" title="Config">
        <Suspense fallback={null}>
          <Config
            context={context}
            onClose={onClose}
            setTabsHidden={setTabsHidden}
            onIsSearchModeChange={setConfigOwnsEsc}
            contentHeight={contentHeight}
          />
        </Suspense>
      </Tab>,
      <Tab key="usage" title="Usage">
        <Usage />
      </Tab>,
      ...gateTabs,
    ]
  }, [contentHeight, context, diagnosticsPromise, onClose])

  const initialHeaderFocused =
    initialTab !== 'Config' &&
    initialTab !== 'Appearance' &&
    initialTab !== 'Privacy' &&
    defaultTab !== 'Gates'
  const tabContentHeight =
    tabsHidden || insideModal ? undefined : contentHeight

  return (
    <Pane color="permission">
      <Tabs
        color="permission"
        selectedTab={selectedTab}
        onTabChange={setSelectedTab}
        hidden={tabsHidden}
        initialHeaderFocused={initialHeaderFocused}
        contentHeight={tabContentHeight}
      >
        {tabs}
      </Tabs>
    </Pane>
  )
}
