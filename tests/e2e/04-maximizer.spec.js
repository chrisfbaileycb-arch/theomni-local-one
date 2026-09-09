const { test, expect } = require('./fixtures');
const { watchPage, expectClean, openApp, goTo, toast, expectNoLeakedValues } = require('./helpers');

async function openMaximizer(page) {
  await openApp(page);
  await goTo(page, 'maximizer');
  await expect(page.getByTestId('games-module')).toBeVisible();
}

test.describe('customer maximizer', () => {
  test('page renders every module without leaked values', async ({ page }) => {
    const problems = watchPage(page);
    await openMaximizer(page);
    for (const id of ['games-module', 'game-planner', 'prize-board', 'qr-generator', 'redeem-station', 'location-spots', 'scan-to-spin', 'drip-campaign', 'csv-import', 'welcome-automation', 'members-panel', 'verification', 'code-batch', 'csv-reconcile']) {
      await expect(page.getByTestId(id), id).toBeVisible();
    }
    await expectNoLeakedValues(page);
    await expectClean(problems);
  });

  test('game planner: pin a game, schedule weeks, pause and resume, change rules', async ({ page }) => {
    const problems = watchPage(page);
    await openMaximizer(page);
    await page.getByTestId('game-scratch_card').click();
    await expect(toast(page, 'Active game set: Scratch & Win')).toBeVisible();
    await expect(page.getByTestId('active-game-title')).toContainText('Scratch & Win');
    await expect(page.getByTestId('game-scratch_card')).toContainText('pinned');

    await page.getByTestId('week-plan-0').selectOption('mystery_box');
    await expect(toast(page, 'Game plan updated')).toBeVisible();
    await expect(page.getByTestId('active-game-title')).toContainText('Vault Mystery Box');
    await expect(page.getByTestId('game-mystery_box')).toContainText('scheduled');
    await page.getByTestId('week-plan-1').selectOption('none');
    await expect(page.getByTestId('week-plan-1')).toHaveValue('none');
    await page.getByTestId('week-plan-0').selectOption('');
    await expect(page.getByTestId('active-game-title')).toContainText('Scratch & Win');

    await page.getByTestId('games-enabled-toggle').uncheck();
    await expect(page.getByTestId('games-paused-note')).toBeVisible();
    await expect(page.getByTestId('active-game-title')).toContainText('Paused');
    await page.getByTestId('games-enabled-toggle').check();
    await expect(page.getByTestId('games-paused-note')).toHaveCount(0);

    await page.getByTestId('play-frequency-select').selectOption('14');
    await expect(toast(page, 'Game rules updated')).toBeVisible();
    await page.getByTestId('code-expiry-select').selectOption('14');
    await expect(page.getByTestId('game-planner')).toContainText('Codes die after 14 days');
    await page.getByTestId('play-frequency-select').selectOption('7');
    await page.getByTestId('code-expiry-select').selectOption('7');
    await page.getByTestId('game-spin_wheel').click();
    await expectClean(problems);
  });

  test('prize board: edit, add, remove and save slots', async ({ page }) => {
    const problems = watchPage(page);
    await openMaximizer(page);
    const before = await page.locator('[data-testid^="prize-slot-"]').count();
    await page.getByTestId('prize-add-btn').click();
    await expect(page.locator('[data-testid^="prize-slot-"]')).toHaveCount(before + 1);
    await page.getByTestId(`prize-label-${before}`).fill('E2E Bonus Reward');
    await page.getByTestId(`prize-pos-${before}`).fill('E2E-BONUS');
    await page.getByTestId('dud-label').fill('E2E Courtesy Perk');
    await page.getByTestId('prize-save-btn').click();
    await expect(toast(page, 'Prize board')).toBeVisible();
    await page.reload();
    await goTo(page, 'maximizer');
    await expect(page.getByTestId(`prize-label-${before}`)).toHaveValue('E2E Bonus Reward');
    await page.getByTestId(`prize-remove-${before}`).click();
    await page.getByTestId('prize-save-btn').click();
    await expect(toast(page, 'Prize board')).toBeVisible();
    await expect(page.locator('[data-testid^="prize-slot-"]')).toHaveCount(before);
    await expectClean(problems);
  });

  test('QR generator: presets, image, play link and table tent PDF', async ({ page }) => {
    const problems = watchPage(page);
    await openMaximizer(page);
    await page.getByTestId('spot-chip-pizza-box').click();
    await expect(page.getByTestId('qr-space-input')).toHaveValue('Pizza Box');
    await page.getByTestId('generate-qr-btn').click();
    await expect(page.getByTestId('qr-output')).toBeVisible();
    await expect(page.getByTestId('qr-image')).toHaveAttribute('src', /^data:image\/png/);
    const href = await page.getByTestId('open-play-link').getAttribute('href');
    expect(href).toMatch(/^http.*\/spin\?space=Pizza%20Box$/);
    const tent = await page.request.get(await page.getByTestId('download-tent-btn').getAttribute('href'));
    expect(tent.headers()['content-type']).toContain('application/pdf');
    const sheet = await page.request.get(await page.getByTestId('qr-sheet-btn').getAttribute('href'));
    expect(sheet.headers()['content-type']).toContain('application/pdf');
    await expectClean(problems);
  });

  test('segment-aware demo spin issues tracked codes and the redeem station validates them', async ({ page }) => {
    const problems = watchPage(page);
    await openMaximizer(page);
    await page.getByTestId('guest-promo_pool').click();
    await page.getByTestId('spin-btn').click();
    await expect(page.getByTestId('spin-result')).toBeVisible();
    await expect(page.getByTestId('spin-result')).toContainText('Standard Reward');

    await page.getByTestId('guest-new').click();
    await page.getByTestId('spin-btn').click();
    await expect(page.getByTestId('spin-result')).toContainText('High-Value Reward');
    const code = (await page.getByTestId('spin-result').locator('.mono').innerText()).trim();
    expect(code).toMatch(/^HV-/);

    await page.getByTestId('redeem-btn').click();
    await expect(toast(page, 'Enter a coupon code')).toBeVisible();
    await page.getByTestId('redeem-code-input').fill('HV-NOPE00');
    await page.getByTestId('redeem-btn').click();
    await expect(page.getByTestId('redeem-result')).toContainText('Rejected');
    await page.getByTestId('redeem-code-input').fill(code);
    await page.getByTestId('redeem-net-input').fill('64');
    await page.getByTestId('redeem-btn').click();
    await expect(page.getByTestId('redeem-result')).toContainText('Valid');
    await expect(page.getByTestId('redeem-pos-code')).toBeVisible();
    await expect(page.getByTestId('redeem-code-input')).toHaveValue('');
    await page.getByTestId('redeem-code-input').fill(code);
    await page.getByTestId('redeem-btn').click();
    await expect(page.getByTestId('redeem-result')).toContainText('already_redeemed');
    await expect(page.getByTestId(`ledger-row-${code}`)).toBeVisible();
    await expectClean(problems);
  });

  test('weekly customer CSV import segments members and queues welcome videos', async ({ page }) => {
    const problems = watchPage(page);
    await openMaximizer(page);
    await expect(page.getByTestId('import-customers-btn')).toBeDisabled();
    await page.getByTestId('load-customers-btn').click();
    await expect(page.getByTestId('customer-csv-input')).toHaveValue(/name,email/);
    await page.getByTestId('customer-csv-input').fill('name,email,phone,orders_count,coupon_ratio\nE2E Newbie,e2e-new@example.com,555-9001,1,0\nE2E Regular,e2e-loyal@example.com,555-9002,9,0.1\n');
    await page.getByTestId('import-customers-btn').click();
    await expect(toast(page, 'queued for welcome video')).toBeVisible();
    await expect(page.getByTestId('import-result')).toContainText('New Customer');
    await expect(page.getByTestId('import-result')).toContainText('Loyal');
    await expect(page.getByTestId('members-table')).toContainText('E2E Newbie');
    const queue = page.getByTestId('welcome-automation');
    await expect(queue).toContainText('e2e-new@example.com');
    const item = queue.locator('[data-testid^="welcome-item-"]').filter({ hasText: 'e2e-new@example.com' });
    const idx = (await item.getAttribute('data-testid')).replace('welcome-item-', '');
    await page.getByTestId(`send-welcome-${idx}`).click();
    await expect(toast(page, 'Welcome video email triggered')).toBeVisible();
    await expect(item).toContainText('sent');
    const csv = await page.request.get(await page.getByTestId('export-members-btn').getAttribute('href'));
    expect(csv.headers()['content-type']).toContain('text/csv');
    expect(await csv.text()).toContain('e2e-new@example.com');
    await expectClean(problems);
  });

  test('bad CSV is rejected with a clear message', async ({ page }) => {
    const problems = watchPage(page);
    await openMaximizer(page);
    await page.getByTestId('customer-csv-input').fill('just,some,junk');
    await page.getByTestId('import-customers-btn').click();
    await expect(toast(page, 'Paste a CSV with a header row')).toBeVisible();
    await expectClean(problems, { allowBad: ['/api/maximizer/import-csv -> 400'] });
  });

  test('weekly codes: regenerate lengths, load the sample POS export and reconcile', async ({ page }) => {
    const problems = watchPage(page);
    await openMaximizer(page);
    await page.getByTestId('length-11').click();
    await expect(toast(page, 'New 11-char weekly batch')).toBeVisible();
    await expect(page.getByTestId('code-batch')).toContainText('11');
    await page.getByTestId('regen-btn').click();
    await expect(toast(page, 'weekly batch generated')).toBeVisible();
    await expect(page.getByTestId('reconcile-csv-btn')).toBeDisabled();
    await page.getByTestId('load-sample-btn').click();
    await expect(page.getByTestId('csv-input')).toHaveValue(/promo_code,net_sales/);
    await page.getByTestId('reconcile-csv-btn').click();
    await expect(page.getByTestId('reconcile-result')).toBeVisible();
    await expect(page.getByTestId('reconcile-result')).toContainText('valid');
    await expect(page.getByTestId('reconcile-result')).toContainText('invalid');
    await expect(page.getByTestId('reconcile-result')).toContainText('fraud guard');
    await expectClean(problems);
  });

  test('location spot analytics table lists every placement', async ({ page }) => {
    await openMaximizer(page);
    await expect(page.getByTestId('location-spots-table')).toBeVisible();
    await expect(page.getByTestId('location-spots-totals')).toBeVisible();
    await expect(page.locator('[data-testid^="spot-row-"]').first()).toBeVisible();
  });
});
