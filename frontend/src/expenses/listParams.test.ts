import { DEFAULT_SORT, detectPeriod, periodRange, readListParams, toApiQuery, toSearchParams } from "./listParams";

// A fixed "now" in local time: Wed 21 Oct 2026, late evening (so a UTC conversion would be wrong)
const NOW = new Date(2026, 9, 21, 23, 30);
const read = (search: string, size = 20) => readListParams(new URLSearchParams(search), size, NOW);

describe("listParams", () => {
  it("uses the defaults for an empty URL", () => {
    expect(read("")).toEqual({
      q: "", category: [], from: "2026-10-01", to: "2026-10-21", minAmount: "", maxAmount: "",
      sort: DEFAULT_SORT, page: 0, size: 20,
    });
    expect(read("", 50).size).toBe(50);
  });

  it("reads every param", () => {
    const p = read("q=lunch&category=FOOD&category=BILLS&from=2026-10-01&to=2026-10-31&minAmount=1.5&maxAmount=20&sort=amount,desc&page=2&size=10");
    expect(p).toEqual({
      q: "lunch", category: ["FOOD", "BILLS"], from: "2026-10-01", to: "2026-10-31",
      minAmount: "1.5", maxAmount: "20", sort: "amount,desc", page: 2, size: 10,
    });
  });

  it("drops values that could not be sent", () => {
    const p = read("category=NOPE&from=yesterday&to=2026-13-45&minAmount=abc&sort=bad&page=-1&size=0");
    expect(p).toEqual(read(""));
  });

  it("round-trips and leaves defaults out of the URL", () => {
    expect(toSearchParams(read(""), 20, NOW).toString()).toBe("");
    expect(read("period=all").from).toBe("");
    expect(toSearchParams(read("period=all"), 20, NOW).toString()).toBe("period=all");
    const search = "q=lunch&category=FOOD&from=2026-09-01&sort=amount%2Cdesc&page=1&size=10";
    expect(toSearchParams(read(search), 20, NOW).toString()).toBe(search);
  });

  it("builds the API query with page, size and sort always present", () => {
    expect(toApiQuery(read("period=all"))).toBe("page=0&size=20&sort=date%2Cdesc");
    expect(toApiQuery(read("period=all&q= lunch &category=FOOD&category=BILLS&minAmount=2"))).toBe(
      "page=0&size=20&sort=date%2Cdesc&q=lunch&category=FOOD&category=BILLS&minAmount=2",
    );
  });

  it("computes each period in the local calendar", () => {
    expect(periodRange("month", NOW)).toEqual({ from: "2026-10-01", to: "2026-10-21" });
    expect(periodRange("last-month", NOW)).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(periodRange("3-months", NOW)).toEqual({ from: "2026-08-01", to: "2026-10-21" });
    expect(periodRange("year", NOW)).toEqual({ from: "2026-01-01", to: "2026-10-21" });
    expect(periodRange("all", NOW)).toEqual({ from: "", to: "" });
    // January: last month and 3 months reach back into the previous year
    const jan = new Date(2026, 0, 5);
    expect(periodRange("last-month", jan)).toEqual({ from: "2025-12-01", to: "2025-12-31" });
    expect(periodRange("3-months", jan).from).toBe("2025-11-01");
  });

  it("detects the chip for a from/to pair", () => {
    expect(detectPeriod("2026-10-01", "2026-10-21", NOW)).toBe("month");
    expect(detectPeriod("2026-09-01", "2026-09-30", NOW)).toBe("last-month");
    expect(detectPeriod("", "", NOW)).toBe("all");
    expect(detectPeriod("2026-10-02", "", NOW)).toBe("custom");
  });
});
