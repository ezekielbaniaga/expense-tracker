import { expect, test, type Page } from "@playwright/test";
import { ADMIN, isRefresh, registerUser, signIn, type Credentials } from "./helpers";

test("a USER sees no Admin link and /admin goes to the list", async ({ page, request }) => {
  const user = await registerUser(request);
  await signIn(page, user);
  await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Admin" })).toHaveCount(0);
  await page.goto("/admin/users");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "Expenses", level: 1 })).toBeVisible();
});

test("the admin disables a user, which ends their session and blocks sign-in", async ({ browser, page, request }) => {
  const target = await registerUser(request);
  const targetContext = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  const targetPage = await targetContext.newPage();
  await signIn(targetPage, target);

  await signIn(page, ADMIN);
  await openUser(page, target);
  const form = page.getByRole("form", { name: "Edit user" });
  await form.getByLabel("Enabled").uncheck();
  await form.getByRole("button", { name: "Save" }).click();
  await expect(form).toContainText(`Disable ${target.username}? Every session of theirs ends`);
  await form.getByRole("button", { name: "Confirm save" }).click();
  await expect(form.getByRole("status")).toHaveText("Saved.");
  await expect(page.getByRole("definition").filter({ hasText: /^Disabled$/ })).toBeVisible();

  // The list shows the new status too
  await page.getByRole("link", { name: "Back to users" }).click();
  await expect(page.getByRole("row", { name: new RegExp(target.username) })).toContainText("Disabled");

  // Their refresh is refused, so a reload signs them out
  const refresh = targetPage.waitForResponse(isRefresh);
  await targetPage.reload();
  expect((await refresh).status()).toBe(401);
  await expect(targetPage).toHaveURL(/\/login$/);
  await targetPage.getByLabel("Username").fill(target.username);
  await targetPage.getByLabel("Password", { exact: true }).fill(target.password);
  await targetPage.getByRole("button", { name: "Sign in" }).click();
  await expect(targetPage.getByRole("alert").filter({ hasText: "Invalid username or password" })).toBeVisible();
  await targetContext.close();
});

test("the admin cannot demote themselves", async ({ page }) => {
  await signIn(page, ADMIN);
  await openUser(page, ADMIN);
  const form = page.getByRole("form", { name: "Edit user" });
  await form.getByLabel("Role").selectOption("USER");
  await form.getByRole("button", { name: "Save" }).click();
  await form.getByRole("button", { name: "Confirm save" }).click();
  await expect(form.getByRole("alert")).toHaveText("You cannot disable or demote yourself.");

  await page.reload();
  await expect(page.getByRole("definition").filter({ hasText: /^ADMIN$/ })).toBeVisible();
});

/** From the nav's Admin link, filters the list by the exact name and opens that user. */
async function openUser(page: Page, user: Credentials) {
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Admin" }).click();
  await expect(page.getByRole("heading", { name: "Users", level: 1 })).toBeVisible();
  const filter = page.getByRole("form", { name: "Filter users" });
  await filter.getByLabel("Username").fill(user.username);
  await filter.getByRole("button", { name: "Search" }).click();
  await expect(page).toHaveURL(new RegExp(`username=${user.username}`));
  await page.getByRole("link", { name: user.username, exact: true }).click();
  await expect(page.getByRole("heading", { name: user.username, level: 1 })).toBeVisible();
}
