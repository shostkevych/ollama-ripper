export const MAX_CONTENT_CHARS = 8000;

export function truncateText(text: string, max = MAX_CONTENT_CHARS): string {
  return text.length > max ? text.slice(0, max) + "\n\n[...truncated]" : text;
}

export function timestamp(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
}
