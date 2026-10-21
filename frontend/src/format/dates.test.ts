import { formatDay, formatGroupDay, formatLocalDateTime, formatLocalDay, formatRelativeDay, parseUtc } from "./dates";

describe("parseUtc", () => {
  it("reads an API timestamp without offset as UTC", () => {
    expect(parseUtc("2026-10-18T09:05:03.123").toISOString()).toBe("2026-10-18T09:05:03.123Z");
  });

  it("keeps an explicit Z or offset", () => {
    expect(parseUtc("2026-10-18T09:05:03Z").toISOString()).toBe("2026-10-18T09:05:03.000Z");
    expect(parseUtc("2026-10-18T09:05:03+02:00").toISOString()).toBe("2026-10-18T07:05:03.000Z");
  });
});

describe("formatLocalDateTime", () => {
  it("converts to the given time zone", () => {
    expect(formatLocalDateTime("2026-10-18T09:05:03", "en-US", "UTC")).toMatch(/^Oct 18, 2026,\s9:05\sAM$/);
    expect(formatLocalDateTime("2026-10-18T09:05:03", "en-US", "Asia/Manila")).toMatch(/^Oct 18, 2026,\s5:05\sPM$/);
  });

  it("rolls over midnight in the target zone", () => {
    expect(formatLocalDateTime("2026-10-18T20:30:00", "en-US", "Asia/Manila")).toMatch(/^Oct 19, 2026,\s4:30\sAM$/);
    expect(formatLocalDateTime("2026-10-18T00:00:00", "en-US", "UTC")).toMatch(/^Oct 18, 2026,\s12:00\sAM$/);
  });

  it("follows daylight saving time", () => {
    // New York is UTC-5 in winter (EST) and UTC-4 in summer (EDT)
    expect(formatLocalDateTime("2026-01-15T12:00:00", "en-US", "America/New_York")).toMatch(/7:00\sAM$/);
    expect(formatLocalDateTime("2026-07-15T12:00:00", "en-US", "America/New_York")).toMatch(/8:00\sAM$/);
  });

  it("shows the placeholder for null and the input for garbage", () => {
    expect(formatLocalDateTime(null, "en-US", "UTC")).toBe("—");
    expect(formatLocalDateTime("not a date", "en-US", "UTC")).toBe("not a date");
  });
});

describe("formatLocalDay", () => {
  it("shows the day in the given time zone, not the UTC day", () => {
    expect(formatLocalDay("2026-10-18T20:00:00", "en-US", "UTC")).toBe("Oct 18, 2026");
    expect(formatLocalDay("2026-10-18T20:00:00", "en-US", "Asia/Singapore")).toBe("Oct 19, 2026");
    expect(formatLocalDay("2026-10-18T20:00:00Z", "en-US", "Pacific/Auckland")).toBe("Oct 19, 2026");
    expect(formatLocalDay("2026-10-18T02:00:00", "en-US", "America/New_York")).toBe("Oct 17, 2026");
  });

  it("shows the placeholder for null and the input for garbage", () => {
    expect(formatLocalDay(null, "en-US", "UTC")).toBe("—");
    expect(formatLocalDay("soon", "en-US", "UTC")).toBe("soon");
  });
});

describe("formatDay", () => {
  it("writes a calendar date out without shifting the day", () => {
    expect(formatDay("2026-10-17", "en-US")).toBe("Oct 17, 2026");
    expect(formatDay("2026-01-01", "en-US")).toBe("Jan 1, 2026");
  });

  it("shows the placeholder for null and the input for garbage", () => {
    expect(formatDay(null, "en-US")).toBe("—");
    expect(formatDay("soon", "en-US")).toBe("soon");
  });
});

describe("formatRelativeDay", () => {
  const now = new Date(2026, 9, 18, 0, 0, 1); // local, just after midnight

  it("says Today and Yesterday by the local calendar", () => {
    expect(formatRelativeDay("2026-10-18", now, "en-US")).toBe("Today");
    expect(formatRelativeDay("2026-10-17", now, "en-US")).toBe("Yesterday");
  });

  it("crosses a month boundary", () => {
    expect(formatRelativeDay("2026-09-30", new Date(2026, 9, 1, 23, 59, 59), "en-US")).toBe("Yesterday");
  });

  it("writes older days out and handles null", () => {
    expect(formatRelativeDay("2026-10-16", now, "en-US")).toBe("Oct 16, 2026");
    expect(formatRelativeDay(null, now, "en-US")).toBe("—");
  });
});

describe("formatGroupDay", () => {
  const now = new Date(2026, 9, 21, 12);
  it("says Today and Yesterday, otherwise month, day and weekday", () => {
    expect(formatGroupDay("2026-10-21", now, "en-US")).toBe("Today");
    expect(formatGroupDay("2026-10-20", now, "en-US")).toBe("Yesterday");
    expect(formatGroupDay("2026-10-19", now, "en-US")).toBe("Oct 19 \u00b7 Mon");
    expect(formatGroupDay(null, now, "en-US")).toBe("No date");
  });
});
