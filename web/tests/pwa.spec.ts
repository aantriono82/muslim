import { expect, test, type Page } from "@playwright/test";

const waitForServiceWorkerReady = async (page: Page) => {
  await page.waitForFunction(() => "serviceWorker" in navigator);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect
    .poll(async () => {
      return page.evaluate(() => Boolean(navigator.serviceWorker.controller));
    })
    .toBe(true);
};

test("manifest has installable metadata and icon assets", async ({ page }) => {
  await page.goto("/");

  const manifestHref = await page
    .locator('link[rel="manifest"]')
    .first()
    .getAttribute("href");
  expect(manifestHref).toBeTruthy();

  const manifestUrl = new URL(manifestHref!, page.url()).toString();
  const manifestResponse = await page.request.get(manifestUrl);
  expect(manifestResponse.ok()).toBeTruthy();

  const manifest = await manifestResponse.json();
  expect(manifest.name).toBe("MuslimKit");
  expect(manifest.short_name).toBe("MuslimKit");
  expect(manifest.display).toBe("standalone");
  expect(manifest.start_url).toBe("/");
  expect(manifest.theme_color).toBe("#2e7d32");
  expect(Array.isArray(manifest.icons)).toBeTruthy();
  expect(
    manifest.icons.some((icon: { sizes?: string }) => icon.sizes === "192x192"),
  ).toBeTruthy();
  expect(
    manifest.icons.some((icon: { sizes?: string }) => icon.sizes === "512x512"),
  ).toBeTruthy();
  expect(
    manifest.icons.some((icon: { purpose?: string }) =>
      (icon.purpose ?? "").includes("maskable"),
    ),
  ).toBeTruthy();

  for (const icon of manifest.icons as Array<{ src?: string }>) {
    if (!icon.src) continue;
    const iconUrl = new URL(icon.src, page.url()).toString();
    const iconResponse = await page.request.get(iconUrl);
    expect(iconResponse.ok(), `Icon not reachable: ${iconUrl}`).toBeTruthy();
  }
});

test("service worker is registered and controls the page", async ({ page }) => {
  await page.goto("/");
  await waitForServiceWorkerReady(page);

  const swStatus = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    const ready = await navigator.serviceWorker.ready;
    return {
      hasRegistration: Boolean(registration),
      scope: registration?.scope ?? "",
      hasActiveWorker: Boolean(ready.active),
      controlled: Boolean(navigator.serviceWorker.controller),
    };
  });

  expect(swStatus.hasRegistration).toBe(true);
  expect(swStatus.hasActiveWorker).toBe(true);
  expect(swStatus.controlled).toBe(true);
  expect(swStatus.scope).toContain("/");
});

test("offline navigation fallback works for app routes", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await waitForServiceWorkerReady(page);

  await context.setOffline(true);

  await page.goto("/disclaimer", { waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("heading", { name: "Disclaimer" }),
  ).toBeVisible();

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("heading", { name: "Disclaimer" }),
  ).toBeVisible();

  await page.goto("/rute-tidak-ada", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Halaman Tidak Ditemukan")).toBeVisible();

  await context.setOffline(false);
});
