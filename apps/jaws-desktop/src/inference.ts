export interface InferenceProfile {
  provider: string;
  model: string;
  baseUrl: string;
  temperature: number;
  maxOutputTokens: number;
  routePolicy: "balanced" | "fast" | "deep";
}

export interface NativeInferenceStatusResult {
  ok: boolean;
  code: number | null;
  stdout: string;
  stderr: string;
  summary: string;
  provider: string;
  model: string;
  baseUrl: string;
  authLabel: string;
}

export interface InferenceStatus {
  provider: string;
  model: string;
  baseUrl: string;
  authLabel: string;
  state: "ready" | "warning" | "error" | "preview";
  summary: string;
  detail: string;
  source: "native" | "preview" | "error";
}

export const inferenceProviders = [
  { id: "oci", label: "Q on OCI" },
  { id: "openai", label: "OpenAI" },
  { id: "groq", label: "Groq" },
  { id: "gemini", label: "Gemini" },
  { id: "codex", label: "Codex" },
  { id: "kimi", label: "Kimi" },
  { id: "ollama", label: "Ollama" }
] as const;

export const defaultInferenceProfile: InferenceProfile = {
  provider: "oci",
  model: "Q",
  baseUrl: "https://inference.generativeai.us-chicago-1.oci.oraclecloud.com/openai/v1",
  temperature: 0.2,
  maxOutputTokens: 4096,
  routePolicy: "balanced"
};

const secretLikePattern = /\b(?:sk|rk|pk|sess|key|token)[-_a-z0-9]{16,}\b/gi;

export function redactInferenceText(value: string): string {
  return value.replace(secretLikePattern, "[redacted]");
}

export function normalizeInferenceProfile(value: Partial<InferenceProfile> | null | undefined): InferenceProfile {
  const provider = value?.provider?.trim().toLowerCase() || defaultInferenceProfile.provider;
  const model = value?.model?.trim() || defaultInferenceProfile.model;
  const baseUrl = (value?.baseUrl?.trim() || defaultInferenceProfile.baseUrl).replace(/\/+$/, "");
  const temperature = Number.isFinite(value?.temperature)
    ? Math.min(Math.max(Number(value?.temperature), 0), 2)
    : defaultInferenceProfile.temperature;
  const maxOutputTokens = Number.isFinite(value?.maxOutputTokens)
    ? Math.min(Math.max(Math.round(Number(value?.maxOutputTokens)), 256), 65536)
    : defaultInferenceProfile.maxOutputTokens;
  const routePolicy =
    value?.routePolicy === "fast" || value?.routePolicy === "deep" || value?.routePolicy === "balanced"
      ? value.routePolicy
      : defaultInferenceProfile.routePolicy;

  return {
    provider,
    model,
    baseUrl,
    temperature,
    maxOutputTokens,
    routePolicy
  };
}

function parseProviderLine(output: string, provider: string) {
  const normalizedProvider = provider.trim().toLowerCase();
  const line =
    output
      .split(/\r?\n/)
      .map((value) => value.trim())
      .find((value) => value.toLowerCase().startsWith(`- ${normalizedProvider}:`)) ?? "";
  const model = line.match(/\bmodel\s+(.+?)\s+·\s+key\b/i)?.[1]?.trim();
  const authLabel = line.match(/\bkey\s+(.+?)\s+·\s+base URL\b/i)?.[1]?.trim();
  const baseUrl = line.match(/\bbase URL\s+(.+)$/i)?.[1]?.trim();

  return {
    model,
    authLabel,
    baseUrl
  };
}

export function createPreviewInferenceStatus(profile: InferenceProfile = defaultInferenceProfile): InferenceStatus {
  const normalized = normalizeInferenceProfile(profile);
  return {
    provider: normalized.provider,
    model: normalized.model,
    baseUrl: normalized.baseUrl,
    authLabel: "native runtime required",
    state: "preview",
    summary: "Open JAWS Desktop to inspect the live provider route.",
    detail: "The web preview cannot read desktop sidecar provider status or local environment wiring.",
    source: "preview"
  };
}

export function buildInferenceStatusFromNative(
  result: NativeInferenceStatusResult,
  profile: InferenceProfile
): InferenceStatus {
  const normalized = normalizeInferenceProfile(profile);
  const output = redactInferenceText([result.stdout, result.stderr].filter(Boolean).join("\n"));
  const parsed = parseProviderLine(output, result.provider || normalized.provider);
  const authLabel = result.authLabel || parsed.authLabel || "not configured";
  const baseUrl = result.baseUrl || parsed.baseUrl || normalized.baseUrl;
  const model = result.model || parsed.model || normalized.model;
  const missing = /missing|not configured|unavailable|failed|error/i.test([authLabel, result.summary, result.stderr].join(" "));
  const state = result.ok && !missing ? "ready" : result.ok ? "warning" : "error";

  return {
    provider: result.provider || normalized.provider,
    model,
    baseUrl,
    authLabel,
    state,
    summary: result.summary || (result.ok ? "Provider route responded." : "Provider route needs review."),
    detail: output || "No provider output returned.",
    source: "native"
  };
}

export function buildInferenceStatusFromError(error: unknown, profile: InferenceProfile): InferenceStatus {
  const normalized = normalizeInferenceProfile(profile);
  return {
    provider: normalized.provider,
    model: normalized.model,
    baseUrl: normalized.baseUrl,
    authLabel: "native command failed",
    state: "error",
    summary: "JAWS could not read the provider route.",
    detail: redactInferenceText(String(error)),
    source: "error"
  };
}

export function buildProviderUseCommand(profile: InferenceProfile): string {
  const normalized = normalizeInferenceProfile(profile);
  return `/provider use ${normalized.provider} ${normalized.model}`;
}

export function buildProviderBaseUrlCommand(profile: InferenceProfile): string {
  const normalized = normalizeInferenceProfile(profile);
  return `/provider base-url ${normalized.provider} ${normalized.baseUrl}`;
}

export function buildInferenceTuningPrompt(profile: InferenceProfile, status: InferenceStatus): string {
  const normalized = normalizeInferenceProfile(profile);
  return [
    "Customize the OpenJaws inference route for this workspace.",
    `Provider: ${normalized.provider}`,
    `Model: ${normalized.model}`,
    `Base URL: ${normalized.baseUrl}`,
    `Policy: ${normalized.routePolicy}`,
    `Temperature target: ${normalized.temperature}`,
    `Max output tokens: ${normalized.maxOutputTokens}`,
    `Current route status: ${status.summary}`,
    "Keep secrets out of the transcript. Prefer environment-backed keys or the existing provider key command.",
    "Verify provider reachability before running a high-cost agent or Q_agents workflow."
  ].join("\n");
}
