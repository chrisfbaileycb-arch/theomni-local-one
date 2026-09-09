const { test, expect } = require('./fixtures');
const { watchPage, expectClean, openApp, goTo, expectNoLeakedValues } = require('./helpers');

const NAV = ['overview', 'printstudio', 'attribution', 'knowledge', 'multitrack', 'dashboard', 'executioner', 'maximizer', 'content', 'team'];

test.describe('smoke: every navigation tab renders cleanly', () => {
  for (const id of NAV) {
    test(`tab "${id}" renders without errors`, async ({ page }) => {
      const problems = watchPage(page);
      await openApp(page);
      await goTo(page, id);
      await page.waitForLoadState('networkidle');
      await expect(page.getByTestId(`nav-${id}`)).toHaveCSS('font-weight', '700');
      await expectNoLeakedValues(page);
      await expectClean(problems);
    });
  }
});

test.describe('smoke: public routes', () => {
  for (const path of ['/spin', '/pricing', '/payment/success', '/payment/cancel']) {
    test(`route ${path} renders`, async ({ page }) => {
      const problems = watchPage(page);
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('#root')).not.toBeEmpty();
      await expect(page.getByTestId('error-boundary')).toHaveCount(0);
      await expectNoLeakedValues(page, page.locator('#root'));
      await expectClean(problems);
    });
  }
});
