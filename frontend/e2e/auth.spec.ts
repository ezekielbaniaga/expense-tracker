import { expect, test } from "@playwright/test";
import { ADMIN, isRefresh, registerUser, signIn, signedIn } from "./helpers";

test("the seeded admin signs in and out, and the other tab leaves too", async ({ page, context }) => {
  await signIn(page, ADMIN);
  const other = await context.newPage();
  await other.goto("/");
  await expect(signedIn(other, ADMIN)).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(other).toHaveURL(/\/login$/);

  // The session is gone, so the boot refresh fails and the page stays signed out
  await page.reload();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});

test("a wrong password shows one generic message", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Username").fill(ADMIN.username);
  await page.getByLabel("Password").fill("not-the-admin-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert")).toHaveText("Invalid username or password");
});

test("a reused refresh token lands on /login", async ({ page, context, request }) => {
  const user = await registerUser(request);
  await signIn(page, user);
  const stolen = (await context.cookies()).find((c) => c.name === "refresh_token");
  expect(stolen).toBeDefined();

  // A reload refreshes at boot, which rotates the cookie
  const rotated = page.waitForResponse(isRefresh);
  await page.reload();
  expect((await rotated).status()).toBe(200);
  await expect(signedIn(page, user)).toBeVisible();

  // Put the rotated-out cookie back: the next refresh is a replay, which revokes the session
  const { name, value, domain, path, expires, httpOnly, secure, sameSite } = stolen!;
  await context.addCookies([{ name, value, domain, path, expires, httpOnly, secure, sameSite }]);
  const reused = page.waitForResponse(isRefresh);
  await page.reload();
  expect((await reused).status()).toBe(401);
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});
