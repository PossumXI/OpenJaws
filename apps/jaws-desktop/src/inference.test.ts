import { describe, expect, test } from "bun:test";
import {
  buildInferenceStatusFromNative,
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
