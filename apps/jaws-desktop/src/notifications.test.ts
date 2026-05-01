import { describe, expect, test } from "bun:test";
import {
  MAX_JAWS_NOTIFICATIONS,
  clearJawsNotifications,
  countUnreadJawsNotifications,
  createJawsNotification,
  dismissJawsNotification,
  initialNotifications,
  markAllJawsNotificationsRead,
  normalizeStoredNotifications,
  pushJawsNotification
} from "./notifications";

describe("JAWS notification lifecycle", () => {
  test("normalizes missing and malformed stored notifications to a durable seed", () => {
    expect(normalizeStoredNotifications(null)).toEqual(initialNotifications);

    const normalized = normalizeStoredNotifications([
      {
        id: "",
        title: "Agent done",
        detail: "",
        tone: "bad-tone",
        time: "",
        createdAt: ""
      }
    ]);

    expect(normalized[0]).toMatchObject({
      id: "notification-restored-0",
      title: "Agent done",
      detail: "Open JAWS for details.",
      tone: "update",
      time: "restored",
      createdAt: "restored"
    });
  });

  test("creates unread notifications with stable user-facing fields", () => {
    const notification = createJawsNotification(
      {
        title: "Agent complete",
        detail: "Q finished the route.",
        tone: "complete"
      },
      new Date("2026-05-01T12:00:00Z")
    );

    expect(notification).toMatchObject({
      title: "Agent complete",
      detail: "Q finished the route.",
      tone: "complete",
      createdAt: "2026-05-01T12:00:00.000Z"
    });
    expect(notification.readAt).toBeUndefined();
  });

  test("pushes newest notifications first and caps history", () => {
    const items = Array.from({ length: MAX_JAWS_NOTIFICATIONS + 3 }, (_, index) =>
      createJawsNotification(
        {
          title: `Notice ${index}`,
          detail: "bounded",
          tone: "update"
        },
        new Date(2026, 4, 1, 12, index)
      )
    ).reduce((current, notification) => pushJawsNotification(current, notification), [] as ReturnType<typeof normalizeStoredNotifications>);

    expect(items).toHaveLength(MAX_JAWS_NOTIFICATIONS);
    expect(items[0]!.title).toBe(`Notice ${MAX_JAWS_NOTIFICATIONS + 2}`);
    expect(items.at(-1)!.title).toBe("Notice 3");
  });

  test("dismisses, clears, marks read, and counts unread notifications", () => {
    const first = createJawsNotification({ title: "First", detail: "one", tone: "update" });
    const second = createJawsNotification({ title: "Second", detail: "two", tone: "input" });
    const notifications = [first, second];

    expect(countUnreadJawsNotifications(notifications)).toBe(2);
    expect(dismissJawsNotification(notifications, first.id)).toEqual([second]);

    const read = markAllJawsNotificationsRead(notifications, new Date("2026-05-01T13:00:00Z"));
    expect(countUnreadJawsNotifications(read)).toBe(0);
    expect(read.every((item) => item.readAt === "2026-05-01T13:00:00.000Z")).toBe(true);
    expect(clearJawsNotifications()).toEqual([]);
  });
});
