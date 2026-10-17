import { expect, test } from "@playwright/test";
import { isRefresh, registerUser, signIn, signedIn } from "./helpers";

test("two tabs refreshing together stay signed in", async ({ page, context, request }) => {
  // Waits for a scheduled refresh: 75 s tokens are refreshed 15 s after each refresh
  test.setTimeout(90_000);
  const user = await registerUser(request);
  await signIn(page, user);
  const other = await context.newPage();

  const statuses: number[] = [];
  for (const p of [page, other]) {
    p.on("response", (response) => {
      if (isRefresh(response)) statuses.push(response.status());
    });
  }

  await other.goto("/");
  await expect(signedIn(other, user)).toBeVisible();

  // Both boot refreshes start at once and share one cookie; the Web Lock makes the
  // second wait and send the cookie the first one received, so neither is a replay
  await Promise.all([page.reload(), other.reload()]);
  // Their scheduled refreshes then fire at about the same time too
  await expect.poll(() => statuses.length, { timeout: 40_000 }).toBeGreaterThanOrEqual(5);
  expect(statuses.filter((s) => s !== 200)).toEqual([]);

  for (const p of [page, other]) {
    await expect(signedIn(p, user)).toBeVisible();
    await p.getByRole("link", { name: "Archived", exact: true }).click();
    await p.getByRole("link", { name: "Expenses", exact: true }).click();
    await expect(p.getByRole("heading", { name: "Expenses", level: 2 })).toBeVisible();
    await expect(p).toHaveURL(/\/$/);
  }
});
