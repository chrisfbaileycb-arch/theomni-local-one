const { test, expect } = require('./fixtures');
const { watchPage, expectClean, openApp, goTo, toast, expectNoLeakedValues, fakeVideo } = require('./helpers');

async function openContent(page) {
  await openApp(page);
  await goTo(page, 'content');
  await expect(page.getByTestId('prompt-today')).toBeVisible();
}

test.describe('content director', () => {
  test('copywriter turns a transcript into three platform drafts', async ({ page }) => {
    const problems = watchPage(page);
    await openContent(page);
    await page.getByTestId('transcript-input').fill('We just finished a full back piece, six sessions, all healed and glowing.');
    await page.getByTestId('generate-copy-btn').click();
    await expect(toast(page, 'platform-ready posts')).toBeVisible();
    for (const p of ['gbp', 'facebook', 'instagram']) await expect(page.getByTestId(`draft-${p}`)).not.toBeEmpty();
    await expectNoLeakedValues(page);
    await expectClean(problems);
  });

  test('video critic grades the sample clips and a real upload', async ({ page }) => {
    const problems = watchPage(page);
    await openContent(page);
    await page.getByTestId('grade-video-1').click();
    await expect(page.getByTestId('critic-report')).toContainText('WEAK');
    await page.getByTestId('grade-video-0').click();
    await expect(page.getByTestId('critic-report')).toContainText('STRONG');

    // Build a coach plan first so the plan-check select has an option.
    await page.getByTestId('coach-topic-input').fill('Healed realism reveal');
    await page.getByTestId('coach-ask-btn').click();
    await expect(page.getByTestId('coach-template-panel')).toBeVisible();
    await page.getByTestId('plan-check-select').focus();
    await expect(page.getByTestId('plan-check-select').locator('option')).toHaveCount(2, { timeout: 5000 }).catch(() => {});
    const options = await page.getByTestId('plan-check-select').locator('option').allTextContents();
    if (options.length > 1) await page.getByTestId('plan-check-select').selectOption({ index: 1 });

    await page.getByTestId('critic-file-input').setInputFiles(fakeVideo('e2e-clip.mp4', 1400));
    await expect(page.getByTestId('critic-report')).toContainText('e2e-clip.mp4', { timeout: 30000 });
    await expect(page.getByTestId('uploaded-analysis')).toBeVisible();
    await expect(page.getByTestId('uploaded-video')).toHaveAttribute('src', /\/api\/content\/critic\/video\/up_/);
    await expect(page.getByTestId('critic-transcript')).not.toBeEmpty();
    await expect(page.getByTestId('critic-measured')).toBeVisible();
    if (options.length > 1) await expect(page.getByTestId('plan-check-verdict')).toBeVisible();
    const src = await page.getByTestId('uploaded-video').getAttribute('src');
    const media = await page.request.get(src);
    expect(media.status()).toBe(200);
    expect(media.headers()['content-type']).toContain('video/mp4');
    await expectClean(problems);
  });

  test('publish-all reaches every connected pathway and skips the rest', async ({ page }) => {
    const problems = watchPage(page);
    await openContent(page);
    await expect(page.getByTestId('distribution-pathways')).toBeVisible();
    await page.getByTestId('publish-all-btn').click();
    await expect(toast(page, 'Published to')).toBeVisible();
    await expect(page.getByTestId('publish-summary')).toContainText('published');
    await expect(page.getByTestId('publish-status-facebook')).toBeVisible();
    await expect(page.getByTestId('publish-status-tiktok')).toBeVisible();
    await expect(page.getByTestId('pathway-tiktok')).toContainText('Skipped');
    await expectNoLeakedValues(page, page.getByTestId('distribution-pathways'));
    await expectClean(problems);
  });

  test('the coach builds a template, exports a PDF, drops it on the calendar and keeps it on the shelf', async ({ page }) => {
    const problems = watchPage(page);
    await openContent(page);
    await expect(page.getByTestId('coach-ask-btn')).toBeDisabled();
    await page.getByTestId('coach-topic-input').fill('Walk-in flash Friday');
    await page.getByTestId('coach-ask-btn').click();
    const panel = page.getByTestId('coach-template-panel');
    await expect(panel).toBeVisible();
    await expect(panel).toContainText('Walk-in flash Friday');
    await expect(panel).toContainText('Key Elements');
    await expect(panel).toContainText('0-3s');
    await expectNoLeakedValues(page, panel);

    const pdf = await page.request.get(await page.getByTestId('coach-template-pdf').getAttribute('href'));
    expect(pdf.headers()['content-type']).toContain('application/pdf');

    await page.getByTestId('coach-to-calendar-btn').click();
    await expect(toast(page, 'posts dropped on the calendar')).toBeVisible();
    await expect(page.getByTestId('content-calendar')).toContainText('Walk-in flash Friday');

    const shelfItem = page.locator('[data-testid^="shelf-item-"]').filter({ hasText: 'Walk-in flash Friday' }).first();
    await expect(shelfItem).toBeVisible();
    const id = (await shelfItem.getAttribute('data-testid')).replace('shelf-item-', '');
    await page.getByTestId(`shelf-open-${id}`).click();
    await expect(panel).toContainText('Walk-in flash Friday');
    await page.getByTestId(`shelf-delete-${id}`).click();
    await expect(toast(page, 'Template removed')).toBeVisible();
    await expect(page.getByTestId(`shelf-item-${id}`)).toHaveCount(0);
    await expectClean(problems);
  });

  test('video vault: upload to a prompt, feature it, upload a campaign video, remove', async ({ page }) => {
    const problems = watchPage(page);
    await openContent(page);
    const vault = page.getByTestId('video-vault');
    await expect(vault).toBeVisible();
    const before = await page.getByTestId('vault-progress').innerText();

    await page.getByTestId('vault-upload-v_p1').locator('input[type=file]').setInputFiles(fakeVideo('story.mp4', 600));
    await expect(toast(page, 'Saved to your vault')).toBeVisible();
    await expect(page.getByTestId('vault-feature-v_p1')).toBeVisible();
    expect(await page.getByTestId('vault-progress').innerText()).not.toBe(before);
    await page.getByTestId('vault-feature-v_p1').click();
    await expect(toast(page, 'Featured')).toBeVisible();
    await expect(page.getByTestId('vault-feature-v_p1')).toContainText('Featured');

    await page.getByTestId('vault-custom-title').fill("Mother's Day Special");
    await page.getByTestId('vault-custom-upload').locator('input[type=file]').setInputFiles(fakeVideo('mothers-day.mp4', 500));
    await expect(toast(page, 'Saved to your vault')).toBeVisible();
    const custom = page.locator('[data-testid^="vault-custom-v_"]').filter({ hasText: "Mother's Day Special" });
    await expect(custom).toBeVisible();
    const vid = (await custom.getAttribute('data-testid')).replace('vault-custom-', '');
    const media = await page.request.get(`/api/vault/video/${vid}`);
    expect(media.status()).toBe(200);
    await page.getByTestId(`vault-delete-${vid}`).click();
    await expect(custom).toHaveCount(0);
    await page.getByTestId('vault-delete-v_p1').click();
    await expect(page.getByTestId('vault-upload-v_p1')).toBeVisible();
    await expectClean(problems);
  });

  test('content calendar: add, remove, plan next week, reset, and local events', async ({ page }) => {
    const problems = watchPage(page);
    await openContent(page);
    const cal = page.getByTestId('content-calendar');
    await expect(cal).toBeVisible();
    await page.getByTestId('calendar-add-btn').click();
    await expect(toast(page, 'Pick a date and enter a title')).toBeVisible();
    const date = await page.getByTestId('calendar-week-0').locator('[data-testid^="calendar-day-"]').nth(2).getAttribute('data-testid');
    const iso = date.replace('calendar-day-', '');
    await page.getByTestId('calendar-add-date').fill(iso);
    await page.getByTestId('calendar-add-title').fill('E2E weekend reel');
    await page.getByTestId('calendar-add-surface').selectOption('TikTok');
    await page.getByTestId('calendar-add-btn').click();
    await expect(toast(page, 'Post added to calendar')).toBeVisible();
    const post = page.getByTestId(`calendar-day-${iso}`).locator('[data-testid^="calendar-post-"]').filter({ hasText: 'E2E weekend reel' });
    await expect(post).toBeVisible();
    await expect(post).toContainText('TikTok');
    await expect(post).toContainText('Manual');
    const pid = (await post.getAttribute('data-testid')).replace('calendar-post-', '');
    await post.hover();
    await page.getByTestId(`remove-post-${pid}`).click({ force: true });
    await expect(post).toHaveCount(0);

    const weeksBefore = await cal.locator('[data-testid^="calendar-week-"]').count();
    await page.getByTestId('calendar-next-week-btn').click();
    await expect(toast(page, 'Next week planned')).toBeVisible();
    await expect(cal.locator('[data-testid^="calendar-week-"]')).toHaveCount(weeksBefore + 1);
    await page.getByTestId('calendar-reset-btn').click();
    await expect(toast(page, 'Calendar reset')).toBeVisible();
    await expect(cal.locator('[data-testid^="calendar-week-"]')).toHaveCount(2);

    const intel = page.getByTestId('local-market-intel');
    await expect(intel).toBeVisible();
    const addBtn = intel.locator('[data-testid^="add-event-"]').first();
    await addBtn.click();
    await expect(toast(page, 'Added to Content Calendar')).toBeVisible();
    await expect(addBtn).toBeDisabled();
    await expect(cal).toContainText('Promote:');
    await expectClean(problems);
  });

  test('brand brain edits persist and feed the sidebar', async ({ page }) => {
    const problems = watchPage(page);
    await openContent(page);
    await page.getByTestId('brand-edit-btn').click();
    const nameInput = page.getByTestId('brand-brain').locator('input').first();
    const original = await nameInput.inputValue();
    await nameInput.fill(`${original} E2E`);
    await page.getByTestId('brand-save-btn').click();
    await expect(toast(page, 'Brand')).toBeVisible();
    await page.reload();
    await expect(page.locator('aside').filter({ hasText: 'Active Business' })).toContainText(`${original} E2E`);
    await goTo(page, 'content');
    await page.getByTestId('brand-edit-btn').click();
    await page.getByTestId('brand-brain').locator('input').first().fill(original);
    await page.getByTestId('brand-save-btn').click();
    await expect(toast(page, 'Brand')).toBeVisible();
    await expectClean(problems);
  });

  test('strategy panel: switch industry, manage industries, save a video slot', async ({ page }) => {
    const problems = watchPage(page);
    await openContent(page);
    const panel = page.getByTestId('strategy-panel');
    await expect(panel).toBeVisible();
    const select = page.getByTestId('strategy-industry-select');
    const options = await select.locator('option').allTextContents();
    expect(options.length).toBeGreaterThan(1);
    await select.selectOption({ index: 1 });
    await expect(toast(page, 'Pacing advisor retuned')).toBeVisible();
    await expect(page.getByTestId('pacing-advisor')).toContainText(options[1]);

    await page.getByTestId('industry-manager-toggle').click();
    await expect(page.getByTestId('industry-manager')).toBeVisible();
    await page.getByTestId('industry-form-label').fill('E2E Bakery');
    await page.getByTestId('industry-form-cadence').fill('1 week on / 3 off');
    await page.getByTestId('industry-form-window').fill('Sat 8-11am');
    await page.getByTestId('industry-form-rotation').fill('IG > FB > GBP');
    await page.getByTestId('industry-form-advisor').fill('Bursts only.');
    await page.getByTestId('industry-form-save').click();
    await expect(toast(page, 'Industry added')).toBeVisible();
    const row = page.locator('[data-testid^="industry-row-"]').filter({ hasText: 'E2E Bakery' });
    await expect(row).toBeVisible();
    const iid = (await row.getAttribute('data-testid')).replace('industry-row-', '');
    await page.getByTestId(`industry-edit-${iid}`).click();
    await page.getByTestId('industry-form-label').fill('E2E Bakery & Cafe');
    await page.getByTestId('industry-form-save').click();
    await expect(toast(page, 'Industry updated')).toBeVisible();
    await expect(select.locator('option', { hasText: 'E2E Bakery & Cafe' })).toHaveCount(1);
    await select.selectOption(iid);
    await expect(page.getByTestId('pacing-advisor-text')).toContainText('Bursts only');
    await page.getByTestId(`industry-delete-${iid}`).click();
    await expect(toast(page, 'Industry removed')).toBeVisible();
    await expect(page.getByTestId(`industry-row-${iid}`)).toHaveCount(0);
    await expect(page.getByTestId('pacing-advisor')).toBeVisible();

    const videoInput = panel.locator('[data-testid^="video-url-"]').first();
    const vidId = (await videoInput.getAttribute('data-testid')).replace('video-url-', '');
    await videoInput.fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    await page.getByTestId(`video-save-${vidId}`).click();
    await expect(toast(page, 'Video slot updated')).toBeVisible();
    await expectClean(problems);
  });
});
