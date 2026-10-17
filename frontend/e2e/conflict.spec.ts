import { expect, test } from "@playwright/test";
import { createExpense, registerUser, signIn } from "./helpers";

test("saving over a newer version offers Reload and keeps the input", async ({ page, context, request }) => {
  const user = await registerUser(request);
  await signIn(page, user);
  await createExpense(page, "Conflict lunch");
  const other = await context.newPage();
  await other.goto(page.url());
  await expect(other.getByRole("heading", { name: "Conflict lunch" })).toBeVisible();

  // Both open the editor on the same version before either saves
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await other.getByRole("button", { name: "Edit", exact: true }).click();

  await page.getByLabel("Amount").fill("20.00");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("20.00", { exact: true })).toBeVisible();

  await other.getByLabel("Amount").fill("30.00");
  await other.getByRole("button", { name: "Save", exact: true }).click();
  await expect(other.getByRole("alert")).toContainText("This expense was changed elsewhere");
  await expect(other.getByLabel("Amount")).toHaveValue("30.00");

  // Reload fetches the first save; the kept input then saves on the new version
  await other.getByRole("button", { name: "Reload" }).click();
  await expect(other.getByText("20.00", { exact: true })).toBeVisible();
  await other.getByRole("button", { name: "Save", exact: true }).click();
  await expect(other.getByText("30.00", { exact: true })).toBeVisible();
});
