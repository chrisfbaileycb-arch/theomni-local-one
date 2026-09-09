const { test, expect } = require('./fixtures');
const { watchPage, expectClean, openApp, goTo, toast, expectNoLeakedValues } = require('./helpers');

test.describe('command center (overview) + weekly win report', () => {
  test('hero, metrics and shortcut buttons navigate', async ({ page }) => {
    const problems = watchPage(page);
    await openApp(page);
    await expect(page.getByTestId('hero-revenue')).toContainText('$');
    await expect(page.getByTestId('metric-blended-roas')).toBeVisible();
    await expect(page.getByTestId('metric-new-customers')).toBeVisible();
    await expect(page.getByTestId('valpak-card')).toBeVisible();
    await expect(page.getByTestId('ourway-card')).toBeVisible();
    await expectNoLeakedValues(page);

    await page.getByTestId('go-attribution-btn').click();
    await expect(page.getByTestId('attribution-hub-section')).toBeVisible();
    await goTo(page, 'overview');
    await page.getByTestId('go-knowledge-btn').click();
    await expect(page.getByTestId('knowledge-base-section')).toBeVisible();
    await goTo(page, 'overview');
    await page.getByTestId('launch-spin-dashboard-btn').click();
    await expect(page.getByTestId('spin-dashboard')).toBeVisible();
    await goTo(page, 'overview');
    // Before any POS import this week the nudge banner sends you to the importer.
    if (await page.getByTestId('import-nudge-banner').isVisible().catch(() => false)) {
      await page.getByTestId('import-nudge-go-btn').click();
      await expect(page.getByTestId('csv-import')).toBeVisible();
    }
    await expectClean(problems);
  });

  test('mobile navigation strip switches sections', async ({ newContext }) => {
    const ctx = await newContext({ viewport: { width: 420, height: 860 } });
    const page = await ctx.newPage();
    await page.goto('/');
    await expect(page.getByTestId('mnav-overview')).toBeVisible();
    await page.getByTestId('mnav-team').click();
    await expect(page.getByTestId('team-page')).toBeVisible();
    await page.getByTestId('mnav-maximizer').click();
    await expect(page.getByTestId('games-module')).toBeVisible();
    await ctx.close();
  });

  test('weekly win report renders and the one-pager downloads as a PDF', async ({ page }) => {
    const problems = watchPage(page);
    await openApp(page);
    const report = page.getByTestId('weekly-win-report');
    await expect(report).toBeVisible();
    await expect(page.getByTestId('win-stat-redeemed')).toBeVisible();
    await expect(page.getByTestId('win-stat-revenue')).toContainText('$');
    await expect(page.getByTestId('win-top-spot')).not.toBeEmpty();
    await expect(page.getByTestId('win-top-game')).not.toBeEmpty();
    await expectNoLeakedValues(page, report);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('win-report-pdf-btn').click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/weekly-win-report.*\.pdf$/);
    const res = await page.request.get('/api/maximizer/weekly-report.pdf');
    expect(res.headers()['content-type']).toContain('application/pdf');
    expect((await res.body()).subarray(0, 5).toString()).toBe('%PDF-');
    await expectClean(problems);
  });

  test('ad spend log adds and removes entries', async ({ page }) => {
    const problems = watchPage(page);
    await openApp(page);
    const log = page.getByTestId('ad-spend-log');
    await expect(log).toBeVisible();
    await page.getByTestId('ad-spend-add-btn').click();
    await expect(toast(page, 'Enter an amount greater than $0')).toBeVisible();
    await page.getByTestId('ad-spend-platform').selectOption({ index: 1 });
    await page.getByTestId('ad-spend-label').fill('E2E boost');
    await page.getByTestId('ad-spend-amount').fill('42.50');
    await page.getByTestId('ad-spend-add-btn').click();
    await expect(toast(page, 'Spend logged')).toBeVisible();
    const entry = log.locator('[data-testid^="ad-spend-entry-"]').filter({ hasText: 'E2E boost' });
    await expect(entry).toBeVisible();
    const id = (await entry.getAttribute('data-testid')).replace('ad-spend-entry-', '');
    await page.getByTestId(`ad-spend-delete-${id}`).click();
    await expect(entry).toHaveCount(0);
    await expectClean(problems, { allowBad: ['/api/maximizer/ad-spend -> 400'] });
  });

  test('Monday report email settings save and "send now" records a send', async ({ page }) => {
    const problems = watchPage(page);
    await openApp(page);
    const box = page.getByTestId('report-email-settings');
    await expect(box).toBeVisible();
    await expect(page.getByTestId('report-email-mode')).toBeVisible();
    await page.getByTestId('report-email-toggle').uncheck();
    await expect(toast(page, 'Monday auto-email updated')).toBeVisible();
    await page.getByTestId('report-email-toggle').check();
    await page.getByTestId('report-email-recipient').fill('reports@ironandneedle.com');
    await page.getByTestId('report-email-recipient').blur();
    await expect(toast(page, 'Monday auto-email updated')).toBeVisible();
    await page.getByTestId('report-email-tz').selectOption('America/Chicago');
    await page.getByTestId('report-email-send-now').click();
    await expect(toast(page, 'reports@ironandneedle.com')).toBeVisible();
    await expect(page.getByTestId('report-email-status')).toContainText('Last sent');
    await expectNoLeakedValues(page, box);
    await expectClean(problems);
  });
});
