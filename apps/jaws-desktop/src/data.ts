import {
  BadgeDollarSign,
  Boxes,
  BrainCircuit,
  Brush,
  CircuitBoard,
  Clapperboard,
  Code2,
  FileText,
  Gamepad2,
  Handshake,
  LayoutDashboard,
  LockKeyhole,
  MessageSquare,
  MonitorPlay,
  Moon,
  Network,
  Puzzle,
  Radar,
  ReceiptText,
  Settings2,
  Sparkles,
  Sun,
  TerminalSquare,
  UserRound,
  Users
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type SectionId =
  | "control"
  | "chat"
  | "terminal"
  | "preview"
  | "context"
  | "agents"
  | "profiles"
  | "studio"
  | "arcade"
  | "ledger"
  | "cowork"
  | "market"
  | "billing"
  | "docs"
  | "settings"
  | "layouts";

export type ThemeId = "default" | "spy" | "scifi" | "halloween" | "hacking" | "coding";

export interface NavItem {
  id: SectionId;
  label: string;
  icon: LucideIcon;
}

export interface SystemLane {
  label: string;
  value: string;
  tone: "good" | "warn" | "neutral";
  icon: LucideIcon;
}

export interface AgentEvent {
  time: string;
  lane: string;
  detail: string;
  state: "active" | "waiting" | "blocked";
}

export interface MarketplaceItem {
  title: string;
  kind: string;
  trust: string;
  description: string;
}

export interface LayoutTheme {
  id: ThemeId;
  label: string;
  icon: LucideIcon;
  description: string;
  accent: string;
}

export const navItems: NavItem[] = [
  { id: "control", label: "Control", icon: LayoutDashboard },
  { id: "chat", label: "Chat", icon: MessageSquare },
  { id: "terminal", label: "Terminal", icon: TerminalSquare },
  { id: "preview", label: "Preview", icon: MonitorPlay },
  { id: "context", label: "Context", icon: BrainCircuit },
  { id: "agents", label: "Agents", icon: Radar },
  { id: "profiles", label: "Profiles", icon: UserRound },
  { id: "studio", label: "Studio", icon: Clapperboard },
  { id: "arcade", label: "Arcade", icon: Gamepad2 },
  { id: "ledger", label: "Ledger", icon: ReceiptText },
  { id: "cowork", label: "Co-work", icon: Users },
  { id: "market", label: "Market", icon: Puzzle },
  { id: "billing", label: "Billing", icon: BadgeDollarSign },
  { id: "docs", label: "Docs", icon: FileText },
  { id: "settings", label: "Settings", icon: Settings2 },
  { id: "layouts", label: "Layouts", icon: Brush }
];

export const systemLanes: SystemLane[] = [
  { label: "OpenJaws", value: "Project tools", tone: "good", icon: TerminalSquare },
  { label: "Q", value: "Ready to help", tone: "good", icon: Sparkles },
  { label: "Immaculate", value: "Final checks", tone: "good", icon: CircuitBoard },
  { label: "Co-work", value: "Invite ready", tone: "neutral", icon: Handshake },
  { label: "Arobi", value: "Account setup", tone: "neutral", icon: ReceiptText },
  { label: "Security", value: "Safe updates", tone: "good", icon: LockKeyhole }
];

export const agentEvents: AgentEvent[] = [
  {
    time: "00:00",
    lane: "Q",
    detail: "Ready to read your project when you start a task.",
    state: "active"
  },
  {
    time: "00:02",
    lane: "Q_agents",
    detail: "Waiting for a worker to join.",
    state: "waiting"
  },
  {
    time: "00:04",
    lane: "OpenCheek",
    detail: "Shared notes are ready for this workspace.",
    state: "active"
  },
  {
    time: "00:06",
    lane: "Immaculate",
    detail: "Safety checks are ready.",
    state: "active"
  }
];

export const marketplaceItems: MarketplaceItem[] = [
  {
    title: "Q Agent Pack",
    kind: "Skill preset",
    trust: "Signed",
    description: "Workers that can inspect, code, test, and double-check a project."
  },
  {
    title: "OpenCheek Co-work",
    kind: "Workflow",
    trust: "Reviewed",
    description: "Invite agents or teammates to work from the same project notes."
  },
  {
    title: "Retro Arcade Kit",
    kind: "Game",
    trust: "Sandboxed",
    description: "Small games to play while longer agent jobs run."
  },
  {
    title: "Studio Render Hooks",
    kind: "Tool",
    trust: "Provider gated",
    description: "Image and video jobs using the provider account you connect."
  }
];

export const layoutThemes: LayoutTheme[] = [
  {
    id: "default",
    label: "Default",
    icon: Sun,
    description: "Clean, balanced workspace for daily use.",
    accent: "#78d6a3"
  },
  {
    id: "spy",
    label: "Spy",
    icon: LockKeyhole,
    description: "Low-light theme with sharp alerts.",
    accent: "#9fd174"
  },
  {
    id: "scifi",
    label: "Sci-Fi",
    icon: Boxes,
    description: "Bright blue panels with a futuristic feel.",
    accent: "#67e8f9"
  },
  {
    id: "halloween",
    label: "Halloween",
    icon: Moon,
    description: "Dark panels with orange and violet accents.",
    accent: "#ff8a3d"
  },
  {
    id: "hacking",
    label: "Hacking",
    icon: TerminalSquare,
    description: "Terminal style with green actions.",
    accent: "#3df278"
  },
  {
    id: "coding",
    label: "Coding",
    icon: Code2,
    description: "Editor-style colors for focused coding.",
    accent: "#7aa7ff"
  }
];
