// SANITIZED: GrowthBook removed
export type GrowthBookUserAttributes = Record<string, unknown>
export type GrowthBookExperimentData = Record<string, unknown>

export function getDynamicConfig_CACHED_MAY_BE_STALE<T>(_name: string, defaultValue: T): T { return defaultValue; }
export function getFeatureValue_CACHED_MAY_BE_STALE<T>(_name: string, defaultValue: T): T { return defaultValue; }
export function getDynamicConfig_CACHED_WITH_REFRESH<T>(_name: string, defaultValue: T, _refreshMs?: number): T { return defaultValue; }
export function getFeatureValue_CACHED_WITH_REFRESH<T>(_name: string, defaultValue: T, _refreshMs?: number): T { return defaultValue; }
export function checkStatsigFeatureGate_CACHED_MAY_BE_STALE(_gate: string): boolean { return false; }
export async function getFeatureValue_DEPRECATED<T>(_name: string, defaultValue: T): Promise<T> { return defaultValue; }
export async function getDynamicConfig_BLOCKS_ON_INIT<T>(_name: string, defaultValue: T): Promise<T> { return defaultValue; }
export function getAllGrowthBookFeatures(): Record<string, unknown> { return {}; }
export function getGrowthBookConfigOverrides(): Record<string, unknown> { return {}; }
export function setGrowthBookConfigOverride(_feature: string, _value: unknown): void {}
export function clearGrowthBookConfigOverrides(): void {}
export function hasGrowthBookEnvOverride(_feature: string): boolean { return false; }
export function onGrowthBookRefresh(_listener: () => void | Promise<void>): () => void { return () => {}; }
export async function checkGate_CACHED_OR_BLOCKING(_gate: string): Promise<boolean> { return false; }
export async function checkSecurityRestrictionGate(_gate: string): Promise<boolean> { return false; }
export function refreshGrowthBookAfterAuthChange(): void {}
export function refreshGrowthBookFeatures(): Promise<void> { return Promise.resolve(); }
export function setupPeriodicGrowthBookRefresh(): void {}
export function stopPeriodicGrowthBookRefresh(): void {}
export function resetGrowthBook(): void {}
export function initializeGrowthBook(): Promise<unknown> { return Promise.resolve(null); }
