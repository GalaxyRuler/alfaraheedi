import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function openCleanApp(page: Page) {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.clear();
  });
  await page.reload();
  await expect(page.getByRole("heading", { name: "الفراهيدي" })).toBeVisible();
  await expect(page.getByTestId("health")).toContainText("المحرك متصل");
}

async function editorText(page: Page) {
  return page.locator(".cm-content").innerText();
}

test.beforeEach(async ({ page }) => {
  await openCleanApp(page);
});

test("loads the packaged RTL workbench without automated accessibility violations", async ({
  page,
}) => {
  await expect(page.locator(".app")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("main")).toBeVisible();
  await expect(page.getByRole("button", { name: "تحليل" })).toBeDisabled();
  await expect(page.getByLabel("محرر النص العربي")).toBeVisible();

  const results = await new AxeBuilder({ page })
    .disableRules(["color-contrast"])
    .analyze();

  expect(results.violations).toEqual([]);
});

test("analyzes example text and applies only safe fixes", async ({ page }) => {
  await page.getByRole("button", { name: "مثال" }).click();
  await expect(page.getByRole("button", { name: "تحليل" })).toBeEnabled();

  await page.getByRole("button", { name: "تحليل" }).click();

  await expect(page.getByTestId("suggestion-count")).toContainText("5");
  await expect(page.getByTestId("suggestion-count")).toContainText("آمنة 2");
  await expect(page.getByText("arabic:tatweel")).toBeVisible();
  await expect(page.getByText("arabic:latin-question-mark")).toBeVisible();

  await page.getByRole("button", { name: /إصلاحات آمنة/ }).click();

  await expect(page.getByTestId("notice")).toContainText("طُبّقت 2");
  await expect(page.getByTestId("suggestion-count")).toContainText("3");

  const text = await editorText(page);
  expect(text).toContain("مرحبا بالعالم، كيف حالك? أنا بخير, شكرًا ؛");
  expect(text).not.toContain("ــ");
  expect(text).not.toContain("  ");
});

test("keeps local LLM unavailable state suggestion-only and manual", async ({
  page,
}) => {
  await page.getByRole("button", { name: "مثال" }).click();
  await page.getByRole("button", { name: "اقتراح النموذج" }).click();

  const alert = page.getByRole("alert");
  await expect(alert).toContainText("تعذّر إنشاء اقتراح");
  await expect(alert).toContainText("اقتراحية فقط");
});

test("exports a privacy-first feedback report from analyzed text", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-write"]);
  await page.getByRole("button", { name: "مثال" }).click();
  await page.getByRole("button", { name: "تحليل" }).click();
  await expect(page.getByTestId("suggestion-count")).toContainText("5");

  await page.getByRole("button", { name: "تقرير التحليل" }).click();

  await expect(
    page.getByRole("dialog", { name: "تقرير ملاحظات" }),
  ).toBeVisible();

  const output = page.getByLabel("نص التقرير");
  await expect(output).toHaveValue(/Raw text was not included\./);
  await expect(output).not.toHaveValue(/مرحبــا {2}بالعالم/);

  await page.getByRole("radio", { name: "النص الكامل" }).click();
  await expect(output).toHaveValue(/مرحبــا {2}بالعالم/);

  const issueHref = await page
    .getByRole("link", { name: "فتح مسألة GitHub" })
    .getAttribute("href");
  expect(issueHref).toContain("github.com/GalaxyRuler/alfaraheedi");

  await page.getByRole("button", { name: "نسخ التقرير" }).click();
  await expect(page.getByRole("button", { name: "نُسخ التقرير" })).toBeVisible();
});

test("opens rules, model policy, and settings drawers", async ({ page }) => {
  await page.getByRole("button", { name: "القواعد" }).click();
  await expect(page.getByRole("dialog", { name: "القواعد" })).toBeVisible();
  await expect(page.getByTestId("rule-list")).toContainText("arabic:tatweel");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "القواعد" })).toBeHidden();

  await page.getByRole("button", { name: "النموذج المحلي" }).click();
  await expect(
    page.getByRole("dialog", { name: "النموذج المحلي" }),
  ).toBeVisible();
  await expect(page.getByTestId("llm-panel")).toContainText("qwen3-1.7b-q4_k_m");
  await expect(page.getByTestId("llm-panel")).toContainText("لا");
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("dialog", { name: "النموذج المحلي" }),
  ).toBeHidden();

  await page.getByRole("button", { name: "الإعدادات" }).click();
  await expect(page.getByRole("dialog", { name: "الإعدادات" })).toBeVisible();
  await page.getByText("English", { exact: true }).click();
  await expect(page.getByRole("heading", { name: "Alfaraheedi" })).toBeVisible();
  await expect(page.locator(".app")).toHaveAttribute("dir", "ltr");
});

test("does not introduce horizontal overflow on supported viewports", async ({
  page,
}) => {
  await page.getByRole("button", { name: "مثال" }).click();
  await page.getByRole("button", { name: "تحليل" }).click();
  await expect(page.getByTestId("suggestion-count")).toBeVisible();

  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));

  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
});
