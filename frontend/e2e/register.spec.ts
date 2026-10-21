import { expect, test } from "@playwright/test";
import { isRefresh, registerUser, signedIn, uniqueName } from "./helpers";

test("registering through the page signs the new user in", async ({ page }) => {
  const username = uniqueName("e2e-reg");
  await page.goto("/login");
  await page.getByRole("link", { name: "Create an account" }).click();
  await expect(page.getByRole("heading", { name: "Create account" })).toBeVisible();

  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password", { exact: true }).fill("e2e-register-password");
  await expect(page.getByRole("list", { name: "Password rules" })).not.toContainText("(not met)");
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(signedIn(page, { username, password: "" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Expenses", level: 1 })).toBeVisible();
});

test("a taken username is shown on the field", async ({ page, request }) => {
  const existing = await registerUser(request);
  await page.goto("/register");
  // Another case: usernames are unique ignoring case
  await page.getByLabel("Username").fill(existing.username.toUpperCase());
  await page.getByLabel("Password", { exact: true }).fill("e2e-register-password");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByLabel("Username")).toHaveAccessibleDescription("Username is already taken");
  await expect(page).toHaveURL(/\/register$/);
});

test("a signed-out deep link returns there after signing in", async ({ page, request }) => {
  const user = await registerUser(request);
  const boot = page.waitForResponse(isRefresh);
  await page.goto("/archived");
  await boot;
  await expect(page).toHaveURL(/\/login$/);

  await page.getByLabel("Username").fill(user.username);
  await page.getByLabel("Password", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/archived$/);
  await expect(page.getByRole("heading", { name: "Archived expenses" })).toBeVisible();
});
