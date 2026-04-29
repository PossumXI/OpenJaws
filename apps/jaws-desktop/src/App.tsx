import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { check } from "@tauri-apps/plugin-updater";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  Activity,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  ExternalLink,
  Film,
  Maximize2,
  MonitorPlay,
  Pause,
  Play,
  RadioTower,
  RefreshCcw,
  ShieldCheck,
  Sparkles,
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

const fallbackStatus: BackendStatus = {
  appVersion: "0.1.0",
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

function hasTauriRuntime() {
  return "__TAURI_INTERNALS__" in window;
}

function toneLabel(tone: "good" | "warn" | "neutral") {
  if (tone === "good") return "Ready";
  if (tone === "warn") return "Review";
  return "Queued";
}

export function App() {
  const [active, setActive] = useState<SectionId>("control");
  const [collapsed, setCollapsed] = useState(false);
  const [appearance, setAppearance] = useState<"dark" | "light">("dark");
  const [theme, setTheme] = useState<ThemeId>("default");
  const [status, setStatus] = useState<BackendStatus>(fallbackStatus);
  const [links, setLinks] = useState<EnrollmentLink[]>(fallbackLinks);
  const [smoke, setSmoke] = useState<SidecarSmoke | null>(null);
  const [updateState, setUpdateState] = useState("Not checked");
  const [arcadeRunning, setArcadeRunning] = useState(true);

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
  }, []);

  const activeTitle = useMemo(() => navItems.find((item) => item.id === active)?.label ?? "Control", [active]);

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

    const result = await invoke<SidecarSmoke>("openjaws_smoke");
    setSmoke(result);
  }

  async function checkForUpdates() {
    if (!hasTauriRuntime()) {
      setUpdateState("Tauri runtime required");
      return;
    }

    try {
      const update = await check();
      setUpdateState(update ? `Update ${update.version} ready` : "Current release");
    } catch (error) {
      setUpdateState(String(error));
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
            <div className="arcade-stage">
              <div className={arcadeRunning ? "runner running" : "runner"} />
              <div className="track">
                <span />
                <span />
                <span />
                <span />
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
