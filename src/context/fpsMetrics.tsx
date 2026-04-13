import * as React from 'react'
import type { FpsMetrics } from '../utils/fpsTracker.js'

type FpsMetricsGetter = () => FpsMetrics | undefined

const FpsMetricsContext = React.createContext<FpsMetricsGetter>(() => undefined)

type Props = {
  getFpsMetrics: FpsMetricsGetter
  children: React.ReactNode
}

export function FpsMetricsProvider({
  getFpsMetrics,
  children,
}: Props): React.ReactNode {
  return (
    <FpsMetricsContext.Provider value={getFpsMetrics}>
      {children}
    </FpsMetricsContext.Provider>
  )
}

export function useFpsMetrics(): FpsMetricsGetter {
  return React.useContext(FpsMetricsContext)
}
