const { test, expect } = require('./fixtures');
const { watchPage, expectClean, openApp, goTo, toast, apiLogin, currentAccessCode, expectNoLeakedValues } = require('./helpers');

test.describe('team & approvals', () => {
  test('memory core card: status, backup download, restore, reset confirm/cancel', async ({ page }) => {
    const problems = watchPage(page);
    await openApp(page);
    await goTo(page, 'team');
    const card = page.getByTestId('data-core-card');
    await expect(card).toBeVisible();
    await expect(page.getByTestId('data-core-status')).toContainText('collections');
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('data-core-backup-btn').click()]);
    expect(download.suggestedFilename()).toMatch(/^omnilocal-backup-.*\.json$/);
    const backup = await page.request.get('/api/admin/backup').then((r) => r.json());
    expect(backup.collections.users).toBeTruthy();

    // Restore the file we just downloaded (with a marker) and see it applied.
    backup.collections.brand_profile.city = 'Restoreville';
    await page.getByTestId('data-core-restore-btn').locator('input[type=file]').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
    await expect(toast(page, 'Backup restored')).toBeVisible();
    await page.waitForURL('/'); // the card reloads the app so every panel shows restored data
    await expect(page.locator('aside').filter({ hasText: 'Active Business' })).toContainText('Restoreville', { timeout: 20000 });
    await goTo(page, 'team');
    backup.collections.brand_profile.city = 'Springfield';
    await page.getByTestId('data-core-restore-btn').locator('input[type=file]').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
    await expect(toast(page, 'Backup restored')).toBeVisible();
    await expect(page.locator('aside').filter({ hasText: 'Active Business' })).toContainText('Springfield', { timeout: 20000 });
    await goTo(page, 'team');
    await page.getByTestId('data-core-restore-btn').locator('input[type=file]').setInputFiles({ name: 'junk.json', mimeType: 'application/json', buffer: Buffer.from('{"nope":1}') });
    await expect(toast(page, /not an OmniLocal backup|collections/)).toBeVisible();

    await page.getByTestId('data-core-reset-btn').click();
    await expect(page.getByTestId('data-core-confirm-reset-btn')).toBeVisible();
    await page.getByTestId('data-core-cancel-reset-btn').click();
    await expect(page.getByTestId('data-core-reset-btn')).toBeVisible();
    await expectClean(problems, { allowBad: ['/api/admin/restore -> 400'] });
  });

  test('access code card: value, copy, rotate confirm/cancel', async ({ newContext }) => {
    const ctx = await newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
    const page = await ctx.newPage();
    const problems = watchPage(page);
    await openApp(page);
    await goTo(page, 'team');
    await expect(page.getByTestId('team-page')).toContainText('You hold the final say');
    const code = (await page.getByTestId('access-code-value').innerText()).trim();
    expect(code).toMatch(/^TR-/);
    await expect(page.getByTestId('seats-used')).toContainText('/3 seats used');
    await expectNoLeakedValues(page);

    await page.getByTestId('copy-code-btn').click();
    await expect(page.getByTestId('copy-code-btn')).toContainText('Copied');
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    expect(clip).toBe(code);

    await page.getByTestId('rotate-code-btn').click();
    await expect(page.getByTestId('confirm-rotate-btn')).toBeVisible();
    await page.getByTestId('cancel-rotate-btn').click();
    await expect(page.getByTestId('rotate-code-btn')).toBeVisible();
    await expect(page.getByTestId('access-code-value')).toHaveText(code);
    await expectClean(problems);
    await ctx.close();
  });

  test('a member publish request shows up for the owner and can be approved and rejected', async ({ newContext, page }) => {
    const problems = watchPage(page);
    await openApp(page);
    const code = await currentAccessCode(page.context().request);

    const memberCtx = await newContext();
    await apiLogin(memberCtx, 'approver-test@example.com', code);
    const p1 = await memberCtx.request.post('/api/content/publish-all', { data: { assetId: 'hero-clip', caption: 'first' } });
    const p2 = await memberCtx.request.post('/api/content/publish-all', { data: { assetId: 'hero-clip', caption: 'second' } });
    const a1 = await p1.json(); const a2 = await p2.json();
    expect(a1.status).toBe('pending_approval');

    await goTo(page, 'team');
    await expect(page.getByTestId('nav-pending-badge')).toBeVisible();
    await expect(page.getByTestId(`approval-${a1.approvalId}`)).toContainText('Publish-All Blast');
    await expect(page.getByTestId(`approval-${a1.approvalId}`)).toContainText('approver-test');
    await expectNoLeakedValues(page);

    await page.getByTestId(`approve-${a1.approvalId}`).click();
    await expect(toast(page, 'Approved & executed')).toBeVisible();
    await expect(page.getByTestId(`history-${a1.approvalId}`)).toContainText('Approved');

    await page.getByTestId(`reject-${a2.approvalId}`).click();
    await expect(toast(page, 'Request rejected')).toBeVisible();
    await expect(page.getByTestId(`history-${a2.approvalId}`)).toContainText('Rejected');

    // The member sees their own submissions and outcomes.
    const member = await memberCtx.newPage();
    await member.goto('/');
    await goTo(member, 'team');
    await expect(member.getByTestId(`history-${a1.approvalId}`)).toContainText('Approved');
    await expect(member.getByTestId('no-pending')).toBeVisible();
    await memberCtx.close();
    await expectClean(problems);
  });
});
