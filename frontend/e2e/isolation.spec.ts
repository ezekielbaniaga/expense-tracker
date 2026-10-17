import { expect, test } from "@playwright/test";
import { createExpense, registerUser, signIn } from "./helpers";

test("another user's expense is Not found", async ({ browser, page, request }) => {
  const owner = await registerUser(request);
  const stranger = await registerUser(request);
  await signIn(page, owner);
  const id = await createExpense(page, "Owner only");

  // A separate context: its own cookie jar, so its own session
  const strangerContext = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  const strangerPage = await strangerContext.newPage();
  await signIn(strangerPage, stranger);
  await strangerPage.goto(`/expenses/${id}`);
  await expect(strangerPage.getByRole("heading", { name: "Not found" })).toBeVisible();
  await expect(strangerPage.getByText("Owner only")).toHaveCount(0);
  await strangerContext.close();
});
