import { formatMoney } from "./money";

describe("formatMoney", () => {
  it("groups and shows 2 decimals without a symbol by default", () => {
    expect(formatMoney(1284.5, undefined, "en-US")).toBe("1,284.50");
    expect(formatMoney(12, "", "en-US")).toBe("12.00");
    expect(formatMoney(0, undefined, "en-US")).toBe("0.00");
    expect(formatMoney(99999999.99, undefined, "en-US")).toBe("99,999,999.99");
  });

  it("follows the locale", () => {
    expect(formatMoney(1284.5, undefined, "de-DE")).toBe("1.284,50");
  });

  it("adds the symbol only when a currency is set", () => {
    expect(formatMoney(1284.5, "USD", "en-US")).toBe("$1,284.50");
    expect(formatMoney(1284.5, "PHP", "en-US")).toBe("₱1,284.50");
  });

  it("falls back to the plain number for a code Intl rejects", () => {
    expect(formatMoney(5, "12", "en-US")).toBe("5.00");
  });

  it("shows the placeholder for null", () => {
    expect(formatMoney(null, "USD", "en-US")).toBe("—");
  });
});
