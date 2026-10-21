import { DEFAULT_SORT, readListParams, toApiQuery, toSearchParams } from "./listParams";

const read = (search: string, size = 20) => readListParams(new URLSearchParams(search), size);

describe("listParams", () => {
  it("uses the defaults for an empty URL", () => {
    expect(read("")).toEqual({
      q: "", category: [], from: "", to: "", minAmount: "", maxAmount: "",
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
    expect(toSearchParams(read(""), 20).toString()).toBe("");
    const search = "q=lunch&category=FOOD&from=2026-10-01&sort=amount%2Cdesc&page=1&size=10";
    expect(toSearchParams(read(search), 20).toString()).toBe(search);
  });

  it("builds the API query with page, size and sort always present", () => {
    expect(toApiQuery(read(""))).toBe("page=0&size=20&sort=date%2Cdesc");
    expect(toApiQuery(read("q= lunch &category=FOOD&category=BILLS&minAmount=2"))).toBe(
      "page=0&size=20&sort=date%2Cdesc&q=lunch&category=FOOD&category=BILLS&minAmount=2",
    );
  });
});
