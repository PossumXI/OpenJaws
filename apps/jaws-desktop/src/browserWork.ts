export type BrowserControlMode = "user" | "agent-review" | "agent-approved";

export type BrowserWorkPresetId =
  | "search"
  | "summarize"
  | "extract"
  | "video"
  | "email"
  | "form";

export type BrowserWorkPreset = {
  id: BrowserWorkPresetId;
  label: string;
  shortLabel: string;
  description: string;
  task: string;
  riskTier: 0 | 1 | 2 | 3 | 4;
};

export type BrowserWorkPromptInput = {
  url: string;
  workspacePath: string;
  mode: BrowserControlMode;
  preset: BrowserWorkPreset;
  task: string;
};

export const browserWorkPresets: BrowserWorkPreset[] = [
  {
    id: "search",
    label: "Search the web",
    shortLabel: "Search",
    description: "Find current pages and bring back the useful parts.",
    task: "Search the web for the requested topic, compare sources, and summarize the useful findings with links.",
    riskTier: 0
  },
  {
    id: "summarize",
    label: "Read and summarize",
    shortLabel: "Summarize",
    description: "Open pages and explain the key points plainly.",
    task: "Open this page, read the visible content, and summarize the key points, links, and next steps.",
    riskTier: 0
  },
  {
    id: "extract",
    label: "Collect page data",
    shortLabel: "Collect",
    description: "Capture public facts into a clean note or table.",
    task: "Collect public page data needed for the task, keep source links, and avoid private account data unless I approve it.",
    riskTier: 1
  },
  {
    id: "video",
    label: "Watch or transcribe",
    shortLabel: "Video",
    description: "Use available captions or page text to summarize video content.",
    task: "Watch or inspect the video page, use captions or transcript when available, and summarize the content with timestamps when possible.",
    riskTier: 1
  },
  {
    id: "email",
    label: "Draft email",
    shortLabel: "Email",
    description: "Prepare the message, then stop before sending.",
    task: "Draft the email or reply needed for this task. Do not send it until I review and approve the exact final message.",
    riskTier: 3
  },
  {
    id: "form",
    label: "Fill a form",
    shortLabel: "Forms",
    description: "Help with forms, then stop before submitting.",
    task: "Help fill the form or application using only information I provide. Stop before submitting or uploading anything.",
    riskTier: 4
  }
];

export function getBrowserWorkPreset(id: BrowserWorkPresetId): BrowserWorkPreset {
  return browserWorkPresets.find((preset) => preset.id === id) ?? browserWorkPresets[0]!;
}

export function defaultBrowserWorkTask(preset: BrowserWorkPreset): string {
  return preset.task;
}

function modeInstruction(mode: BrowserControlMode): string {
  if (mode === "user") {
    return "User drives the browser; agent watches, explains, and prepares next steps.";
  }
  if (mode === "agent-review") {
    return "Agent may browse and draft changes, but must stop for review before any account, message, payment, upload, or form submission.";
  }
  return "Agent may perform low-risk browsing steps that I approve, but must still stop before sending messages, making purchases, changing accounts, uploading files, or submitting forms.";
}

export function buildBrowserWorkPrompt(input: BrowserWorkPromptInput): string {
  const task = input.task.trim() || defaultBrowserWorkTask(input.preset);
  return [
    `Start a JAWS browser-work task for ${input.url}.`,
    `Workspace: ${input.workspacePath || "not attached"}.`,
    `Job type: ${input.preset.label}. Risk tier: ${input.preset.riskTier}.`,
    `Control mode: ${input.mode}. ${modeInstruction(input.mode)}`,
    task,
    `Preset guardrail: ${input.preset.task}`,
    "Use the live browser lane for web search, page reading, public data collection, video/caption summaries, email drafts, and form assistance.",
    "Record useful source links and browser history. Ask for human approval before personal data entry, applications, resumes, email sends, purchases, account changes, uploads, bookings, or any irreversible action."
  ].join("\n");
}
