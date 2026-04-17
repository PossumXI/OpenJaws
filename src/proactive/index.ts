type ProactiveActivationSource = 'command' | 'control'

let proactiveActive = false
let proactivePaused = false
let proactiveContextBlocked = false
let proactiveNextTickAt: number | null = null

const listeners = new Set<() => void>()

function emitChange(): void {
  for (const listener of listeners) {
    listener()
  }
}

export function activateProactive(_source: ProactiveActivationSource): void {
  if (proactiveActive) {
    return
  }
  proactiveActive = true
  proactivePaused = false
  proactiveNextTickAt = null
  emitChange()
}

export function deactivateProactive(): void {
  if (!proactiveActive && !proactivePaused && proactiveNextTickAt === null) {
    return
  }
  proactiveActive = false
  proactivePaused = false
  proactiveContextBlocked = false
  proactiveNextTickAt = null
  emitChange()
}

export function isProactiveActive(): boolean {
  return proactiveActive
}

export function pauseProactive(): void {
  if (proactivePaused) {
    return
  }
  proactivePaused = true
  emitChange()
}

export function resumeProactive(): void {
  if (!proactivePaused) {
    return
  }
  proactivePaused = false
  emitChange()
}

export function isProactivePaused(): boolean {
  return proactivePaused
}

export function setContextBlocked(blocked: boolean): void {
  if (proactiveContextBlocked === blocked) {
    return
  }
  proactiveContextBlocked = blocked
  emitChange()
}

export function isContextBlocked(): boolean {
  return proactiveContextBlocked
}

export function getNextTickAt(): number | null {
  return proactiveNextTickAt
}

export function subscribeToProactiveChanges(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
