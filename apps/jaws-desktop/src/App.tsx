import { useEffect, useMemo, useState, type FormEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { openUrl } from "@tauri-apps/plugin-opener";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import {
  Activity,
  BellRing,
  Bot,
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
  agentEvents,
  layoutThemes,
  marketplaceItems,
  navItems,
  systemLanes,
  type SectionId,
  type ThemeId
} from "./data";
import {
  addHoldemChat,
  advanceHoldemRound,
  advanceSlowGuy,
  createHoldemTable,
  createSlowGuyState,
  describeCard,
  type HoldemTableState,
  type SlowGuyAction,
  type SlowGuyState
} from "./games";
import { buildWorkspaceSelection, type TerminalPlatform } from "./workspace";

interface BackendStatus {
  appVersion: string;
  sidecarName: string;
  sidecarReady: boolean;
  sidecarMessage: string;
  updateChannel: string;
  releaseSites: string[];
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

interface ChatMessage {
  id: string;
  speaker: string;
  role: "user" | "agent" | "system";
  body: string;
  time: string;
  state: "done" | "thinking" | "queued";
  lane: string;
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
}

interface AgentProfile {
  name: string;
  role: string;
  status: string;
  load: number;
}

interface UpdatePipelineEntry {
  id: string;
  label: string;
  status: "ready" | "checking" | "ok" | "error" | "info";
  detail: string;
}

type ArcadeView = "slow-guy" | "holdem" | "world";

const fallbackStatus: BackendStatus = {
  appVersion: "0.1.2",
  sidecarName: "openjaws",
  sidecarReady: false,
  sidecarMessage: "Desktop preview running outside Tauri",
  updateChannel: "stable",
  releaseSites: ["https://qline.site/downloads/jaws", "https://iorch.net/downloads/jaws"]
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
  message: "Set a project folder to route OpenJaws like a local cd command.",
  tuiCommand: "openjaws"
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

const initialMessages: ChatMessage[] = [
  {
    id: "system-ready",
    speaker: "JAWS",
    role: "system",
    body: "Chat lane ready. Commands route through OpenJaws with Q, Q_agents, OpenCheek, and Immaculate visible in the work stream.",
    time: "now",
    state: "done",
    lane: "system"
  },
  {
    id: "agent-watch",
    speaker: "Q_agents",
    role: "agent",
    body: "Workspace watcher armed. Turn on compare mode to inspect file deltas while agents work.",
    time: "now",
    state: "queued",
    lane: "agents"
  }
];

const changePreview: ChangePreview[] = [
  {
    file: "src/orchestrator/dispatch.ts",
    status: "proposed",
    before: "dispatch(worker, task)",
    after: "dispatch(healthGate(worker), task, sharedPhaseMemory)"
  },
  {
    file: "apps/jaws-desktop/session.json",
    status: "local",
    before: "permissions: prompt",
    after: "permissions: review first or fast queue"
  },
  {
    file: "website/api/jaws/latest.json",
    status: "release",
    before: "notification: idle",
    after: "notification: update pipeline armed"
  }
];

const chatTools = [
  { label: "Inspect", prompt: "Inspect this workspace and tell me the safest next fix." },
  { label: "Code", prompt: "Implement the next high-value production change, then verify it." },
  { label: "Test", prompt: "Run the focused test suite, explain failures, and repair them." },
  { label: "Agents", prompt: "Spin up Q_agents for parallel review, implementation, and verification lanes." },
  { label: "Bench", prompt: "Run the benchmark harness once and capture actionable verifier output." },
  { label: "Ship", prompt: "Prepare release notes, tag the build, and verify updater metadata." }
];

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
  focus: "Ship clean releases"
};

const agentProfiles: AgentProfile[] = [
  { name: "Q", role: "Primary planner", status: "Thinking", load: 62 },
  { name: "Q_agents", role: "Parallel workers", status: "Standing by", load: 41 },
  { name: "OpenCheek", role: "Co-work loop", status: "Memory attached", load: 54 },
  { name: "Immaculate", role: "Crew pacing", status: "Ready", load: 28 }
];

const initialUpdatePipeline: UpdatePipelineEntry[] = [
  {
    id: "runtime",
    label: "Tauri updater",
    status: "ready",
    detail: "Waiting for a signed update check from the native runtime."
  },
  {
    id: "qline",
    label: "qline.site mirror",
    status: "ready",
    detail: "https://qline.site/downloads/jaws/latest.json"
  },
  {
    id: "iorch",
    label: "iorch.net mirror",
    status: "ready",
    detail: "https://iorch.net/downloads/jaws/latest.json"
  },
  {
    id: "github",
    label: "GitHub release",
    status: "ready",
    detail: "jaws-v0.1.2 signed assets"
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
  const output = result.stdout || result.stderr || "OpenJaws returned no text output.";
  const code = result.code === null ? "unknown" : String(result.code);
  return [
    result.summary,
    `Mode: ${result.permissionMode} - Exit: ${code}`,
    `Workspace: ${result.workspacePath || "not attached"}`,
    "",
    output
  ].join("\n");
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
  const [account, setAccount] = useState<AccountSession | null>(() => loadStoredAccountSession());
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(initialMessages);
  const [chatBusy, setChatBusy] = useState(false);
  const [compareMode, setCompareMode] = useState(() => localStorage.getItem("jaws.compareMode") === "true");
  const [fastRunMode, setFastRunMode] = useState(
    () =>
      localStorage.getItem("jaws.fastRunMode") === "true" ||
      localStorage.getItem("jaws.bypassPermissions") === "true"
  );
  const [notificationsArmed, setNotificationsArmed] = useState(
    () => localStorage.getItem("jaws.notificationsArmed") !== "false"
  );
  const [pet, setPet] = useState<CyberPetState>(() => loadStoredValue("jaws.cyberPet", defaultPet));
  const [userProfile, setUserProfile] = useState<UserProfile>(() =>
    loadStoredValue("jaws.userProfile", defaultUserProfile)
  );
  const [arcadeView, setArcadeView] = useState<ArcadeView>("slow-guy");
  const [slowGuy, setSlowGuy] = useState<SlowGuyState>(() => loadSlowGuyState());
  const [holdemTable, setHoldemTable] = useState<HoldemTableState>(() => loadHoldemTable("Founder"));
  const [holdemChatInput, setHoldemChatInput] = useState("");
  const [jawFrame, setJawFrame] = useState(0);

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
    localStorage.setItem("jaws.cyberPet", JSON.stringify(pet));
  }, [pet]);

  useEffect(() => {
    localStorage.setItem("jaws.userProfile", JSON.stringify(userProfile));
  }, [userProfile]);

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

  const activeTitle = useMemo(() => navItems.find((item) => item.id === active)?.label ?? "Control", [active]);
  const workspaceSelection = useMemo(
    () => buildWorkspaceSelection(workspaceInput, terminalPlatform()),
    [workspaceInput]
  );

  async function runSmoke() {
    if (!hasTauriRuntime()) {
      setSmoke({
        ok: false,
        code: null,
        stdout: "",
        stderr: "Run inside Tauri to execute the bundled OpenJaws sidecar."
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
          ? "Preview mode cannot validate the folder, but the command is ready for Tauri."
          : "Use an absolute project folder path before opening the TUI view.",
        tuiCommand: selection.command
      });
      return;
    }

    const result = await invoke<WorkspaceStatus>("validate_workspace", {
      path: selection.cleaned
    });
    setWorkspaceStatus(result);
    if (result.path) {
      setWorkspaceInput(result.path);
    }
  }

  async function openWorkspaceFolder() {
    if (!hasTauriRuntime()) {
      setWorkspaceStatus({
        path: workspaceSelection.cleaned,
        name: workspaceSelection.name,
        valid: false,
        message: "Open Folder uses the native Tauri desktop picker.",
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

    const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    setChatMessages((messages) => [
      ...messages,
      {
        id: `workspace-${Date.now()}`,
        speaker: "JAWS",
        role: "system",
        body: result.valid
          ? `Workspace opened: ${result.path}. Chat and TUI routes now use this project folder.`
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
        stderr: "Run inside Tauri to execute OpenJaws from the selected project folder."
      });
      return;
    }

    const result = await invoke<SidecarSmoke>("openjaws_smoke", {
      workspacePath: workspaceStatus.path || workspaceSelection.cleaned
    });
    setWorkspaceSmoke(result);
  }

  async function checkForUpdates() {
    setUpdateChecking(true);
    setPendingUpdate(null);
    if (!hasTauriRuntime()) {
      setUpdateState("Tauri runtime required");
      setUpdatePipeline([
        {
          id: "runtime",
          label: "Tauri updater",
          status: "error",
          detail: "The signed updater only runs inside the native JAWS desktop shell."
        },
        ...status.releaseSites.map((site) => ({
          id: site,
          label: site.includes("iorch") ? "iorch.net mirror" : "qline.site mirror",
          status: "info" as const,
          detail: site
        }))
      ]);
      setUpdateChecking(false);
      return;
    }

    try {
      setUpdatePipeline((entries) =>
        entries.map((entry) =>
          entry.id === "runtime"
            ? { ...entry, status: "checking", detail: "Calling Tauri updater.check() against signed endpoints." }
            : { ...entry, status: "checking" }
        )
      );
      const update = await check();
      setPendingUpdate(update);
      setUpdateState(update ? `Update ${update.version} ready` : "Current release");
      setUpdatePipeline((entries) =>
        entries.map((entry) =>
          entry.id === "runtime"
            ? {
                ...entry,
                status: "ok",
                detail: update
                  ? `Signed update ${update.version} is ready.`
                  : "No newer signed release was offered by the updater."
              }
            : { ...entry, status: "ok", detail: entry.detail }
        )
      );
    } catch (error) {
      const detail = String(error);
      setUpdateState(detail);
      setUpdatePipeline((entries) =>
        entries.map((entry) =>
          entry.id === "runtime"
            ? { ...entry, status: "error", detail }
            : { ...entry, status: "info", detail: entry.detail }
        )
      );
    } finally {
      setUpdateChecking(false);
    }
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

  async function submitChatCommand(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (chatBusy) return;
    const command = chatInput.trim();
    if (!command) return;

    const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const runMode = fastRunMode ? "fast queue" : "review first";
    const workspaceName = workspaceStatus.valid ? workspaceStatus.name : workspaceSelection.name;
    const baseId = Date.now();
    const qMessageId = `q-${baseId}`;
    const agentMessageId = `agents-${baseId}`;

    setChatMessages((messages) => [
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
        body: `Thinking through audited ${runMode}. Workspace: ${workspaceName || "not set"}.`,
        time,
        state: "thinking",
        lane: "q"
      },
      {
        id: agentMessageId,
        speaker: "Q_agents",
        role: "agent",
        body: compareMode
          ? "Standing up compare-aware worker lanes. Proposed edits stay visible beside the transcript."
          : "Standing up worker lanes. Compare mode is off, so edits can flow in the main workstream.",
        time,
        state: "queued",
        lane: "agents"
      }
    ]);
    setChatInput("");
    setChatBusy(true);
    setPet((current) => ({
      ...current,
      tokens: Math.min(999, current.tokens + 6),
      energy: Math.min(100, current.energy + 4),
      egg: Math.min(100, current.egg + 3),
      mood: "locked in"
    }));
    if (notificationsArmed) {
      setUpdateState("Notification queued: chat command routed");
    }

    if (hasTauriRuntime()) {
      try {
        const result = await invoke<OpenJawsChatResult>("run_openjaws_chat", {
          prompt: command,
          workspacePath: workspaceStatus.path || workspaceSelection.cleaned || null,
          fastRunMode
        });
        setChatMessages((messages) =>
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
                  ? "OpenJaws sidecar completed the Chat command. Review the Q lane output and continue from the same workspace."
                  : "OpenJaws sidecar blocked or failed the Chat command. The Q lane has the exact diagnostic.",
                state: "done"
              };
            }
            return message;
          })
        );
        setUpdateState(result.ok ? "OpenJaws Chat command completed" : "OpenJaws Chat command needs review");
      } catch (error) {
        setChatMessages((messages) =>
          messages.map((message) => {
            if (message.id === qMessageId) {
              return {
                ...message,
                body: `OpenJaws Chat command failed before the sidecar returned output.\n\n${String(error)}`,
                state: "done"
              };
            }
            if (message.id === agentMessageId) {
              return {
                ...message,
                body: "Desktop command bridge failed. Check the bundled sidecar and workspace settings.",
                state: "done"
              };
            }
            return message;
          })
        );
        setUpdateState("OpenJaws Chat command failed");
      } finally {
        setChatBusy(false);
      }
      return;
    }

    window.setTimeout(() => {
      setChatMessages((messages) =>
        messages.map((message) => {
          if (message.id === qMessageId) {
            return {
              ...message,
              body: `Routed through ${runMode}. Workspace: ${workspaceName || "not set"}. Next step is visible in the agent lane.`,
              state: "done"
            };
          }
          if (message.id === agentMessageId) {
            return {
              ...message,
              body: compareMode
                ? "Compare-aware worker lanes are live. File changes will surface in the delta rail before release."
                : "Worker lanes are live. JAWS will keep the transcript moving while agents report progress.",
              state: "thinking"
            };
          }
          return message;
        })
      );
    }, 650);
    window.setTimeout(() => {
      setChatMessages((messages) =>
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
    }, 1500);
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
    setSlowGuy((state) => advanceSlowGuy(state, action));
  }

  function advanceHoldem() {
    const next = advanceHoldemRound(holdemTable);
    setHoldemTable(next);
    if (next.phase === "showdown" && holdemTable.phase !== "showdown") {
      setPet((current) => ({
        ...current,
        tokens: Math.min(999, current.tokens + 12),
        mood: "table winner energy"
      }));
    }
  }

  function resetHoldemRoom() {
    setHoldemTable(createHoldemTable(userProfile.name || account?.displayName || "Founder", `jaws-holdem-${Date.now()}`));
  }

  function sendHoldemChat(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setHoldemTable((table) => addHoldemChat(table, userProfile.name || "Founder", holdemChatInput));
    setHoldemChatInput("");
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
            <button className="icon-button" type="button" onClick={() => setAppearance(appearance === "dark" ? "light" : "dark")} aria-label="Toggle light and dark mode">
              {appearance === "dark" ? <Sparkles size={18} /> : <ShieldCheck size={18} />}
            </button>
            <button className="text-button" type="button" onClick={() => openExternal("https://github.com/PossumXI/OpenJaws")}>
              <ExternalLink size={16} />
              GitHub
            </button>
          </div>
        </header>

        {active === "control" && (
          <section className="page-grid">
            <div className="hero-panel">
              <div>
                <p className="eyebrow">Native cockpit</p>
                <h3>OpenJaws backend, desktop controls, live release path.</h3>
                <p>
                  JAWS keeps the terminal engine behind a sidecar boundary while the desktop surface owns workspace
                  visibility, enrollment, marketplace, co-work, and studio lanes.
                </p>
              </div>
              <div className="status-stack">
                <JawsMark className="hero-logo" />
                <button className="text-button primary" type="button" onClick={runSmoke}>
                  <RefreshCcw size={16} />
                  Test Sidecar
                </button>
                <button className="text-button" type="button" onClick={checkForUpdates}>
                  <RadioTower size={16} />
                  Check Update
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
              <PanelHeader icon={Activity} label="Desktop Runtime" />
              <div className="runtime-grid">
                <StatusLine label="App version" value={status.appVersion} />
                <StatusLine label="Sidecar" value={status.sidecarReady ? "Ready" : "Pending"} />
                <StatusLine label="Sidecar detail" value={status.sidecarMessage} />
                <StatusLine label="Update channel" value={`${status.updateChannel}: ${updateState}`} />
              </div>
              {smoke && (
                <pre className="console">{smoke.ok ? smoke.stdout || "OpenJaws responded." : smoke.stderr || "Sidecar check failed."}</pre>
              )}
            </div>
          </section>
        )}

        {active === "chat" && (
          <section className="chat-page">
            <div className="wide-panel chat-panel">
              <PanelHeader icon={MessageSquare} label="Chat Window" />
              <div className="chat-layout">
                <section className="chat-main" aria-label="JAWS command chat">
                  <div className="chat-status slim">
                    <MessageActivity active={chatBusy} state={chatBusy ? "thinking" : "done"} frame={jawFrame} />
                    <div>
                      <span>Live Workstream</span>
                      <strong>{chatBusy ? "Q is thinking" : fastRunMode ? "Fast audited queue" : "Review first"}</strong>
                      <small>{notificationsArmed ? "Updates and notifications armed" : "Notifications muted"}</small>
                    </div>
                    <div className="chat-status-tools" aria-label="Chat state">
                      <span>{compareMode ? "Compare on" : "Compare off"}</span>
                      <span>{workspaceStatus.valid ? workspaceStatus.name : "No folder"}</span>
                    </div>
                  </div>

                  <div className="chat-transcript">
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
                      value={chatInput}
                      onChange={(event) => setChatInput(event.target.value)}
                      placeholder="Ask JAWS to inspect, code, test, run agents, or route work through Q."
                      rows={3}
                    />
                    <button className="text-button primary" type="submit" disabled={chatBusy}>
                      <Send size={16} />
                      {chatBusy ? "Running" : "Send"}
                    </button>
                  </form>
                </section>

                <aside className="chat-side">
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
                      TUI View
                    </button>
                    <button className="text-button" type="button" onClick={() => setCompareMode((value) => !value)}>
                      <GitCompare size={16} />
                      {compareMode ? "Compare On" : "Compare Off"}
                    </button>
                    <button className="text-button" type="button" onClick={() => setFastRunMode((value) => !value)}>
                      {fastRunMode ? <Send size={16} /> : <ShieldCheck size={16} />}
                      {fastRunMode ? "Fast Queue" : "Review"}
                    </button>
                    <button className="text-button" type="button" onClick={() => setNotificationsArmed((value) => !value)}>
                      <BellRing size={16} />
                      {notificationsArmed ? "Notify On" : "Notify Off"}
                    </button>
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
                </aside>
              </div>
            </div>

            {compareMode && (
              <div className="wide-panel compare-panel">
                <PanelHeader icon={GitCompare} label="Change Compare" />
                <div className="compare-grid">
                  {changePreview.map((change) => (
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
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {active === "terminal" && (
          <section className="terminal-page">
            <div className="wide-panel terminal-panel">
              <PanelHeader icon={TerminalSquare} label="Workspace TUI" />
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

This native view keeps the selected project folder attached before OpenJaws, Q, Immaculate, and ledger routes run.`}
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
                  <StatusLine label="View" value="Embedded TUI" />
                  <StatusLine label="Command" value={workspaceStatus.tuiCommand || workspaceSelection.command} />
                  <button className="text-button" type="button" onClick={runWorkspaceSmoke}>
                    <RefreshCcw size={16} />
                    Test In Folder
                  </button>
                  {workspaceSmoke && (
                    <pre className="console">
                      {workspaceSmoke.ok
                        ? workspaceSmoke.stdout || `OpenJaws responded from ${workspaceStatus.path || workspaceSelection.cleaned}.`
                        : workspaceSmoke.stderr || "Workspace sidecar check failed."}
                    </pre>
                  )}
                </aside>
              </div>
            </div>
          </section>
        )}

        {active === "agents" && (
          <section className="split-view">
            <div className="wide-panel">
              <PanelHeader icon={RadarIcon} label="Agent Watch" />
              <div className="agent-timeline">
                {agentEvents.map((event) => (
                  <article className={`agent-event ${event.state}`} key={`${event.time}-${event.lane}`}>
                    <span>{event.time}</span>
                    <strong>{event.lane}</strong>
                    <p>{event.detail}</p>
                  </article>
                ))}
              </div>
            </div>
            <div className="wide-panel">
              <PanelHeader icon={NetworkIcon} label="Orchestration" />
              <div className="orchestration-map">
                <Node label="Q" />
                <Node label="Q_agents" />
                <Node label="OpenCheek" />
                <Node label="Immaculate" />
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
              </div>
              <div className="profile-stat-grid">
                <StatusLine label="Code tokens" value={String(pet.tokens)} />
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
                type="button"
                onClick={() => setArcadeView("slow-guy")}
              >
                Slow Guy
              </button>
              <button
                className={arcadeView === "holdem" ? "theme-chip active" : "theme-chip"}
                type="button"
                onClick={() => setArcadeView("holdem")}
              >
                Hold'em Roundtable
              </button>
              <button
                className={arcadeView === "world" ? "theme-chip active" : "theme-chip"}
                type="button"
                onClick={() => setArcadeView("world")}
              >
                3D Sandbox
              </button>
            </div>

            {arcadeView === "slow-guy" && (
              <SlowGuyGame state={slowGuy} pet={pet} onAction={dispatchSlowGuy} onFeed={feedPet} onTrain={trainPet} onEquip={equipPet} onDecorate={decoratePet} />
            )}

            {arcadeView === "holdem" && (
              <HoldemRoundtable
                table={holdemTable}
                chatInput={holdemChatInput}
                onChatInput={setHoldemChatInput}
                onSendChat={sendHoldemChat}
                onAdvance={advanceHoldem}
                onReset={resetHoldemRoom}
              />
            )}

            {arcadeView === "world" && <SandboxWorldFoundation pet={pet} />}
          </section>
        )}

        {active === "ledger" && (
          <section className="split-view">
            <div className="wide-panel">
              <PanelHeader icon={ReceiptIcon} label="Arobi Ledger" />
              <p className="panel-copy">Enrollment and ledger status are kept outside local prompt history and attached by explicit user action.</p>
              <div className="link-row">
                {links.map((link) => (
                  <button className="text-button" type="button" key={link.url} onClick={() => openExternal(link.url)}>
                    <ExternalLink size={16} />
                    {link.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="wide-panel">
              <PanelHeader icon={CircleDot} label="Trial State" />
              <StatusLine label="Plan" value="JAWS IDE" />
              <StatusLine label="Trial" value="14 days" />
              <StatusLine label="Subscription" value="$12.99/mo" />
              <StatusLine label="Q credits" value="Separate balance" />
            </div>
          </section>
        )}

        {active === "cowork" && (
          <section className="wide-panel">
            <PanelHeader icon={UsersIcon} label="Shared Workspace" />
            <div className="pairing-card">
              <div>
                <span>Exchange Code</span>
                <strong>JWS-PAIR-READY</strong>
              </div>
              <button className="text-button primary" type="button">
                <Zap size={16} />
                Start Pairing
              </button>
            </div>
            <div className="cowork-grid">
              <StatusLine label="Shared agents" value="Stacked by workspace policy" />
              <StatusLine label="Credits" value="Explicit pooled session" />
              <StatusLine label="Immaculate" value="Co-worker route lane" />
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
                  <div className="button-row">
                    <button className="text-button primary" type="button" onClick={checkForUpdates}>
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

                <section className="settings-group">
                  <span className="settings-kicker">Account</span>
                  <StatusLine label="Signed in" value={account?.email ?? "No local account"} />
                  <StatusLine label="Role" value={account?.role ?? "Not enrolled"} />
                  <StatusLine label="Plan" value={account?.plan ?? "Trial"} />
                  <StatusLine label="Status" value={account?.status ?? "Local session needed"} />
                  <StatusLine label="Run mode" value={fastRunMode ? "Fast audited queue" : "Review prompts"} />
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
          <StatusLine label="Distance" value={`${state.distance}m`} />
          <StatusLine label="Combo" value={`x${state.combo}`} />
          <StatusLine label="Stamina" value={`${state.stamina}%`} />
        </div>

        <div className="slow-guy-objective">
          <strong>Slow Guy</strong>
          <span>{state.objective}</span>
          <small>{state.lastEvent}</small>
        </div>

        <div className={`arcade-stage slow-guy-stage ${state.gameOver ? "game-over" : ""}`}>
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
            className={`slow-runner ${state.running ? "running" : ""} ${state.pose}`}
            style={{ top: `${14 + state.lane * 31}%` }}
            aria-label={`Slow Guy in lane ${state.lane + 1}`}
          >
            <span />
          </div>
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
          {state.gameOver && (
            <div className="slow-game-over">
              <strong>Run ended</strong>
              <span>Reset and chase the 500 point objective.</span>
            </div>
          )}
        </div>

        <div className="slow-controls" aria-label="Slow Guy controls">
          <button className="text-button" type="button" onClick={() => onAction("left")}>
            Left
          </button>
          <button className="text-button primary" type="button" onClick={() => onAction("jump")}>
            Jump
          </button>
          <button className="text-button" type="button" onClick={() => onAction("duck")}>
            Duck
          </button>
          <button className="text-button" type="button" onClick={() => onAction("right")}>
            Right
          </button>
          <button className="text-button" type="button" onClick={() => onAction("dash")}>
            Dash
          </button>
          <button className="text-button" type="button" onClick={() => onAction("pause")}>
            {state.running ? <Pause size={15} /> : <Play size={15} />}
            {state.running ? "Pause" : "Resume"}
          </button>
          <button className="text-button" type="button" onClick={() => onAction("reset")}>
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
  chatInput,
  onChatInput,
  onSendChat,
  onAdvance,
  onReset
}: {
  table: HoldemTableState;
  chatInput: string;
  onChatInput: (value: string) => void;
  onSendChat: (event: FormEvent<HTMLFormElement>) => void;
  onAdvance: () => void;
  onReset: () => void;
}) {
  const buttonLabel = table.phase === "lobby" ? "Deal Hand" : table.phase === "showdown" ? "Next Hand" : "Next Street";
  return (
    <div className="holdem-shell">
      <section className="holdem-table-panel">
        <div className="holdem-topline">
          <div>
            <span>Texas Hold'em Dealer Roundtable</span>
            <strong>{table.multiplayer.roomCode}</strong>
          </div>
          <div>
            <span>{table.multiplayer.transport}</span>
            <strong>{table.phase}</strong>
          </div>
          <div>
            <span>Pot</span>
            <strong>{table.pot}</strong>
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

        <div className="holdem-status">
          <strong>{table.lastEvent}</strong>
          <span>Presence: {table.multiplayer.presence.join(", ")}</span>
          <span>Mode: {table.multiplayer.mode}</span>
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

        <div className="world-chat">
          <strong>Table Chat</strong>
          <div className="world-chat-log">
            {table.chat.map((message) => (
              <p className={message.channel} key={message.id}>
                <span>{message.speaker}</span>
                {message.body}
              </p>
            ))}
          </div>
          <form className="holdem-chat-form" onSubmit={onSendChat}>
            <input
              value={chatInput}
              onChange={(event) => onChatInput(event.target.value)}
              placeholder="Chat at the table"
            />
            <button className="text-button" type="submit">
              <Send size={15} />
            </button>
          </form>
        </div>

        <div className="sandbox-scope-card">
          <strong>Secure PvP Foundation</strong>
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
    { label: "Agent Forge", detail: "capability review", x: 72, y: 28 },
    { label: "PvP Table", detail: "room auth", x: 78, y: 68 }
  ];
  return (
    <div className="sandbox-world">
      <section className="world-stage" aria-label="Agent and pet sandbox foundation">
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
        <strong>Sandbox Agent Builder</strong>
        <span>Agents start as signed local profiles before entering shared rooms.</span>
        <div className="builder-step ready">
          <CheckCircle2 size={15} />
          Capability manifest
        </div>
        <div className="builder-step ready">
          <CheckCircle2 size={15} />
          Workspace scope
        </div>
        <div className="builder-step">
          <CircleDot size={15} />
          Multiplayer auth lane
        </div>
        <div className="builder-step">
          <CircleDot size={15} />
          Pet and agent inventory ledger
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
        <strong>{mode === "image" ? "Prompt canvas" : "Render queue"}</strong>
        <p>{mode === "image" ? "Provider-gated image workbench" : "Storyboard and export lane"}</p>
      </div>
    </div>
  );
}

const RadarIcon = RadioTower;
const NetworkIcon = Activity;
const GamepadIcon = Zap;
const ReceiptIcon = ShieldCheck;
const UsersIcon = Activity;
