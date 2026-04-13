type PluginInstallationStatus = {
  marketplaces: Array<{
    name: string
    status: 'pending' | 'installing' | 'installed' | 'failed'
    error?: string
  }>
  plugins: Array<{
    id: string
    name: string
    status: 'pending' | 'installing' | 'installed' | 'failed'
    error?: string
  }>
}

export type PluginInstallationFailureCounts = {
  totalFailed: number
  failedMarketplacesCount: number
  failedPluginsCount: number
}

export const EMPTY_PLUGIN_INSTALLATION_FAILURE_COUNTS: PluginInstallationFailureCounts =
  {
    totalFailed: 0,
    failedMarketplacesCount: 0,
    failedPluginsCount: 0,
  }

export function getPluginInstallationFailureCounts(
  installationStatus: PluginInstallationStatus | null | undefined,
): PluginInstallationFailureCounts {
  if (!installationStatus) {
    return EMPTY_PLUGIN_INSTALLATION_FAILURE_COUNTS
  }

  const failedMarketplacesCount = installationStatus.marketplaces.filter(
    marketplace => marketplace.status === 'failed',
  ).length
  const failedPluginsCount = installationStatus.plugins.filter(
    plugin => plugin.status === 'failed',
  ).length

  return {
    totalFailed: failedMarketplacesCount + failedPluginsCount,
    failedMarketplacesCount,
    failedPluginsCount,
  }
}
