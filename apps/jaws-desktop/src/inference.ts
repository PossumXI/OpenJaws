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

export interface InferenceProviderOption {
  id: string;
  label: string;
  defaultModel: string;
  baseUrl: string;
}

export const inferenceProviders = [
  {
    id: "oci",
    label: "Q on OCI",
    defaultModel: "Q",
    baseUrl: "https://inference.generativeai.us-chicago-1.oci.oraclecloud.com/openai/v1"
  },
  { id: "openai", label: "OpenAI", defaultModel: "gpt-5.4", baseUrl: "https://api.openai.com/v1" },
  { id: "groq", label: "Groq", defaultModel: "llama-3.3-70b-versatile", baseUrl: "https://api.groq.com/openai/v1" },
  { id: "minimax", label: "MiniMax", defaultModel: "MiniMax-M2.7", baseUrl: "https://api.minimax.io/v1" },
  {
    id: "gemini",
    label: "Gemini",
    defaultModel: "gemini-3-flash-preview",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai"
  },
  { id: "codex", label: "Codex", defaultModel: "gpt-5.4", baseUrl: "https://api.openai.com/v1" },
  { id: "kimi", label: "Kimi", defaultModel: "kimi-k2-0711-preview", baseUrl: "https://api.moonshot.cn/v1" },
  { id: "ollama", label: "Ollama", defaultModel: "q", baseUrl: "http://127.0.0.1:11434" }
] as const satisfies readonly InferenceProviderOption[];

export type InferenceProviderId = (typeof inferenceProviders)[number]["id"];

const providerOptionsById = new Map<string, InferenceProviderOption>(
  inferenceProviders.map((provider) => [provider.id, provider])
);

export function getInferenceProviderOption(provider: string | null | undefined): InferenceProviderOption {
  const normalized = provider?.trim().toLowerCase();
  return providerOptionsById.get(normalized || "") ?? inferenceProviders[0];
}

export const defaultInferenceProfile: InferenceProfile = {
  provider: inferenceProviders[0].id,
  model: inferenceProviders[0].defaultModel,
  baseUrl: inferenceProviders[0].baseUrl,
  temperature: 0.2,
  maxOutputTokens: 4096,
  routePolicy: "balanced"
};

const secretLikePattern = /\b(?:sk|rk|pk|sess|key|token)[-_a-z0-9]{16,}\b/gi;

export function redactInferenceText(value: string): string {
  return value.replace(secretLikePattern, "[redacted]");
}

export function normalizeInferenceProfile(value: Partial<InferenceProfile> | null | undefined): InferenceProfile {
  const providerOption = getInferenceProviderOption(value?.provider ?? defaultInferenceProfile.provider);
  const provider = providerOption.id;
  const model = value?.model?.trim() || providerOption.defaultModel;
  const baseUrl = (value?.baseUrl?.trim() || providerOption.baseUrl).replace(/\/+$/, "");
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

export function applyInferenceProviderSelection(
  current: InferenceProfile,
  provider: string
): InferenceProfile {
  const option = getInferenceProviderOption(provider);
  return normalizeInferenceProfile({
    ...current,
    provider: option.id,
    model: option.defaultModel,
    baseUrl: option.baseUrl
  });
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

function parseProbeField(output: string, field: string): string | undefined {
  const line =
    output
      .split(/\r?\n/)
      .map((value) => value.trim())
      .find((value) => value.toLowerCase().startsWith(`${field.toLowerCase()}:`)) ?? "";
  return line.slice(field.length + 1).trim() || undefined;
}

function isUnconfiguredAuthLabel(value: string): boolean {
  return /not configured|missing|incomplete|check failed|desktop app required/i.test(value);
}

export function createPreviewInferenceStatus(profile: InferenceProfile = defaultInferenceProfile): InferenceStatus {
  const normalized = normalizeInferenceProfile(profile);
  return {
    provider: normalized.provider,
    model: normalized.model,
    baseUrl: normalized.baseUrl,
    authLabel: "desktop app required",
    state: "preview",
    summary: "Open the JAWS desktop app to check your AI connection.",
    detail: "The browser preview cannot read your local AI settings.",
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
  const parsedAuthLabel = parsed.authLabel || parseProbeField(output, "Auth");
  const nativeAuthLabel = result.authLabel?.trim() || "";
  const authLabel =
    parsedAuthLabel ||
    (nativeAuthLabel && !isUnconfiguredAuthLabel(nativeAuthLabel)
      ? nativeAuthLabel
      : result.ok && parseProbeField(output, "Provider test")
        ? "validated by provider test"
        : nativeAuthLabel || "not configured");
  const baseUrl = result.baseUrl || parsed.baseUrl || parseProbeField(output, "Base URL") || normalized.baseUrl;
  const model = result.model || parsed.model || parseProbeField(output, "Model") || normalized.model;
  const missing = /missing|not configured|unavailable|failed|error/i.test([authLabel, result.summary, result.stderr].join(" "));
  const state = result.ok && !missing ? "ready" : result.ok ? "warning" : "error";

  return {
    provider: result.provider || normalized.provider,
    model,
    baseUrl,
    authLabel,
    state,
    summary: result.summary || (result.ok ? "AI connection is ready." : "AI connection needs attention."),
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
    authLabel: "check failed",
    state: "error",
    summary: "JAWS could not check the AI connection.",
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

export function buildProviderApplySummary(profile: InferenceProfile): string {
  const normalized = normalizeInferenceProfile(profile);
  return `Use ${normalized.provider}:${normalized.model} at ${normalized.baseUrl}`;
}

export function buildInferenceTuningPrompt(profile: InferenceProfile, status: InferenceStatus): string {
  const normalized = normalizeInferenceProfile(profile);
  return [
    "Set up the AI connection for this workspace.",
    `Provider: ${normalized.provider}`,
    `Model: ${normalized.model}`,
    `Server URL: ${normalized.baseUrl}`,
    `Mode: ${normalized.routePolicy}`,
    `Temperature target: ${normalized.temperature}`,
    `Max output tokens: ${normalized.maxOutputTokens}`,
    `Current status: ${status.summary}`,
    "Keep secrets out of the transcript. Prefer environment-backed keys or the existing provider key command.",
    "Check the connection before running a long agent job."
  ].join("\n");
}
