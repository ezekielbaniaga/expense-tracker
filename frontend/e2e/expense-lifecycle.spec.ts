import { expect, test } from "@playwright/test";
import { createExpense, registerUser, signIn } from "./helpers";

test("the form shows each field's error before anything is sent", async ({ page, request }) => {
  const user = await registerUser(request);
  await signIn(page, user);
  await page.goto("/expenses/new");

  let posted = false;
  page.on("request", (r) => {
    if (r.method() === "POST" && new URL(r.url()).pathname === "/api/expense") posted = true;
  });
  await page.getByRole("button", { name: "Add expense" }).click();
  await expect(page.getByLabel("Amount")).toHaveAccessibleDescription("Amount is required");
  await expect(page.getByLabel("Description")).toHaveAccessibleDescription("Description is required");
  await expect(page.getByText("Choose a category")).toBeVisible();

  await page.getByLabel("Amount").fill("0");
  await page.getByRole("button", { name: "Add expense" }).click();
  await expect(page.getByLabel("Amount")).toHaveAccessibleDescription("Amount must be greater than 0");
  expect(posted).toBe(false);
});

test("Add another keeps the form open and empties it", async ({ page, request }) => {
  const user = await registerUser(request);
  await signIn(page, user);
  await page.goto("/expenses/new");
  await page.getByLabel("Add another").check();
  await page.getByLabel("Description").fill("First of two");
  await page.getByLabel("Amount").fill("4.20");
  await page.getByRole("radio", { name: "Transport" }).check();
  await page.getByRole("button", { name: "Add expense" }).click();

  await expect(page.getByRole("status").filter({ hasText: "Added First of two" })).toBeVisible();
  await expect(page).toHaveURL(/\/expenses\/new$/);
  await expect(page.getByLabel("Description")).toHaveValue("");
  await expect(page.getByLabel("Amount")).toHaveValue("");

  await page.getByRole("link", { name: "Expenses", exact: true }).click();
  await expect(page.getByRole("link", { name: "First of two", exact: true })).toBeVisible();
});

test("edit the expense, then delete into Archived", async ({ page, request }) => {
  const user = await registerUser(request);
  await signIn(page, user);
  const id = await createExpense(page, "Lifecycle coffee");

  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Description").fill("Lifecycle tea");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Lifecycle tea" })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();

  // Cancel leaves it alone
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Delete this expense?" });
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toHaveCount(0);

  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await dialog.getByRole("button", { name: "Delete" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("status").filter({ hasText: "Expense deleted" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Lifecycle tea", exact: true })).toHaveCount(0);

  await page.getByRole("link", { name: "Archived", exact: true }).click();
  await expect(page.getByRole("region", { name: "Archived expenses table" })).toContainText("Lifecycle tea");

  // Archived expenses answer 404 on the detail route
  await page.goto(`/expenses/${id}`);
  await expect(page.getByRole("heading", { name: "Not found" })).toBeVisible();
});
