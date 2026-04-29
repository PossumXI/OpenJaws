import {
  BadgeDollarSign,
  Boxes,
  Brush,
  CircuitBoard,
  Clapperboard,
  Code2,
  Gamepad2,
  Handshake,
  LayoutDashboard,
  LockKeyhole,
  Moon,
  Network,
  Puzzle,
  Radar,
  ReceiptText,
  Sparkles,
  Sun,
  TerminalSquare,
  Users
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type SectionId =
  | "control"
  | "terminal"
  | "agents"
  | "studio"
  | "arcade"
  | "ledger"
  | "cowork"
  | "market"
  | "billing"
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

export const navItems: NavItem[] = [
  { id: "control", label: "Control", icon: LayoutDashboard },
  { id: "terminal", label: "Terminal", icon: TerminalSquare },
  { id: "agents", label: "Agents", icon: Radar },
  { id: "studio", label: "Studio", icon: Clapperboard },
  { id: "arcade", label: "Arcade", icon: Gamepad2 },
  { id: "ledger", label: "Ledger", icon: ReceiptText },
  { id: "cowork", label: "Co-work", icon: Users },
  { id: "market", label: "Market", icon: Puzzle },
  { id: "billing", label: "Billing", icon: BadgeDollarSign },
  { id: "layouts", label: "Layouts", icon: Brush }
];

export const systemLanes: SystemLane[] = [
  { label: "OpenJaws", value: "Sidecar boundary", tone: "good", icon: TerminalSquare },
  { label: "Q", value: "Default route", tone: "good", icon: Sparkles },
  { label: "Immaculate", value: "Crew pacing", tone: "good", icon: CircuitBoard },
  { label: "Co-work", value: "Pairing lane", tone: "neutral", icon: Handshake },
  { label: "Arobi", value: "Enrollment", tone: "neutral", icon: ReceiptText },
  { label: "Security", value: "Signed releases", tone: "good", icon: LockKeyhole }
];

export const agentEvents: AgentEvent[] = [
  {
    time: "00:00",
    lane: "Q",
    detail: "Workspace route ready for prompt dispatch",
    state: "active"
  },
  {
    time: "00:02",
    lane: "Q_agents",
    detail: "Health-gated dispatch lane waiting for worker heartbeat",
    state: "waiting"
  },
  {
    time: "00:04",
    lane: "OpenCheek",
    detail: "Shared phase memory attached to the session",
    state: "active"
  },
  {
    time: "00:06",
    lane: "Immaculate",
    detail: "Crew pacing policy loaded from OpenJaws",
    state: "active"
  }
];

export const marketplaceItems: MarketplaceItem[] = [
  {
    title: "Q Agent Pack",
    kind: "Skill preset",
    trust: "Signed",
    description: "Default route workers, verifier loops, and background check lanes."
  },
  {
    title: "OpenCheek Co-work",
    kind: "Workflow",
    trust: "Reviewed",
    description: "Pair-programming agents with shared phase memory and handoff receipts."
  },
  {
    title: "Retro Arcade Kit",
    kind: "Game",
    trust: "Sandboxed",
    description: "Small idle-safe games for long-running agent sessions."
  },
  {
    title: "Studio Render Hooks",
    kind: "Tool",
    trust: "Provider gated",
    description: "Image, storyboard, and video render queues behind explicit credentials."
  }
];

export const layoutThemes: Array<{ id: ThemeId; label: string; icon: LucideIcon }> = [
  { id: "default", label: "Default", icon: Sun },
  { id: "spy", label: "Spy", icon: LockKeyhole },
  { id: "scifi", label: "Sci-Fi", icon: Boxes },
  { id: "halloween", label: "Halloween", icon: Moon },
  { id: "hacking", label: "Hacking", icon: TerminalSquare },
  { id: "coding", label: "Coding", icon: Code2 }
];
