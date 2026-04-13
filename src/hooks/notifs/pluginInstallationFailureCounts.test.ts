import { describe, expect, it } from 'bun:test'
import {
  EMPTY_PLUGIN_INSTALLATION_FAILURE_COUNTS,
  getPluginInstallationFailureCounts,
} from './pluginInstallationFailureCounts.js'

describe('getPluginInstallationFailureCounts', () => {
  it('returns zero counts when installation status is missing', () => {
    expect(getPluginInstallationFailureCounts(null)).toEqual(
      EMPTY_PLUGIN_INSTALLATION_FAILURE_COUNTS,
    )
  })

  it('counts failed marketplaces and plugins only', () => {
    expect(
      getPluginInstallationFailureCounts({
        marketplaces: [
          { name: 'market-a', status: 'failed', error: 'boom' },
          { name: 'market-b', status: 'installed' },
          { name: 'market-c', status: 'installing' },
        ],
        plugins: [
          { id: 'plugin-a', name: 'Plugin A', status: 'failed' },
          { id: 'plugin-b', name: 'Plugin B', status: 'failed' },
          { id: 'plugin-c', name: 'Plugin C', status: 'installed' },
        ],
      }),
    ).toEqual({
      totalFailed: 3,
      failedMarketplacesCount: 1,
      failedPluginsCount: 2,
    })
  })
})
