import { expect, test } from "@playwright/test";

test("health endpoint reports a ready application", async ({ page }) => {
  const response = await page.request.get("/api/health");
  expect(response.status()).toBe(200);
  await expect(response).toBeOK();
  await expect(response.json()).resolves.toMatchObject({ ok: true, dev: true });
});
