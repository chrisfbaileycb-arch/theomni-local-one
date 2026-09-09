const { test, expect } = require('./fixtures');
const { watchPage, expectClean, openApp, goTo, toast, expectNoLeakedValues } = require('./helpers');

async function openExec(page) {
  await openApp(page);
  await goTo(page, 'executioner');
  await expect(page.getByTestId('run-week-btn')).toBeVisible();
}

test.describe('content executioner (ad engine)', () => {
  test('run next week advances the learning loop and reset returns to week 1', async ({ page }) => {
    const problems = watchPage(page);
    await openExec(page);
    await expect(page.getByTestId('strategy-A')).toBeVisible();
    await expect(page.getByTestId('strategy-B')).toBeVisible();
    await expectNoLeakedValues(page);
    const zipsBefore = await page.locator('[data-testid^="zip-"]').count();
    expect(zipsBefore).toBeGreaterThan(0);

    const before = await page.request.get('/api/executioner/reports').then((r) => r.json());
    await page.getByTestId('run-week-btn').click();
    await expect(toast(page, 'Week reconciled')).toBeVisible();
    const after = await page.request.get('/api/executioner/reports').then((r) => r.json());
    expect(after.reports.length).toBe(before.reports.length + 1);
    await page.getByTestId('run-week-btn').click();
    await expect(toast(page, 'Week reconciled')).toBeVisible();
    await page.getByTestId('reset-loop-btn').click();
    await expect(toast(page, 'Loop reset')).toBeVisible();
    const reset = await page.request.get('/api/executioner/reports').then((r) => r.json());
    expect(reset.reports.length).toBe(2);
    await expectClean(problems);
  });

  test('POS transaction import switches the badge to real data and clears back to demo', async ({ page }) => {
    const problems = watchPage(page);
    await openExec(page);
    await expect(page.getByTestId('data-source-badge')).toContainText('DEMO');
    await page.getByTestId('import-tx-btn').click();
    await expect(toast(page, 'Paste a CSV or load the sample first')).toBeVisible();
    await page.getByTestId('load-sample-tx-btn').click();
    await expect(page.getByTestId('tx-csv-input')).toHaveValue(/Net Sales/);
    await page.getByTestId('import-tx-btn').click();
    await expect(toast(page, 'Imported 6 real orders')).toBeVisible();
    await expect(page.getByTestId('import-result')).toContainText('1 skipped');
    await expect(page.getByTestId('data-source-badge')).not.toContainText('DEMO');
    await expect(page.getByTestId('recommended-plan')).toBeVisible();
    await page.getByTestId('clear-tx-btn').click();
    await expect(toast(page, 'Real orders cleared')).toBeVisible();
    await expect(page.getByTestId('data-source-badge')).toContainText('DEMO');

    await page.getByTestId('tx-csv-input').fill('garbage');
    await page.getByTestId('import-tx-btn').click();
    await expect(toast(page, 'Import failed')).toBeVisible();
    await expectClean(problems, { allowBad: ['/api/executioner/import-transactions -> 400'] });
  });

  test('recommended plan is gated by connected platforms and the coach explains each strategy', async ({ page }) => {
    const problems = watchPage(page);
    await openExec(page);
    await expect(page.getByTestId('recommended-plan')).toBeVisible();
    await expect(page.getByTestId('diversification-tip')).toBeVisible();
    await expect(page.getByTestId('plan-strategy-A')).toBeVisible();
    await expect(page.getByTestId('excluded-tiktok')).toBeVisible();

    await page.getByTestId('connect-tiktok').click();
    await expect(toast(page, 'TikTok Business authorized')).toBeVisible();
    await expect(page.getByTestId('disconnect-tiktok')).toBeVisible();
    await page.reload();
    await goTo(page, 'executioner');
    await expect(page.getByTestId('excluded-tiktok')).toHaveCount(0);
    await page.getByTestId('disconnect-facebook').click();
    await expect(page.getByTestId('connect-facebook')).toBeVisible();
    await page.reload();
    await goTo(page, 'executioner');
    await expect(page.getByTestId('excluded-facebook')).toBeVisible();
    await page.getByTestId('connect-facebook').click();
    await expect(page.getByTestId('disconnect-facebook')).toBeVisible();
    await page.getByTestId('disconnect-tiktok').click();
    await expect(page.getByTestId('connect-tiktok')).toBeVisible();

    await page.getByTestId('coach-how-btn-A').click();
    await expect(toast(page, 'Build template ready')).toBeVisible();
    await expect(page.getByTestId('coach-template-panel')).toContainText('Key Elements');
    await expectNoLeakedValues(page, page.getByTestId('coach-template-panel'));
    await expectClean(problems);
  });
});
