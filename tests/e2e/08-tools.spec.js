const { test, expect } = require('./fixtures');
const { watchPage, expectClean, openApp, goTo, toast, expectNoLeakedValues } = require('./helpers');

test.describe('print studio', () => {
  test('templates render, copy edits re-render, URL copies, print triggers', async ({ newContext }) => {
    const ctx = await newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
    const page = await ctx.newPage();
    await page.addInitScript(() => { window.__printed = 0; window.print = () => { window.__printed += 1; }; });
    const problems = watchPage(page);
    await openApp(page);
    await goTo(page, 'printstudio');
    await expect(page.getByTestId('print-studio-section')).toBeVisible();
    await expect(page.getByTestId('print-placement-guardrail-banner')).toBeVisible();
    await expect(page.getByTestId('live-print-preview').locator('img').first()).toHaveAttribute('src', /^data:image\/png/);
    const tpls = page.locator('[data-testid^="tpl-select-"]');
    const n = await tpls.count();
    expect(n).toBeGreaterThan(2);
    for (let i = 0; i < n; i++) {
      await tpls.nth(i).click();
      await expect(page.getByTestId('live-print-preview').locator('img').first()).toHaveAttribute('src', /^data:image\/png/);
    }
    await page.getByTestId('print-headline-input').fill('E2E Headline');
    await page.getByTestId('print-subhead-input').fill('E2E subhead');
    await page.getByTestId('print-cta-input').fill('Scan me');
    await page.getByTestId('render-print-btn').click();
    await expect(toast(page, 'Print asset updated')).toBeVisible();
    await expect(page.getByTestId('live-print-preview')).toContainText('E2E Headline');
    await page.getByTestId('copy-qr-link-btn').click();
    await expect(page.getByTestId('copy-qr-link-btn')).toContainText('Copied');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/\/spin\?/);
    await page.getByTestId('print-action-btn').click();
    expect(await page.evaluate(() => window.__printed)).toBe(1);
    await expectNoLeakedValues(page);
    await expectClean(problems);
    await ctx.close();
  });
});

test.describe('attribution hub', () => {
  test('tabs, sample CSVs, import, ledger and clear', async ({ page }) => {
    const problems = watchPage(page);
    await openApp(page);
    await goTo(page, 'attribution');
    await expect(page.getByTestId('attribution-hub-section')).toBeVisible();
    for (const id of ['metric-blended-roas', 'metric-attributed-revenue', 'metric-cost-per-walkin', 'metric-gross-margin', 'normalized-ledger-table', 'channel-breakdown-card']) {
      await expect(page.getByTestId(id), id).toBeVisible();
    }
    await expect(page.getByTestId('execute-import-btn')).toBeDisabled();
    for (const src of ['meta', 'tiktok', 'gbp', 'pos']) {
      await page.getByTestId(`tab-source-${src}`).click();
      await page.getByTestId('load-sample-csv-btn').click();
      await expect(page.getByTestId('csv-textarea')).not.toHaveValue('');
      await page.getByTestId('execute-import-btn').click();
      await expect(toast(page, /import|Import/)).toBeVisible();
    }
    await expectNoLeakedValues(page);
    const before = await page.request.get('/api/attribution/sources').then((r) => r.json());
    expect(before.sources.pos.length).toBeGreaterThan(0);
    await page.getByTestId('clear-sources-btn').click();
    const after = await page.request.get('/api/attribution/sources').then((r) => r.json());
    expect(after.sources.pos.length).toBe(0);
    expect(after.summary.blendedRoas).toBe(0);
    await expect(page.getByTestId('metric-blended-roas')).toContainText('0');
    // Re-seed so later specs see data.
    await page.getByTestId('tab-source-pos').click();
    await page.getByTestId('load-sample-csv-btn').click();
    await page.getByTestId('execute-import-btn').click();
    await expect(toast(page, /import|Import/)).toBeVisible();
    await expectClean(problems);
  });
});

test.describe('knowledge base & multi-track campaigns', () => {
  test('horizon toggles, maturity simulation, track toggles', async ({ page }) => {
    const problems = watchPage(page);
    await openApp(page);
    await goTo(page, 'knowledge');
    await expect(page.getByTestId('knowledge-base-section')).toBeVisible();
    for (const h of ['30d', '90d', '180d']) {
      await page.getByTestId(`horizon-${h}-btn`).click();
      await expect(page.getByTestId('time-horizons-card')).toBeVisible();
    }
    for (const id of ['winning-creative-hooks', 'game-style-rankings', 'margin-thresholds-box', 'peak-conversion-windows', 'autonomous-insights-log']) {
      await expect(page.getByTestId(id), id).toBeVisible();
    }
    if (await page.getByTestId('advance-maturity-btn').isVisible().catch(() => false)) {
      await page.getByTestId('advance-maturity-btn').click();
      await expect(page.locator('[data-sonner-toast]').first()).toBeVisible();
    }
    await expectNoLeakedValues(page);

    await goTo(page, 'multitrack');
    await expect(page.getByTestId('multi-track-strategy-section')).toBeVisible();
    await expect(page.getByTestId('anti-fatigue-guardrail-banner')).toBeVisible();
    await expect(page.getByTestId('cadence-rotation-timeline')).toBeVisible();
    const toggle = page.getByTestId('toggle-track-track_b');
    const initial = await toggle.innerText();
    await toggle.click();
    await expect(toggle).not.toHaveText(initial);
    await toggle.click();
    await expect(toggle).toHaveText(initial);
    await expectNoLeakedValues(page);
    await expectClean(problems);
  });
});
