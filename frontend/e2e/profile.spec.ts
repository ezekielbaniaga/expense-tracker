import { expect, test } from "@playwright/test";
import { isRefresh, registerUser, signIn, signedIn } from "./helpers";

test("add a display name and it survives a reload", async ({ page, request }) => {
  const user = await registerUser(request);
  await signIn(page, user);
  await page.goto("/me");
  await page.getByRole("button", { name: "Add your name" }).click();
  await page.getByLabel("Name", { exact: true }).fill("  Pat E2E  ");
  await page.getByRole("form", { name: "Edit name" }).getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Name saved." })).toBeVisible();

  // Stored stripped
  await page.reload();
  await expect(page.getByText("Pat E2E", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit", exact: true })).toBeVisible();
});

test("changing the password signs out everywhere and only the new one works", async ({ page, context, request }) => {
  const user = await registerUser(request);
  await signIn(page, user);
  const other = await context.newPage();
  await other.goto("/");
  await expect(signedIn(other, user)).toBeVisible();

  await page.goto("/me");
  const form = page.getByRole("form", { name: "Change password" });
  await form.getByLabel("Current password").fill("not-the-current-password");
  await form.getByLabel("New password").fill("e2e-user-new-password");
  await form.getByRole("button", { name: "Change password" }).click();
  await expect(form.getByLabel("Current password")).toHaveAccessibleDescription("Current password is incorrect");

  await form.getByLabel("Current password").fill(user.password);
  await form.getByRole("button", { name: "Change password" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("alert").filter({ hasText: "Password changed" })).toBeVisible();
  // The other tab follows the sign-out
  await expect(other).toHaveURL(/\/login$/);

  await page.getByLabel("Username").fill(user.username);
  await page.getByLabel("Password", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Invalid username or password" })).toBeVisible();

  await signIn(page, { ...user, password: "e2e-user-new-password" });
});

test("sign out other devices ends their sessions but keeps this one", async ({ browser, page, request }) => {
  const user = await registerUser(request);
  await signIn(page, user);
  const otherContext = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  const otherPage = await otherContext.newPage();
  await signIn(otherPage, user);

  await page.goto("/me#devices");
  const devices = page.getByRole("list", { name: "Your devices" });
  await expect(devices.getByRole("listitem")).toHaveCount(2);
  await expect(devices.getByText("This device")).toHaveCount(1);
  await page.getByRole("button", { name: "Sign out other devices" }).click();
  await page.getByRole("button", { name: "Confirm sign out" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Signed out 1 other device." })).toBeVisible();
  await expect(devices.getByRole("listitem")).toHaveCount(1);

  // The other device's refresh cookie is dead, so its next boot lands on /login
  const refresh = otherPage.waitForResponse(isRefresh);
  await otherPage.reload();
  expect((await refresh).status()).toBe(401);
  await expect(otherPage).toHaveURL(/\/login$/);
  await otherContext.close();

  await page.reload();
  await expect(signedIn(page, user)).toBeVisible();
});
