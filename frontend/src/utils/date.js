export function getTimezone() {
  return window.__pharmaPOSTz || Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * SQLite stores datetimes as naive UTC strings ("2026-05-02T15:32:07") with no
 * timezone suffix. JavaScript's Date constructor treats such strings as LOCAL
 * time, which is wrong. We append "Z" when no timezone designator is present
 * so the browser always interprets the value as UTC before converting to the
 * configured display timezone.
 */
function toUtcDate(dateStr) {
  if (!dateStr) return null;
  const s = String(dateStr).trim().replace(" ", "T");
  return new Date(/Z$|[+-]\d{2}:?\d{2}$/.test(s) ? s : s + "Z");
}

export function formatDateTime(dateStr) {
  if (!dateStr) return "—";
  return toUtcDate(dateStr).toLocaleString("en-PH", {
    timeZone: getTimezone(),
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export function formatDate(dateStr) {
  if (!dateStr) return "—";
  return toUtcDate(dateStr).toLocaleDateString("en-PH", {
    timeZone: getTimezone(),
    year: "numeric", month: "short", day: "numeric",
  });
}

export function formatTime(dateStr) {
  if (!dateStr) return "—";
  return toUtcDate(dateStr).toLocaleTimeString("en-PH", {
    timeZone: getTimezone(),
    hour: "2-digit", minute: "2-digit",
  });
}
