import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { ADMIN, registerUser, seedExpenses, signIn } from "./helpers";

// Axe (all rules, including color-contrast, which jsdom cannot compute) on the main screens in both color
// schemes at phone and desktop width. Screenshots are attached to the report as artifacts,
// never compared against baselines.
const SCHEMES = ["light", "dark"] as const;
const WIDTHS = [360, 1280] as const;

for (const colorScheme of SCHEMES) {
  for (const width of WIDTHS) {
    test(`main screens have no axe violations (${colorScheme}, ${width}px)`, async ({ browser, page, request }, testInfo) => {
      await page.setViewportSize({ width, height: 800 });
      await page.emulateMedia({ colorScheme });
      const user = await registerUser(request);
      await seedExpenses(request, user, "Axe");

      // The public screens first
      const screens: { name: string; path: string }[] = [{ name: "login", path: "/login" }, { name: "register", path: "/register" }];
      for (const screen of screens) {
        await page.goto(screen.path);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await check(page, testInfo, `${screen.name}-${colorScheme}-${width}`);
      }

      await signIn(page, user);
      const signedInScreens: { name: string; path: string; ready: () => Promise<void> }[] = [
        { name: "list", path: "/", ready: () => expect(page.getByRole("table", { name: "Expenses table" }).or(page.locator("table.expense-table")).first()).toBeVisible() },
        { name: "new", path: "/expenses/new", ready: () => expect(page.getByLabel("Description")).toBeVisible() },
        { name: "archived", path: "/archived", ready: () => expect(page.getByRole("heading", { level: 1 })).toBeVisible() },
        { name: "profile", path: "/me", ready: () => expect(page.getByRole("heading", { level: 1 })).toBeVisible() },
      ];
      for (const screen of signedInScreens) {
        // Full navigation: the session survives it through the refresh cookie
        await page.goto(screen.path);
        await screen.ready();
        await check(page, testInfo, `${screen.name}-${colorScheme}-${width}`);
      }

      // The detail screen of the first seeded row
      await page.goto("/");
      await page.locator("table.expense-table tbody a").first().click();
      await expect(page.getByRole("button", { name: "Edit description" })).toBeVisible();
      await check(page, testInfo, `detail-${colorScheme}-${width}`);

      // The admin screens, in a context of their own so the user's session is untouched
      const adminContext = await browser.newContext({
        baseURL: testInfo.project.use.baseURL,
        viewport: { width, height: 800 },
        colorScheme,
      });
      const admin = await adminContext.newPage();
      await signIn(admin, ADMIN);
      await admin.goto("/admin/users");
      await expect(admin.getByRole("region", { name: "Users table" })).toBeVisible();
      await check(admin, testInfo, `admin-users-${colorScheme}-${width}`);
      await admin.getByRole("link", { name: ADMIN.username, exact: true }).click();
      await expect(admin.getByRole("form", { name: "Edit user" })).toBeVisible();
      await check(admin, testInfo, `admin-user-${colorScheme}-${width}`);
      await adminContext.close();
    });
  }
}

async function check(page: import("@playwright/test").Page, testInfo: import("@playwright/test").TestInfo, name: string) {
  const results = await new AxeBuilder({ page }).analyze();
  const png = await page.screenshot({ fullPage: true });
  await testInfo.attach(name, { body: png, contentType: "image/png" });
  const summary = results.violations.flatMap((v) => v.nodes.map((n) => `${v.id}: ${n.target.join(" ")} (${n.any[0]?.message ?? ""})`));
  expect(summary, `axe violations on ${name}`).toEqual([]);
}
