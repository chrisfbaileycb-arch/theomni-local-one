const { test, expect } = require('./fixtures');
const { watchPage, expectClean, toast } = require('./helpers');

test.describe('public scan-to-play page', () => {
  test('a guest signs up, spins, wins a code, and cannot play twice in a week', async ({ newContext }) => {
    const ctx = await newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
    const page = await ctx.newPage();
    const problems = watchPage(page);
    const email = `guest-${Date.now()}@example.com`;
    await page.goto('/spin?space=Door%20Decal');
    await expect(page.getByTestId('spin-play')).toBeVisible();
    await expect(page.getByTestId('play-spin-btn')).toBeVisible();

    await page.getByTestId('play-spin-btn').click();
    await expect(page.getByTestId('spin-error')).toContainText('agree');
    await page.getByTestId('spin-agree-checkbox').check();
    await page.getByTestId('play-spin-btn').click();
    await expect(page.getByTestId('spin-error')).toContainText('email or mobile');
    await page.getByTestId('spin-name-input').fill('Door Guest');
    await page.getByTestId('spin-email-input').fill(email);
    await page.getByTestId('play-spin-btn').click();
    await expect(page.getByTestId('spin-won')).toBeVisible({ timeout: 10000 });
    const code = (await page.getByTestId('won-code').innerText()).trim();
    expect(code).toMatch(/^HV-/);
    await page.getByTestId('copy-code-btn').click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(code);

    // Same guest again -> limited screen with the existing code.
    await page.goto('/spin?space=Door%20Decal');
    await page.getByTestId('spin-agree-checkbox').check();
    await page.getByTestId('spin-email-input').fill(email);
    await page.getByTestId('play-spin-btn').click();
    await expect(page.getByTestId('spin-limited')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('existing-code')).toHaveText(code);

    // The scan/spin were attributed to the placement.
    const loc = await page.request.get('/api/maximizer/locations').then((r) => r.json());
    expect(loc.spots.find((s) => s.name === 'Door Decal').spins).toBeGreaterThan(0);
    await expectClean(problems, { allowBad: ['/api/maximizer/spin -> 429'] });
    await ctx.close();
  });

  test('paused games show the check-back-soon screen', async ({ page, request }) => {
    await request.put('/api/maximizer/game-settings', { data: { enabled: false } });
    try {
      await page.goto('/spin');
      await expect(page.getByTestId('spin-paused')).toBeVisible();
    } finally {
      await request.put('/api/maximizer/game-settings', { data: { enabled: true } });
    }
  });
});

test.describe('pricing & payments', () => {
  test('checkout lands on the success page and confirms; cancel page links back', async ({ page }) => {
    const problems = watchPage(page);
    await page.goto('/pricing');
    await expect(page.getByTestId('plan-omnilocal_monthly')).toBeVisible();
    await expect(page.getByTestId('plan-omnilocal_yearly')).toBeVisible();
    await page.getByTestId('checkout-omnilocal_yearly-btn').click();
    await expect(page).toHaveURL(/\/payment\/success\?session_id=demo_/);
    await expect(page.getByTestId('payment-success')).toBeVisible({ timeout: 15000 });
    await page.goto('/payment/cancel');
    await page.getByTestId('back-to-pricing-link').click();
    await expect(page.getByTestId('pricing-page')).toBeVisible();
    await expectClean(problems);
  });
});
