export type TerminalPlatform = "windows" | "posix";

export interface WorkspaceSelection {
  input: string;
  cleaned: string;
  name: string;
  command: string;
  looksAbsolute: boolean;
  ready: boolean;
}

export function cleanWorkspaceInput(input: string): string {
  return input.trim().replace(/^["']|["']$/g, "");
}

export function workspaceName(path: string): string {
  const cleaned = cleanWorkspaceInput(path);
  if (!cleaned) return "No workspace";
  const parts = cleaned.split(/[\\/]+/).filter(Boolean);
  return parts.at(-1) ?? cleaned;
}

export function quotePosixShellPath(path: string): string {
  return `'${path.replace(/'/g, "'\\''")}'`;
}

export function quoteWindowsCmdPath(path: string): string {
  const safePath = path.replace(/["\r\n]/g, "");
  return `"${safePath}"`;
}

export function buildOpenJawsTuiCommand(path: string, platform: TerminalPlatform): string {
  const cleaned = cleanWorkspaceInput(path);
  if (!cleaned) return "openjaws";
  if (platform === "windows") {
    return `cd /d ${quoteWindowsCmdPath(cleaned)} && openjaws`;
  }
  return `cd ${quotePosixShellPath(cleaned)} && openjaws`;
}

export function isLikelyAbsolutePath(path: string): boolean {
  const cleaned = cleanWorkspaceInput(path);
  return /^[a-zA-Z]:[\\/]/.test(cleaned) || cleaned.startsWith("/") || cleaned.startsWith("\\\\");
}

export function buildWorkspaceSelection(input: string, platform: TerminalPlatform): WorkspaceSelection {
  const cleaned = cleanWorkspaceInput(input);
  const looksAbsolute = isLikelyAbsolutePath(cleaned);
  return {
    input,
    cleaned,
    name: workspaceName(cleaned),
    command: buildOpenJawsTuiCommand(cleaned, platform),
    looksAbsolute,
    ready: cleaned.length > 0 && looksAbsolute
  };
}
