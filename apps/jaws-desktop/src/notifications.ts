export interface JawsNotification {
  id: string;
  title: string;
  detail: string;
  tone: "complete" | "input" | "update";
  time: string;
  createdAt: string;
  readAt?: string;
}

export const MAX_JAWS_NOTIFICATIONS = 12;

export const initialNotifications: JawsNotification[] = [
  {
    id: "update-coming",
    title: "Update incoming",
    detail: "A JAWS update is being prepared for later. Keep notifications armed for the release prompt.",
    tone: "update",
    time: "now",
    createdAt: "seed"
  }
];

function coerceTone(value: unknown): JawsNotification["tone"] {
  return value === "complete" || value === "input" || value === "update" ? value : "update";
}

function coerceText(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

export function normalizeStoredNotifications(
  value: unknown,
  fallback: JawsNotification[] = initialNotifications
): JawsNotification[] {
  const source = Array.isArray(value) ? value : fallback;
  const normalized = source
    .filter((entry): entry is Partial<JawsNotification> => Boolean(entry) && typeof entry === "object")
    .map((entry, index) => ({
      id: coerceText(entry.id, `notification-restored-${index}`),
      title: coerceText(entry.title, "JAWS notification"),
      detail: coerceText(entry.detail, "Open JAWS for details."),
      tone: coerceTone(entry.tone),
      time: coerceText(entry.time, "restored"),
      createdAt: coerceText(entry.createdAt, "restored"),
      readAt: typeof entry.readAt === "string" && entry.readAt ? entry.readAt : undefined
    }))
    .slice(0, MAX_JAWS_NOTIFICATIONS);
  return normalized.length > 0 ? normalized : fallback.slice(0, MAX_JAWS_NOTIFICATIONS);
}

export function createJawsNotification(
  notification: Omit<JawsNotification, "id" | "time" | "createdAt" | "readAt">,
  now: Date = new Date()
): JawsNotification {
  return {
    ...notification,
    id: `notice-${now.getTime()}-${Math.round(Math.random() * 10000)}`,
    time: now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    createdAt: now.toISOString()
  };
}

export function pushJawsNotification(
  notifications: JawsNotification[],
  notification: JawsNotification
): JawsNotification[] {
  return [notification, ...notifications.filter((item) => item.id !== notification.id)].slice(0, MAX_JAWS_NOTIFICATIONS);
}

export function dismissJawsNotification(
  notifications: JawsNotification[],
  id: string
): JawsNotification[] {
  return notifications.filter((item) => item.id !== id);
}

export function clearJawsNotifications(): JawsNotification[] {
  return [];
}

export function markAllJawsNotificationsRead(
  notifications: JawsNotification[],
  now: Date = new Date()
): JawsNotification[] {
  const readAt = now.toISOString();
  return notifications.map((notification) =>
    notification.readAt ? notification : { ...notification, readAt }
  );
}

export function countUnreadJawsNotifications(notifications: JawsNotification[]): number {
  return notifications.filter((notification) => !notification.readAt).length;
}
