import { join } from 'path'
import * as React from 'react'
import { useNotifications } from '../context/notifications.js'
import {
  clearPendingHint,
  getPendingHintSnapshot,
  markShownThisSession,
  subscribeToPendingHint,
} from '../utils/openJawsCodeHints.js'
import {
  cacheAndRegisterPlugin,
} from '../utils/plugins/pluginInstallationHelpers.js'
import {
  disableHintRecommendations,
  markHintPluginShown,
  resolvePluginHint,
  type PluginHintRecommendation,
} from '../utils/plugins/hintRecommendation.js'
import {
  getSettingsForSource,
  updateSettingsForSource,
} from '../utils/settings/settings.js'
import {
  installPluginAndNotify,
  usePluginRecommendationBase,
} from './usePluginRecommendationBase.js'

export type PluginHintResponse = 'yes' | 'no' | 'disable'

export function useOpenJawsHintRecommendation(): {
  recommendation: PluginHintRecommendation | null
  handleResponse: (response: PluginHintResponse) => void
} {
  const pendingHint = React.useSyncExternalStore(
    subscribeToPendingHint,
    getPendingHintSnapshot,
    getPendingHintSnapshot,
  )
  const { addNotification } = useNotifications()
  const { recommendation, clearRecommendation, tryResolve } =
    usePluginRecommendationBase<PluginHintRecommendation>()

  React.useEffect(() => {
    if (!pendingHint) {
      return
    }

    tryResolve(async () => {
      const resolved = await resolvePluginHint(pendingHint)
      clearPendingHint()
      if (!resolved) {
        return null
      }
      markShownThisSession()
      markHintPluginShown(resolved.pluginId)
      return resolved
    })
  }, [pendingHint, tryResolve])

  const handleResponse = React.useCallback(
    (response: PluginHintResponse) => {
      if (!recommendation) {
        return
      }

      const { pluginId, pluginName } = recommendation

      switch (response) {
        case 'yes':
          void installPluginAndNotify(
            pluginId,
            pluginName,
            'openjaws-hint',
            addNotification,
            async pluginData => {
              const localSourcePath =
                typeof pluginData.entry.source === 'string'
                  ? join(
                      pluginData.marketplaceInstallLocation,
                      pluginData.entry.source,
                    )
                  : undefined

              await cacheAndRegisterPlugin(
                pluginId,
                pluginData.entry,
                'user',
                undefined,
                localSourcePath,
              )

              const settings = getSettingsForSource('userSettings')
              updateSettingsForSource('userSettings', {
                enabledPlugins: {
                  ...settings?.enabledPlugins,
                  [pluginId]: true,
                },
              })
            },
          )
          break
        case 'disable':
          disableHintRecommendations()
          break
        case 'no':
          break
      }

      clearRecommendation()
    },
    [addNotification, clearRecommendation, recommendation],
  )

  return { recommendation, handleResponse }
}
