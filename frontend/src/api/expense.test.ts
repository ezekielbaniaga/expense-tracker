import {
  formatAmount,
  isFutureDate,
  mapCategories,
  mapExpenseList,
  todayIso,
  type ExpenseListResponseDto,
} from "./expense";

describe("mapCategories", () => {
  it("maps supported_categories to supportedCategories", () => {
    expect(mapCategories({ supported_categories: ["FOOD", "BILLS"] })).toEqual({
      supportedCategories: ["FOOD", "BILLS"],
    });
  });
});

describe("mapExpenseList", () => {
  it("maps total_amount to totalAmount and leaves items and dates alone", () => {
    const dto: ExpenseListResponseDto = {
      expenses: [
        {
          id: "7d2a0a40-0000-4000-8000-000000000001",
          description: "Lunch",
          amount: 12.5,
          category: "FOOD",
          date: "2026-10-17",
          version: 0,
        },
      ],
      count: 1,
      total_amount: 12.5,
    };
    const list = mapExpenseList(dto);
    expect(list.totalAmount).toBe(12.5);
    expect(list.count).toBe(1);
    expect(list.expenses[0].date).toBe("2026-10-17");
    expect(list).not.toHaveProperty("total_amount");
  });
});

describe("formatAmount", () => {
  it("always shows 2 decimals", () => {
    expect(formatAmount(12)).toBe("12.00");
    expect(formatAmount(12.5)).toBe("12.50");
    expect(formatAmount(0)).toBe("0.00");
    expect(formatAmount(99999999.99)).toBe("99999999.99");
  });
});

describe("date helpers", () => {
  it("formats today as local YYYY-MM-DD", () => {
    expect(todayIso(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });

  it("flags only dates after today", () => {
    const now = new Date(2026, 9, 18, 12);
    expect(isFutureDate("2026-10-18", now)).toBe(false);
    expect(isFutureDate("2026-10-17", now)).toBe(false);
    expect(isFutureDate("2026-10-19", now)).toBe(true);
  });
});
