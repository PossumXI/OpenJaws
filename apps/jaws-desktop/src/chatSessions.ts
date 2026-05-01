export interface ChatMessage {
  id: string;
  speaker: string;
  role: "user" | "agent" | "system";
  body: string;
  time: string;
  state: "done" | "thinking" | "queued";
  lane: string;
}

export interface ChatWindowState {
  id: string;
  title: string;
  workspacePath: string;
  workspaceName: string;
  input: string;
  messages: ChatMessage[];
  minimized: boolean;
  expanded: boolean;
  sideCollapsed: boolean;
  createdAt: string;
  closedAt?: string;
}

export const MAX_OPEN_CHAT_WINDOWS = 6;
export const MAX_CLOSED_CHAT_WINDOWS = 10;

export const initialChatMessages: ChatMessage[] = [
  {
    id: "system-ready",
    speaker: "JAWS",
    role: "system",
    body: "Ready. Pick a folder, then tell JAWS what you want done.",
    time: "now",
    state: "done",
    lane: "system"
  },
  {
    id: "agent-watch",
    speaker: "Q_agents",
    role: "agent",
    body: "Turn on Compare when you want to review file changes before applying them.",
    time: "now",
    state: "queued",
    lane: "agents"
  }
];

function withWindowMessageIds(messages: ChatMessage[], suffix: string): ChatMessage[] {
  return messages.map((message) => ({
    ...message,
    id: `${message.id}-${suffix}`
  }));
}

export function createChatWindow(
  workspacePath = "",
  workspaceName = "No workspace",
  title = workspaceName || "JAWS Chat",
  now: Date = new Date()
): ChatWindowState {
  const id = `chat-window-${now.getTime()}-${Math.round(Math.random() * 10000)}`;
  const createdAt = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return {
    id,
    title: title || "JAWS Chat",
    workspacePath,
    workspaceName: workspaceName || "No workspace",
    input: "",
    messages: [
      ...withWindowMessageIds(initialChatMessages, id),
      {
        id: `workspace-bound-${id}`,
        speaker: "JAWS",
        role: "system",
        body: workspacePath
          ? `This chat uses ${workspacePath}.`
          : "Open a folder before running agents.",
        time: createdAt,
        state: workspacePath ? "done" : "queued",
        lane: "workspace"
      }
    ],
    minimized: false,
    expanded: false,
    sideCollapsed: false,
    createdAt
  };
}

export function normalizeStoredChatWindows(value: unknown, allowEmpty = false): ChatWindowState[] {
  if (!Array.isArray(value)) return allowEmpty ? [] : [createChatWindow()];
  const windows = value
    .filter((entry): entry is Partial<ChatWindowState> => Boolean(entry) && typeof entry === "object")
    .slice(0, allowEmpty ? MAX_CLOSED_CHAT_WINDOWS : MAX_OPEN_CHAT_WINDOWS)
    .map((entry, index) => ({
      ...createChatWindow(),
      ...entry,
      id: typeof entry.id === "string" && entry.id ? entry.id : `chat-window-restored-${index}`,
      title: typeof entry.title === "string" && entry.title ? entry.title : entry.workspaceName || "JAWS Chat",
      workspacePath: typeof entry.workspacePath === "string" ? entry.workspacePath : "",
      workspaceName: typeof entry.workspaceName === "string" && entry.workspaceName ? entry.workspaceName : "No workspace",
      input: typeof entry.input === "string" ? entry.input : "",
      messages: Array.isArray(entry.messages) && entry.messages.length > 0 ? entry.messages : initialChatMessages,
      minimized: Boolean(entry.minimized),
      expanded: Boolean(entry.expanded),
      sideCollapsed: Boolean(entry.sideCollapsed),
      createdAt: typeof entry.createdAt === "string" ? entry.createdAt : "restored",
      closedAt: typeof entry.closedAt === "string" ? entry.closedAt : undefined
    }));
  return windows.length > 0 || allowEmpty ? windows : [createChatWindow()];
}

export function closeChatWindow(
  openWindows: ChatWindowState[],
  windowId: string,
  closedWindows: ChatWindowState[] = [],
  now: Date = new Date()
): { open: ChatWindowState[]; closed: ChatWindowState[]; activeId: string } {
  const target = openWindows.find((windowState) => windowState.id === windowId);
  if (!target) {
    return {
      open: openWindows.length > 0 ? openWindows : [createChatWindow()],
      closed: closedWindows.slice(0, MAX_CLOSED_CHAT_WINDOWS),
      activeId: openWindows[0]?.id ?? ""
    };
  }

  const remaining = openWindows.filter((windowState) => windowState.id !== windowId);
  const fallback = remaining.length > 0 ? remaining : [createChatWindow()];
  const closedEntry: ChatWindowState = {
    ...target,
    input: "",
    minimized: true,
    expanded: false,
    sideCollapsed: target.sideCollapsed,
    closedAt: now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  };

  return {
    open: fallback,
    closed: [closedEntry, ...closedWindows.filter((windowState) => windowState.id !== windowId)].slice(
      0,
      MAX_CLOSED_CHAT_WINDOWS
    ),
    activeId: fallback[0]?.id ?? ""
  };
}

export function resumeChatWindow(
  openWindows: ChatWindowState[],
  closedWindows: ChatWindowState[],
  windowId: string
): { open: ChatWindowState[]; closed: ChatWindowState[]; activeId: string } {
  const existing = openWindows.find((windowState) => windowState.id === windowId);
  if (existing) {
    return {
      open: openWindows.map((windowState) =>
        windowState.id === windowId ? { ...windowState, minimized: false, closedAt: undefined } : windowState
      ),
      closed: closedWindows,
      activeId: windowId
    };
  }

  const archived = closedWindows.find((windowState) => windowState.id === windowId);
  if (!archived) {
    return {
      open: openWindows.length > 0 ? openWindows : [createChatWindow()],
      closed: closedWindows,
      activeId: openWindows[0]?.id ?? ""
    };
  }

  const resumed: ChatWindowState = {
    ...archived,
    minimized: false,
    expanded: false,
    closedAt: undefined
  };
  const candidateOpen = [resumed, ...openWindows.filter((windowState) => windowState.id !== windowId)];
  const open = candidateOpen.slice(0, MAX_OPEN_CHAT_WINDOWS);
  const displaced = candidateOpen.slice(MAX_OPEN_CHAT_WINDOWS).map((windowState) => ({
    ...windowState,
    minimized: true,
    expanded: false,
    closedAt: windowState.closedAt ?? "auto-archived"
  }));

  return {
    open,
    closed: [
      ...displaced,
      ...closedWindows.filter((windowState) => windowState.id !== windowId)
    ].slice(0, MAX_CLOSED_CHAT_WINDOWS),
    activeId: resumed.id
  };
}
