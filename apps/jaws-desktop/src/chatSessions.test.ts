import { describe, expect, test } from "bun:test";
import {
  MAX_CLOSED_CHAT_WINDOWS,
  MAX_OPEN_CHAT_WINDOWS,
  closeChatWindow,
  createChatWindow,
  normalizeStoredChatWindows,
  resumeChatWindow
} from "./chatSessions";

describe("chat session lifecycle", () => {
  test("normalizes stored sessions without fabricating closed archives", () => {
    expect(normalizeStoredChatWindows(null)).toHaveLength(1);
    expect(normalizeStoredChatWindows(null, true)).toEqual([]);

    const normalized = normalizeStoredChatWindows([
      {
        id: "kept",
        title: "Asgard",
        workspacePath: "D:/work/asgard",
        workspaceName: "asgard",
        messages: []
      }
    ]);

    expect(normalized[0]).toMatchObject({
      id: "kept",
      title: "Asgard",
      workspacePath: "D:/work/asgard",
      workspaceName: "asgard"
    });
    expect(normalized[0]!.messages.length).toBeGreaterThan(0);
  });

  test("closes the active session into a bounded resume archive", () => {
    const first = createChatWindow("D:/one", "one", "One", new Date("2026-05-01T10:00:00Z"));
    const second = createChatWindow("D:/two", "two", "Two", new Date("2026-05-01T10:01:00Z"));
    const result = closeChatWindow([first, second], first.id, [], new Date("2026-05-01T10:02:00Z"));

    expect(result.open.map((windowState) => windowState.id)).toEqual([second.id]);
    expect(result.closed[0]).toMatchObject({
      id: first.id,
      workspacePath: "D:/one",
      minimized: true,
      expanded: false
    });
    expect(result.activeId).toBe(second.id);
  });

  test("keeps one fallback chat open when the last session closes", () => {
    const only = createChatWindow("D:/solo", "solo", "Solo", new Date("2026-05-01T10:00:00Z"));
    const result = closeChatWindow([only], only.id, [], new Date("2026-05-01T10:02:00Z"));

    expect(result.open).toHaveLength(1);
    expect(result.open[0]!.id).not.toBe(only.id);
    expect(result.closed[0]!.id).toBe(only.id);
    expect(result.activeId).toBe(result.open[0]!.id);
  });

  test("resumes archived sessions without duplicating open windows", () => {
    const open = createChatWindow("D:/open", "open", "Open", new Date("2026-05-01T10:00:00Z"));
    const archived = createChatWindow("D:/archived", "archived", "Archived", new Date("2026-05-01T10:01:00Z"));
    const result = resumeChatWindow([open], [{ ...archived, minimized: true, closedAt: "10:01 AM" }], archived.id);

    expect(result.activeId).toBe(archived.id);
    expect(result.open[0]).toMatchObject({
      id: archived.id,
      workspacePath: "D:/archived",
      minimized: false
    });
    expect(result.closed.find((windowState) => windowState.id === archived.id)).toBeUndefined();

    const second = resumeChatWindow(result.open, result.closed, archived.id);
    expect(second.open.filter((windowState) => windowState.id === archived.id)).toHaveLength(1);
  });

  test("caps open and closed sessions deterministically", () => {
    const open = Array.from({ length: MAX_OPEN_CHAT_WINDOWS }, (_, index) =>
      createChatWindow(`D:/open-${index}`, `open-${index}`, `Open ${index}`, new Date(2026, 4, 1, 10, index))
    );
    const closed = Array.from({ length: MAX_CLOSED_CHAT_WINDOWS }, (_, index) =>
      createChatWindow(`D:/closed-${index}`, `closed-${index}`, `Closed ${index}`, new Date(2026, 4, 1, 11, index))
    );

    const result = resumeChatWindow(open, closed, closed[0]!.id);

    expect(result.open).toHaveLength(MAX_OPEN_CHAT_WINDOWS);
    expect(result.closed).toHaveLength(MAX_CLOSED_CHAT_WINDOWS);
    expect(result.open[0]!.id).toBe(closed[0]!.id);
    expect(result.closed[0]!.id).toBe(open[MAX_OPEN_CHAT_WINDOWS - 1]!.id);
  });
});
