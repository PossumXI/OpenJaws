import { useEffect, useMemo, useState, type FormEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { openUrl } from "@tauri-apps/plugin-opener";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import {
  Activity,
  BellRing,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  CircleDot,
  ExternalLink,
  Film,
  FolderOpen,
  GitCompare,
  Maximize2,
  MessageSquare,
  MonitorPlay,
  Pause,
  Play,
  RadioTower,
  RefreshCcw,
  Settings2,
  ShieldCheck,
  Send,
  Sparkles,
  TerminalSquare,
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
import { buildWorkspaceSelection, type TerminalPlatform } from "./workspace";
import cyberFrog from "./assets/cyber-frog.svg";
import jawsLogo from "./assets/jaws-logo.svg";

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
}

interface ChangePreview {
  file: string;
  status: string;
  before: string;
  after: string;
}

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
    time: "now"
  },
  {
    id: "agent-watch",
    speaker: "Q_agents",
    role: "agent",
    body: "Workspace watcher armed. Turn on compare mode to inspect file deltas while agents work.",
    time: "now"
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
  const [pendingUpdate, setPendingUpdate] = useState<Update | null>(null);
  const [arcadeRunning, setArcadeRunning] = useState(true);
  const [slowGuyScore, setSlowGuyScore] = useState(12);
  const [account, setAccount] = useState<AccountSession | null>(() => loadStoredAccountSession());
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(initialMessages);
  const [compareMode, setCompareMode] = useState(() => localStorage.getItem("jaws.compareMode") === "true");
  const [fastRunMode, setFastRunMode] = useState(
    () =>
      localStorage.getItem("jaws.fastRunMode") === "true" ||
      localStorage.getItem("jaws.bypassPermissions") === "true"
  );
  const [notificationsArmed, setNotificationsArmed] = useState(
    () => localStorage.getItem("jaws.notificationsArmed") !== "false"
  );
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
    if (!arcadeRunning) return;
    const timer = window.setInterval(() => {
      setSlowGuyScore((score) => (score + 1) % 1000);
    }, 1400);
    return () => window.clearInterval(timer);
  }, [arcadeRunning]);

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
        time
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
    if (!hasTauriRuntime()) {
      setUpdateState("Tauri runtime required");
      return;
    }

    try {
      const update = await check();
      setPendingUpdate(update);
      setUpdateState(update ? `Update ${update.version} ready` : "Current release");
    } catch (error) {
      setUpdateState(String(error));
    }
  }

  async function installUpdate() {
    if (!pendingUpdate) {
      setUpdateState("No update selected");
      return;
    }
    setUpdateState(`Downloading ${pendingUpdate.version}`);
    await pendingUpdate.downloadAndInstall((event) => {
      if (event.event === "Started") setUpdateState(`Downloading ${pendingUpdate.version}`);
      if (event.event === "Progress") setUpdateState(`Downloading ${pendingUpdate.version}`);
      if (event.event === "Finished") setUpdateState("Installing update");
    });
    setUpdateState("Update installed. Restart JAWS to finish.");
  }

  function submitChatCommand(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const command = chatInput.trim();
    if (!command) return;

    const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const runMode = fastRunMode ? "fast queue" : "review first";
    const workspaceName = workspaceStatus.valid ? workspaceStatus.name : workspaceSelection.name;

    setChatMessages((messages) => [
      ...messages,
      {
        id: `user-${Date.now()}`,
        speaker: account?.displayName || "You",
        role: "user",
        body: command,
        time
      },
      {
        id: `q-${Date.now()}`,
        speaker: "Q",
        role: "agent",
        body: `Queued through audited ${runMode}. Workspace: ${workspaceName || "not set"}.`,
        time
      },
      {
        id: `agents-${Date.now()}`,
        speaker: "Q_agents",
        role: "agent",
        body: compareMode
          ? "Change compare mode is active. Proposed edits will stay visible beside the transcript."
          : "Work stream active. Compare mode is off, so edits can flow without the side-by-side review pane.",
        time
      }
    ]);
    setChatInput("");
    if (notificationsArmed) {
      setUpdateState("Notification queued: chat command routed");
    }
  }

  async function openExternal(url: string) {
    if (hasTauriRuntime()) {
      await openUrl(url);
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <main className="shell">
      <aside className={collapsed ? "sidebar collapsed" : "sidebar"}>
        <div className="brand-row">
          <img className="brand-mark" src={jawsLogo} alt="" aria-hidden="true" />
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
                <img className="hero-logo" src={jawsLogo} alt="JAWS blue shark jaws logo" />
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
                  <div className="chat-status">
                    <pre className="jaw-spinner" aria-label="JAWS spinner">
                      {jawFrames[jawFrame]}
                    </pre>
                    <div>
                      <span>Live Workstream</span>
                      <strong>{fastRunMode ? "Fast queue" : "Review first"}</strong>
                      <small>{notificationsArmed ? "Updates and notifications armed" : "Notifications muted"}</small>
                    </div>
                  </div>

                  <div className="chat-transcript">
                    {chatMessages.map((message) => (
                      <article className={`chat-message ${message.role}`} key={message.id}>
                        <header>
                          <strong>{message.speaker}</strong>
                          <span>{message.time}</span>
                        </header>
                        <p>{message.body}</p>
                      </article>
                    ))}
                  </div>

                  <form className="chat-input" onSubmit={submitChatCommand}>
                    <textarea
                      value={chatInput}
                      onChange={(event) => setChatInput(event.target.value)}
                      placeholder="Ask JAWS to inspect, code, test, run agents, or route work through Q."
                      rows={3}
                    />
                    <button className="text-button primary" type="submit">
                      <Send size={16} />
                      Send
                    </button>
                  </form>
                </section>

                <aside className="chat-side">
                  <button className="text-button primary" type="button" onClick={openWorkspaceFolder}>
                    <FolderOpen size={16} />
                    Open Folder
                  </button>
                  <button className="text-button primary" type="button" onClick={() => setActive("terminal")}>
                    <TerminalSquare size={16} />
                    Switch To TUI
                  </button>
                  <button className="text-button" type="button" onClick={() => setCompareMode((value) => !value)}>
                    <GitCompare size={16} />
                    {compareMode ? "Hide Compare" : "Show Compare"}
                  </button>
                  <button className="text-button" type="button" onClick={() => setFastRunMode((value) => !value)}>
                    {fastRunMode ? <Send size={16} /> : <ShieldCheck size={16} />}
                    {fastRunMode ? "Fast Queue" : "Review First"}
                  </button>
                  <button className="text-button" type="button" onClick={() => setNotificationsArmed((value) => !value)}>
                    <BellRing size={16} />
                    {notificationsArmed ? "Notify On" : "Notify Off"}
                  </button>
                  <StatusLine label="Workspace" value={workspaceStatus.path || workspaceSelection.cleaned || "Not set"} />
                  <StatusLine label="Agents" value="Q, Q_agents, OpenCheek" />
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
            <div className="slow-guy-header">
              <div>
                <span>Retro wait game</span>
                <strong>Slow Guy</strong>
              </div>
              <div className="slow-guy-stats">
                <StatusLine label="Score" value={String(slowGuyScore)} />
                <StatusLine label="Patience" value={arcadeRunning ? "Steady" : "Paused"} />
              </div>
            </div>
            <div className="arcade-layout">
              <div className="arcade-stage">
                <div className="slow-guy-skyline">
                  <span />
                  <span />
                  <span />
                </div>
                <div className={arcadeRunning ? "runner running" : "runner"} />
                <div className="slow-guy-pack" />
                <div className="track">
                  <span />
                  <span />
                  <span />
                  <span />
                </div>
              </div>
              <div className="companion-card compact">
                <img src={cyberFrog} alt="JAWS cyber frog companion" />
                <div>
                  <span>Companion</span>
                  <strong>Cyber Frog</strong>
                  <small>Ready</small>
                </div>
              </div>
            </div>
            <button className="text-button" type="button" onClick={() => setArcadeRunning((value) => !value)}>
              {arcadeRunning ? <Pause size={16} /> : <Play size={16} />}
              {arcadeRunning ? "Pause" : "Play"}
            </button>
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
                      Check Updates
                    </button>
                    {pendingUpdate && (
                      <button className="text-button" type="button" onClick={installUpdate}>
                        <CheckCircle2 size={16} />
                        Install {pendingUpdate.version}
                      </button>
                    )}
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
                          {layout.label}
                        </button>
                      );
                    })}
                  </div>
                </section>
              </div>
            </div>

            <div className="wide-panel companion-panel">
              <PanelHeader icon={Zap} label="Digital Companion" />
              <div className="companion-card">
                <img src={cyberFrog} alt="JAWS cyber frog companion" />
                <div>
                  <span>Included Asset</span>
                  <strong>Cyber Frog</strong>
                  <small>Unified JAWS blue, teal, and graphite palette</small>
                </div>
              </div>
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
                    {layout.label}
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

function StatusLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="status-line">
      <span>{label}</span>
      <strong>{value}</strong>
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
