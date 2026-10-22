import { expect, test } from "@playwright/test";
import { COUNT, registerUser, seedExpenses, signIn } from "./helpers";

test("sort, filter, page and search the list", async ({ page, request }) => {
  const user = await registerUser(request);
  await seedExpenses(request, user, "Zed");
  await signIn(page, user);

  const rows = page.locator("table.expense-table tbody tr:not(.expense-table__day)");
  await expect(page.getByText(`${COUNT}`, { exact: true }).first()).toBeVisible();
  await expect(rows).toHaveCount(20); // default page size

  // Sort by amount: the first click is the natural order, highest first
  await page.getByRole("button", { name: "Amount" }).click();
  await expect(page).toHaveURL(/sort=amount%2Cdesc/);
  await expect(rows.first()).toContainText("Zed item 25");
  await page.getByRole("button", { name: "Amount" }).click();
  await expect(page).toHaveURL(/sort=amount%2Casc/);
  await expect(rows.first()).toContainText("Zed item 01");

  // Page 2 holds the remaining 5 (highest amounts, in ascending order)
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByText("Page 2 of 2")).toBeVisible();
  await expect(rows).toHaveCount(5);
  await expect(rows.last()).toContainText("Zed item 25");

  // Filtering by category goes back to page 1: items 1, 5, ..., 25 are FOOD (7 rows)
  await page.getByRole("button", { name: "Filters" }).click();
  await page.locator("label.chip", { hasText: "Food" }).click();
  await expect(page).toHaveURL(/category=FOOD/);
  await expect(page.getByText("Page 1 of 1")).toBeVisible();
  await expect(rows).toHaveCount(7);
  await expect(rows.first()).toContainText("Zed item 01");

  // Search narrows it further (debounced into the URL)
  await page.getByLabel("Search descriptions").fill("item 13");
  await expect(page).toHaveURL(/q=item\+13|q=item%2013/);
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Zed item 13");

  // Clearing the filters restores the full list
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(rows).toHaveCount(20);
});
