// SANITIZED: Plugin telemetry - no-op stubs
export type TelemetryPluginScope = 'official'
export type EnabledVia = 'user-install'
export type InvocationTrigger = 'user-slash'
export type SkillExecutionContext = 'inline'
export type InstallSource = 'cli-explicit'
export type PluginCommandErrorCategory = 'unknown'

export function hashPluginId(_name: string, _marketplace?: string): string { return 'sanitized'; }
export function getTelemetryPluginScope(_name: string, _marketplace?: string, _managed?: unknown): TelemetryPluginScope { return 'official'; }
export function getEnabledVia(_plugin: unknown, _managed?: unknown, _seed?: unknown): EnabledVia { return 'user-install'; }
export function buildPluginTelemetryFields(_name: string, _marketplace?: string, _managed?: unknown): Record<string, unknown> { return {}; }
export function buildPluginCommandTelemetryFields(_info: unknown, _managed?: unknown): Record<string, unknown> { return {}; }
export function logPluginsEnabledForSession(_plugins: unknown[], _managed?: unknown, _seed?: unknown): void {}
export function classifyPluginCommandError(_error: unknown): PluginCommandErrorCategory { return 'unknown'; }
export function logPluginLoadErrors(_errors: unknown[], _managed?: unknown): void {}
