import { describe, expect, test } from "bun:test";
import { normalizePreviewFrameUrl } from "./previewUrl";

describe("preview URL normalization", () => {
  test("keeps explicit HTTP and HTTPS preview URLs", () => {
    expect(normalizePreviewFrameUrl("https://demo.example/path")).toBe("https://demo.example/path");
    expect(normalizePreviewFrameUrl("http://127.0.0.1:4173")).toBe("http://127.0.0.1:4173/");
  });

  test("treats local preview hosts as HTTP by default", () => {
    expect(normalizePreviewFrameUrl("localhost:5173")).toBe("http://localhost:5173/");
    expect(normalizePreviewFrameUrl("[::1]:5173/app")).toBe("http://[::1]:5173/app");
  });

  test("rejects unsupported or malformed frame targets", () => {
    const fallback = "http://127.0.0.1:5173/";
    expect(normalizePreviewFrameUrl("javascript:alert(1)", fallback)).toBe(fallback);
    expect(normalizePreviewFrameUrl("http://[", fallback)).toBe(fallback);
  });

  test("strips credentials before mounting the frame", () => {
    expect(normalizePreviewFrameUrl("https://user:pass@example.com/demo")).toBe("https://example.com/demo");
  });
});
