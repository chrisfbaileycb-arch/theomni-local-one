const { test, expect } = require('./fixtures');
const { watchPage, expectClean, openApp, goTo, toast, expectNoLeakedValues } = require('./helpers');

async function openDashboard(page) {
  await openApp(page);
  await goTo(page, 'dashboard');
  await expect(page.getByTestId('spin-dashboard')).toBeVisible();
}

test.describe('spin & vouchers dashboard', () => {
  test('spinning the wheel mints a claim code that staff can redeem', async ({ newContext }) => {
    const ctx = await newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
    const page = await ctx.newPage();
    const problems = watchPage(page);
    await openDashboard(page);
    await expect(page.getByTestId('wheel-container')).toBeVisible();
    await expect(page.getByTestId('spinning-wheel-svg')).toBeVisible();
    await expectNoLeakedValues(page);

    await page.getByRole('button', { name: /Sound On/ }).click();
    await expect(page.getByRole('button', { name: /Muted/ })).toBeVisible();
    await page.getByTestId('center-spin-btn').click();
    await expect(page.getByTestId('winner-card')).toBeVisible({ timeout: 15000 });
    const code = (await page.getByTestId('winner-card').locator('.font-mono, .mono').filter({ hasText: /^OL-/ }).first().innerText()).trim();
    expect(code).toMatch(/^OL-[A-Z0-9]+-[A-Z0-9]+$/);
    await page.getByTestId('copy-won-code').click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(code);

    // The code is now in the server ledger.
    const lookup = await page.request.get(`/api/codes/voucher-lookup?q=${encodeURIComponent(code)}`).then((r) => r.json());
    expect(lookup.total).toBe(1);

    await expect(page.getByTestId('rewards-history-section')).toContainText(code);
    await page.getByRole('button', { name: /Staff 1-Click POS Redemption Ledger/ }).click();
    await expect(page.getByTestId('staff-lookup-view')).toBeVisible();
    const row = page.getByTestId('staff-lookup-view').locator('tr').filter({ hasText: code });
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: /Mark Redeemed/ }).click();
    await page.getByRole('button', { name: /Lock & Reconcile Sale/ }).click();
    await expect(toast(page, `Voucher ${code} Verified`)).toBeVisible();
    await expect(row).toContainText('Redeemed');

    const ledger = await page.request.get('/api/codes/export.csv');
    expect(ledger.headers()['content-type']).toContain('text/csv');
    expect(await ledger.text()).toContain(`"${code}"`);
    await expectClean(problems);
    await ctx.close();
  });

  test('Add Plays, spin CTA and rewards history filters', async ({ page }) => {
    const problems = watchPage(page);
    await openDashboard(page);
    await page.getByRole('button', { name: /Add Plays/ }).click();
    await page.getByTestId('spin-cta-button').click();
    await expect(page.getByTestId('winner-card')).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: /Interactive Lucky Wheel/ }).click();
    await expect(page.getByTestId('rewards-history-section')).toBeVisible();
    await page.getByRole("button", { name: /4-Week Rest Cadence Schedule/ }).click();
    await expect(page.getByTestId('rest-schedule-view')).toBeVisible();
    await expectClean(problems);
  });

  test('cadence controls: sprint, rest mode and the margin floor modal', async ({ page }) => {
    const problems = watchPage(page);
    await openDashboard(page);
    await expect(page.getByTestId('anti-fatigue-banner')).toBeVisible();
    await page.getByRole('button', { name: /Switch to Rest Mode/ }).click();
    await expect(toast(page, 'Rest & Nurture Mode')).toBeVisible();
    await page.getByRole('button', { name: /Launch 7-Day Sprint/ }).click();
    await expect(toast(page, 'Sprint Launched')).toBeVisible();
    await page.getByRole('button', { name: /Tune Margin Floor/ }).first().click();
    await expect(page.getByRole('heading', { name: /Tune Margin Floor/ })).toBeVisible();
    await page.getByRole('button', { name: /Lock Margin Floor/ }).click();
    await expect(toast(page, 'Margin Floor Locked')).toBeVisible();
    const cadence = await page.request.get('/api/campaign/cadence').then((r) => r.json());
    expect(cadence.mode).toBe('sprint');
    await expectClean(problems);
  });
});
