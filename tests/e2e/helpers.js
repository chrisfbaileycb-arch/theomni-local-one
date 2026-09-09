// Shared helpers for the OmniLocal e2e suite.
const { expect } = require('@playwright/test');

const MASTER_PASSWORD = process.env.MASTER_PASSWORD || 'omnilocal';

/**
 * Collect console errors, uncaught page errors and failed / 4xx+ API responses
 * so every test can assert a clean run at the end.
 */
function watchPage(page) {
  const problems = { consoleErrors: [], pageErrors: [], badResponses: [], failedRequests: [] };
  page.on('console', (msg) => {
    if (msg.type() === 'error') problems.consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => problems.pageErrors.push(String(err)));
  page.on('response', (res) => {
    const url = res.url();
    if (url.includes('/api/') && res.status() >= 400)
      problems.badResponses.push(`${res.request().method()} ${url.replace(/^https?:\/\/[^/]+/, '')} -> ${res.status()}`);
  });
  page.on('requestfailed', (req) => {
    const url = req.url();
    if (url.includes('/api/')) problems.failedRequests.push(`${req.method()} ${url} (${req.failure()?.errorText})`);
  });
  return problems;
}

/** Assert the page produced no uncaught errors and no unexpected failing API calls. */
async function expectClean(problems, { allowBad = [] } = {}) {
  const bad = problems.badResponses.filter((b) => !allowBad.some((a) => b.includes(a)));
  expect.soft(problems.pageErrors, 'uncaught page errors').toEqual([]);
  expect.soft(bad, 'API responses >= 400').toEqual([]);
  expect.soft(problems.failedRequests, 'failed API requests').toEqual([]);
}

async function openApp(page) {
  await page.goto('/');
  await expect(page.getByTestId('nav-overview')).toBeVisible();
}

async function goTo(page, navId) {
  await page.getByTestId(`nav-${navId}`).click();
  await expect(page.getByTestId(`nav-${navId}`)).toHaveCSS('font-weight', '700');
}

/** Assert no literal "undefined" / "NaN" / "[object Object]" leaked into rendered text. */
async function expectNoLeakedValues(page, scope) {
  const text = await (scope || page.locator('main')).innerText();
  const leaks = text.match(/\b(undefined|NaN|\[object Object\])\b/g) || [];
  expect(leaks, `leaked values in rendered text: ${leaks.join(', ')}`).toEqual([]);
}

/** A sonner toast containing the given text. */
function toast(page, text) {
  return page.locator('[data-sonner-toast]').filter({ hasText: text }).first();
}

/** Sign a browser context in through the API (owner via master password, or a member via the team code). */
async function apiLogin(context, email, password) {
  const res = await context.request.post('/api/auth/login', { data: { email, password } });
  expect(res.ok(), `login ${email}: ${res.status()} ${await res.text()}`).toBeTruthy();
  return res.json();
}

async function currentAccessCode(request) {
  const team = await (await request.get('/api/team')).json();
  return team.accessCode;
}

/** Small fake video payload for upload tests. */
function fakeVideo(name = 'clip.mp4', kb = 300) {
  return { name, mimeType: 'video/mp4', buffer: Buffer.alloc(kb * 1024, 7) };
}

module.exports = {
  MASTER_PASSWORD, watchPage, expectClean, openApp, goTo, expectNoLeakedValues, toast, apiLogin, currentAccessCode, fakeVideo,
};
