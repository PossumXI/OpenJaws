import { describe, expect, test } from "bun:test";
import {
  applyInferenceProviderSelection,
  buildInferenceStatusFromNative,
  buildProviderApplySummary,
  buildInferenceTuningPrompt,
  buildProviderBaseUrlCommand,
  buildProviderUseCommand,
  defaultInferenceProfile,
  normalizeInferenceProfile,
  redactInferenceText
} from "./inference";

describe("inference helpers", () => {
  test("normalizes profile input and clamps tuning fields", () => {
    expect(
      normalizeInferenceProfile({
        provider: " OCI ",
        model: " Q ",
        baseUrl: "https://example.test/openai/v1///",
        temperature: 7,
        maxOutputTokens: 12,
        routePolicy: "deep"
      })
    ).toEqual({
      provider: "oci",
      model: "Q",
      baseUrl: "https://example.test/openai/v1",
      temperature: 2,
      maxOutputTokens: 256,
      routePolicy: "deep"
    });
  });

  test("switches provider defaults instead of carrying the old model lane", () => {
    const profile = applyInferenceProviderSelection(defaultInferenceProfile, "openai");

    expect(profile).toMatchObject({
      provider: "openai",
      model: "gpt-5.4",
      baseUrl: "https://api.openai.com/v1"
    });
    expect(buildProviderApplySummary(profile)).toBe("Use openai:gpt-5.4 at https://api.openai.com/v1");
  });

  test("builds provider commands without embedding secrets", () => {
    expect(buildProviderUseCommand(defaultInferenceProfile)).toBe("/provider use oci Q");
    expect(buildProviderBaseUrlCommand(defaultInferenceProfile)).toBe(
      "/provider base-url oci https://inference.generativeai.us-chicago-1.oci.oraclecloud.com/openai/v1"
    );
  });

  test("parses native provider status into a stable UI status", () => {
    const status = buildInferenceStatusFromNative(
      {
        ok: true,
        code: 0,
        provider: "oci",
        model: "Q",
        baseUrl: "",
        authLabel: "",
        summary: "Provider status loaded.",
        stderr: "",
        stdout:
          "Current model: oci:Q\n\nExternal providers:\n- oci: model oci:Q · key OCI IAM (DEFAULT) · base URL https://oci.test/openai/v1"
      },
      defaultInferenceProfile
    );

    expect(status).toMatchObject({
      provider: "oci",
      model: "Q",
      baseUrl: "https://oci.test/openai/v1",
      authLabel: "OCI IAM (DEFAULT)",
      state: "ready"
    });
  });

  test("trusts parsed OpenJaws provider auth over native fallback labels", () => {
    const status = buildInferenceStatusFromNative(
      {
        ok: true,
        code: 0,
        provider: "openai",
        model: "gpt-5.4",
        baseUrl: "",
        authLabel: "not configured",
        summary: "AI settings loaded.",
        stderr: "",
        stdout:
          "Current model: openai:gpt-5.4\n\nExternal providers:\n- openai: model openai:gpt-5.4 · key settings.llmProviders.openai.apiKey · base URL https://api.openai.com/v1"
      },
      applyInferenceProviderSelection(defaultInferenceProfile, "openai")
    );

    expect(status).toMatchObject({
      provider: "openai",
      model: "gpt-5.4",
      baseUrl: "https://api.openai.com/v1",
      authLabel: "settings.llmProviders.openai.apiKey",
      state: "ready"
    });
  });

  test("reads live provider probe receipts into a ready status", () => {
    const status = buildInferenceStatusFromNative(
      {
        ok: true,
        code: 0,
        provider: "groq",
        model: "llama-3.3-70b-versatile",
        baseUrl: "",
        authLabel: "not configured",
        summary: "AI connection checked.",
        stderr: "",
        stdout:
          "Provider test: Groq answered.\nModel: groq:llama-3.3-70b-versatile\nBase URL: https://api.groq.com/openai/v1\nEndpoint: /chat/completions\nAuth: GROQ_API_KEY"
      },
      applyInferenceProviderSelection(defaultInferenceProfile, "groq")
    );

    expect(status).toMatchObject({
      provider: "groq",
      model: "llama-3.3-70b-versatile",
      baseUrl: "https://api.groq.com/openai/v1",
      authLabel: "GROQ_API_KEY",
      state: "ready"
    });
  });

  test("redacts token-shaped output and includes tuning guardrails", () => {
    expect(redactInferenceText("token sk-testsecretvalue1234567890")).toContain("[redacted]");
    expect(buildInferenceTuningPrompt(defaultInferenceProfile, {
      provider: "oci",
      model: "Q",
      baseUrl: defaultInferenceProfile.baseUrl,
      authLabel: "environment",
      state: "ready",
      summary: "ready",
      detail: "ready",
      source: "native"
    })).toContain("Keep secrets out of the transcript");
  });
});
