const { test, expect } = require('./fixtures');
const { MASTER_PASSWORD, watchPage, expectClean, openApp, goTo, toast, apiLogin, currentAccessCode } = require('./helpers');

test.describe('auth: sign out, master password, Google, team seats', () => {
  test('logout shows the login page and refresh keeps you signed out', async ({ page }) => {
    const problems = watchPage(page);
    await openApp(page);
    await page.getByTestId('logout-btn').click();
    await expect(page.getByTestId('login-page')).toBeVisible();
    await page.reload();
    await expect(page.getByTestId('login-page')).toBeVisible();
    await expectClean(problems, { allowBad: ['/api/auth/me -> 401'] });
  });

  test('wrong password is rejected, master password signs the owner in', async ({ page }) => {
    const problems = watchPage(page);
    await openApp(page);
    await page.getByTestId('logout-btn').click();
    await page.getByTestId('login-email-input').fill('owner@ironandneedle.com');
    await page.getByTestId('login-password-input').fill('definitely-wrong');
    await page.getByTestId('password-login-btn').click();
    await expect(page.getByTestId('login-error')).toContainText('Invalid master password');

    await page.getByTestId('login-password-input').fill(MASTER_PASSWORD);
    await page.getByTestId('password-login-btn').click();
    await expect(page.getByTestId('nav-overview')).toBeVisible();
    await expect(page.getByTestId('user-card')).toContainText('Owner');
    await expectClean(problems, { allowBad: ['/api/auth/me -> 401', '/api/auth/login -> 401'] });
  });

  test('Google button explains that Google sign-in is not configured', async ({ page }) => {
    await openApp(page);
    await page.getByTestId('logout-btn').click();
    await page.getByTestId('google-login-btn').click();
    await expect(page).toHaveURL(/auth_error=google_not_configured/);
    await expect(page.getByTestId('login-error')).toContainText("Google sign-in isn't configured");
  });

  test('pricing link from login page opens the pricing page and back', async ({ page }) => {
    await openApp(page);
    await page.getByTestId('logout-btn').click();
    await page.getByTestId('login-pricing-link').click();
    await expect(page.getByTestId('pricing-page')).toBeVisible();
    await page.getByTestId('pricing-signin-link').click();
    await expect(page.getByTestId('login-page')).toBeVisible();
  });

  test('a teammate signs in with the access code, gets locked out by a rotation, and unlocks with the new code', async ({ newContext, page }) => {
    // Owner context (default seeded session) rotates the code later.
    await openApp(page);
    const code = await currentAccessCode(page.context().request);
    expect(code).toMatch(/^TR-[A-Z0-9]{4}-[A-Z0-9]{4}$/);

    const memberCtx = await newContext();
    const member = await memberCtx.newPage();
    const problems = watchPage(member);
    await member.goto('/');
    await member.getByTestId('logout-btn').click();
    await member.getByTestId('login-email-input').fill('teammate@example.com');
    await member.getByTestId('login-password-input').fill(code);
    await member.getByTestId('password-login-btn').click();
    await expect(member.getByTestId('user-card')).toContainText('Team Member');
    await goTo(member, 'team');
    await expect(member.getByTestId('member-info-card')).toBeVisible();

    // Owner rotates the code -> member is locked out on their next API call.
    await goTo(page, 'team');
    await page.getByTestId('rotate-code-btn').click();
    await page.getByTestId('confirm-rotate-btn').click();
    await expect(toast(page, 'Access code rotated')).toBeVisible();
    const newCode = await page.getByTestId('access-code-value').innerText();
    expect(newCode).not.toBe(code);

    await member.reload();
    await expect(member.getByTestId('activate-gate')).toBeVisible();
    await member.getByTestId('access-code-input').fill('TR-WRONG-CODE');
    await member.getByTestId('access-code-submit').click();
    await expect(member.getByTestId('access-code-error')).toContainText('Invalid access code');
    await member.getByTestId('access-code-input').fill(newCode.trim());
    await member.getByTestId('access-code-submit').click();
    await expect(member.getByTestId('nav-overview')).toBeVisible();

    // Owner revokes -> member sees the revoked screen; restore -> member must re-enter the code.
    await page.reload();
    await goTo(page, 'team');
    await page.getByTestId('revoke-teammate@example.com').click();
    await expect(toast(page, 'Member revoked')).toBeVisible();
    await member.reload();
    await expect(member.getByTestId('revoked-message')).toBeVisible();
    await page.getByTestId('restore-teammate@example.com').click();
    await expect(toast(page, 'Member restored')).toBeVisible();
    await member.reload();
    await expect(member.getByTestId('activate-gate')).toBeVisible();
    await member.getByTestId('activate-logout-btn').click();
    await expect(member.getByTestId('login-page')).toBeVisible();

    await expectClean(problems, { allowBad: ['-> 401', '-> 403', '/api/auth/activate -> 400'] });
    await memberCtx.close();
  });

  test('owner can change the master password and sign in with it', async ({ page, request }) => {
    const problems = watchPage(page);
    await openApp(page);
    await goTo(page, 'team');
    const card = page.getByTestId('master-password-card');
    await expect(card).toBeVisible();
    await expect(page.getByTestId('mp-save-btn')).toBeDisabled();
    await page.getByTestId('mp-current').fill('wrong-current');
    await page.getByTestId('mp-new').fill('newpassword1');
    await page.getByTestId('mp-confirm').fill('newpassword2');
    await page.getByTestId('mp-save-btn').click();
    await expect(toast(page, "New passwords don't match")).toBeVisible();
    await page.getByTestId('mp-confirm').fill('newpassword1');
    await page.getByTestId('mp-save-btn').click();
    await expect(toast(page, 'Current master password is incorrect')).toBeVisible();

    await page.getByTestId('mp-current').fill(MASTER_PASSWORD);
    await page.getByTestId('mp-save-btn').click();
    await expect(toast(page, 'Master password updated')).toBeVisible();
    try {
      const login = await request.post('/api/auth/login', { data: { email: 'owner@ironandneedle.com', password: 'newpassword1' } });
      expect(login.ok()).toBeTruthy();
      const old = await request.post('/api/auth/login', { data: { email: 'owner@ironandneedle.com', password: MASTER_PASSWORD } });
      expect(old.status()).toBe(401);
    } finally {
      // Restore the default so other specs keep working.
      const r = await request.post('/api/auth/change-password', { data: { currentPassword: 'newpassword1', newPassword: MASTER_PASSWORD } });
      expect(r.ok()).toBeTruthy();
    }
    await expectClean(problems, { allowBad: ['/api/auth/change-password -> 400'] });
  });
});
