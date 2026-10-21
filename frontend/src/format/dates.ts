import { MISSING } from "../api/expense";

/** The API sends UTC without an offset ("2026-10-18T09:05:03.123"); append `Z` so it parses as UTC. */
export function parseUtc(value: string): Date {
  return new Date(/(Z|[+-]\d{2}:?\d{2})$/i.test(value) ? value : `${value}Z`);
}

/** A UTC timestamp from the API in the viewer's time zone, e.g. "Oct 18, 2026, 9:05 AM". */
export function formatLocalDateTime(value: string | null, locale?: string, timeZone?: string): string {
  if (value === null) return MISSING;
  const date = parseUtc(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone }).format(date);
}

/** "2026-10-17" as a calendar date, e.g. "Oct 17, 2026". No time zone shift: it is not an instant. */
function dayParts(day: string): [number, number, number] | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

export function formatDay(day: string | null, locale?: string): string {
  if (day === null) return MISSING;
  const parts = dayParts(day);
  if (!parts) return day;
  // Formatted in UTC from a UTC date, so the viewer's zone and DST cannot move the day
  const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(date);
}

/** "Today" or "Yesterday" by the viewer's local calendar, otherwise `formatDay`. */
export function formatRelativeDay(day: string | null, now: Date = new Date(), locale?: string): string {
  if (day === null) return MISSING;
  const local = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  if (day === local(now)) return "Today";
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (day === local(yesterday)) return "Yesterday";
  return formatDay(day, locale);
}

/** The day written out in full, e.g. "Saturday, October 17, 2026". */
export function formatLongDay(day: string | null, locale?: string): string {
  if (day === null) return MISSING;
  const parts = dayParts(day);
  if (!parts) return day;
  const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  return new Intl.DateTimeFormat(locale, { dateStyle: "full", timeZone: "UTC" }).format(date);
}
