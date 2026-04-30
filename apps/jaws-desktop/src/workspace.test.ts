import { describe, expect, test } from "bun:test";
import {
  buildWorkspaceSelection,
  buildOpenJawsTuiCommand,
  cleanWorkspaceInput,
  isLikelyAbsolutePath,
  quotePosixShellPath,
  quoteWindowsCmdPath,
  workspaceName
} from "./workspace";

describe("workspace helpers", () => {
  test("cleans quoted workspace input", () => {
    expect(cleanWorkspaceInput(' "D:\\openjaws\\OpenJaws" ')).toBe("D:\\openjaws\\OpenJaws");
  });

  test("derives the visible workspace name", () => {
    expect(workspaceName("D:\\openjaws\\OpenJaws")).toBe("OpenJaws");
    expect(workspaceName("/opt/jaws/app")).toBe("app");
  });

  test("builds platform-specific TUI commands", () => {
    expect(buildOpenJawsTuiCommand("D:\\openjaws\\OpenJaws", "windows")).toBe(
      'cd /d "D:\\openjaws\\OpenJaws" && openjaws'
    );
    expect(buildOpenJawsTuiCommand("/opt/jaws", "posix")).toBe("cd '/opt/jaws' && openjaws");
  });

  test("quotes shell paths without letting metacharacters escape", () => {
    expect(quotePosixShellPath("/tmp/jaws agent's app")).toBe("'/tmp/jaws agent'\\''s app'");
    expect(quoteWindowsCmdPath('D:\\jaws "demo"')).toBe('"D:\\jaws demo"');
  });

  test("recognizes absolute workspace paths", () => {
    expect(isLikelyAbsolutePath("D:\\openjaws")).toBe(true);
    expect(isLikelyAbsolutePath("/opt/jaws")).toBe(true);
    expect(isLikelyAbsolutePath("relative/path")).toBe(false);
  });

  test("builds a terminal-ready workspace selection", () => {
    expect(buildWorkspaceSelection('"D:\\projects\\Q"', "windows")).toEqual({
      input: '"D:\\projects\\Q"',
      cleaned: "D:\\projects\\Q",
      name: "Q",
      command: 'cd /d "D:\\projects\\Q" && openjaws',
      looksAbsolute: true,
      ready: true
    });

    expect(buildWorkspaceSelection("relative/path", "posix")).toMatchObject({
      name: "path",
      looksAbsolute: false,
      ready: false
    });
  });
});
