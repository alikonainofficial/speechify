// Small display formatters shared by components.

// 75 → "1:15"
export function formatClock(seconds) {
  const s = Math.max(0, Math.floor(seconds || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

const dateFormat = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

// ISO date → "26 Nov, 10:04" (in the browser's locale)
export function formatDate(iso) {
  return dateFormat.format(new Date(iso));
}
