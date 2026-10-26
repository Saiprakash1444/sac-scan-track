import { expect, test, type Page } from "@playwright/test";

// READ-ONLY. Safe against production: loads public pages and assets, never signs
// in, never submits a form.

function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && errors.push(`console: ${m.text()}`));
  page.on("response", (r) => r.status() >= 500 && errors.push(`${r.status()} ${r.url()}`));
  return errors;
}

test("landing page loads cleanly and links to sign-in and admin", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Member sign in" })).toHaveAttribute("href", "/auth");
  await expect(page.getByRole("link", { name: "Admin panel" })).toHaveAttribute("href", "/admin");
  expect(errors).toEqual([]);
});

for (const path of ["/home", "/find", "/scan", "/my-items", "/requests", "/dashboard"]) {
  test(`protected ${path} redirects a signed-out visitor to /auth`, async ({ page }) => {
    await page.goto(path);
    await page.waitForURL(/\/auth/);
    expect(new URL(page.url()).searchParams.get("redirect")).toBe(path);
    await expect(page.getByRole("heading", { name: "Member sign in" })).toBeVisible();
  });
}

test("sign-in form has labelled email and password fields", async ({ page }) => {
  await page.goto("/auth");
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Password")).toHaveAttribute("type", "password");
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
});

test("admin panel asks for a password and shows no data", async ({ page }) => {
  await page.goto("/admin");
  await expect(page.locator('input[type="password"]')).toBeVisible();
  await expect(page.getByRole("tab", { name: "Loans" })).toHaveCount(0);
});

test("unknown route renders a not-found page, not a crash", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/definitely-not-a-page");
  await expect(page.locator("body")).not.toBeEmpty();
  expect(errors.filter((e) => e.startsWith("pageerror") || /^5\d\d /.test(e))).toEqual([]);
});

test("PWA manifest is valid", async ({ request }) => {
  const res = await request.get("/manifest.webmanifest");
  expect(res.ok()).toBe(true);
  const manifest = await res.json();
  expect(manifest.name || manifest.short_name).toBeTruthy();
  expect(manifest.start_url).toBeTruthy();
  expect(["standalone", "fullscreen", "minimal-ui"]).toContain(manifest.display);
  expect(manifest.icons?.some((i: { sizes?: string }) => /192|512/.test(i.sizes ?? ""))).toBe(true);
});

test("no service worker is registered (offline is NOT supported)", async ({ page }) => {
  await page.goto("/");
  const count = await page.evaluate(async () =>
    "serviceWorker" in navigator ? (await navigator.serviceWorker.getRegistrations()).length : 0,
  );
  expect(count).toBe(0);
});

test("cron endpoint refuses unauthenticated calls", async ({ request }) => {
  const res = await request.get("/api/cron/daily");
  expect([401, 503]).toContain(res.status());
  const auth = await request.get("/api/cron/daily", { headers: { authorization: "Bearer wrong" } });
  expect([401, 503]).toContain(auth.status());
});

test("no server secrets in the browser bundle", async ({ page }) => {
  const bodies: string[] = [];
  page.on("response", async (r) => {
    if (r.request().resourceType() === "script") bodies.push(await r.text().catch(() => ""));
  });
  for (const path of ["/", "/auth", "/admin"]) await page.goto(path, { waitUntil: "networkidle" });
  const all = bodies.join("\n");
  expect(all.length).toBeGreaterThan(1000);
  // Report only which marker matched — never print bundle text (it could hold a secret).
  const markers = [
    "SUPABASE_SERVICE_ROLE_KEY",
    "SAC_ADMIN_PASSWORD",
    "ADMIN_SESSION_SECRET",
    "GEMINI_API_KEY",
    "CRON_SECRET",
    '"role":"service_role"',
  ];
  expect(markers.filter((m) => all.includes(m))).toEqual([]);
  // supabase-js ships the bare "sb_secret_" prefix to detect misuse; only a prefix
  // followed by key characters would be an actual leaked secret key.
  expect(/sb_secret_[A-Za-z0-9_-]{10,}/.test(all)).toBe(false);
  // A service-role JWT has "service_role" in its base64 payload.
  expect(/eyJ[\w-]+\.eyJ[\w-]*c2VydmljZV9yb2xl[\w-]*\./.test(all)).toBe(false);
});
