import * as React from 'react'
import { useEffect, useMemo } from 'react'
import { getIsRemoteMode } from '../../bootstrap/state.js'
import { foldNotificationLatest } from '../../context/notificationFold.js'
import { useNotifications } from '../../context/notifications.js'
import { Text } from '../../ink.js'
import { useAppState } from '../../state/AppState.js'
import { logForDebugging } from '../../utils/debug.js'
import { plural } from '../../utils/stringUtils.js'
import { getPluginInstallationFailureCounts } from './pluginInstallationFailureCounts.js'

export const PLUGIN_INSTALL_FAILED_NOTIFICATION_KEY = 'plugin-install-failed'

export function usePluginInstallationStatus(): void {
  const { addNotification, removeNotification } = useNotifications()
  const installationStatus = useAppState(s => s.plugins.installationStatus)

  const {
    totalFailed,
    failedMarketplacesCount,
    failedPluginsCount,
  } = useMemo(
    () => getPluginInstallationFailureCounts(installationStatus),
    [installationStatus],
  )

  useEffect(() => {
    if (getIsRemoteMode()) {
      removeNotification(PLUGIN_INSTALL_FAILED_NOTIFICATION_KEY)
      return
    }

    if (!installationStatus) {
      logForDebugging('No installation status to monitor')
      removeNotification(PLUGIN_INSTALL_FAILED_NOTIFICATION_KEY)
      return
    }

    if (totalFailed === 0) {
      removeNotification(PLUGIN_INSTALL_FAILED_NOTIFICATION_KEY)
      return
    }

    logForDebugging(
      `Plugin installation status: ${failedMarketplacesCount} failed marketplaces, ${failedPluginsCount} failed plugins`,
    )

    addNotification({
      key: PLUGIN_INSTALL_FAILED_NOTIFICATION_KEY,
      jsx: (
        <>
          <Text color="error">
            {totalFailed} {plural(totalFailed, 'plugin')} failed to install
          </Text>
          <Text dimColor> · /plugin for details</Text>
        </>
      ),
      priority: 'medium',
      fold: foldNotificationLatest,
    })
  }, [
    addNotification,
    removeNotification,
    installationStatus,
    totalFailed,
    failedMarketplacesCount,
    failedPluginsCount,
  ])
}
