/** Dates for the UI, in the browser's language. */

const relativeTime = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
const RELATIVE_UNITS = [
  ["year", 31_536_000],
  ["month", 2_592_000],
  ["week", 604_800],
  ["day", 86_400],
  ["hour", 3_600],
  ["minute", 60],
] as const;

/** "3 hours ago" / "hace 3 horas", in the browser's language. */
export function timeAgo(at: number, now = Date.now()) {
  const seconds = (at - now) / 1000;
  const [unit, size] = RELATIVE_UNITS.find(([, unitSize]) => Math.abs(seconds) >= unitSize) ?? ["minute", 60];
  return relativeTime.format(Math.round(seconds / size), unit);
}

export const fullDate = (at: number) =>
  new Date(at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
