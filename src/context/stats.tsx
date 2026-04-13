import * as React from 'react'

export type StatsStore = {
  observe(name: string, value: number): void
}

const noopStore: StatsStore = {
  observe() {},
}

const StatsContext = React.createContext<StatsStore>(noopStore)

type Props = {
  store?: StatsStore
  children: React.ReactNode
}

export function createStatsStore(): StatsStore {
  return {
    observe() {},
  }
}

export function StatsProvider({
  store,
  children,
}: Props): React.ReactNode {
  return (
    <StatsContext.Provider value={store ?? noopStore}>
      {children}
    </StatsContext.Provider>
  )
}

export function useStats(): {
  stats: StatsStore
  refreshStats: () => void
} {
  const stats = React.useContext(StatsContext)
  return {
    stats,
    refreshStats: () => {},
  }
}
