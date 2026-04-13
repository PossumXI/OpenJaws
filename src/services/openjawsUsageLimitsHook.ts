import { useEffect, useState } from 'react'
import {
  type OpenJawsUsageLimits,
  currentLimits,
  statusListeners,
} from './openjawsUsageLimits.js'

export function useOpenJawsUsageLimits(): OpenJawsUsageLimits {
  const [limits, setLimits] = useState<OpenJawsUsageLimits>({ ...currentLimits })

  useEffect(() => {
    const listener = (newLimits: OpenJawsUsageLimits) => {
      setLimits({ ...newLimits })
    }
    statusListeners.add(listener)

    return () => {
      statusListeners.delete(listener)
    }
  }, [])

  return limits
}
