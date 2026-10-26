import { expect, test } from "@playwright/test";

// READ-ONLY layout checks on public pages, run at desktop and phone sizes.

for (const path of ["/", "/auth", "/admin"]) {
  test(`${path} has no horizontal scroll`, async ({ page }) => {
    await page.goto(path);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
}

test("sign-in form is keyboard reachable", async ({ page }) => {
  await page.goto("/auth");
  const email = page.getByLabel("Email");
  await email.focus();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Password")).toBeFocused();
});
