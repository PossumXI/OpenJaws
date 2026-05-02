import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { openUrl } from "@tauri-apps/plugin-opener";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification
} from "@tauri-apps/plugin-notification";
import {
  Activity,
  BellRing,
  Bot,
  BrainCircuit,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  CircleDot,
  Coffee,
  Crown,
  ExternalLink,
  Film,
  FolderOpen,
  Gauge,
  GitCompare,
  Heart,
  Maximize2,
  MessageSquare,
  Minimize2,
  MonitorPlay,
  PackagePlus,
  Pause,
  Play,
  RadioTower,
  RefreshCcw,
  Settings2,
  ShieldCheck,
  Send,
  Sparkles,
  TerminalSquare,
  UserRound,
  XCircle,
  Zap
} from "lucide-react";
import {
  layoutThemes,
  marketplaceItems,
  navItems,
  systemLanes,
  type AgentEvent,
  type SectionId,
  type ThemeId
} from "./data";
import {
  advanceHoldemRound,
  advanceSlowGuy,
  applyHoldemAction,
  createHoldemTable,
  createSlowGuyState,
  describeCard,
  describeHoldemMode,
  describeHoldemTransport,
  holdemCodeTokenPrize,
  type HoldemAction,
  type HoldemTableState,
  type SlowGuyAction,
  type SlowGuyState
} from "./games";
import {
  contextConfidenceLabel,
  contextCoverageTone,
  contextScanRatio,
  formatTokenEstimate
} from "./context";
import {
  MAX_CLOSED_CHAT_WINDOWS,
  MAX_OPEN_CHAT_WINDOWS,
  closeChatWindow,
  createChatWindow,
  normalizeStoredChatWindows,
  resumeChatWindow,
  type ChatMessage,
  type ChatWindowState
} from "./chatSessions";
import {
  buildNativeNotificationPayload,
  clearJawsNotifications,
  countUnreadJawsNotifications,
  createJawsNotification,
  dismissJawsNotification,
  markAllJawsNotificationsRead,
  normalizeNativeNotificationPermission,
  normalizeStoredNotifications,
  pushJawsNotification,
  shouldSendNativeNotification,
  type NativeNotificationPermission,
  type JawsNotification
} from "./notifications";
import {
  buildInferenceStatusFromError,
  buildInferenceStatusFromNative,
  buildInferenceTuningPrompt,
  buildProviderBaseUrlCommand,
  buildProviderUseCommand,
  createPreviewInferenceStatus,
  inferenceProviders,
  normalizeInferenceProfile,
  type InferenceProfile,
  type InferenceStatus,
  type NativeInferenceStatusResult
} from "./inference";
import releaseIndex from "./release-index.json";
import { canRenderPreviewInline, normalizePreviewFrameUrl } from "./previewUrl";
import {
  createInitialUpdatePipeline,
  createPreviewUpdatePipeline,
  formatDeferredUpdateState,
  markUpdatePipelineChecking,
  resolveUpdateFailure,
  resolveUpdateSuccess,
  shouldResetDeferredPrompt,
  type JawsReleaseIndex,
  type UpdatePipelineEntry
} from "./updateWorkflow";
import { buildWorkspaceSelection, type TerminalPlatform } from "./workspace";
import {
  browserWorkPresets,
  buildBrowserWorkPrompt,
  defaultBrowserWorkTask,
  getBrowserWorkPreset,
  type BrowserControlMode,
  type BrowserWorkPresetId
} from "./browserWork";

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
    webkitAudioContext?: typeof AudioContext;
  }
}

interface BackendStatus {
  appVersion: string;
  sidecarName: string;
  sidecarReady: boolean;
  sidecarMessage: string;
  updateChannel: string;
  releaseSites: string[];
  releaseTag?: string;
  releaseVersion?: string;
  releaseRepo?: string;
  releaseUrl?: string;
  releaseApiUrl?: string;
}

interface EnrollmentLink {
  label: string;
  url: string;
}

interface SidecarSmoke {
  ok: boolean;
  code: number | null;
  stdout: string;
  stderr: string;
}

interface OpenJawsChatResult {
  ok: boolean;
  code: number | null;
  stdout: string;
  stderr: string;
  summary: string;
  permissionMode: string;
  workspacePath: string;
}

interface WorkspaceStatus {
  path: string;
  name: string;
  valid: boolean;
  message: string;
  tuiCommand: string;
}

interface AccountSession {
  email: string;
  role: string;
  plan: string;
  status: string;
  savedAt: string;
  source: string;
  displayName: string;
}

interface ChangePreview {
  file: string;
  status: string;
  before: string;
  after: string;
}

interface CyberPetState {
  name: string;
  tokens: number;
  energy: number;
  fullness: number;
  egg: number;
  gear: string;
  decor: string;
  mood: string;
}

interface UserProfile {
  name: string;
  handle: string;
  focus: string;
  walletId: string;
  promotionOptIn: boolean;
  lastPromotionTouch: string;
}

interface AgentProfile {
  name: string;
  role: string;
  status: string;
  load: number;
}

interface CognitiveMemoryLayer {
  layer: string;
  count: number;
  status: "active" | "waiting" | "blocked" | string;
  detail: string;
}

interface CognitiveTraceNode {
  kind: string;
  label: string;
  state: "active" | "waiting" | "blocked" | string;
  detail: string;
}

interface CognitiveScorecard {
  goalId: string;
  status: string;
  quality: number;
  riskTier: number;
  detail: string;
}

interface CognitiveRuntimeSnapshot {
  status: "ready" | "review" | "blocked" | "waiting" | string;
  summary: string;
  goalCount: number;
  decisionCount: number;
  allowCount: number;
  reviewCount: number;
  delayCount: number;
  denyCount: number;
  highestRiskTier: number;
  averageQuality: number;
  memoryLayers: CognitiveMemoryLayer[];
  trace: CognitiveTraceNode[];
  scorecards: CognitiveScorecard[];
  policyHints: string[];
}

interface AgentRuntimeSnapshot {
  checkedAt: string;
  source: string;
  summary: string;
  queueCount: number;
  workerCount: number;
  runtimeCount: number;
  events: AgentEvent[];
  cognitive: CognitiveRuntimeSnapshot;
}

interface BrowserPreviewSessionSummary {
  id: string;
  action: string;
  intent: string;
  requestedBy: string;
  startedAt: string;
  opened: boolean;
  note: string;
  url: string;
}

interface BrowserPreviewSnapshot {
  checkedAt: string;
  receiptPath: string;
  receiptExists: boolean;
  receiptSummary: string;
  sessionCount: number;
  launchConfigPath: string;
  launchConfigExists: boolean;
  launchUrl: string;
  devCommand: string;
  previewCommand: string;
  playwrightCodegenCommand: string;
  playwrightTestCommand: string;
  sessions: BrowserPreviewSessionSummary[];
}

interface PreviewWindowResult {
  ok: boolean;
  url: string;
  label: string;
  message: string;
}

interface PreviewLaunchConfigResult {
  ok: boolean;
  path: string;
  message: string;
  url: string;
  devCommand: string;
  previewCommand: string;
  playwrightCodegenCommand: string;
  playwrightTestCommand: string;
}

interface PreviewDemoHarnessResult {
  ok: boolean;
  outputDir: string;
  message: string;
  name: string;
  slug: string;
  url: string;
  devCommand: string;
  previewCommand: string;
  playwrightInstallCommand: string;
  playwrightCodegenCommand: string;
  playwrightTestCommand: string;
  playwrightHeadedCommand: string;
  readmePath: string;
  packagePath: string;
  configPath: string;
  specPath: string;
  receiptPath: string;
  receiptHash: string;
}

interface LedgerEventSummary {
  id: string;
  time: string;
  actor: string;
  action: string;
  surface: string;
  status: string;
  proof: string;
  detail: string;
  riskTier: number;
}

interface LedgerSnapshot {
  checkedAt: string;
  source: string;
  configured: boolean;
  summary: string;
  eventCount: number;
  agentEventCount: number;
  browserEventCount: number;
  creditEventCount: number;
  externalRouteConfigured: boolean;
  events: LedgerEventSummary[];
  warnings: string[];
}

interface QAgentsCoworkControl {
  id: string;
  label: string;
  detail: string;
  status: string;
}

interface QAgentsCoworkPlan {
  mode: string;
  roomCode: string;
  sharedPhaseMemory: boolean;
  pooledCredits: boolean;
  routePolicy: string;
  controls: QAgentsCoworkControl[];
}

interface ContextCategory {
  id: string;
  label: string;
  fileCount: number;
  includedCount: number;
  estimatedTokens: number;
  confidence: number;
  status: string;
  detail: string;
}

interface ContextPriorityFile {
  path: string;
  kind: string;
  reason: string;
  estimatedTokens: number;
  status: string;
}

interface ContextSkippedGroup {
  reason: string;
  count: number;
  examples: string[];
}

interface ContextBrainLane {
  label: string;
  receives: string;
  status: string;
  detail: string;
}

interface ProjectContextSnapshot {
  checkedAt: string;
  workspacePath: string;
  workspaceName: string;
  valid: boolean;
  source: string;
  confidenceScore: number;
  summary: string;
  totalFiles: number;
  scannedFiles: number;
  skippedFiles: number;
  estimatedTokens: number;
  contextBudgetTokens: number;
  categories: ContextCategory[];
  priorityFiles: ContextPriorityFile[];
  skipped: ContextSkippedGroup[];
  brainLanes: ContextBrainLane[];
  notes: string[];
}

type ArcadeView = "slow-guy" | "holdem" | "world";

const jawsReleaseIndex = releaseIndex as JawsReleaseIndex;

const fallbackStatus: BackendStatus = {
  appVersion: jawsReleaseIndex.version,
  sidecarName: "openjaws",
  sidecarReady: false,
  sidecarMessage: "Open the desktop app to connect OpenJaws.",
  updateChannel: "stable",
  releaseSites: jawsReleaseIndex.mirrors.map((mirror) => mirror.pageUrl),
  releaseTag: jawsReleaseIndex.tag,
  releaseVersion: jawsReleaseIndex.version,
  releaseRepo: jawsReleaseIndex.repo,
  releaseUrl: jawsReleaseIndex.github.releaseUrl,
  releaseApiUrl: jawsReleaseIndex.github.apiUrl
};

const fallbackLinks: EnrollmentLink[] = [
  { label: "Qline", url: "https://qline.site" },
  { label: "Iorch", url: "https://iorch.net" },
  { label: "GitHub", url: "https://github.com/PossumXI/OpenJaws" }
];

const fallbackWorkspace: WorkspaceStatus = {
  path: "",
  name: "No workspace",
  valid: false,
  message: "Choose a project folder before starting chat or Terminal View.",
  tuiCommand: "openjaws"
};

const fallbackPreviewSnapshot: BrowserPreviewSnapshot = {
  checkedAt: "preview",
  receiptPath: "~/.openjaws/browser-preview/receipt.json",
  receiptExists: false,
  receiptSummary: "No browser sessions yet. Open the desktop app and run Preview to start one.",
  sessionCount: 0,
  launchConfigPath: ".openjaws/launch.json",
  launchConfigExists: false,
  launchUrl: "http://127.0.0.1:5173/",
  devCommand: "npm run dev",
  previewCommand: "/preview http://127.0.0.1:5173/",
  playwrightCodegenCommand: "bunx playwright codegen http://127.0.0.1:5173/",
  playwrightTestCommand: "bunx playwright test",
  sessions: []
};

const fallbackLedgerSnapshot: LedgerSnapshot = {
  checkedAt: "preview",
  source: "Open the desktop app to read local receipts.",
  configured: false,
  summary: "Ledger waits for agent, browser, billing, or credit receipts from the selected workspace.",
  eventCount: 0,
  agentEventCount: 0,
  browserEventCount: 0,
  creditEventCount: 0,
  externalRouteConfigured: false,
  events: [],
  warnings: ["Desktop runtime required for local ledger scan."]
};

const browserControlModes: Array<{
  id: BrowserControlMode;
  label: string;
  description: string;
}> = [
  {
    id: "user",
    label: "I drive",
    description: "JAWS watches and helps."
  },
  {
    id: "agent-review",
    label: "Agent drafts",
    description: "JAWS browses, then asks before acting."
  },
  {
    id: "agent-approved",
    label: "Approved run",
    description: "JAWS handles low-risk steps after approval."
  }
];

const fallbackCoworkPlan: QAgentsCoworkPlan = {
  mode: "stacked-agents",
  roomCode: "JWS-QAGENTS",
  sharedPhaseMemory: true,
  pooledCredits: false,
  routePolicy: "Start workers only when the room is ready and you approve shared credits.",
  controls: [
    {
      id: "planner",
      label: "Q planner",
      detail: "Breaks the request into clear jobs.",
      status: "ready"
    },
    {
      id: "implementer",
      label: "Q_agent implementer",
      detail: "Works on the approved project files.",
      status: "ready check"
    },
    {
      id: "verifier",
      label: "Q_agent verifier",
      detail: "Runs tests and checks before you ship.",
      status: "ready check"
    }
  ]
};

const jawFrames = [
  String.raw`    __
 __/  \__
/  JAWS  \
\__    __/
   \__/`,
  String.raw`  \        /
   \  JAWS /
    \    /
     \  /
      \/`,
  String.raw`  /\/\/\/\
 <  JAWS  >
  \/\/\/\/`,
  String.raw`      /\
  ___/  \___
 /  JAWS   \
 \___  ____/
     \/`
];

const changePreview: ChangePreview[] = [];

const chatTools = [
  { label: "Inspect", prompt: "Inspect this project and tell me what needs attention." },
  { label: "Code", prompt: "Make the next useful code fix and check your work." },
  { label: "Test", prompt: "Run the right tests, explain any failures, and fix them." },
  { label: "Agents", prompt: "Use Q_agents to review, build, and verify this task." },
  { label: "Bench", prompt: "Run a benchmark and summarize what changed." },
  { label: "Ship", prompt: "Prepare this project for release and check the update files." }
];

const codeTokenCap = 999_999;

const defaultPet: CyberPetState = {
  name: "Byte Hopper",
  tokens: 42,
  energy: 74,
  fullness: 68,
  egg: 36,
  gear: "visor",
  decor: "neon pad",
  mood: "curious"
};

const defaultUserProfile: UserProfile = {
  name: "Founder",
  handle: "gaetano",
  focus: "Ship clean releases",
  walletId: "local-founder-wallet",
  promotionOptIn: true,
  lastPromotionTouch: "local only"
};

const agentProfiles: AgentProfile[] = [
  { name: "Q", role: "Primary planner", status: "Thinking", load: 62 },
  { name: "Q_agents", role: "Parallel workers", status: "Standing by", load: 41 },
  { name: "OpenCheek", role: "Co-work loop", status: "Memory attached", load: 54 },
  { name: "Immaculate", role: "Crew pacing", status: "Ready", load: 28 }
];

const initialUpdatePipeline = createInitialUpdatePipeline(jawsReleaseIndex);

const complianceDocuments = [
  {
    title: "Terms Of Use",
    tone: "Legal",
    summary:
      "Use JAWS only with projects you own or are allowed to work on. Keep your keys private and review agent work before you rely on it."
  },
  {
    title: "Final Sale Policy",
    tone: "Billing",
    summary:
      "Paid plans and delivered work are final sale unless the law or payment rules require otherwise."
  },
  {
    title: "Security And Privacy",
    tone: "Security",
    summary:
      "Your workspace stays local by default. Updates are signed, and JAWS asks before higher-risk actions."
  },
  {
    title: "Community Content",
    tone: "Marketplace",
    summary:
      "Community games, tools, widgets, and agents must be reviewed before they can be shared publicly."
  },
  {
    title: "AI Output Notice",
    tone: "Compliance",
    summary:
      "AI can be wrong. Test important work, check licenses, and approve production changes yourself."
  }
];

const developerDocuments = [
  {
    label: "Desktop Build",
    command: "bun run jaws:verify",
    detail: "Checks the desktop app before a release."
  },
  {
    label: "Release Check",
    command: "bun run jaws:release:check",
    detail: "Confirms the update files, icons, and release settings are ready."
  },
  {
    label: "Mirror Health",
    command: "bun run jaws:mirror:check --json",
    detail: "Checks the download pages and GitHub release files."
  },
  {
    label: "Public Guard",
    command: "bun run showcase:copy:check",
    detail: "Checks public text for private paths, secrets, and stale wording."
  }
];

function hasTauriRuntime() {
  return "__TAURI_INTERNALS__" in window;
}

function toneLabel(tone: "good" | "warn" | "neutral") {
  if (tone === "good") return "Ready";
  if (tone === "warn") return "Review";
  return "Queued";
}

function terminalPlatform(): TerminalPlatform {
  return navigator.platform.toLowerCase().includes("win") ? "windows" : "posix";
}

function loadStoredAccountSession(): AccountSession | null {
  try {
    return JSON.parse(localStorage.getItem("jaws.accountSession") ?? "null") as AccountSession | null;
  } catch {
    return null;
  }
}

function loadStoredValue<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null") ?? fallback;
  } catch {
    return fallback;
  }
}

function loadChatWindows(): ChatWindowState[] {
  return normalizeStoredChatWindows(loadStoredValue<unknown>("jaws.chatWindows", null));
}

function loadClosedChatWindows(): ChatWindowState[] {
  return normalizeStoredChatWindows(loadStoredValue<unknown>("jaws.closedChatWindows", null), true);
}

function loadNotifications(): JawsNotification[] {
  return normalizeStoredNotifications(loadStoredValue<unknown>("jaws.notifications", null));
}

function loadSlowGuyState(): SlowGuyState {
  const bestScore = Number(localStorage.getItem("jaws.slowGuyBest") ?? "0") || 0;
  const fallback = createSlowGuyState(bestScore);
  const stored = loadStoredValue<Partial<SlowGuyState> | null>("jaws.slowGuy", null);
  if (!stored || typeof stored !== "object") return fallback;
  return {
    ...fallback,
    ...stored,
    bestScore: Math.max(bestScore, stored.bestScore ?? fallback.bestScore),
    hazards: Array.isArray(stored.hazards) ? stored.hazards : fallback.hazards,
    coins: Array.isArray(stored.coins) ? stored.coins : fallback.coins
  };
}

function loadHoldemTable(playerName: string): HoldemTableState {
  const fallback = createHoldemTable(playerName);
  const stored = loadStoredValue<Partial<HoldemTableState> | null>("jaws.holdemTable", null);
  if (!stored || typeof stored !== "object") return fallback;
  return {
    ...fallback,
    ...stored,
    deck: Array.isArray(stored.deck) ? stored.deck : fallback.deck,
    communityCards: Array.isArray(stored.communityCards) ? stored.communityCards : fallback.communityCards,
    seats: Array.isArray(stored.seats) ? stored.seats : fallback.seats,
    winners: Array.isArray(stored.winners) ? stored.winners : fallback.winners,
    chat: Array.isArray(stored.chat) ? stored.chat : fallback.chat,
    multiplayer: stored.multiplayer ?? fallback.multiplayer,
    sandbox: stored.sandbox ?? fallback.sandbox
  };
}

function formatOpenJawsChatResult(result: OpenJawsChatResult) {
  const output = result.stdout || result.stderr || "OpenJaws finished without a message.";
  const friendlyMode = result.permissionMode === "acceptEdits" ? "Fast mode" : "Review mode";
  const status = result.ok ? "Finished" : "Needs review";
  return [
    result.summary,
    `Run mode: ${friendlyMode} - Status: ${status}`,
    `Workspace: ${result.workspacePath || "not attached"}`,
    "",
    output
  ].join("\n");
}

function fallbackAgentRuntimeSnapshot(): AgentRuntimeSnapshot {
  return {
    checkedAt: "preview",
    source: "Desktop app",
    summary: "No live agent activity yet. Start a chat task or refresh after workers run.",
    queueCount: 0,
    workerCount: 0,
    runtimeCount: 0,
    events: [],
    cognitive: {
      status: "waiting",
      summary: "Governed route decisions will appear after Q_agents claim work.",
      goalCount: 0,
      decisionCount: 0,
      allowCount: 0,
      reviewCount: 0,
      delayCount: 0,
      denyCount: 0,
      highestRiskTier: 0,
      averageQuality: 0,
      memoryLayers: [
        {
          layer: "Working",
          count: 0,
          status: "waiting",
          detail: "Live tasks appear here."
        },
        {
          layer: "Episodic",
          count: 0,
          status: "waiting",
          detail: "Finished route history appears here."
        },
        {
          layer: "Semantic",
          count: 0,
          status: "waiting",
          detail: "Worker capabilities appear here."
        },
        {
          layer: "Procedural",
          count: 0,
          status: "waiting",
          detail: "Handoff patterns appear here."
        }
      ],
      trace: [
        {
          kind: "Waiting",
          label: "No admission yet",
          state: "waiting",
          detail: "Start agent work to see the governed trace."
        }
      ],
      scorecards: [],
      policyHints: ["JAWS shows governed route decisions after worker claims are recorded."]
    }
  };
}

function fallbackProjectContextSnapshot(workspace: WorkspaceStatus = fallbackWorkspace): ProjectContextSnapshot {
  const valid = workspace.valid || Boolean(workspace.path);
  return {
    checkedAt: "preview",
    workspacePath: workspace.path,
    workspaceName: workspace.name || "No workspace",
    valid: false,
    source: valid ? "Desktop scan needed" : "workspace not selected",
    confidenceScore: 0,
    summary: valid
      ? "A project folder is selected, but this view cannot scan it yet. Open the desktop app and refresh Context to see what JAWS can read."
      : "Open a project folder to show what JAWS can read before agents start.",
    totalFiles: 0,
    scannedFiles: 0,
    skippedFiles: 0,
    estimatedTokens: 0,
    contextBudgetTokens: 200_000,
    categories: [],
    priorityFiles: [],
    skipped: [],
    brainLanes: [
      {
        label: "Q planner",
        receives: "project map and important files",
        status: "blocked",
        detail: "Waiting for a real desktop scan."
      },
      {
        label: "Q_agents",
        receives: "files to work on and files to avoid",
        status: "blocked",
        detail: "Workers wait until the project scan is ready."
      }
    ],
    notes: [
      "No raw file contents are shown in this view.",
      "Secret-like files and generated folders are shown only as skipped."
    ]
  };
}

export function App() {
  const [active, setActive] = useState<SectionId>("control");
  const [collapsed, setCollapsed] = useState(false);
  const [appearance, setAppearance] = useState<"dark" | "light">("dark");
  const [theme, setTheme] = useState<ThemeId>("default");
  const [status, setStatus] = useState<BackendStatus>(fallbackStatus);
  const [links, setLinks] = useState<EnrollmentLink[]>(fallbackLinks);
  const [smoke, setSmoke] = useState<SidecarSmoke | null>(null);
  const [workspaceInput, setWorkspaceInput] = useState(() => localStorage.getItem("jaws.workspace") ?? "");
  const [workspaceStatus, setWorkspaceStatus] = useState<WorkspaceStatus>(fallbackWorkspace);
  const [workspaceSmoke, setWorkspaceSmoke] = useState<SidecarSmoke | null>(null);
  const [updateState, setUpdateState] = useState("Not checked");
  const [updateChecking, setUpdateChecking] = useState(false);
  const [updatePipeline, setUpdatePipeline] = useState<UpdatePipelineEntry[]>(initialUpdatePipeline);
  const [pendingUpdate, setPendingUpdate] = useState<Update | null>(null);
  const [updatePromptHidden, setUpdatePromptHidden] = useState(false);
  const [inferenceProfile, setInferenceProfile] = useState<InferenceProfile>(() =>
    normalizeInferenceProfile(loadStoredValue<Partial<InferenceProfile> | null>("jaws.inferenceProfile", null))
  );
  const [inferenceStatus, setInferenceStatus] = useState<InferenceStatus>(() =>
    createPreviewInferenceStatus(inferenceProfile)
  );
  const [inferenceChecking, setInferenceChecking] = useState(false);
  const [account, setAccount] = useState<AccountSession | null>(() => loadStoredAccountSession());
  const [chatWindows, setChatWindows] = useState<ChatWindowState[]>(() => loadChatWindows());
  const [closedChatWindows, setClosedChatWindows] = useState<ChatWindowState[]>(() => loadClosedChatWindows());
  const [activeChatWindowId, setActiveChatWindowId] = useState(
    () => localStorage.getItem("jaws.activeChatWindowId") ?? ""
  );
  const [chatBusy, setChatBusy] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<JawsNotification[]>(() => loadNotifications());
  const [firework, setFirework] = useState<JawsNotification | null>(null);
  const [compareMode, setCompareMode] = useState(() => localStorage.getItem("jaws.compareMode") === "true");
  const [fastRunMode, setFastRunMode] = useState(
    () =>
      localStorage.getItem("jaws.fastRunMode") === "true" ||
      localStorage.getItem("jaws.bypassPermissions") === "true"
  );
  const [notificationsArmed, setNotificationsArmed] = useState(
    () => localStorage.getItem("jaws.notificationsArmed") !== "false"
  );
  const [nativeNotificationPermission, setNativeNotificationPermission] = useState<NativeNotificationPermission>(
    hasTauriRuntime() ? "prompt" : "unsupported"
  );
  const [pet, setPet] = useState<CyberPetState>(() => loadStoredValue("jaws.cyberPet", defaultPet));
  const [userProfile, setUserProfile] = useState<UserProfile>(() =>
    ({ ...defaultUserProfile, ...loadStoredValue<Partial<UserProfile>>("jaws.userProfile", {}) })
  );
  const [arcadeView, setArcadeView] = useState<ArcadeView>("slow-guy");
  const [slowGuy, setSlowGuy] = useState<SlowGuyState>(() => loadSlowGuyState());
  const [holdemTable, setHoldemTable] = useState<HoldemTableState>(() => loadHoldemTable("Founder"));
  const [jawFrame, setJawFrame] = useState(0);
  const [agentRuntime, setAgentRuntime] = useState<AgentRuntimeSnapshot>(() => fallbackAgentRuntimeSnapshot());
  const [agentRuntimeLoading, setAgentRuntimeLoading] = useState(false);
  const [projectContext, setProjectContext] = useState<ProjectContextSnapshot>(() =>
    fallbackProjectContextSnapshot()
  );
  const [projectContextLoading, setProjectContextLoading] = useState(false);
  const [previewSnapshot, setPreviewSnapshot] = useState<BrowserPreviewSnapshot>(fallbackPreviewSnapshot);
  const [previewUrl, setPreviewUrl] = useState(
    () => localStorage.getItem("jaws.previewUrl") ?? fallbackPreviewSnapshot.launchUrl
  );
  const [previewDevCommand, setPreviewDevCommand] = useState(
    () => localStorage.getItem("jaws.previewDevCommand") ?? fallbackPreviewSnapshot.devCommand
  );
  const [previewConfigResult, setPreviewConfigResult] = useState<PreviewLaunchConfigResult | null>(null);
  const [previewDemoResult, setPreviewDemoResult] = useState<PreviewDemoHarnessResult | null>(null);
  const [previewRunResult, setPreviewRunResult] = useState<OpenJawsChatResult | null>(null);
  const [previewWindowResult, setPreviewWindowResult] = useState<PreviewWindowResult | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [browserControlMode, setBrowserControlMode] = useState<BrowserControlMode>("user");
  const [browserPresetId, setBrowserPresetId] = useState<BrowserWorkPresetId>("search");
  const [browserTaskInput, setBrowserTaskInput] = useState("");
  const [ledgerSnapshot, setLedgerSnapshot] = useState<LedgerSnapshot>(fallbackLedgerSnapshot);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [coworkPlan, setCoworkPlan] = useState<QAgentsCoworkPlan>(fallbackCoworkPlan);
  const [coworkStackMode, setCoworkStackMode] = useState<"solo" | "pair" | "stacked">("stacked");
  const [coworkSharedCredits, setCoworkSharedCredits] = useState(fallbackCoworkPlan.pooledCredits);
  const [coworkLaneEnabled, setCoworkLaneEnabled] = useState<Record<string, boolean>>(() =>
    fallbackCoworkPlan.controls.reduce<Record<string, boolean>>((lanes, control) => {
      lanes[control.id] = control.id !== "cowork";
      return lanes;
    }, {})
  );

  useEffect(() => {
    document.documentElement.dataset.appearance = appearance;
    document.documentElement.dataset.theme = theme;
  }, [appearance, theme]);

  useEffect(() => {
    if (!hasTauriRuntime()) return;

    void invoke<BackendStatus>("backend_status")
      .then(setStatus)
      .catch((error) =>
        setStatus({
          ...fallbackStatus,
          sidecarMessage: String(error)
        })
      );

    void invoke<EnrollmentLink[]>("enrollment_links").then(setLinks).catch(() => setLinks(fallbackLinks));

    void invoke<AccountSession | null>("account_session")
      .then((session) => {
        if (!session) return;
        setAccount(session);
        localStorage.setItem("jaws.accountSession", JSON.stringify(session));
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setJawFrame((frame) => (frame + 1) % jawFrames.length);
    }, 520);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    localStorage.setItem("jaws.compareMode", String(compareMode));
  }, [compareMode]);

  useEffect(() => {
    localStorage.setItem("jaws.fastRunMode", String(fastRunMode));
    localStorage.removeItem("jaws.bypassPermissions");
  }, [fastRunMode]);

  useEffect(() => {
    localStorage.setItem("jaws.notificationsArmed", String(notificationsArmed));
  }, [notificationsArmed]);

  useEffect(() => {
    if (!hasTauriRuntime()) {
      setNativeNotificationPermission("unsupported");
      return;
    }

    void isPermissionGranted()
      .then((granted) => setNativeNotificationPermission(granted ? "granted" : "prompt"))
      .catch(() => setNativeNotificationPermission("unsupported"));
  }, []);

  useEffect(() => {
    localStorage.setItem("jaws.inferenceProfile", JSON.stringify(inferenceProfile));
  }, [inferenceProfile]);

  useEffect(() => {
    localStorage.setItem("jaws.cyberPet", JSON.stringify(pet));
  }, [pet]);

  useEffect(() => {
    localStorage.setItem("jaws.userProfile", JSON.stringify(userProfile));
  }, [userProfile]);

  useEffect(() => {
    localStorage.setItem("jaws.chatWindows", JSON.stringify(chatWindows.slice(0, MAX_OPEN_CHAT_WINDOWS)));
    if (activeChatWindowId) {
      localStorage.setItem("jaws.activeChatWindowId", activeChatWindowId);
    }
  }, [activeChatWindowId, chatWindows]);

  useEffect(() => {
    localStorage.setItem(
      "jaws.closedChatWindows",
      JSON.stringify(closedChatWindows.slice(0, MAX_CLOSED_CHAT_WINDOWS))
    );
  }, [closedChatWindows]);

  useEffect(() => {
    if (chatWindows.length === 0) {
      const windowState = createChatWindow();
      setChatWindows([windowState]);
      setActiveChatWindowId(windowState.id);
      return;
    }
    if (!activeChatWindowId || !chatWindows.some((windowState) => windowState.id === activeChatWindowId)) {
      setActiveChatWindowId(chatWindows[0]!.id);
    }
  }, [activeChatWindowId, chatWindows]);

  useEffect(() => {
    if (!slowGuy.running || slowGuy.gameOver) return;
    const timer = window.setInterval(() => {
      setSlowGuy((state) => advanceSlowGuy(state, "tick"));
    }, 560);
    return () => window.clearInterval(timer);
  }, [slowGuy.running, slowGuy.gameOver]);

  useEffect(() => {
    localStorage.setItem("jaws.slowGuy", JSON.stringify(slowGuy));
    localStorage.setItem("jaws.slowGuyBest", String(slowGuy.bestScore));
  }, [slowGuy]);

  useEffect(() => {
    localStorage.setItem("jaws.holdemTable", JSON.stringify(holdemTable));
  }, [holdemTable]);

  useEffect(() => {
    if (active !== "arcade" || arcadeView !== "slow-guy") return;
    const handleKeyDown = (event: KeyboardEvent) => {
      const keyMap: Record<string, SlowGuyAction> = {
        ArrowLeft: "left",
        ArrowRight: "right",
        ArrowUp: "jump",
        " ": "jump",
        ArrowDown: "duck",
        s: "duck",
        S: "duck",
        d: "dash",
        D: "dash",
        p: "pause",
        P: "pause",
        r: "reset",
        R: "reset"
      };
      const action = keyMap[event.key];
      if (!action) return;
      event.preventDefault();
      setSlowGuy((state) => advanceSlowGuy(state, action));
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [active, arcadeView]);

  useEffect(() => {
    if (active !== "agents") return;
    void refreshAgentRuntime();
  }, [active]);

  useEffect(() => {
    if (active !== "context") return;
    void refreshProjectContext();
  }, [active]);

  useEffect(() => {
    if (!hasTauriRuntime()) return;
    const timer = window.setTimeout(() => {
      void checkForUpdates("startup");
    }, 900);
    return () => window.clearTimeout(timer);
  }, []);

  const activeTitle = useMemo(() => navItems.find((item) => item.id === active)?.label ?? "Control", [active]);
  const activeChatWindow = useMemo(
    () => chatWindows.find((windowState) => windowState.id === activeChatWindowId) ?? chatWindows[0] ?? createChatWindow(),
    [activeChatWindowId, chatWindows]
  );
  const chatInput = activeChatWindow.input;
  const chatMessages = activeChatWindow.messages;
  const workspaceSelection = useMemo(
    () => buildWorkspaceSelection(workspaceInput, terminalPlatform()),
    [workspaceInput]
  );
  const previewFrameUrl = useMemo(() => {
    return normalizePreviewFrameUrl(
      previewUrl || previewSnapshot.launchUrl,
      fallbackPreviewSnapshot.launchUrl
    );
  }, [previewSnapshot.launchUrl, previewUrl]);
  const previewCanRenderInline = useMemo(() => canRenderPreviewInline(previewFrameUrl), [previewFrameUrl]);
  const browserWorkPreset = useMemo(() => getBrowserWorkPreset(browserPresetId), [browserPresetId]);
  const contextLabel = contextConfidenceLabel(projectContext);
  const contextCoverage = contextScanRatio(projectContext);
  const contextBudgetPercent = projectContext.contextBudgetTokens
    ? Math.min(100, Math.round((projectContext.estimatedTokens / projectContext.contextBudgetTokens) * 100))
    : 0;
  const unreadNotificationCount = useMemo(() => countUnreadJawsNotifications(notifications), [notifications]);
  const visibleNotificationCount = unreadNotificationCount || notifications.length;
  const cognitiveRuntime = agentRuntime.cognitive ?? fallbackAgentRuntimeSnapshot().cognitive;

  useEffect(() => {
    localStorage.setItem("jaws.previewUrl", previewUrl);
  }, [previewUrl]);

  useEffect(() => {
    localStorage.setItem("jaws.notifications", JSON.stringify(notifications));
  }, [notifications]);

  useEffect(() => {
    localStorage.setItem("jaws.previewDevCommand", previewDevCommand);
  }, [previewDevCommand]);

  useEffect(() => {
    if (active !== "preview") return;
    void refreshBrowserPreview();
  }, [active]);

  useEffect(() => {
    if (active !== "ledger") return;
    void refreshLedger();
  }, [active]);

  useEffect(() => {
    if (!hasTauriRuntime()) {
      setCoworkPlan(fallbackCoworkPlan);
      return;
    }

    void invoke<QAgentsCoworkPlan>("q_agents_cowork_plan")
      .then((plan) => {
        setCoworkPlan(plan);
        setCoworkSharedCredits(plan.pooledCredits);
        setCoworkLaneEnabled((current) =>
          plan.controls.reduce<Record<string, boolean>>((lanes, control) => {
            lanes[control.id] = current[control.id] ?? control.id !== "cowork";
            return lanes;
          }, {})
        );
      })
      .catch(() => setCoworkPlan(fallbackCoworkPlan));
  }, []);

  useEffect(() => {
    if (!hasTauriRuntime()) {
      setInferenceStatus(createPreviewInferenceStatus(inferenceProfile));
      return;
    }

    void refreshInferenceStatus(false);
  }, []);

  async function runSmoke() {
    if (!hasTauriRuntime()) {
      setSmoke({
        ok: false,
        code: null,
        stdout: "",
        stderr: "Open the desktop app to test OpenJaws."
      });
      return;
    }

    const result = await invoke<SidecarSmoke>("openjaws_smoke", {
      workspacePath: null
    });
    setSmoke(result);
  }

  async function applyWorkspace() {
    const selection = workspaceSelection;
    setWorkspaceSmoke(null);
    localStorage.setItem("jaws.workspace", selection.cleaned);

    if (!hasTauriRuntime()) {
      setWorkspaceStatus({
        path: selection.cleaned,
        name: selection.name,
        valid: selection.ready,
        message: selection.ready
          ? "Preview mode cannot validate the folder, but the command is ready for the desktop app."
          : "Use an absolute project folder path before opening the TUI view.",
        tuiCommand: selection.command
      });
      if (selection.cleaned) {
        attachWorkspaceToActiveChatWindow(selection.cleaned, selection.name);
      }
      void refreshProjectContext(selection.cleaned);
      return;
    }

    const result = await invoke<WorkspaceStatus>("validate_workspace", {
      path: selection.cleaned
    });
    setWorkspaceStatus(result);
    if (result.path) {
      setWorkspaceInput(result.path);
      attachWorkspaceToActiveChatWindow(result.path, result.name || selection.name);
    }
    void refreshProjectContext(result.path || selection.cleaned);
  }

  async function openWorkspaceFolder() {
    if (!hasTauriRuntime()) {
      setWorkspaceStatus({
        path: workspaceSelection.cleaned,
        name: workspaceSelection.name,
        valid: false,
        message: "Open Folder uses the desktop file picker.",
        tuiCommand: workspaceSelection.command
      });
      return;
    }

    const selected = await openDialog({
      title: "Open JAWS workspace folder",
      directory: true,
      multiple: false,
      defaultPath: workspaceStatus.path || workspaceSelection.cleaned || undefined
    });
    if (!selected || Array.isArray(selected)) return;

    setWorkspaceInput(selected);
    localStorage.setItem("jaws.workspace", selected);
    const result = await invoke<WorkspaceStatus>("validate_workspace", {
      path: selected
    });
    setWorkspaceStatus(result);
    attachWorkspaceToActiveChatWindow(result.path || selected, result.name || workspaceSelection.name);
    void refreshProjectContext(result.path || selected);

    const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    setChatMessages((messages) => [
      ...messages,
      {
        id: `workspace-${Date.now()}`,
        speaker: "JAWS",
        role: "system",
        body: result.valid
          ? `Workspace opened: ${result.path}. Chat and TUI now use this project folder.`
          : result.message,
        time,
        state: result.valid ? "done" : "queued",
        lane: "workspace"
      }
    ]);
  }

  async function runWorkspaceSmoke() {
    if (!hasTauriRuntime()) {
      setWorkspaceSmoke({
        ok: false,
        code: null,
        stdout: "",
        stderr: "Open the desktop app to run OpenJaws from the selected project folder."
      });
      return;
    }

    const result = await invoke<SidecarSmoke>("openjaws_smoke", {
      workspacePath: workspaceStatus.path || workspaceSelection.cleaned
    });
    setWorkspaceSmoke(result);
  }

  async function checkForUpdates(source: "startup" | "manual" = "manual") {
    setUpdateChecking(true);
    setPendingUpdate(null);
    if (shouldResetDeferredPrompt(source)) {
      setUpdatePromptHidden(false);
    }
    if (!hasTauriRuntime()) {
      setUpdateState("Desktop app required");
      setUpdatePipeline(createPreviewUpdatePipeline(jawsReleaseIndex));
      setUpdateChecking(false);
      return;
    }

    setUpdatePipeline(markUpdatePipelineChecking);

    const [updateResult, probeResult] = await Promise.allSettled([
      check(),
      invoke<UpdatePipelineEntry[]>("probe_release_update_pipeline")
    ]);
    const releaseEntries =
      probeResult.status === "fulfilled"
        ? probeResult.value
        : [
            {
              id: "native-probe",
              label: "Release check",
              status: "error" as const,
              detail: String(probeResult.reason)
            }
          ];

    if (updateResult.status === "fulfilled") {
      const update = updateResult.value;
      setPendingUpdate(update);
      const workflow = resolveUpdateSuccess(update?.version ?? null, releaseEntries);
      setUpdateState(workflow.updateState);
      setUpdatePromptHidden(workflow.promptHidden);
      if (workflow.openNotificationTray) {
        setNotificationsOpen(true);
      }
      if (workflow.notice) {
        triggerJawsNotification(workflow.notice);
      }
      setUpdatePipeline(workflow.pipeline);
    } else {
      const workflow = resolveUpdateFailure(updateResult.reason, releaseEntries);
      setUpdateState(workflow.updateState);
      setUpdatePipeline(workflow.pipeline);
    }
    setUpdateChecking(false);
  }

  async function installUpdate() {
    if (!pendingUpdate) {
      setUpdateState("No update selected");
      return;
    }
    setUpdateState(`Downloading ${pendingUpdate.version}`);
    try {
      await pendingUpdate.downloadAndInstall((event) => {
        if (event.event === "Started") setUpdateState(`Downloading ${pendingUpdate.version}`);
        if (event.event === "Progress") setUpdateState(`Downloading ${pendingUpdate.version}`);
        if (event.event === "Finished") setUpdateState("Installing update");
      });
      setUpdateState("Update installed. Restart JAWS to finish.");
      setUpdatePipeline((entries) =>
        entries.map((entry) =>
          entry.id === "runtime"
            ? { ...entry, status: "ok", detail: `Installed ${pendingUpdate.version}; restart required.` }
            : entry
        )
      );
    } catch (error) {
      setUpdateState(String(error));
      setUpdatePipeline((entries) =>
        entries.map((entry) =>
          entry.id === "runtime"
            ? { ...entry, status: "error", detail: `Install failed: ${String(error)}` }
            : entry
        )
      );
    }
  }

  async function refreshAgentRuntime() {
    if (!hasTauriRuntime()) {
      setAgentRuntime(fallbackAgentRuntimeSnapshot());
      return;
    }

    setAgentRuntimeLoading(true);
    try {
      const snapshot = await invoke<AgentRuntimeSnapshot>("agent_runtime_snapshot", {
        workspacePath: workspaceStatus.path || workspaceSelection.cleaned || null
      });
      setAgentRuntime(snapshot);
    } catch (error) {
      setAgentRuntime({
        ...fallbackAgentRuntimeSnapshot(),
        checkedAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        source: "Desktop app",
        summary: `Agent Watch could not refresh: ${String(error)}`
      });
    } finally {
      setAgentRuntimeLoading(false);
    }
  }

  async function refreshProjectContext(workspacePath?: string) {
    const selectedPath = workspacePath ?? (workspaceStatus.path || workspaceSelection.cleaned);
    if (!hasTauriRuntime()) {
      setProjectContext(
        fallbackProjectContextSnapshot({
          ...workspaceStatus,
          path: selectedPath,
          name: workspaceStatus.name || workspaceSelection.name,
          valid: workspaceStatus.valid || workspaceSelection.ready
        })
      );
      return;
    }

    setProjectContextLoading(true);
    try {
      const snapshot = await invoke<ProjectContextSnapshot>("project_context_snapshot", {
        workspacePath: selectedPath || null
      });
      setProjectContext(snapshot);
    } catch (error) {
      setProjectContext({
        ...fallbackProjectContextSnapshot(workspaceStatus),
        checkedAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        source: "Desktop app",
        confidenceScore: 0,
        summary: `Context scan could not finish: ${String(error)}`
      });
    } finally {
      setProjectContextLoading(false);
    }
  }

  async function refreshBrowserPreview() {
    if (!hasTauriRuntime()) {
      setPreviewSnapshot({
        ...fallbackPreviewSnapshot,
        launchUrl: previewFrameUrl,
        devCommand: previewDevCommand,
        previewCommand: `/preview ${previewFrameUrl}`,
        playwrightCodegenCommand: `bunx playwright codegen ${previewFrameUrl}`
      });
      return;
    }

    try {
      const snapshot = await invoke<BrowserPreviewSnapshot>("browser_preview_snapshot", {
        workspacePath: workspaceStatus.path || workspaceSelection.cleaned || null
      });
      setPreviewSnapshot(snapshot);
      setPreviewUrl(snapshot.launchUrl);
      setPreviewDevCommand(snapshot.devCommand);
    } catch (error) {
      setPreviewSnapshot({
        ...fallbackPreviewSnapshot,
        checkedAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        receiptSummary: `Preview check failed: ${String(error)}`,
        launchUrl: previewFrameUrl,
        devCommand: previewDevCommand
      });
    }
  }

  async function openNativeBrowserPreview() {
    setPreviewWindowResult(null);

    if (!hasTauriRuntime()) {
      await openExternal(previewFrameUrl);
      setPreviewWindowResult({
        ok: true,
        url: previewFrameUrl,
        label: "system-browser",
        message: "Opened in the system browser."
      });
      return;
    }

    try {
      const result = await invoke<PreviewWindowResult>("open_browser_preview_window", {
        url: previewFrameUrl
      });
      setPreviewWindowResult(result);
      await refreshBrowserPreview();
    } catch (error) {
      setPreviewWindowResult({
        ok: false,
        url: previewFrameUrl,
        label: "",
        message: String(error)
      });
    }
  }

  async function saveBrowserPreviewLaunchConfig() {
    const workspacePath = workspaceStatus.path || workspaceSelection.cleaned;
    if (!hasTauriRuntime()) {
      setPreviewConfigResult({
        ok: false,
        path: ".openjaws/launch.json",
        message: "Open the desktop app to save this launch setup.",
        url: previewFrameUrl,
        devCommand: previewDevCommand,
        previewCommand: `/preview ${previewFrameUrl}`,
        playwrightCodegenCommand: `bunx playwright codegen ${previewFrameUrl}`,
        playwrightTestCommand: fallbackPreviewSnapshot.playwrightTestCommand
      });
      return;
    }

    const result = await invoke<PreviewLaunchConfigResult>("write_browser_preview_launch_config", {
      workspacePath,
      url: previewFrameUrl,
      devCommand: previewDevCommand
    });
    setPreviewConfigResult(result);
    if (result.ok) {
      setPreviewUrl(result.url);
      setPreviewDevCommand(result.devCommand);
      await refreshBrowserPreview();
    }
  }

  async function writePlaywrightDemoHarness() {
    const workspacePath = workspaceStatus.path || workspaceSelection.cleaned;
    if (!hasTauriRuntime()) {
      setPreviewDemoResult({
        ok: false,
        outputDir: "",
        message: "Open the desktop app to create the website test files.",
        name: "OpenJaws website test",
        slug: "",
        url: previewFrameUrl,
        devCommand: previewDevCommand,
        previewCommand: `/preview ${previewFrameUrl}`,
        playwrightInstallCommand: "bunx playwright install chromium",
        playwrightCodegenCommand: `bunx playwright codegen ${previewFrameUrl}`,
        playwrightTestCommand: "bunx playwright test",
        playwrightHeadedCommand: "bunx playwright test --headed",
        readmePath: "",
        packagePath: "",
        configPath: "",
        specPath: "",
        receiptPath: "",
        receiptHash: ""
      });
      return;
    }

    const result = await invoke<PreviewDemoHarnessResult>("write_browser_preview_demo_harness", {
      workspacePath,
      url: previewFrameUrl,
      devCommand: previewDevCommand,
      name: workspaceStatus.name ? `${workspaceStatus.name} website test` : "OpenJaws website test"
    });
    setPreviewDemoResult(result);
  }

  async function runBrowserPreviewCommand() {
    const prompt = previewSnapshot.previewCommand || `/preview ${previewFrameUrl}`;
    setPreviewBusy(true);
    setPreviewRunResult(null);
    setPreviewWindowResult(null);

    if (!previewCanRenderInline) {
      try {
        await openNativeBrowserPreview();
        setPreviewRunResult({
          ok: true,
          code: 0,
          stdout:
            "External sites often block embedded frames. JAWS opened this target in a dedicated native preview window instead.",
          stderr: "",
          summary: "Browser preview opened outside the embedded frame.",
          permissionMode: "browser-preview",
          workspacePath: workspaceStatus.path || workspaceSelection.cleaned || ""
        });
      } finally {
        setPreviewBusy(false);
      }
      return;
    }

    if (!hasTauriRuntime()) {
      setPreviewRunResult({
        ok: false,
        code: null,
        stdout: "",
        stderr: "Open the desktop app to run the browser preview command.",
        summary: "Desktop app required.",
        permissionMode: fastRunMode ? "bypassPermissions" : "default",
        workspacePath: workspaceStatus.path || workspaceSelection.cleaned || ""
      });
      setPreviewBusy(false);
      return;
    }

    try {
      const result = await invoke<OpenJawsChatResult>("run_openjaws_chat", {
        prompt,
        workspacePath: workspaceStatus.path || workspaceSelection.cleaned || null,
        fastRunMode
      });
      setPreviewRunResult(result);
      if (result.ok) {
        await refreshBrowserPreview();
      }
    } catch (error) {
      setPreviewRunResult({
        ok: false,
        code: null,
        stdout: "",
        stderr: String(error),
        summary: "OpenJaws preview command could not start.",
        permissionMode: fastRunMode ? "bypassPermissions" : "default",
        workspacePath: workspaceStatus.path || workspaceSelection.cleaned || ""
      });
    } finally {
      setPreviewBusy(false);
    }
  }

  async function refreshLedger() {
    setLedgerLoading(true);

    if (!hasTauriRuntime()) {
      setLedgerSnapshot(fallbackLedgerSnapshot);
      setLedgerLoading(false);
      return;
    }

    try {
      const snapshot = await invoke<LedgerSnapshot>("arobi_ledger_snapshot", {
        workspacePath: workspaceStatus.path || workspaceSelection.cleaned || null
      });
      setLedgerSnapshot(snapshot);
    } catch (error) {
      setLedgerSnapshot({
        ...fallbackLedgerSnapshot,
        checkedAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        summary: `Ledger scan failed: ${String(error)}`,
        warnings: ["The local ledger reader could not finish."]
      });
    } finally {
      setLedgerLoading(false);
    }
  }

  function stagePlaywrightDemoPrompt() {
    setChatInput(
      [
        `Open the workspace web app at ${previewFrameUrl}.`,
        `Create or update a short website test for the main user flow.`,
        `Respect the workspace launch command "${previewDevCommand}" and verify with ${previewSnapshot.playwrightTestCommand}.`
      ].join("\n")
    );
    setActive("chat");
  }

  function stageBrowserControlPrompt() {
    setChatInput(buildBrowserWorkPrompt({
      url: previewFrameUrl,
      workspacePath: activeChatWindow.workspacePath || workspaceStatus.path || workspaceSelection.cleaned || "",
      mode: browserControlMode,
      preset: browserWorkPreset,
      task: browserTaskInput
    }));
    setActive("chat");
  }

  function toggleCoworkLane(id: string) {
    setCoworkLaneEnabled((lanes) => ({
      ...lanes,
      [id]: !lanes[id]
    }));
  }

  function stageQAgentsCoworkPrompt() {
    const lanes = coworkPlan.controls
      .filter((control) => coworkLaneEnabled[control.id])
      .map((control) => control.label)
      .join(", ");
    setChatInput(
      [
        `Start a Q_agents co-work run for ${workspaceStatus.path || workspaceSelection.cleaned || "the selected workspace"}.`,
        `Mode: ${coworkStackMode}. Room: ${coworkPlan.roomCode}. Lanes: ${lanes || "none selected"}.`,
        `Use shared notes: ${coworkPlan.sharedPhaseMemory ? "yes" : "no"}. Shared credits: ${coworkSharedCredits ? "enabled" : "disabled"}.`,
        "Plan, implement, verify, and report every handoff with tests and browser/preview evidence."
      ].join("\n")
    );
    setActive("chat");
  }

  function stageContextAuditPrompt() {
    setChatInput(
      [
        `Use the visible JAWS Context view for ${projectContext.workspacePath || workspaceStatus.path || workspaceSelection.cleaned || "the selected workspace"}.`,
        `Coverage: ${projectContext.scannedFiles}/${projectContext.totalFiles} files, ${projectContext.confidenceScore}% confidence, ${formatTokenEstimate(projectContext.estimatedTokens)} estimated.`,
        `Do not claim files are understood unless they appear in the Context view. Inspect missing areas first, then plan the next change.`
      ].join("\n")
    );
    setActive("chat");
  }

  function playNotificationSound(tone: JawsNotification["tone"]) {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      const context = new AudioContextClass();
      const now = context.currentTime;
      const gain = context.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(tone === "input" ? 0.1 : 0.16, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.58);
      gain.connect(context.destination);
      const notes = tone === "complete" ? [523.25, 659.25, 783.99] : tone === "input" ? [392, 349.23] : [440, 554.37, 880];
      notes.forEach((frequency, index) => {
        const osc = context.createOscillator();
        osc.type = index % 2 === 0 ? "triangle" : "sine";
        osc.frequency.setValueAtTime(frequency, now + index * 0.08);
        osc.connect(gain);
        osc.start(now + index * 0.08);
        osc.stop(now + 0.46 + index * 0.04);
      });
      window.setTimeout(() => void context.close(), 900);
    } catch {
      // Audio is optional; the visual notification remains authoritative.
    }
  }

  async function requestNativeNotificationPermissionState(): Promise<NativeNotificationPermission> {
    if (!hasTauriRuntime()) return "unsupported";
    try {
      const alreadyGranted = await isPermissionGranted();
      if (alreadyGranted) return "granted";
      return normalizeNativeNotificationPermission(await requestPermission());
    } catch {
      return "unsupported";
    }
  }

  async function sendNativeJawsNotification(entry: JawsNotification) {
    if (!hasTauriRuntime() || !notificationsArmed) return;
    let permission = nativeNotificationPermission;
    if (permission !== "granted") {
      try {
        permission = (await isPermissionGranted()) ? "granted" : permission;
        setNativeNotificationPermission(permission);
      } catch {
        permission = "unsupported";
        setNativeNotificationPermission(permission);
      }
    }

    if (!shouldSendNativeNotification({ armed: notificationsArmed, permission })) return;

    try {
      await Promise.resolve(sendNotification(buildNativeNotificationPayload(entry)));
    } catch {
      setNativeNotificationPermission("unsupported");
    }
  }

  function triggerJawsNotification(notification: Omit<JawsNotification, "id" | "time" | "createdAt" | "readAt">) {
    const entry = createJawsNotification(notification);
    setNotifications((items) => pushJawsNotification(items, entry));
    if (notificationsArmed) {
      setFirework(entry);
      playNotificationSound(entry.tone);
      void sendNativeJawsNotification(entry);
      window.setTimeout(() => setFirework((current) => (current?.id === entry.id ? null : current)), 1800);
    }
  }

  async function toggleNotificationsArmed() {
    if (notificationsArmed) {
      setNotificationsArmed(false);
      return;
    }

    const permission = await requestNativeNotificationPermissionState();
    setNativeNotificationPermission(permission);
    if (permission === "denied" || permission === "prompt") {
      setNotificationsArmed(false);
      setNotifications((items) =>
        pushJawsNotification(
          items,
          createJawsNotification({
            title: "Notifications blocked",
            detail: "Allow notifications in your system settings, then arm alerts again.",
            tone: "input"
          })
        )
      );
      return;
    }

    setNotificationsArmed(true);
  }

  function toggleNotificationsTray() {
    setNotificationsOpen((open) => !open);
  }

  function markNotificationsRead() {
    setNotifications((items) => markAllJawsNotificationsRead(items));
  }

  function updateChatWindow(windowId: string, update: (windowState: ChatWindowState) => ChatWindowState) {
    setChatWindows((windows) =>
      windows.map((windowState) => (windowState.id === windowId ? update(windowState) : windowState))
    );
  }

  function setChatWindowInput(windowId: string, value: string) {
    updateChatWindow(windowId, (windowState) => ({ ...windowState, input: value }));
  }

  function setChatInput(value: string) {
    setChatWindowInput(activeChatWindow.id, value);
  }

  function setChatWindowMessages(windowId: string, update: (messages: ChatMessage[]) => ChatMessage[]) {
    updateChatWindow(windowId, (windowState) => ({
      ...windowState,
      messages: update(windowState.messages)
    }));
  }

  function setChatMessages(update: (messages: ChatMessage[]) => ChatMessage[]) {
    setChatWindowMessages(activeChatWindow.id, update);
  }

  function attachWorkspaceToActiveChatWindow(path: string, name: string) {
    const title = name || "Workspace";
    updateChatWindow(activeChatWindow.id, (windowState) => ({
      ...windowState,
      title,
      workspacePath: path,
      workspaceName: title,
      minimized: false
    }));
  }

  function startProjectChatWindow() {
    const workspacePath = workspaceStatus.path || workspaceSelection.cleaned;
    const workspaceName = workspaceStatus.name || workspaceSelection.name || "Workspace";
    const next = createChatWindow(workspacePath, workspaceName, workspaceName);
    setChatWindows((windows) => [next, ...windows].slice(0, 6));
    setActiveChatWindowId(next.id);
    setActive("chat");
  }

  function toggleActiveChatWindow(key: "minimized" | "expanded" | "sideCollapsed") {
    updateChatWindow(activeChatWindow.id, (windowState) => ({
      ...windowState,
      [key]: !windowState[key]
    }));
  }

  function closeActiveChatWindow() {
    const result = closeChatWindow(chatWindows, activeChatWindow.id, closedChatWindows);
    setChatWindows(result.open);
    setClosedChatWindows(result.closed);
    setActiveChatWindowId(result.activeId);
    triggerJawsNotification({
      title: "Chat closed",
      detail: `${activeChatWindow.title} is archived. Resume it from Chat Sessions when needed.`,
      tone: "complete"
    });
  }

  function resumeChatWindowById(windowId: string) {
    const result = resumeChatWindow(chatWindows, closedChatWindows, windowId);
    setChatWindows(result.open);
    setClosedChatWindows(result.closed);
    setActiveChatWindowId(result.activeId);
    setActive("chat");
  }

  function clearNotifications() {
    setNotifications(clearJawsNotifications());
    setFirework(null);
  }

  function dismissNotification(id: string) {
    setNotifications((items) => dismissJawsNotification(items, id));
  }

  function updateInferenceProfile(patch: Partial<InferenceProfile>) {
    setInferenceProfile((current) => normalizeInferenceProfile({ ...current, ...patch }));
  }

  function stageInferenceCommand(command: string) {
    setChatInput(command);
    setActive("chat");
  }

  async function refreshInferenceStatus(runProbe: boolean) {
    setInferenceChecking(true);

    if (!hasTauriRuntime()) {
      setInferenceStatus(createPreviewInferenceStatus(inferenceProfile));
      setInferenceChecking(false);
      return;
    }

    try {
      const result = await invoke<NativeInferenceStatusResult>("openjaws_inference_status", {
        provider: inferenceProfile.provider,
        model: inferenceProfile.model,
        runProbe,
        workspacePath: activeChatWindow.workspacePath || workspaceStatus.path || workspaceSelection.cleaned || null
      });
      const next = buildInferenceStatusFromNative(result, inferenceProfile);
      setInferenceStatus(next);
      setUpdateState(
        runProbe
          ? next.state === "ready"
            ? "AI connection check passed"
            : "AI connection needs review"
          : "AI connection refreshed"
      );
    } catch (error) {
      setInferenceStatus(buildInferenceStatusFromError(error, inferenceProfile));
      setUpdateState("AI connection check failed");
    } finally {
      setInferenceChecking(false);
    }
  }

  async function submitChatCommand(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (chatBusy) return;
    const command = chatInput.trim();
    if (!command) return;

    const runWindowId = activeChatWindow.id;
    const runWorkspacePath = activeChatWindow.workspacePath || workspaceStatus.path || workspaceSelection.cleaned;
    const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const runMode = fastRunMode ? "fast queue" : "review first";
    const workspaceName = activeChatWindow.workspaceName || (workspaceStatus.valid ? workspaceStatus.name : workspaceSelection.name);
    const baseId = Date.now();
    const qMessageId = `q-${baseId}`;
    const agentMessageId = `agents-${baseId}`;

    setChatWindowMessages(runWindowId, (messages) => [
      ...messages,
      {
        id: `user-${baseId}`,
        speaker: userProfile.name || account?.displayName || "You",
        role: "user",
        body: command,
        time,
        state: "done",
        lane: "user"
      },
      {
        id: qMessageId,
        speaker: "Q",
        role: "agent",
        body: `Working in ${runMode} mode. Workspace: ${workspaceName || "not set"}.`,
        time,
        state: "thinking",
        lane: "q"
      },
      {
        id: agentMessageId,
        speaker: "Q_agents",
        role: "agent",
        body: compareMode
          ? "Compare is on. Proposed file changes will stay visible beside the chat."
          : "Compare is off. Work updates will appear in the chat.",
        time,
        state: "queued",
        lane: "agents"
      }
    ]);
    setChatWindowInput(runWindowId, "");
    setChatBusy(true);
    awardCodeTokens(6, "agent work");
    triggerJawsNotification({
      title: "Agents started",
      detail: `Q and Q_agents started work in ${workspaceName || "the selected workspace"}.`,
      tone: "update"
    });

    if (hasTauriRuntime()) {
      try {
        const result = await invoke<OpenJawsChatResult>("run_openjaws_chat", {
          prompt: command,
          workspacePath: runWorkspacePath || null,
          fastRunMode
        });
        setChatWindowMessages(runWindowId, (messages) =>
          messages.map((message) => {
            if (message.id === qMessageId) {
              return {
                ...message,
                body: formatOpenJawsChatResult(result),
                state: "done"
              };
            }
            if (message.id === agentMessageId) {
              return {
                ...message,
                body: result.ok
                  ? "OpenJaws finished this chat command. Review the result and continue from the same workspace."
                  : "OpenJaws could not finish this command. Review the Q message before continuing.",
                state: "done"
              };
            }
            return message;
          })
        );
        setUpdateState(result.ok ? "OpenJaws Chat command completed" : "OpenJaws Chat command needs review");
        triggerJawsNotification({
          title: result.ok ? "Agents finished" : "Human input needed",
          detail: result.ok
            ? "OpenJaws finished the chat command. Review the transcript and next steps."
            : "OpenJaws needs your review before continuing.",
          tone: result.ok ? "complete" : "input"
        });
      } catch (error) {
        setChatWindowMessages(runWindowId, (messages) =>
          messages.map((message) => {
            if (message.id === qMessageId) {
              return {
                ...message,
                body: `OpenJaws could not start this chat command.\n\n${String(error)}`,
                state: "done"
              };
            }
            if (message.id === agentMessageId) {
              return {
                ...message,
                body: "JAWS could not reach OpenJaws. Check the app and workspace settings.",
                state: "done"
              };
            }
            return message;
          })
        );
        setUpdateState("OpenJaws chat command failed");
        triggerJawsNotification({
          title: "Human input needed",
        detail: "JAWS could not reach OpenJaws. Check workspace and app settings.",
          tone: "input"
        });
      } finally {
        setChatBusy(false);
      }
      return;
    }

    window.setTimeout(() => {
      setChatWindowMessages(runWindowId, (messages) =>
        messages.map((message) => {
          if (message.id === qMessageId) {
            return {
              ...message,
              body: `Finished the preview run in ${runMode} mode. Workspace: ${workspaceName || "not set"}.`,
              state: "done"
            };
          }
          if (message.id === agentMessageId) {
            return {
              ...message,
              body: compareMode
                ? "Compare is on. File changes will appear here before release."
                : "Worker lanes are live. JAWS will keep the transcript moving while agents report progress.",
              state: "thinking"
            };
          }
          return message;
        })
      );
    }, 650);
    window.setTimeout(() => {
      setChatWindowMessages(runWindowId, (messages) =>
        messages.map((message) =>
          message.id === agentMessageId
            ? {
                ...message,
                state: "done"
              }
            : message
        )
      );
      setChatBusy(false);
      triggerJawsNotification({
        title: "Goals complete",
        detail: "Preview mode finished. Desktop runs will show exact OpenJaws output.",
        tone: "complete"
      });
    }, 1500);
  }

  function awardCodeTokens(amount: number, reason: string) {
    const reward = Math.max(0, Math.round(amount));
    if (reward === 0) return;
    setPet((current) => ({
      ...current,
      tokens: Math.min(codeTokenCap, current.tokens + reward),
      energy: Math.min(100, current.energy + Math.min(8, Math.ceil(reward / 2))),
      egg: Math.min(100, current.egg + Math.min(6, Math.ceil(reward / 3))),
      mood: `${reason} reward`
    }));
  }

  function spendPetTokens(cost: number, update: (current: CyberPetState) => CyberPetState) {
    setPet((current) => {
      if (current.tokens < cost) return { ...current, mood: "needs more code tokens" };
      return update({ ...current, tokens: current.tokens - cost });
    });
  }

  function feedPet() {
    spendPetTokens(4, (current) => ({
      ...current,
      fullness: Math.min(100, current.fullness + 18),
      energy: Math.min(100, current.energy + 8),
      mood: "fed"
    }));
  }

  function trainPet() {
    spendPetTokens(6, (current) => ({
      ...current,
      energy: Math.max(12, current.energy - 10),
      egg: Math.min(100, current.egg + 12),
      mood: current.egg >= 88 ? "ready to hatch" : "training"
    }));
  }

  function equipPet() {
    const gear = pet.gear === "visor" ? "jet boots" : pet.gear === "jet boots" ? "debug crown" : "visor";
    spendPetTokens(8, (current) => ({
      ...current,
      gear,
      mood: "geared up"
    }));
  }

  function decoratePet() {
    const decor = pet.decor === "neon pad" ? "reef desk" : pet.decor === "reef desk" ? "holo plants" : "neon pad";
    spendPetTokens(5, (current) => ({
      ...current,
      decor,
      mood: "settled"
    }));
  }

  async function openExternal(url: string) {
    if (hasTauriRuntime()) {
      await openUrl(url);
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function dispatchSlowGuy(action: SlowGuyAction) {
    setSlowGuy((state) => {
      const next = advanceSlowGuy(state, action);
      const earned = Math.max(0, next.tokens - state.tokens);
      if (earned > 0) {
        awardCodeTokens(earned, "Slow Guy");
      }
      return next;
    });
  }

  function advanceHoldem() {
    const next = advanceHoldemRound(holdemTable);
    setHoldemTable(next);
    if (next.phase === "showdown" && holdemTable.phase !== "showdown") {
      awardCodeTokens(holdemCodeTokenPrize(next), "Hold'em");
    }
  }

  function actHoldem(action: HoldemAction, amount?: number) {
    setHoldemTable((table) => {
      const next = applyHoldemAction(table, "seat-founder", action, amount);
      if (next.phase === "showdown" && table.phase !== "showdown") {
        awardCodeTokens(holdemCodeTokenPrize(next), "Hold'em");
      }
      return next;
    });
  }

  function resetHoldemRoom() {
    setHoldemTable(createHoldemTable(userProfile.name || account?.displayName || "Founder", `jaws-holdem-${Date.now()}`));
  }

  return (
    <main className="shell">
      <aside className={collapsed ? "sidebar collapsed" : "sidebar"}>
        <div className="brand-row">
          <JawsMark className="brand-mark" />
          {!collapsed && (
            <div>
              <p className="eyebrow">JAWS</p>
              <h1>Jaws IDE</h1>
            </div>
          )}
          <button className="icon-button" type="button" onClick={() => setCollapsed((value) => !value)} aria-label="Toggle menu">
            {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
        </div>

        <nav className="nav-list" aria-label="Primary">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={active === item.id ? "nav-item active" : "nav-item"}
                type="button"
                onClick={() => setActive(item.id)}
                title={item.label}
              >
                <Icon size={18} />
                {!collapsed && <span>{item.label}</span>}
              </button>
            );
          })}
        </nav>

        {!collapsed && (
          <div className="sidebar-footer">
            {account && <small>{account.displayName || account.email}</small>}
            <span>14 day trial</span>
            <strong>$12.99/mo IDE</strong>
            <small>Q credits billed separately</small>
          </div>
        )}
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">{activeTitle}</p>
            <h2>Jaws IDE. The future wrapped with OpenJaws, with Q and Immaculate built in.</h2>
          </div>
          <div className="top-actions">
            <div className="notification-tray">
              <button
                className={notificationsOpen ? "text-button notification-button active" : notificationsArmed ? "text-button notification-button armed" : "text-button notification-button"}
                type="button"
                onClick={toggleNotificationsTray}
                aria-expanded={notificationsOpen}
                aria-label="Open notifications"
              >
                <BellRing size={16} />
                {visibleNotificationCount}
              </button>
              {notificationsOpen && (
                <NotificationList
                  notifications={notifications}
                  armed={notificationsArmed}
                  nativePermission={nativeNotificationPermission}
                  unreadCount={unreadNotificationCount}
                  compact
                  onToggleArmed={toggleNotificationsArmed}
                  onClear={clearNotifications}
                  onDismiss={dismissNotification}
                  onMarkRead={markNotificationsRead}
                  onTest={() =>
                    triggerJawsNotification({
                      title: "Fireworks test",
                      detail: "JAWS notifications are armed for agent completion, human input, and release updates.",
                      tone: "complete"
                    })
                  }
                />
              )}
            </div>
            {pendingUpdate && !updatePromptHidden && (
              <div className="update-inline-card" role="status" aria-live="polite">
                <div>
                  <span>Signed update ready</span>
                  <strong>{pendingUpdate.version}</strong>
                </div>
                <button className="text-button primary" type="button" onClick={installUpdate}>
                  <CheckCircle2 size={16} />
                  Install Now
                </button>
                <button
                  className="text-button"
                  type="button"
                  onClick={() => {
                    setUpdatePromptHidden(true);
                    setUpdateState(formatDeferredUpdateState(pendingUpdate.version));
                  }}
                >
                  Later
                </button>
              </div>
            )}
            <button className="icon-button" type="button" onClick={() => setAppearance(appearance === "dark" ? "light" : "dark")} aria-label="Toggle light and dark mode">
              {appearance === "dark" ? <Sparkles size={18} /> : <ShieldCheck size={18} />}
            </button>
            <button className="text-button" type="button" onClick={() => openExternal("https://github.com/PossumXI/OpenJaws")}>
              <ExternalLink size={16} />
              GitHub
            </button>
          </div>
        </header>

        {firework && <FireworkNotice notification={firework} />}

        {active === "control" && (
          <section className="page-grid">
            <div className="hero-panel">
              <div>
                <p className="eyebrow">Workspace</p>
                <h3>Open a project, ask for work, and review results.</h3>
                <p>
                  JAWS gives you chat, terminal, browser preview, updates, games, and co-work in one desktop app.
                </p>
              </div>
              <div className="status-stack">
                <JawsMark className="hero-logo" />
                <button className="text-button primary" type="button" onClick={runSmoke}>
                  <RefreshCcw size={16} />
                  Test OpenJaws
                </button>
                <button className="text-button" type="button" onClick={() => checkForUpdates()}>
                  <RadioTower size={16} />
                  Check for update
                </button>
                {pendingUpdate && (
                  <button className="text-button" type="button" onClick={installUpdate}>
                    <CheckCircle2 size={16} />
                    Install
                  </button>
                )}
              </div>
            </div>

            <div className="status-grid">
              {systemLanes.map((lane) => {
                const Icon = lane.icon;
                return (
                  <article className="metric-card" key={lane.label}>
                    <div className={`metric-icon ${lane.tone}`}>
                      <Icon size={18} />
                    </div>
                    <span>{lane.label}</span>
                    <strong>{lane.value}</strong>
                    <small>{toneLabel(lane.tone)}</small>
                  </article>
                );
              })}
            </div>

            <div className="wide-panel">
              <PanelHeader icon={Activity} label="App Status" />
              <div className="runtime-grid">
                <StatusLine label="App version" value={status.appVersion} />
                <StatusLine label="OpenJaws" value={status.sidecarReady ? "Ready" : "Pending"} />
                <StatusLine label="Details" value={status.sidecarMessage} />
                <StatusLine label="Updates" value={`${status.updateChannel}: ${updateState}`} />
              </div>
              {smoke && (
                <pre className="console">{smoke.ok ? smoke.stdout || "OpenJaws responded." : smoke.stderr || "OpenJaws check failed."}</pre>
              )}
            </div>
          </section>
        )}

        {active === "chat" && (
          <section className="chat-page">
            <div className={`wide-panel chat-panel ${activeChatWindow.expanded ? "expanded" : ""} ${activeChatWindow.sideCollapsed ? "side-collapsed" : ""}`}>
              <div className="panel-header-row">
                <PanelHeader icon={MessageSquare} label="Chat Window" />
                <div className="button-row">
                  <button className="text-button" type="button" onClick={startProjectChatWindow}>
                    <PackagePlus size={16} />
                    New Project Chat
                  </button>
                  <button className="text-button" type="button" onClick={() => toggleActiveChatWindow("sideCollapsed")}>
                    {activeChatWindow.sideCollapsed ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
                    {activeChatWindow.sideCollapsed ? "Tools" : "Collapse"}
                  </button>
                  <button className="text-button" type="button" onClick={() => toggleActiveChatWindow("expanded")}>
                    <Maximize2 size={16} />
                    {activeChatWindow.expanded ? "Normal" : "Expand"}
                  </button>
                  <button className="text-button" type="button" onClick={() => toggleActiveChatWindow("minimized")}>
                    {activeChatWindow.minimized ? <Maximize2 size={16} /> : <Minimize2 size={16} />}
                    {activeChatWindow.minimized ? "Restore" : "Minimize"}
                  </button>
                  <button className="text-button danger" type="button" onClick={closeActiveChatWindow}>
                    <XCircle size={16} />
                    Close
                  </button>
                </div>
              </div>

              <div className="chat-window-strip" aria-label="Open chat windows">
                {chatWindows.map((windowState) => (
                  <button
                    className={windowState.id === activeChatWindow.id ? "chat-window-tab active" : windowState.minimized ? "chat-window-tab minimized" : "chat-window-tab"}
                    key={windowState.id}
                    type="button"
                    onClick={() => setActiveChatWindowId(windowState.id)}
                  >
                    <span>{windowState.title}</span>
                    <small>{windowState.workspacePath || "no folder"}</small>
                  </button>
                ))}
              </div>

              {activeChatWindow.minimized ? (
                <div className="chat-minimized-card">
                  <MessageActivity active={chatBusy} state={chatBusy ? "thinking" : "queued"} frame={jawFrame} />
                  <div>
                    <strong>{activeChatWindow.title} is minimized</strong>
                    <span>{activeChatWindow.workspacePath || "No project folder pinned."}</span>
                  </div>
                  <button className="text-button primary" type="button" onClick={() => toggleActiveChatWindow("minimized")}>
                    Restore
                  </button>
                </div>
              ) : (
              <div className="chat-layout">
                <section className="chat-main" aria-label="JAWS command chat">
                  <div className="chat-status slim">
                    <MessageActivity active={chatBusy} state={chatBusy ? "thinking" : "done"} frame={jawFrame} />
                    <div>
                      <span>Work updates</span>
                      <strong>{chatBusy ? "Q is thinking" : fastRunMode ? "Fast mode" : "Review first"}</strong>
                      <small>{notificationsArmed ? "Alerts on" : "Alerts off"}</small>
                    </div>
                    <div className="chat-status-tools" aria-label="Chat state">
                      <span>{compareMode ? "Compare on" : "Compare off"}</span>
                      <span>{contextConfidenceLabel(projectContext)}</span>
                      <span>{activeChatWindow.workspaceName || workspaceStatus.name || "No folder"}</span>
                    </div>
                  </div>

                  <div className="chat-transcript" aria-live="polite" aria-relevant="additions text">
                    {chatMessages.map((message) => (
                      <article className={`chat-row ${message.role}`} key={message.id}>
                        <MessageActivity active={message.state === "thinking"} state={message.state} frame={jawFrame} />
                        <div className="chat-message">
                          <header>
                            <div>
                              <strong>{message.speaker}</strong>
                              <span>{message.lane}</span>
                            </div>
                            <span>{message.time}</span>
                          </header>
                          <p>{message.body}</p>
                        </div>
                      </article>
                    ))}
                  </div>

                  <form className="chat-input" onSubmit={submitChatCommand}>
                    <label className="sr-only" htmlFor="jaws-chat-command">
                      JAWS chat command
                    </label>
                    <div className="chat-tool-strip" aria-label="Command starters">
                      {chatTools.map((tool) => (
                        <button
                          className="tool-chip"
                          key={tool.label}
                          type="button"
                          onClick={() => setChatInput(tool.prompt)}
                        >
                          {tool.label}
                        </button>
                      ))}
                    </div>
                    <textarea
                      id="jaws-chat-command"
                      value={chatInput}
                      onChange={(event) => setChatInput(event.target.value)}
                      placeholder="Ask JAWS what you want done in this project."
                      rows={3}
                    />
                    <button className="text-button primary" type="submit" disabled={chatBusy || chatInput.trim().length === 0}>
                      <Send size={16} />
                      {chatBusy ? "Running" : "Send"}
                    </button>
                  </form>
                </section>

                {!activeChatWindow.sideCollapsed && <aside className="chat-side">
                  <div className="side-module profile-mini">
                    <div className="profile-avatar">
                      <UserRound size={20} />
                    </div>
                    <div>
                      <span>User profile</span>
                      <strong>{userProfile.name}</strong>
                      <small>{userProfile.focus}</small>
                    </div>
                  </div>

                  <div className="side-module tool-grid">
                    <button className="text-button primary" type="button" onClick={openWorkspaceFolder}>
                      <FolderOpen size={16} />
                      Open Folder
                    </button>
                    <button className="text-button primary" type="button" onClick={() => setActive("terminal")}>
                      <TerminalSquare size={16} />
                      Terminal View
                    </button>
                    <button className="text-button" type="button" onClick={() => setCompareMode((value) => !value)}>
                      <GitCompare size={16} />
                      {compareMode ? "Compare On" : "Compare Off"}
                    </button>
                    <button className="text-button" type="button" onClick={() => setFastRunMode((value) => !value)}>
                      {fastRunMode ? <Send size={16} /> : <ShieldCheck size={16} />}
                      {fastRunMode ? "Fast Queue" : "Review"}
                    </button>
                    <button className="text-button" type="button" onClick={toggleNotificationsArmed}>
                      <BellRing size={16} />
                      {notificationsArmed ? "Notify On" : "Notify Off"}
                    </button>
                  </div>

                  <div className="side-module chat-session-manager">
                    <div className="session-manager-header">
                      <div>
                        <span>Chat sessions</span>
                        <strong>{chatWindows.length} active</strong>
                      </div>
                      <small>{closedChatWindows.length} archived</small>
                    </div>
                    <div className="session-list" aria-label="Resume chat sessions">
                      {chatWindows.map((windowState) => (
                        <button
                          className={windowState.id === activeChatWindow.id ? "session-row active" : "session-row"}
                          key={windowState.id}
                          type="button"
                          onClick={() => resumeChatWindowById(windowState.id)}
                        >
                          <span>{windowState.title}</span>
                          <small>{windowState.workspacePath || "no folder pinned"}</small>
                        </button>
                      ))}
                      {closedChatWindows.length > 0 ? (
                        closedChatWindows.slice(0, 4).map((windowState) => (
                          <button
                            className="session-row archived"
                            key={windowState.id}
                            type="button"
                            onClick={() => resumeChatWindowById(windowState.id)}
                          >
                            <span>{windowState.title}</span>
                            <small>{windowState.closedAt ? `closed ${windowState.closedAt}` : windowState.workspacePath || "archived"}</small>
                          </button>
                        ))
                      ) : (
                        <div className="session-empty">
                          <span>No archived chats</span>
                          <small>Closed project chats will stay resumable here.</small>
                        </div>
                      )}
                    </div>
                  </div>

                  <CyberPet pet={pet} compact onFeed={feedPet} onTrain={trainPet} onEquip={equipPet} onDecorate={decoratePet} />

                  <div className="side-module agent-mini-list">
                    <span>Agent profiles</span>
                    {agentProfiles.map((agent) => (
                      <div className="agent-mini" key={agent.name}>
                        <Bot size={15} />
                        <div>
                          <strong>{agent.name}</strong>
                          <small>{agent.status}</small>
                        </div>
                        <meter min="0" max="100" value={agent.load} />
                      </div>
                    ))}
                  </div>

                  <StatusLine label="Workspace" value={workspaceStatus.path || workspaceSelection.cleaned || "Not set"} />
                  <StatusLine label="Updates" value={updateState} />
                </aside>}
              </div>
              )}
            </div>

            {compareMode && (
              <div className="wide-panel compare-panel">
                <PanelHeader icon={GitCompare} label="Change Compare" />
                <div className="compare-grid">
                  {changePreview.length > 0 ? (
                    changePreview.map((change) => (
                      <article className="compare-card" key={change.file}>
                        <header>
                          <strong>{change.file}</strong>
                          <span>{change.status}</span>
                        </header>
                        <div className="diff-columns">
                          <pre>{change.before}</pre>
                          <pre>{change.after}</pre>
                        </div>
                      </article>
                    ))
                  ) : (
                    <article className="compare-card empty">
                      <header>
                        <strong>No file changes yet</strong>
                        <span>waiting</span>
                      </header>
                      <p>When agents propose edits, they will appear here for review.</p>
                    </article>
                  )}
                </div>
              </div>
            )}
          </section>
        )}

        {active === "terminal" && (
          <section className="terminal-page">
            <div className="wide-panel terminal-panel">
              <PanelHeader icon={TerminalSquare} label="Workspace Terminal" />
              <div className="workspace-picker">
                <label htmlFor="workspace-path">Project folder</label>
                <div className="input-row">
                  <input
                    id="workspace-path"
                    value={workspaceInput}
                    onChange={(event) => setWorkspaceInput(event.target.value)}
                    placeholder="Choose a project folder"
                    spellCheck={false}
                  />
                  <button className="text-button" type="button" onClick={openWorkspaceFolder}>
                    <FolderOpen size={16} />
                    Open Folder
                  </button>
                  <button className="text-button primary" type="button" onClick={applyWorkspace}>
                    <FolderOpen size={16} />
                    Set Folder
                  </button>
                </div>
              </div>

              <div className="terminal-layout">
                <section className="terminal-screen" aria-label="JAWS terminal preview">
                  <div className="terminal-titlebar">
                    <span />
                    <span />
                    <span />
                    <strong>{workspaceStatus.valid ? workspaceStatus.name : workspaceSelection.name}</strong>
                  </div>
                  <pre>
{`$ ${workspaceStatus.tuiCommand || workspaceSelection.command}

Workspace: ${workspaceStatus.path || workspaceSelection.cleaned || "not set"}
Status: ${workspaceStatus.message}

JAWS will use this folder for chat, terminal, preview, and agent work.`}
                  </pre>
                </section>

                <aside className="terminal-side">
                  <div className={workspaceStatus.valid ? "workspace-state ready" : "workspace-state blocked"}>
                    {workspaceStatus.valid ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
                    <div>
                      <strong>{workspaceStatus.valid ? "Workspace ready" : "Workspace needed"}</strong>
                      <span>{workspaceStatus.message}</span>
                    </div>
                  </div>
                  <StatusLine label="Folder" value={workspaceStatus.path || workspaceSelection.cleaned || "Not set"} />
                  <StatusLine label="View" value="Built-in terminal" />
                  <StatusLine label="Command" value={workspaceStatus.tuiCommand || workspaceSelection.command} />
                  <button className="text-button" type="button" onClick={runWorkspaceSmoke}>
                    <RefreshCcw size={16} />
                    Test In Folder
                  </button>
                  {workspaceSmoke && (
                    <pre className="console">
                      {workspaceSmoke.ok
                        ? workspaceSmoke.stdout || `OpenJaws responded from ${workspaceStatus.path || workspaceSelection.cleaned}.`
                        : workspaceSmoke.stderr || "OpenJaws could not check this folder."}
                    </pre>
                  )}
                </aside>
              </div>
            </div>
          </section>
        )}

        {active === "preview" && (
          <section className="preview-page">
            <div className="wide-panel preview-panel">
              <div className="panel-header-row">
                <PanelHeader icon={MonitorPlay} label="Browser Preview" />
                <div className="button-row">
                  <button className="text-button" type="button" onClick={refreshBrowserPreview}>
                    <RefreshCcw size={16} />
                    Refresh
                  </button>
                  <button className="text-button primary" type="button" onClick={runBrowserPreviewCommand} disabled={previewBusy}>
                    <Play size={16} />
                    {previewBusy ? "Running" : "Run Preview"}
                  </button>
                </div>
              </div>

              <div className="preview-workbench">
                <section className="preview-stage" aria-label="Embedded browser preview">
                  <div className="browser-chrome">
                    <span />
                    <span />
                    <span />
                    <strong>{previewFrameUrl}</strong>
                  </div>
                  {previewCanRenderInline ? (
                    <iframe
                      title="JAWS browser preview"
                      src={previewFrameUrl}
                      sandbox="allow-forms allow-modals allow-pointer-lock allow-popups allow-same-origin allow-scripts"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="preview-external-card">
                      <MonitorPlay size={32} />
                      <strong>Open in native preview</strong>
                      <p>
                        External sites often block embedded frames. Local apps render here; public sites open in a
                        dedicated JAWS preview window and still write a browser history receipt.
                      </p>
                      <div className="button-row">
                        <button className="text-button primary" type="button" onClick={openNativeBrowserPreview}>
                          <ExternalLink size={16} />
                          Open Native
                        </button>
                        <button className="text-button" type="button" onClick={() => openExternal(previewFrameUrl)}>
                          <ExternalLink size={16} />
                          System Browser
                        </button>
                      </div>
                    </div>
                  )}
                </section>

                <aside className="preview-side">
                  <label>
                    Preview URL
                    <input value={previewUrl} onChange={(event) => setPreviewUrl(event.target.value)} spellCheck={false} />
                  </label>
                  <label>
                    Start command
                    <input
                      value={previewDevCommand}
                      onChange={(event) => setPreviewDevCommand(event.target.value)}
                      spellCheck={false}
                    />
                  </label>
                  <div className="button-row">
                    <button className="text-button" type="button" onClick={saveBrowserPreviewLaunchConfig}>
                      <CheckCircle2 size={16} />
                      Save Launch
                    </button>
                    <button className="text-button" type="button" onClick={writePlaywrightDemoHarness}>
                      <PackagePlus size={16} />
                      Create Website Test
                    </button>
                    <button className="text-button" type="button" onClick={stagePlaywrightDemoPrompt}>
                      <Bot size={16} />
                      Ask Agent to Test
                    </button>
                  </div>
                  <div className="browser-control-card">
                    <strong>Web Work</strong>
                    <span>
                      Search, read pages, collect public data, summarize videos, draft emails, or help with forms. JAWS stops before sends, purchases, uploads, account changes, or submissions.
                    </span>
                    <div className="browser-preset-grid" role="group" aria-label="Browser work type">
                      {browserWorkPresets.map((preset) => (
                        <button
                          className={browserPresetId === preset.id ? "browser-preset active" : "browser-preset"}
                          key={preset.id}
                          type="button"
                          onClick={() => {
                            setBrowserPresetId(preset.id);
                            if (!browserTaskInput.trim()) {
                              setBrowserTaskInput(defaultBrowserWorkTask(preset));
                            }
                          }}
                        >
                          <strong>{preset.shortLabel}</strong>
                          <small>{preset.description}</small>
                        </button>
                      ))}
                    </div>
                    <div className="stack-mode-row" role="group" aria-label="Browser control mode">
                      {browserControlModes.map((mode) => (
                        <button
                          className={browserControlMode === mode.id ? "theme-chip active" : "theme-chip"}
                          key={mode.id}
                          type="button"
                          title={mode.description}
                          onClick={() => setBrowserControlMode(mode.id)}
                        >
                          {mode.label}
                        </button>
                      ))}
                    </div>
                    <textarea
                      value={browserTaskInput}
                      onChange={(event) => setBrowserTaskInput(event.target.value)}
                      placeholder={browserWorkPreset.task}
                      rows={4}
                    />
                    <button className="text-button primary" type="button" onClick={stageBrowserControlPrompt}>
                      <Bot size={16} />
                      Start Web Work
                    </button>
                  </div>
                  {previewConfigResult && (
                    <div className={previewConfigResult.ok ? "workspace-state ready" : "workspace-state blocked"}>
                      {previewConfigResult.ok ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
                      <div>
                        <strong>{previewConfigResult.ok ? "Launch saved" : "Launch blocked"}</strong>
                        <span>{previewConfigResult.message}</span>
                      </div>
                    </div>
                  )}
                  {previewDemoResult && (
                    <div className={previewDemoResult.ok ? "workspace-state ready" : "workspace-state blocked"}>
                      {previewDemoResult.ok ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
                      <div>
                        <strong>{previewDemoResult.ok ? "Website test created" : "Website test blocked"}</strong>
                        <span>{previewDemoResult.ok ? previewDemoResult.outputDir : previewDemoResult.message}</span>
                      </div>
                    </div>
                  )}
                  <StatusLine label="Launch config" value={previewSnapshot.launchConfigExists ? previewSnapshot.launchConfigPath : "Not saved"} />
                  <StatusLine label="History" value={previewSnapshot.receiptExists ? previewSnapshot.receiptPath : "No runs yet"} />
                  <StatusLine label="Sessions" value={String(previewSnapshot.sessionCount)} />
                  <StatusLine label="Render mode" value={previewCanRenderInline ? "Embedded local app" : "Native external window"} />
                  {previewWindowResult && (
                    <div className={previewWindowResult.ok ? "workspace-state ready" : "workspace-state blocked"}>
                      {previewWindowResult.ok ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
                      <div>
                        <strong>{previewWindowResult.ok ? "Preview opened" : "Preview blocked"}</strong>
                        <span>{previewWindowResult.message}</span>
                      </div>
                    </div>
                  )}
                </aside>
              </div>
            </div>

            <div className="preview-bottom-grid">
              <section className="wide-panel playwright-panel">
                <PanelHeader icon={TerminalSquare} label="Website Test Tools" />
                <div className="command-stack">
                  <code>{previewDemoResult?.previewCommand || previewConfigResult?.previewCommand || previewSnapshot.previewCommand || `/preview ${previewFrameUrl}`}</code>
                  <code>{previewDemoResult?.playwrightInstallCommand || "bunx playwright install chromium"}</code>
                  <code>{previewDemoResult?.playwrightTestCommand || previewConfigResult?.playwrightTestCommand || previewSnapshot.playwrightTestCommand}</code>
                  <code>{previewDemoResult?.playwrightHeadedCommand || "bunx playwright test --headed"}</code>
                  <code>{previewDemoResult?.playwrightCodegenCommand || previewConfigResult?.playwrightCodegenCommand || previewSnapshot.playwrightCodegenCommand}</code>
                </div>
                {previewDemoResult?.ok && (
                  <div className="demo-artifact-grid">
                    <StatusLine label="Test folder" value={previewDemoResult.outputDir} />
                    <StatusLine label="Test file" value={previewDemoResult.specPath} />
                    <StatusLine label="History" value={previewDemoResult.receiptPath} />
                    <StatusLine label="Receipt ID" value={previewDemoResult.receiptHash} />
                  </div>
                )}
                {previewRunResult && (
                  <pre className={previewRunResult.ok ? "console success" : "console error"}>
                    {formatOpenJawsChatResult(previewRunResult)}
                  </pre>
                )}
              </section>

              <section className="wide-panel receipt-panel">
                <PanelHeader icon={Activity} label="Preview History" />
                <p className="panel-copy">{previewSnapshot.receiptSummary}</p>
                <div className="receipt-list">
                  {previewSnapshot.sessions.length > 0 ? (
                    previewSnapshot.sessions.map((session) => (
                      <article className="receipt-card" key={session.id || `${session.startedAt}-${session.url}`}>
                        <header>
                          <strong>{session.action || "preview"}</strong>
                          <span>{session.opened ? "opened" : "recorded"}</span>
                        </header>
                        <StatusLine label="By" value={session.requestedBy || "operator"} />
                        <StatusLine label="URL" value={session.url || previewFrameUrl} />
                        <small>{session.note || session.intent || session.startedAt}</small>
                      </article>
                    ))
                  ) : (
                    <article className="receipt-card empty">
                      <strong>No sessions yet</strong>
                      <span>{previewSnapshot.receiptSummary}</span>
                    </article>
                  )}
                </div>
              </section>
            </div>
          </section>
        )}

        {active === "context" && (
          <section className="context-page">
            <div className="wide-panel context-hero">
              <div className="panel-header-row">
                <PanelHeader icon={BrainCircuit} label="Context Brain" />
                <div className="button-row">
                  <button className="text-button" type="button" onClick={() => refreshProjectContext()} disabled={projectContextLoading}>
                    <RefreshCcw size={16} />
                    {projectContextLoading ? "Scanning" : "Refresh"}
                  </button>
                  <button className="text-button primary" type="button" onClick={stageContextAuditPrompt}>
                    <MessageSquare size={16} />
                    Review Scan
                  </button>
                </div>
              </div>
              <div className="context-score-row">
                <div className={`context-score ${contextCoverageTone(contextCoverage)}`}>
                  <strong>{projectContext.confidenceScore}%</strong>
                  <span>{contextLabel}</span>
                </div>
                <div>
                  <p>{projectContext.summary}</p>
                  <div className="context-meter">
                    <span style={{ width: `${Math.min(100, projectContext.confidenceScore)}%` }} />
                  </div>
                </div>
              </div>
              <div className="runtime-source-card">
                <StatusLine label="Workspace" value={projectContext.workspacePath || workspaceStatus.path || workspaceSelection.cleaned || "Not set"} />
                <StatusLine label="Checked" value={projectContext.checkedAt} />
                <StatusLine label="Files scanned" value={`${projectContext.scannedFiles}/${projectContext.totalFiles}`} />
                <StatusLine label="Skipped" value={String(projectContext.skippedFiles)} />
                <StatusLine label="Estimated context" value={formatTokenEstimate(projectContext.estimatedTokens)} />
                <StatusLine label="Budget used" value={`${contextBudgetPercent}%`} />
              </div>
              <div className="context-vision-map" aria-label="Context trust vision map">
                <div className="context-brain-core">
                  <BrainCircuit size={24} />
                  <strong>{contextLabel}</strong>
                  <span>{projectContext.source}</span>
                </div>
                {(projectContext.categories.length > 0 ? projectContext.categories : [{ id: "waiting", label: "Project scan", confidence: 0, includedCount: 0, fileCount: 0, estimatedTokens: 0, detail: "Open the JAWS desktop app to scan.", status: "blocked" }]).map((category, index) => (
                  <article
                    className={`context-orbit ${category.status}`}
                    key={category.id}
                    style={{ "--orbit-index": String(index) } as CSSProperties}
                  >
                    <strong>{category.label}</strong>
                    <span>{category.confidence}%</span>
                    <small>{category.includedCount}/{category.fileCount} files</small>
                  </article>
                ))}
              </div>
            </div>

            <div className="context-grid">
              <section className="wide-panel">
                <PanelHeader icon={Activity} label="Coverage Map" />
                <div className="context-category-grid">
                  {projectContext.categories.length > 0 ? (
                    projectContext.categories.map((category) => (
                      <article className={`context-category ${category.status}`} key={category.id}>
                        <header>
                          <strong>{category.label}</strong>
                          <span>{category.confidence}%</span>
                        </header>
                        <div className="context-meter">
                          <span style={{ width: `${category.confidence}%` }} />
                        </div>
                        <p>{category.detail}</p>
                        <small>
                          {category.includedCount}/{category.fileCount} files - {formatTokenEstimate(category.estimatedTokens)}
                        </small>
                      </article>
                    ))
                  ) : (
                    <article className="context-empty">
                      <strong>No context scan yet</strong>
                      <span>Open a folder and refresh to see what JAWS can read.</span>
                    </article>
                  )}
                </div>
              </section>

              <section className="wide-panel">
                <PanelHeader icon={FileTextIcon} label="Priority Files" />
                <div className="context-file-list">
                  {projectContext.priorityFiles.length > 0 ? (
                    projectContext.priorityFiles.map((file) => (
                      <article className="context-file" key={`${file.path}-${file.reason}`}>
                        <strong>{file.path}</strong>
                        <span>
                          {file.kind} - {file.reason} - {formatTokenEstimate(file.estimatedTokens)}
                        </span>
                      </article>
                    ))
                  ) : (
                    <article className="context-empty">
                      <strong>No priority files selected</strong>
                      <span>JAWS will surface project contracts, configs, tests, and core source here.</span>
                    </article>
                  )}
                </div>
              </section>
            </div>

            <div className="context-grid">
              <section className="wide-panel">
                <PanelHeader icon={ShieldCheck} label="Privacy Skips" />
                <div className="context-skip-list">
                  {projectContext.skipped.length > 0 ? (
                    projectContext.skipped.map((group) => (
                      <article className="context-skip" key={group.reason}>
                        <header>
                          <strong>{group.reason}</strong>
                          <span>{group.count}</span>
                        </header>
                        <small>{group.examples.join(", ") || "No examples"}</small>
                      </article>
                    ))
                  ) : (
                    <article className="context-empty">
                      <strong>No skips recorded</strong>
                      <span>Secrets, generated folders, binary assets, and oversized files will be listed here as metadata only.</span>
                    </article>
                  )}
                </div>
              </section>

              <section className="wide-panel">
                <PanelHeader icon={NetworkIcon} label="Context Sharing" />
                <div className="agent-timeline compact context-lanes">
                  {projectContext.brainLanes.map((lane) => (
                    <article className={`agent-event ${lane.status === "blocked" ? "blocked" : lane.status === "review" ? "waiting" : "active"}`} key={lane.label}>
                      <span>{lane.status}</span>
                      <strong>{lane.label}</strong>
                      <p>{lane.receives}</p>
                      <small>{lane.detail}</small>
                    </article>
                  ))}
                </div>
                <div className="context-notes">
                  {projectContext.notes.map((note) => (
                    <span key={note}>{note}</span>
                  ))}
                </div>
              </section>
            </div>
          </section>
        )}

        {active === "agents" && (
          <section className="split-view">
            <div className="wide-panel">
              <div className="panel-header-row">
                <PanelHeader icon={RadarIcon} label="Agent Watch" />
                <button className="text-button" type="button" onClick={refreshAgentRuntime} disabled={agentRuntimeLoading}>
                  <RefreshCcw size={16} />
                  {agentRuntimeLoading ? "Refreshing" : "Refresh"}
                </button>
              </div>
              <div className="runtime-source-card">
                <StatusLine label="Source" value={agentRuntime.source} />
                <StatusLine label="Checked" value={agentRuntime.checkedAt} />
                <StatusLine label="Waiting tasks" value={String(agentRuntime.queueCount)} />
                <StatusLine label="Workers" value={`${agentRuntime.workerCount} ready / ${agentRuntime.runtimeCount} running`} />
              </div>
              <p className="panel-copy">{agentRuntime.summary}</p>
              <div className="agent-timeline">
                {agentRuntime.events.map((event, index) => (
                  <article className={`agent-event ${event.state}`} key={`${event.time}-${event.lane}`}>
                    <span>{event.time}</span>
                    <strong>{event.lane}</strong>
                    <p>{event.detail}</p>
                    {index === 0 && agentRuntimeLoading && <small>Refreshing</small>}
                  </article>
                ))}
              </div>
            </div>
            <div className="wide-panel">
              <PanelHeader icon={BrainCircuit} label="Cognitive Runtime" />
              <div className={`cognitive-runtime-hero ${cognitiveRuntime.status}`}>
                <div>
                  <span>{cognitiveRuntime.status}</span>
                  <strong>{cognitiveRuntime.averageQuality}%</strong>
                  <small>Average score</small>
                </div>
                <p>{cognitiveRuntime.summary}</p>
              </div>
              <div className="runtime-source-card cognitive-metrics">
                <StatusLine label="Goals" value={String(cognitiveRuntime.goalCount)} />
                <StatusLine label="Decisions" value={String(cognitiveRuntime.decisionCount)} />
                <StatusLine label="Allowed" value={String(cognitiveRuntime.allowCount)} />
                <StatusLine label="Review" value={String(cognitiveRuntime.reviewCount)} />
                <StatusLine label="Delayed" value={String(cognitiveRuntime.delayCount)} />
                <StatusLine label="Denied" value={String(cognitiveRuntime.denyCount)} />
                <StatusLine label="Top risk" value={`Tier ${cognitiveRuntime.highestRiskTier}`} />
                <StatusLine label="Score" value={`${cognitiveRuntime.averageQuality}%`} />
              </div>
              <div className="cognitive-memory-grid">
                {cognitiveRuntime.memoryLayers.map((layer) => (
                  <article className={`cognitive-memory-card ${layer.status}`} key={layer.layer}>
                    <span>{layer.count}</span>
                    <strong>{layer.layer}</strong>
                    <p>{layer.detail}</p>
                  </article>
                ))}
              </div>
              <div className="cognitive-scorecards">
                {cognitiveRuntime.scorecards.length > 0 ? (
                  cognitiveRuntime.scorecards.map((scorecard) => (
                    <article className={`cognitive-scorecard ${scorecard.status}`} key={`${scorecard.goalId}-${scorecard.status}`}>
                      <header>
                        <strong>{scorecard.goalId}</strong>
                        <span>{scorecard.quality}%</span>
                      </header>
                      <p>{scorecard.detail}</p>
                      <small>
                        {scorecard.status} - risk tier {scorecard.riskTier}
                      </small>
                    </article>
                  ))
                ) : (
                  <article className="cognitive-scorecard waiting">
                    <strong>No scorecards yet</strong>
                    <p>Scorecards appear after governed Q routes are claimed.</p>
                  </article>
                )}
              </div>
            </div>
            <div className="wide-panel">
              <PanelHeader icon={NetworkIcon} label="Causal Trace" />
              <div className="agent-orchestration-board cognitive-trace-board">
                {cognitiveRuntime.trace.map((node, index) => (
                  <article className={`agent-orchestration-node ${node.state}`} key={`${node.kind}-${node.label}-${index}`}>
                    <span>{node.kind}</span>
                    <strong>{node.label}</strong>
                    <p>{node.detail}</p>
                    <small>{node.state}</small>
                  </article>
                ))}
              </div>
            </div>
            <div className="wide-panel">
              <PanelHeader icon={NetworkIcon} label="Agent Activity" />
              <div className="agent-orchestration-board">
                {agentRuntime.events.map((event, index) => (
                  <article className={`agent-orchestration-node ${event.state}`} key={`${event.time}-${event.lane}-${index}`}>
                    <span>{event.time}</span>
                    <strong>{event.lane}</strong>
                    <p>{event.detail}</p>
                    <small>{event.state}</small>
                  </article>
                ))}
                {agentRuntime.events.length === 0 && (
                  <article className="agent-orchestration-node blocked">
                    <span>idle</span>
                    <strong>No workers visible</strong>
                    <p>Open JAWS Desktop and refresh to see current agent work.</p>
                    <small>blocked</small>
                  </article>
                )}
              </div>
              <div className="policy-hint-list">
                {cognitiveRuntime.policyHints.map((hint) => (
                  <span key={hint}>{hint}</span>
                ))}
              </div>
            </div>
          </section>
        )}

        {active === "profiles" && (
          <section className="profiles-page">
            <div className="wide-panel profile-panel">
              <PanelHeader icon={UserRound} label="User Profile" />
              <div className="profile-editor">
                <label>
                  Display name
                  <input
                    value={userProfile.name}
                    onChange={(event) => setUserProfile((profile) => ({ ...profile, name: event.target.value }))}
                  />
                </label>
                <label>
                  Handle
                  <input
                    value={userProfile.handle}
                    onChange={(event) => setUserProfile((profile) => ({ ...profile, handle: event.target.value }))}
                  />
                </label>
                <label>
                  Focus
                  <input
                    value={userProfile.focus}
                    onChange={(event) => setUserProfile((profile) => ({ ...profile, focus: event.target.value }))}
                  />
                </label>
                <label>
                  Wallet ID
                  <input
                    value={userProfile.walletId}
                    onChange={(event) => setUserProfile((profile) => ({ ...profile, walletId: event.target.value }))}
                  />
                </label>
                <label className="profile-toggle">
                  <input
                    type="checkbox"
                    checked={userProfile.promotionOptIn}
                    onChange={(event) => setUserProfile((profile) => ({ ...profile, promotionOptIn: event.target.checked }))}
                  />
                  <span>Allow product updates, promotions, and follow-up emails</span>
                </label>
              </div>
              <div className="profile-stat-grid">
                <StatusLine label="Code tokens" value={String(pet.tokens)} />
                <StatusLine label="Wallet" value={userProfile.walletId || "Local wallet"} />
                <StatusLine label="Promotions" value={userProfile.promotionOptIn ? "Opted in" : "Off"} />
                <StatusLine label="Workspace" value={workspaceStatus.name || workspaceSelection.name} />
                <StatusLine label="Account" value={account?.email ?? "Local trial"} />
              </div>
            </div>

            <div className="wide-panel profile-panel">
              <PanelHeader icon={Bot} label="Agent Profiles" />
              <div className="agent-profile-grid">
                {agentProfiles.map((agent) => (
                  <article className="agent-profile-card" key={agent.name}>
                    <Bot size={18} />
                    <div>
                      <strong>{agent.name}</strong>
                      <span>{agent.role}</span>
                      <small>{agent.status}</small>
                    </div>
                    <meter min="0" max="100" value={agent.load} />
                  </article>
                ))}
              </div>
            </div>

            <div className="wide-panel profile-panel pet-profile-panel">
              <PanelHeader icon={Heart} label="Cyber Frog" />
              <CyberPet pet={pet} onFeed={feedPet} onTrain={trainPet} onEquip={equipPet} onDecorate={decoratePet} />
              <label className="pet-name-field">
                Companion name
                <input
                  value={pet.name}
                  onChange={(event) => setPet((current) => ({ ...current, name: event.target.value }))}
                />
              </label>
            </div>
          </section>
        )}

        {active === "studio" && (
          <section className="studio-grid">
            <div className="wide-panel">
              <PanelHeader icon={Film} label="Image Studio" />
              <StudioPreview mode="image" />
            </div>
            <div className="wide-panel">
              <PanelHeader icon={MonitorPlay} label="Video Studio" />
              <StudioPreview mode="video" />
            </div>
          </section>
        )}

        {active === "arcade" && (
          <section className="wide-panel arcade-panel">
            <PanelHeader icon={GamepadIcon} label="Arcade Bar" />
            <div className="arcade-tabs" role="tablist" aria-label="Arcade games">
              <button
                className={arcadeView === "slow-guy" ? "theme-chip active" : "theme-chip"}
                role="tab"
                aria-selected={arcadeView === "slow-guy"}
                aria-controls="slow-guy-panel"
                type="button"
                onClick={() => setArcadeView("slow-guy")}
              >
                Slow Guy
              </button>
              <button
                className={arcadeView === "holdem" ? "theme-chip active" : "theme-chip"}
                role="tab"
                aria-selected={arcadeView === "holdem"}
                aria-controls="holdem-panel"
                type="button"
                onClick={() => setArcadeView("holdem")}
              >
                Hold'em Roundtable
              </button>
              <button
                className={arcadeView === "world" ? "theme-chip active" : "theme-chip"}
                role="tab"
                aria-selected={arcadeView === "world"}
                aria-controls="world-panel"
                type="button"
                onClick={() => setArcadeView("world")}
              >
                3D Sandbox
              </button>
            </div>

            {arcadeView === "slow-guy" && (
              <div id="slow-guy-panel" role="tabpanel">
                <SlowGuyGame state={slowGuy} pet={pet} onAction={dispatchSlowGuy} onFeed={feedPet} onTrain={trainPet} onEquip={equipPet} onDecorate={decoratePet} />
              </div>
            )}

            {arcadeView === "holdem" && (
              <div id="holdem-panel" role="tabpanel">
                <HoldemRoundtable
                  table={holdemTable}
                  userTokens={pet.tokens}
                  onAction={actHoldem}
                  onAdvance={advanceHoldem}
                  onReset={resetHoldemRoom}
                  onOpenChat={() => {
                    setChatInput(`Open Hold'em room ${holdemTable.multiplayer.roomCode} chat and coordinate the table safely.`);
                    setActive("chat");
                  }}
                />
              </div>
            )}

            {arcadeView === "world" && (
              <div id="world-panel" role="tabpanel">
                <SandboxWorldFoundation pet={pet} />
              </div>
            )}
          </section>
        )}

        {active === "ledger" && (
          <section className="ledger-page">
            <div className="wide-panel ledger-hero">
              <div className="panel-header-row">
                <PanelHeader icon={ReceiptIcon} label="Arobi Ledger" />
                <button className="text-button" type="button" onClick={refreshLedger} disabled={ledgerLoading}>
                  <RefreshCcw size={16} />
                  {ledgerLoading ? "Reading" : "Refresh"}
                </button>
              </div>
              <p className="panel-copy">{ledgerSnapshot.summary}</p>
              <div className="runtime-source-card ledger-metrics">
                <StatusLine label="Events" value={String(ledgerSnapshot.eventCount)} />
                <StatusLine label="Agents" value={String(ledgerSnapshot.agentEventCount)} />
                <StatusLine label="Browser/tests" value={String(ledgerSnapshot.browserEventCount)} />
                <StatusLine label="Credits/account" value={String(ledgerSnapshot.creditEventCount)} />
                <StatusLine label="LAAS route" value={ledgerSnapshot.externalRouteConfigured ? "Configured" : "Local only"} />
                <StatusLine label="Checked" value={ledgerSnapshot.checkedAt} />
              </div>
              <StatusLine label="Source" value={ledgerSnapshot.source} />
              {ledgerSnapshot.warnings.length > 0 && (
                <div className="ledger-warning-list">
                  {ledgerSnapshot.warnings.map((warning) => (
                    <span key={warning}>{warning}</span>
                  ))}
                </div>
              )}
              <div className="link-row">
                {links.map((link) => (
                  <button className="text-button" type="button" key={link.url} onClick={() => openExternal(link.url)}>
                    <ExternalLink size={16} />
                    {link.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="wide-panel ledger-events-panel">
              <PanelHeader icon={CircleDot} label="Audit Events" />
              <div className="ledger-event-list">
                {ledgerSnapshot.events.length > 0 ? (
                  ledgerSnapshot.events.map((event) => (
                    <article className="ledger-event-card" key={`${event.surface}-${event.id}`}>
                      <header>
                        <strong>{event.action}</strong>
                        <span>{event.status}</span>
                      </header>
                      <div className="ledger-event-grid">
                        <StatusLine label="Actor" value={event.actor} />
                        <StatusLine label="Surface" value={event.surface} />
                        <StatusLine label="Risk" value={`Tier ${event.riskTier}`} />
                        <StatusLine label="Proof" value={event.proof} />
                      </div>
                      <p>{event.detail}</p>
                      <small>{event.time || event.id}</small>
                    </article>
                  ))
                ) : (
                  <article className="ledger-event-card empty">
                    <strong>No receipts found</strong>
                    <p>Run an agent task, browser preview, website test, checkout, or credit event to populate this audit view.</p>
                  </article>
                )}
              </div>
            </div>

            <div className="wide-panel">
              <PanelHeader icon={ShieldCheck} label="Account Boundary" />
              <div className="ledger-boundary-grid">
                <StatusLine label="Plan" value="JAWS IDE" />
                <StatusLine label="Trial" value="14 days" />
                <StatusLine label="Subscription" value="$12.99/mo" />
                <StatusLine label="Q credits" value="Separate balance" />
              </div>
              <p className="panel-copy">
                Chat, agent work, billing, and credit events stay as separate receipts. JAWS shows the proof here only
                after a local receipt exists or an Arobi LAAS route is configured.
              </p>
            </div>
          </section>
        )}

        {active === "cowork" && (
          <section className="cowork-page">
            <div className="wide-panel cowork-command">
              <div className="panel-header-row">
                <PanelHeader icon={UsersIcon} label="Q_agents Co-work" />
                <button className="text-button primary" type="button" onClick={stageQAgentsCoworkPrompt}>
                  <Zap size={16} />
                  Start Co-work
                </button>
              </div>

              <div className="pairing-card">
                <div>
                  <span>Exchange Code</span>
                  <strong>{coworkPlan.roomCode}</strong>
                </div>
                <div className="stack-mode-row" role="group" aria-label="Q_agents co-work mode">
                  {(["solo", "pair", "stacked"] as const).map((mode) => (
                    <button
                      className={coworkStackMode === mode ? "theme-chip active" : "theme-chip"}
                      key={mode}
                      type="button"
                      onClick={() => setCoworkStackMode(mode)}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>

              <div className="cowork-grid">
                <StatusLine label="Work rule" value={coworkPlan.routePolicy} />
                <StatusLine label="Shared notes" value={coworkPlan.sharedPhaseMemory ? "Shared" : "Local"} />
                <StatusLine label="Credits" value={coworkSharedCredits ? "Pooled by approval" : "Owner only"} />
                <StatusLine label="Workspace" value={workspaceStatus.path || workspaceSelection.cleaned || "Not set"} />
              </div>

              <label className="cowork-credit-toggle">
                <input
                  type="checkbox"
                  checked={coworkSharedCredits}
                  onChange={(event) => setCoworkSharedCredits(event.target.checked)}
                />
                <span>Allow pooled credits for this co-work room</span>
              </label>
            </div>

            <div className="wide-panel cowork-lanes">
              <PanelHeader icon={NetworkIcon} label="Worker Lanes" />
              <div className="cowork-control-grid">
                {coworkPlan.controls.map((control) => (
                  <button
                    className={coworkLaneEnabled[control.id] ? "cowork-control active" : "cowork-control"}
                    key={control.id}
                    type="button"
                    onClick={() => toggleCoworkLane(control.id)}
                  >
                    <span>{coworkLaneEnabled[control.id] ? "On" : "Off"}</span>
                    <strong>{control.label}</strong>
                    <small>{control.status}</small>
                    <p>{control.detail}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="wide-panel cowork-runbook">
              <PanelHeader icon={Bot} label="Runbook" />
              <div className="agent-timeline compact">
                <article className="agent-event active">
                  <span>01</span>
                  <strong>Q</strong>
                  <p>Break the request into clear jobs.</p>
                </article>
                <article className="agent-event waiting">
                  <span>02</span>
                  <strong>Q_agents</strong>
                  <p>Workers handle code, preview, safety, and test checks.</p>
                </article>
                <article className="agent-event active">
                  <span>03</span>
                  <strong>OpenCheek</strong>
                  <p>Shared notes keep everyone on the same page.</p>
                </article>
                <article className="agent-event active">
                  <span>04</span>
                  <strong>Immaculate</strong>
                  <p>Final checks stay attached before release.</p>
                </article>
              </div>
            </div>
          </section>
        )}

        {active === "market" && (
          <section className="market-grid">
            {marketplaceItems.map((item) => (
              <article className="market-card" key={item.title}>
                <span>{item.kind}</span>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
                <small>{item.trust}</small>
              </article>
            ))}
          </section>
        )}

        {active === "billing" && (
          <section className="wide-panel billing-panel">
            <PanelHeader icon={ShieldCheck} label="Billing" />
            <div className="price-lockup">
              <span>$</span>
              <strong>12.99</strong>
              <small>/month</small>
            </div>
            <p className="panel-copy">The IDE subscription stays flat. Q credits remain separate and visible before spend.</p>
            <button className="text-button primary" type="button" onClick={() => openExternal("https://qline.site/downloads/jaws")}>
              <ExternalLink size={16} />
              Download
            </button>
          </section>
        )}

        {active === "docs" && (
          <section className="docs-page">
            <div className="wide-panel docs-hero">
              <PanelHeader icon={FileTextIcon} label="Docs And Legal" />
              <div className="docs-brand-lockup">
                <JawsMark />
                <div>
                  <span className="settings-kicker">JAWS Desktop</span>
                  <h2>Built by AROBI TECHNOLOGY ALLIANCE A OPAL MAR GROUP CORPORATION NJ USA</h2>
                  <p className="panel-copy">
                    Clear rules, privacy notes, billing terms, and developer checks are available here before using agents, games, updates, or paid features.
                  </p>
                </div>
              </div>
            </div>

            <div className="docs-grid">
              {complianceDocuments.map((document) => (
                <article className="doc-card" key={document.title}>
                  <span>{document.tone}</span>
                  <h3>{document.title}</h3>
                  <p>{document.summary}</p>
                </article>
              ))}
            </div>

            <div className="wide-panel docs-dev-panel">
              <PanelHeader icon={TerminalSquare} label="Developer Docs" />
              <div className="dev-doc-grid">
                {developerDocuments.map((document) => (
                  <article className="dev-doc-card" key={document.label}>
                    <span>{document.label}</span>
                    <code>{document.command}</code>
                    <p>{document.detail}</p>
                  </article>
                ))}
              </div>
              <div className="button-row">
                <button className="text-button" type="button" onClick={() => openExternal("https://github.com/PossumXI/OpenJaws")}>
                  <ExternalLink size={16} />
                  GitHub
                </button>
                <button className="text-button" type="button" onClick={() => openExternal("https://qline.site/downloads/jaws")}>
                  <ExternalLink size={16} />
                  Qline Download
                </button>
                <button className="text-button" type="button" onClick={() => openExternal("https://iorch.net/downloads/jaws")}>
                  <ExternalLink size={16} />
                  Iorch Download
                </button>
              </div>
            </div>
          </section>
        )}

        {active === "settings" && (
          <section className="settings-grid">
            <div className="wide-panel settings-panel">
              <PanelHeader icon={Settings2} label="Settings" />
              <div className="settings-layout">
                <section className="settings-group">
                  <span className="settings-kicker">Release</span>
                  <StatusLine label="Installed" value={status.appVersion} />
                  <StatusLine label="Channel" value={status.updateChannel} />
                  <StatusLine label="Update" value={updateState} />
                  <StatusLine label="Notifications" value={notificationsArmed ? "Armed" : "Muted"} />
                  <StatusLine label="Desktop alerts" value={nativeNotificationPermission} />
                  <div className="button-row">
                    <button className="text-button primary" type="button" onClick={() => checkForUpdates()}>
                      <RadioTower size={16} />
                      {updateChecking ? "Checking" : "Check Updates"}
                    </button>
                    {pendingUpdate && (
                      <button className="text-button" type="button" onClick={installUpdate}>
                        <CheckCircle2 size={16} />
                        Install {pendingUpdate.version}
                      </button>
                    )}
                  </div>
                  <UpdatePipelinePanel entries={updatePipeline} releaseSites={status.releaseSites} />
                </section>

                <section className="settings-group inference-settings">
                  <span className="settings-kicker">AI Connection</span>
                  <StatusLine label="Provider" value={inferenceStatus.provider} />
                  <StatusLine label="Model" value={inferenceStatus.model} />
                  <StatusLine label="Sign-in" value={inferenceStatus.authLabel} />
                  <StatusLine label="Server" value={inferenceStatus.baseUrl} />

                  <div className="inference-form">
                    <label>
                      Provider
                      <select
                        value={inferenceProfile.provider}
                        onChange={(event) => updateInferenceProfile({ provider: event.target.value })}
                      >
                        {inferenceProviders.map((provider) => (
                          <option key={provider.id} value={provider.id}>
                            {provider.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Model
                      <input
                        value={inferenceProfile.model}
                        onChange={(event) => updateInferenceProfile({ model: event.target.value })}
                      />
                    </label>
                    <label className="full">
                      Server URL
                      <input
                        value={inferenceProfile.baseUrl}
                        onChange={(event) => updateInferenceProfile({ baseUrl: event.target.value })}
                      />
                    </label>
                    <label>
                      Mode
                      <select
                        value={inferenceProfile.routePolicy}
                        onChange={(event) =>
                          updateInferenceProfile({ routePolicy: event.target.value as InferenceProfile["routePolicy"] })
                        }
                      >
                        <option value="balanced">Balanced</option>
                        <option value="fast">Fast</option>
                        <option value="deep">Deep</option>
                      </select>
                    </label>
                    <label>
                      Temperature
                      <input
                        min="0"
                        max="2"
                        step="0.1"
                        type="number"
                        value={inferenceProfile.temperature}
                        onChange={(event) => updateInferenceProfile({ temperature: Number(event.target.value) })}
                      />
                    </label>
                    <label>
                      Max response length
                      <input
                        min="256"
                        max="65536"
                        step="256"
                        type="number"
                        value={inferenceProfile.maxOutputTokens}
                        onChange={(event) => updateInferenceProfile({ maxOutputTokens: Number(event.target.value) })}
                      />
                    </label>
                  </div>

                  <div className="button-row">
                    <button
                      className="text-button primary"
                      type="button"
                      disabled={inferenceChecking}
                      onClick={() => refreshInferenceStatus(false)}
                    >
                      <Gauge size={16} />
                      {inferenceChecking ? "Checking" : "Check Connection"}
                    </button>
                    <button
                      className="text-button"
                      type="button"
                      disabled={inferenceChecking}
                      onClick={() => refreshInferenceStatus(true)}
                    >
                      <RadioTower size={16} />
                      Test Connection
                    </button>
                    <button
                      className="text-button"
                      type="button"
                      onClick={() => stageInferenceCommand(buildProviderUseCommand(inferenceProfile))}
                    >
                      <Send size={16} />
                      Use Provider
                    </button>
                    <button
                      className="text-button"
                      type="button"
                      onClick={() => stageInferenceCommand(buildProviderBaseUrlCommand(inferenceProfile))}
                    >
                      <ExternalLink size={16} />
                      Save Server
                    </button>
                    <button
                      className="text-button"
                      type="button"
                      onClick={() => stageInferenceCommand(buildInferenceTuningPrompt(inferenceProfile, inferenceStatus))}
                    >
                      <Sparkles size={16} />
                      Prepare Setup
                    </button>
                  </div>

                  <div className="inference-receipt" data-state={inferenceStatus.state}>
                    <strong>{inferenceStatus.summary}</strong>
                    <pre>{inferenceStatus.detail}</pre>
                  </div>
                </section>

                <section className="settings-group">
                  <span className="settings-kicker">Account</span>
                  <StatusLine label="Signed in" value={account?.email ?? "No local account"} />
                  <StatusLine label="Role" value={account?.role ?? "Not enrolled"} />
                  <StatusLine label="Plan" value={account?.plan ?? "Trial"} />
                  <StatusLine label="Status" value={account?.status ?? "Local session needed"} />
                  <StatusLine label="Run mode" value={fastRunMode ? "Fast audited queue" : "Review prompts"} />
                </section>

                <section className="settings-group">
                  <NotificationList
                    notifications={notifications}
                    armed={notificationsArmed}
                    nativePermission={nativeNotificationPermission}
                    unreadCount={unreadNotificationCount}
                    onToggleArmed={toggleNotificationsArmed}
                    onClear={clearNotifications}
                    onDismiss={dismissNotification}
                    onMarkRead={markNotificationsRead}
                    onTest={() =>
                      triggerJawsNotification({
                        title: "Fireworks test",
                        detail: "JAWS notifications are armed for agent completion, human input, and release updates.",
                        tone: "complete"
                      })
                    }
                  />
                </section>

                <section className="settings-group">
                  <span className="settings-kicker">Appearance</span>
                  <div className="button-row">
                    <button className="text-button" type="button" onClick={() => setAppearance("dark")}>
                      <ShieldCheck size={16} />
                      Dark
                    </button>
                    <button className="text-button" type="button" onClick={() => setAppearance("light")}>
                      <Sparkles size={16} />
                      Light
                    </button>
                  </div>
                  <div className="theme-grid compact">
                    {layoutThemes.map((layout) => {
                      const Icon = layout.icon;
                      return (
                        <button
                          className={theme === layout.id ? "theme-chip active" : "theme-chip"}
                          key={layout.id}
                          type="button"
                          onClick={() => setTheme(layout.id)}
                        >
                          <Icon size={16} />
                          <span>{layout.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              </div>
            </div>

            <div className="wide-panel companion-panel">
              <PanelHeader icon={Zap} label="Digital Companion" />
              <CyberPet pet={pet} compact onFeed={feedPet} onTrain={trainPet} onEquip={equipPet} onDecorate={decoratePet} />
            </div>
          </section>
        )}

        {active === "layouts" && (
          <section className="wide-panel">
            <PanelHeader icon={Maximize2} label="Layouts" />
            <div className="theme-grid">
              {layoutThemes.map((layout) => {
                const Icon = layout.icon;
                return (
                  <button
                    className={theme === layout.id ? "theme-chip active" : "theme-chip"}
                    key={layout.id}
                    type="button"
                    onClick={() => setTheme(layout.id)}
                  >
                    <Icon size={16} />
                    <span>{layout.label}</span>
                    <small>{layout.description}</small>
                    <i style={{ background: layout.accent }} />
                  </button>
                );
              })}
            </div>
          </section>
        )}
      </section>
    </main>
  );
}

function PanelHeader({ icon: Icon, label }: { icon: typeof Activity; label: string }) {
  return (
    <div className="panel-header">
      <Icon size={18} />
      <h3>{label}</h3>
    </div>
  );
}

function JawsMark({ className = "" }: { className?: string }) {
  return (
    <div className={`jaws-mark ${className}`} aria-hidden="true">
      <span className="jaws-mark-fin" />
      <span className="jaws-mark-head" />
      <span className="jaws-mark-mouth">
        <i />
        <i />
        <i />
        <i />
        <i />
        <i />
      </span>
      <span className="jaws-mark-water" />
      <strong>JAWS</strong>
    </div>
  );
}

function MessageActivity({
  active,
  state,
  frame
}: {
  active: boolean;
  state: ChatMessage["state"];
  frame: number;
}) {
  return (
    <div className={`message-activity ${active ? "active" : ""} ${state}`} aria-label={`Message ${state}`}>
      <pre>{jawFrames[frame]}</pre>
    </div>
  );
}

function StatusLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="status-line">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function FireworkNotice({ notification }: { notification: JawsNotification }) {
  return (
    <div className={`firework-notice ${notification.tone}`} role="status" aria-live="polite">
      <div className="firework-burst">
        {Array.from({ length: 12 }, (_, index) => (
          <span key={index} style={{ rotate: `${index * 30}deg` }} />
        ))}
      </div>
      <div>
        <strong>{notification.title}</strong>
        <span>{notification.detail}</span>
      </div>
    </div>
  );
}

function NotificationList({
  notifications,
  armed,
  nativePermission,
  unreadCount,
  compact = false,
  onToggleArmed,
  onClear,
  onDismiss,
  onMarkRead,
  onTest
}: {
  notifications: JawsNotification[];
  armed: boolean;
  nativePermission: NativeNotificationPermission;
  unreadCount: number;
  compact?: boolean;
  onToggleArmed?: () => void;
  onClear?: () => void;
  onDismiss?: (id: string) => void;
  onMarkRead?: () => void;
  onTest: () => void;
}) {
  return (
    <div className={compact ? "notification-center compact" : "notification-center"}>
      <div className="panel-header-row">
        <PanelHeader icon={BellRing} label="Notifications" />
        <div className="button-row">
          {onToggleArmed && (
            <button className="text-button" type="button" onClick={onToggleArmed}>
              <BellRing size={16} />
              {armed ? "Mute" : "Arm"}
            </button>
          )}
          <button className="text-button" type="button" onClick={onTest}>
            <Sparkles size={16} />
            Test
          </button>
          {onClear && (
            <button className="text-button" type="button" onClick={onClear} disabled={notifications.length === 0}>
              Clear
            </button>
          )}
          {onMarkRead && (
            <button className="text-button" type="button" onClick={onMarkRead} disabled={unreadCount === 0}>
              Mark Read
            </button>
          )}
        </div>
      </div>
      <StatusLine label="Sound and fireworks" value={armed ? "Armed" : "Muted"} />
      <StatusLine label="Desktop alerts" value={nativePermission} />
      <StatusLine label="History" value={`${notifications.length} saved · ${unreadCount} unread`} />
      <div className="notification-list">
        {notifications.length > 0 ? (
          notifications.map((notification) => (
            <article className={`notification-card ${notification.tone} ${notification.readAt ? "read" : "unread"}`} key={notification.id}>
              <header>
                <strong>{notification.title}</strong>
                <span>{notification.readAt ? notification.time : `Unread · ${notification.time}`}</span>
                {onDismiss && (
                  <button className="icon-button mini" type="button" onClick={() => onDismiss(notification.id)} aria-label={`Dismiss ${notification.title}`}>
                    <XCircle size={14} />
                  </button>
                )}
              </header>
              <p>{notification.detail}</p>
            </article>
          ))
        ) : (
          <article className="notification-card empty">
            <strong>No notifications</strong>
            <p>Agent completion, human input, billing, updates, and release prompts will appear here.</p>
          </article>
        )}
      </div>
    </div>
  );
}

function CyberPet({
  pet,
  compact = false,
  onFeed,
  onTrain,
  onEquip,
  onDecorate
}: {
  pet: CyberPetState;
  compact?: boolean;
  onFeed: () => void;
  onTrain: () => void;
  onEquip: () => void;
  onDecorate: () => void;
}) {
  return (
    <div className={compact ? "cyber-pet compact" : "cyber-pet"}>
      <div className={`pet-stage ${pet.gear.replace(/\s/g, "-")} ${pet.decor.replace(/\s/g, "-")}`}>
        <div className="pet-decor left" />
        <div className="pet-decor right" />
        <div className="frog-body">
          <div className="frog-eye left">
            <span />
          </div>
          <div className="frog-eye right">
            <span />
          </div>
          <div className="frog-visor" />
          <div className="frog-mouth" />
          <div className="frog-chest">
            <span />
            <span />
            <span />
          </div>
          <div className="frog-gear" />
        </div>
        <div className="pet-egg">
          <span style={{ height: `${pet.egg}%` }} />
        </div>
      </div>
      <div className="pet-info">
        <span>Cyber Frog</span>
        <strong>{pet.name}</strong>
        <small>
          {pet.mood} - {pet.gear} - {pet.decor}
        </small>
      </div>
      <div className="pet-bars">
        <StatusLine label="Tokens" value={String(pet.tokens)} />
        <StatusLine label="Full" value={`${pet.fullness}%`} />
        <StatusLine label="Energy" value={`${pet.energy}%`} />
        <StatusLine label="Egg" value={`${pet.egg}%`} />
      </div>
      <div className="pet-actions">
        <button className="text-button" type="button" onClick={onFeed}>
          <Coffee size={15} />
          Feed
        </button>
        <button className="text-button" type="button" onClick={onTrain}>
          <Gauge size={15} />
          Train
        </button>
        <button className="text-button" type="button" onClick={onEquip}>
          <Crown size={15} />
          Gear
        </button>
        <button className="text-button" type="button" onClick={onDecorate}>
          <PackagePlus size={15} />
          Decor
        </button>
      </div>
    </div>
  );
}

function UpdatePipelinePanel({
  entries,
  releaseSites
}: {
  entries: UpdatePipelineEntry[];
  releaseSites: string[];
}) {
  return (
    <div className="update-pipeline">
      {entries.map((entry) => (
        <article className={`pipeline-step ${entry.status}`} key={entry.id}>
          <div className="pipeline-icon">
            {entry.status === "ok" ? (
              <CheckCircle2 size={16} />
            ) : entry.status === "error" ? (
              <XCircle size={16} />
            ) : entry.status === "checking" ? (
              <RefreshCcw size={16} />
            ) : (
              <CircleDot size={16} />
            )}
          </div>
          <div>
            <strong>{entry.label}</strong>
            <span>{entry.detail}</span>
          </div>
        </article>
      ))}
      <div className="release-mirrors">
        {(releaseSites.length > 0 ? releaseSites : fallbackStatus.releaseSites).map((site) => (
          <span key={site}>{site}</span>
        ))}
      </div>
    </div>
  );
}

function SlowGuyGame({
  state,
  pet,
  onAction,
  onFeed,
  onTrain,
  onEquip,
  onDecorate
}: {
  state: SlowGuyState;
  pet: CyberPetState;
  onAction: (action: SlowGuyAction) => void;
  onFeed: () => void;
  onTrain: () => void;
  onEquip: () => void;
  onDecorate: () => void;
}) {
  const laneNames = ["High lane", "Middle lane", "Low lane"];
  return (
    <div className="slow-guy-shell">
      <section className="slow-guy-main">
        <div className="slow-guy-scoreboard">
          <StatusLine label="Score" value={String(state.score)} />
          <StatusLine label="Best" value={String(state.bestScore)} />
          <StatusLine label="Level" value={String(state.level)} />
          <StatusLine label="Lives" value={`${state.lives}/3`} />
          <StatusLine label="Tokens" value={String(state.tokens)} />
          <StatusLine label="Combo" value={`x${state.combo}`} />
          <StatusLine label="Stamina" value={`${state.stamina}%`} />
        </div>

        <div className="slow-guy-objective">
          <strong>Slow Guy</strong>
          <span>{state.objective}</span>
          <small>{state.lastEvent}</small>
        </div>

        <div className={`arcade-stage slow-guy-stage ${state.gameOver ? "game-over" : ""}`} tabIndex={0}>
          <div className="slow-guy-skyline">
            <span />
            <span />
            <span />
          </div>
          {laneNames.map((lane, index) => (
            <div className="slow-lane" key={lane} style={{ top: `${19 + index * 31}%` }}>
              <span>{lane}</span>
            </div>
          ))}
          <div
            className={`slow-runner ${state.running ? "running" : ""} ${state.pose} ${state.shieldTicks > 0 ? "shielded" : ""}`}
            style={{ top: `${14 + state.lane * 31}%` }}
            aria-label={`Slow Guy in lane ${state.lane + 1}`}
          >
            <span />
          </div>
          <div className="slow-runner-shadow" style={{ top: `${27 + state.lane * 31}%` }} />
          {state.hazards.map((hazard) => (
            <span
              className={`slow-hazard ${hazard.type}`}
              key={hazard.id}
              style={{ left: `${hazard.x}%`, top: `${16 + hazard.lane * 31}%` }}
              title={hazard.type}
            />
          ))}
          {state.coins.map((coin) => (
            <span
              className="slow-coin"
              key={coin.id}
              style={{ left: `${coin.x}%`, top: `${17 + coin.lane * 31}%` }}
            />
          ))}
          <div className="slow-goal-line" />
          <div className="slow-stage-hud">
            <span>{state.distance}m</span>
            <span>{state.shieldTicks > 0 ? "shield" : state.running ? "run" : "paused"}</span>
          </div>
          {state.gameOver && (
            <div className="slow-game-over">
              <strong>Run ended</strong>
              <span>Reset and chase the 500 point objective.</span>
            </div>
          )}
        </div>

        <div className="slow-controls" aria-label="Slow Guy controls">
          <button className="text-button" type="button" aria-keyshortcuts="ArrowLeft" onClick={() => onAction("left")}>
            Left
          </button>
          <button className="text-button primary" type="button" aria-keyshortcuts="ArrowUp Space" onClick={() => onAction("jump")}>
            Jump
          </button>
          <button className="text-button" type="button" aria-keyshortcuts="ArrowDown S" onClick={() => onAction("duck")}>
            Duck
          </button>
          <button className="text-button" type="button" aria-keyshortcuts="ArrowRight" onClick={() => onAction("right")}>
            Right
          </button>
          <button className="text-button" type="button" aria-keyshortcuts="D" onClick={() => onAction("dash")}>
            Dash
          </button>
          <button className="text-button" type="button" aria-keyshortcuts="P" onClick={() => onAction("pause")}>
            {state.running ? <Pause size={15} /> : <Play size={15} />}
            {state.running ? "Pause" : "Resume"}
          </button>
          <button className="text-button" type="button" aria-keyshortcuts="R" onClick={() => onAction("reset")}>
            <RefreshCcw size={15} />
            Reset
          </button>
        </div>
      </section>

      <aside className="slow-guy-side">
        <CyberPet pet={pet} compact onFeed={onFeed} onTrain={onTrain} onEquip={onEquip} onDecorate={onDecorate} />
        <div className="control-card">
          <strong>Controls</strong>
          <span>Arrow keys move lanes. Space jumps. S ducks. D dashes. P pauses. R resets.</span>
        </div>
      </aside>
    </div>
  );
}

function HoldemRoundtable({
  table,
  userTokens,
  onAction,
  onAdvance,
  onReset,
  onOpenChat
}: {
  table: HoldemTableState;
  userTokens: number;
  onAction: (action: HoldemAction, amount?: number) => void;
  onAdvance: () => void;
  onReset: () => void;
  onOpenChat: () => void;
}) {
  const buttonLabel = table.phase === "lobby" ? "Deal Hand" : table.phase === "showdown" ? "Next Hand" : "Next Street";
  const userSeat = table.seats.find((seat) => seat.id === "seat-founder");
  const canAct = table.phase !== "lobby" && table.phase !== "showdown" && Boolean(userSeat && !userSeat.folded);
  return (
    <div className="holdem-shell">
      <section className="holdem-table-panel">
        <div className="holdem-topline">
          <div>
            <span>Texas Hold'em Dealer Roundtable</span>
            <strong>{table.multiplayer.roomCode}</strong>
          </div>
          <div>
            <span>{describeHoldemTransport(table.multiplayer.transport)}</span>
            <strong>{table.phase}</strong>
          </div>
          <div>
            <span>Pot</span>
            <strong>{table.pot}</strong>
          </div>
          <div>
            <span>Live bet</span>
            <strong>{table.currentBet}</strong>
          </div>
        </div>

        <div className="community-row" aria-label="Community cards">
          {table.communityCards.length > 0
            ? table.communityCards.map((card) => <PlayingCard card={card} key={card} />)
            : Array.from({ length: 5 }, (_, index) => <PlayingCard card="" hidden key={`slot-${index}`} />)}
        </div>

        <div className="holdem-seat-grid">
          {table.seats.map((seat) => (
            <article className={`holdem-seat ${seat.kind} ${seat.connected ? "connected" : "offline"}`} key={seat.id}>
              <header>
                <div>
                  <strong>{seat.name}</strong>
                  <span>{seat.kind === "open" ? "Invite ready" : seat.agentName ?? seat.petName ?? "Player"}</span>
                </div>
                <small>{seat.connected ? "online" : "open"}</small>
              </header>
              <div className="card-row">
                {seat.holeCards.length > 0 ? (
                  seat.holeCards.map((card) => (
                    <PlayingCard card={card} hidden={seat.kind === "agent" && table.phase !== "showdown"} key={card} />
                  ))
                ) : (
                  <>
                    <PlayingCard card="" hidden />
                    <PlayingCard card="" hidden />
                  </>
                )}
              </div>
              <StatusLine label="Chips" value={String(seat.chips)} />
              <StatusLine label="Bet" value={String(seat.currentBet)} />
              <div className="scope-row">
                {seat.secureScopes.slice(0, 3).map((scope) => (
                  <span key={scope}>{scope}</span>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <aside className="holdem-side">
        <div className="holdem-actions">
          <button className="text-button primary" type="button" onClick={onAdvance}>
            <Play size={15} />
            {buttonLabel}
          </button>
          <button className="text-button" type="button" onClick={onReset}>
            <RefreshCcw size={15} />
            New Room
          </button>
        </div>

        <div className="holdem-token-bank">
          <strong>Token Bank</strong>
          <span>Profile code tokens: {userTokens}</span>
          <span>Table chips: {userSeat?.chips ?? 0}</span>
          <span>Prize: winner earns code tokens, table chips settle in-game.</span>
        </div>

        <div className="holdem-control-grid" aria-label="Hold'em player actions">
          <button className="text-button" type="button" disabled={!canAct} onClick={() => onAction("hold")}>
            Hold
          </button>
          <button className="text-button" type="button" disabled={!canAct} onClick={() => onAction("check")}>
            Check
          </button>
          <button className="text-button" type="button" disabled={!canAct} onClick={() => onAction("pass")}>
            Pass
          </button>
          <button className="text-button primary" type="button" disabled={!canAct || table.currentBet > 0} onClick={() => onAction("bet", table.bigBlind)}>
            Bet {table.bigBlind}
          </button>
          <button className="text-button" type="button" disabled={!canAct} onClick={() => onAction("raise", table.minimumRaise)}>
            Raise {table.minimumRaise}
          </button>
        </div>

        <div className="holdem-status">
          <strong>{table.lastEvent}</strong>
          <span>Presence: {table.multiplayer.presence.join(", ")}</span>
          <span>Mode: {describeHoldemMode(table.multiplayer.mode)}</span>
        </div>

        {table.winners.length > 0 && (
          <div className="winner-list">
            <strong>Showdown</strong>
            {table.winners.map((winner) => (
              <span key={winner.seatId}>
                {winner.name}: {winner.description}
              </span>
            ))}
          </div>
        )}

        <div className="world-chat table-log">
          <div className="panel-header-row">
            <strong>Table Log</strong>
            <button className="text-button" type="button" onClick={onOpenChat}>
              <MessageSquare size={15} />
              Chat
            </button>
          </div>
          <div className="world-chat-log">
            {table.chat.map((message) => (
              <p className={message.channel} key={message.id}>
                <span>{message.speaker}</span>
                {message.body}
              </p>
            ))}
          </div>
        </div>

        <div className="sandbox-scope-card">
          <strong>Online Play Setup</strong>
          {table.sandbox.pendingReview.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
      </aside>
    </div>
  );
}

function PlayingCard({ card, hidden = false }: { card: string; hidden?: boolean }) {
  const red = card.endsWith("h") || card.endsWith("d");
  const rank = card[0] ?? "";
  const suit = card[1] ?? "";
  const suitMark: Record<string, string> = { s: "S", h: "H", d: "D", c: "C" };
  return (
    <span
      className={`playing-card ${hidden ? "hidden" : ""} ${red ? "red" : ""}`}
      aria-label={hidden || !card ? "Hidden card" : describeCard(card)}
    >
      {hidden || !card ? (
        "JAWS"
      ) : (
        <>
          <strong>{rank}</strong>
          <small>{suitMark[suit] ?? suit}</small>
        </>
      )}
    </span>
  );
}

function SandboxWorldFoundation({ pet }: { pet: CyberPetState }) {
  const nodes = [
    { label: "You", detail: "profile + credits", x: 12, y: 58 },
    { label: pet.name, detail: "pet presence", x: 32, y: 36 },
    { label: "Q", detail: "planner", x: 52, y: 54 },
    { label: "Agent Builder", detail: "skill review", x: 72, y: 28 },
    { label: "PvP Table", detail: "online room", x: 78, y: 68 }
  ];
  return (
    <div className="sandbox-world">
      <section className="world-stage" aria-label="Agent and pet world">
        <div className="world-floor" />
        {nodes.map((node) => (
          <div className="world-node" key={node.label} style={{ left: `${node.x}%`, top: `${node.y}%` }}>
            <strong>{node.label}</strong>
            <span>{node.detail}</span>
          </div>
        ))}
        <div className="world-link a" />
        <div className="world-link b" />
        <div className="world-link c" />
      </section>
      <aside className="agent-builder-panel">
        <strong>Agent Builder</strong>
        <span>Build a local agent profile before sharing it online.</span>
        <div className="builder-step ready">
          <CheckCircle2 size={15} />
          Allowed skills
        </div>
        <div className="builder-step ready">
          <CheckCircle2 size={15} />
          Project folder
        </div>
        <div className="builder-step">
          <CircleDot size={15} />
          Online sign-in
        </div>
        <div className="builder-step">
          <CircleDot size={15} />
          Pet and agent items
        </div>
      </aside>
    </div>
  );
}

function Node({ label }: { label: string }) {
  return (
    <div className="node">
      <span />
      <strong>{label}</strong>
    </div>
  );
}

function StudioPreview({ mode }: { mode: "image" | "video" }) {
  return (
    <div className={`studio-preview ${mode}`}>
      <div className="media-strip">
        <span />
        <span />
        <span />
      </div>
      <div>
        <strong>{mode === "image" ? "Image canvas" : "Video queue"}</strong>
        <p>{mode === "image" ? "Create images with your connected provider." : "Plan and export short videos."}</p>
      </div>
    </div>
  );
}

const RadarIcon = RadioTower;
const NetworkIcon = Activity;
const GamepadIcon = Zap;
const ReceiptIcon = ShieldCheck;
const UsersIcon = Activity;
const FileTextIcon = Settings2;
