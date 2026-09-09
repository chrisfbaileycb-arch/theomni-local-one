const { test, expect } = require('./fixtures');
const { watchPage, expectClean, openApp, goTo, toast } = require('./helpers');

async function openCopilot(page) {
  await openApp(page);
  if (await page.getByTestId('copilot-reopen-btn').isVisible().catch(() => false)) await page.getByTestId('copilot-reopen-btn').click();
  await expect(page.getByTestId('copilot-sidebar')).toBeVisible();
}

test.describe('co-captain copilot sidebar', () => {
  test('collapse/reopen, mute, tools registry and free-text commands', async ({ page }) => {
    const problems = watchPage(page);
    await openCopilot(page);
    await page.getByTestId('copilot-collapse-btn').click();
    await expect(page.getByTestId('copilot-reopen-btn')).toBeVisible();
    await page.getByTestId('copilot-reopen-btn').click();
    await expect(page.getByTestId('copilot-sidebar')).toBeVisible();
    await page.getByTestId('copilot-mute-toggle').click();
    await page.getByTestId('copilot-tools-registry-toggle').click();
    await expect(page.getByTestId('copilot-sidebar')).toContainText('tune_margin_floor');
    await page.getByTestId('copilot-tools-registry-toggle').click();

    await expect(page.getByTestId('copilot-send-btn')).toBeDisabled();
    await page.getByTestId('copilot-text-input').fill('Take me to the Knowledge Base');
    await page.getByTestId('copilot-send-btn').click();
    await expect(page.getByTestId('knowledge-base-section')).toBeVisible({ timeout: 15000 });
    await page.getByTestId('copilot-mic-btn').click();
    await expectClean(problems);
  });

  test('every quick-action chip completes its tool call', async ({ page, context }) => {
    const problems = watchPage(page);
    await openCopilot(page);
    await page.getByTestId('copilot-mute-toggle').click();

    await page.getByTestId('test-nav-multitrack-chip').click();
    await expect(page.getByTestId('multi-track-strategy-section')).toBeVisible({ timeout: 15000 });

    await page.getByTestId('test-schedule-campaign-chip').click();
    await expect(toast(page, /scheduled|Scheduled|campaign/i)).toBeVisible({ timeout: 15000 });

    await page.getByTestId('test-update-contacts-chip').click();
    await expect(toast(page, /contact|Contact|directory|Directory/)).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('games-module')).toBeVisible(); // "locations" aliases to the maximizer panel

    await page.getByTestId('test-pull-analytics-chip').click();
    await expect(page.getByTestId('attribution-hub-section')).toBeVisible({ timeout: 15000 });

    await page.getByTestId('test-print-studio-chip').click();
    await expect(page.getByTestId('print-studio-section')).toBeVisible({ timeout: 15000 });

    const cadenceBefore = await page.request.get('/api/campaign/cadence').then((r) => r.json());
    await page.getByTestId('test-margin-chip').click();
    await expect(toast(page, 'Margin floor locked')).toBeVisible({ timeout: 15000 });
    const cadenceAfter = await page.request.get('/api/campaign/cadence').then((r) => r.json());
    expect(JSON.stringify(cadenceAfter)).not.toBe(JSON.stringify(cadenceBefore));

    const pendingBefore = await page.request.get('/api/approvals').then((r) => r.json());
    await page.getByTestId('test-stage-approval-chip').click();
    await expect(page.getByTestId('copilot-staged-action-card')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('team-page')).toBeVisible();
    const pendingMid = await page.request.get('/api/approvals').then((r) => r.json());
    expect(pendingMid.pendingCount).toBe(pendingBefore.pendingCount + 1);
    await page.getByTestId('copilot-approve-execute-btn').click();
    await expect(toast(page, 'approved')).toBeVisible({ timeout: 15000 });
    const pendingAfter = await page.request.get('/api/approvals').then((r) => r.json());
    expect(pendingAfter.pendingCount).toBe(pendingBefore.pendingCount);
    await page.getByTestId('test-stage-approval-chip').click();
    await expect(page.getByTestId('copilot-staged-action-card')).toBeVisible({ timeout: 15000 });
    await page.getByTestId('copilot-dismiss-btn').click();
    await expect(page.getByTestId('copilot-staged-action-card')).toHaveCount(0);

    const [popup] = await Promise.all([
      context.waitForEvent('page'),
      page.getByTestId('test-export-codes-chip').click(),
    ]);
    await popup.waitForLoadState();
    expect(popup.url()).toContain('/api/codes/export.csv');
    await popup.close();

    await page.getByTestId('copilot-text-input').fill('Redeem the next open voucher code with $150 net sales');
    await page.getByTestId('copilot-send-btn').click();
    await expect(toast(page, /redeemed/i)).toBeVisible({ timeout: 15000 });
    await expectClean(problems);
  });
});
