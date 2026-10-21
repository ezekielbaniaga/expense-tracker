import { expect, type APIRequestContext, type Page, type Response } from "@playwright/test";

export interface Credentials {
  username: string;
  password: string;
}

/** Seeded by the admin bootstrap from docker-compose.e2e.yml. */
export const ADMIN: Credentials = { username: "e2e-admin", password: "e2e-admin-test-password" };

/** A name no earlier run used, in case a killed run left the volume behind. */
export function uniqueName(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Registers a USER through the API (there is no register page yet). */
export async function registerUser(request: APIRequestContext): Promise<Credentials> {
  const user = { username: uniqueName("e2e-user"), password: "e2e-user-test-password" };
  const response = await request.post("/auth/register", { data: user });
  expect(response.status()).toBe(201);
  return user;
}

export function signedIn(page: Page, user: Credentials) {
  return page.getByRole("button", { name: `Account menu for ${user.username}` });
}

export async function signIn(page: Page, user: Credentials): Promise<void> {
  // Wait out the boot refresh (401 without a cookie), so its sign-out cannot land after the login
  const boot = page.waitForResponse(isRefresh);
  await page.goto("/login");
  await boot;
  await page.getByLabel("Username").fill(user.username);
  await page.getByLabel("Password", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(signedIn(page, user)).toBeVisible();
}

export function isRefresh(response: Response): boolean {
  return new URL(response.url()).pathname === "/auth/refresh";
}

/** Creates an expense through the form and returns its id; the page ends on its detail screen (opened from the list row). */
export async function createExpense(page: Page, description: string): Promise<string> {
  await page.goto("/expenses/new");
  await page.getByLabel("Description").fill(description);
  await page.getByLabel("Amount").fill("12.50");
  await page.getByRole("radio", { name: "Food" }).check();
  await page.getByRole("button", { name: "Add expense" }).click();
  await page.waitForURL((url) => url.pathname === "/");
  const link = page.getByRole("link", { name: description, exact: true });
  await expect(link).toBeVisible();
  const id = (await link.getAttribute("href"))!.split("/").pop()!;
  await link.click();
  await expect(page.getByRole("heading", { name: description })).toBeVisible();
  return id;
}

const CATEGORIES = ["FOOD", "TRANSPORT", "BILLS", "ENTERTAINMENT"] as const;
export const COUNT = 25;

/** Creates COUNT expenses (dated today, so inside "This month") through the API; amount is 10 * n. */
export async function seedExpenses(request: APIRequestContext, user: Credentials, tag: string): Promise<void> {
  const login = await request.post("/auth/login", { data: user, headers: { "X-API-Version": "1.0" } });
  expect(login.ok()).toBeTruthy();
  const { accessToken } = await login.json();
  const today = new Date().toISOString().slice(0, 10);
  for (let n = 1; n <= COUNT; n++) {
    const response = await request.post("/api/expense", {
      headers: { Authorization: `Bearer ${accessToken}`, "X-API-Version": "1.0" },
      data: {
        description: `${tag} item ${String(n).padStart(2, "0")}`,
        amount: n * 10,
        category: CATEGORIES[(n - 1) % CATEGORIES.length],
        date: today,
      },
    });
    expect(response.status()).toBe(200);
  }
}
