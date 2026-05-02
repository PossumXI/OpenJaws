import { describe, expect, test } from "bun:test";
import {
  buildBrowserWorkPrompt,
  getBrowserWorkPreset,
  type BrowserControlMode
} from "./browserWork";

describe("browser work prompts", () => {
  test("stages normal web research with source and browser-history requirements", () => {
    const prompt = buildBrowserWorkPrompt({
      url: "https://google.com/search?q=openjaws",
      workspacePath: "D:\\projects\\demo",
      mode: "agent-review",
      preset: getBrowserWorkPreset("search"),
      task: ""
    });

    expect(prompt).toContain("Job type: Search the web. Risk tier: 0.");
    expect(prompt).toContain("web search, page reading, public data collection");
    expect(prompt).toContain("Record useful source links and browser history");
  });

  test.each(["user", "agent-review", "agent-approved"] as BrowserControlMode[])(
    "keeps irreversible browser actions approval gated in %s mode",
    (mode) => {
      const prompt = buildBrowserWorkPrompt({
        url: "https://mail.example.test",
        workspacePath: "",
        mode,
        preset: getBrowserWorkPreset("email"),
        task: "Write a follow-up email."
      });

      expect(prompt).toContain("Do not send it until I review and approve");
      expect(prompt).toContain(
        "Ask for human approval before personal data entry, applications, resumes, email sends, purchases, account changes, uploads, bookings, or any irreversible action."
      );
    }
  );

  test("defaults unknown preset lookups to a safe search task", () => {
    const preset = getBrowserWorkPreset("unknown" as never);
    expect(preset.id).toBe("search");
    expect(preset.riskTier).toBe(0);
  });
});
