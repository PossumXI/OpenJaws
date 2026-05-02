const DEFAULT_PREVIEW_URL = "http://127.0.0.1:5173/";

function candidatePreviewUrl(input: string): string {
  if (/^https?:\/\//i.test(input)) return input;
  if (/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:[/?#].*)?$/i.test(input)) {
    return `http://${input}`;
  }
  return `https://${input}`;
}

export function normalizePreviewFrameUrl(input: string, fallback = DEFAULT_PREVIEW_URL): string {
  const fallbackValue = fallback.trim() || DEFAULT_PREVIEW_URL;
  const trimmed = input.trim();
  if (!trimmed) return fallbackValue;

  try {
    const url = new URL(candidatePreviewUrl(trimmed));
    if (url.protocol !== "http:" && url.protocol !== "https:") return fallbackValue;
    url.username = "";
    url.password = "";
    return url.href;
  } catch {
    return fallbackValue;
  }
}

export function canRenderPreviewInline(input: string): boolean {
  try {
    const url = new URL(normalizePreviewFrameUrl(input));
    const host = url.hostname.toLowerCase();
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      (host === "localhost" || host === "127.0.0.1" || host === "::1")
    );
  } catch {
    return false;
  }
}
