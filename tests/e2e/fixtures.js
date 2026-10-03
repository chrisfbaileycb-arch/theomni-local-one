// Test fixtures: the app loads Google Fonts from index.html. In sandboxed CI the request hangs
// and delays the window "load" event by ~12s per navigation, so abort every non-local request.
const base = require('@playwright/test');
const { MASTER_PASSWORD } = require('./helpers');

const EXTERNAL = /^https?:\/\/(?!localhost|127\.0\.0\.1)/;

async function isolate(context) {
  await context.route(EXTERNAL, (route) => route.abort());
  return context;
}

const test = base.test.extend({
  context: async ({ context }, use) => {
    await isolate(context);
    await use(context);
  },
  /** browser.newContext() with the same isolation applied. */
  newContext: async ({ browser }, use) => {
    const created = [];
    await use(async (options) => {
      const ctx = await browser.newContext(options);
      created.push(ctx);
      return isolate(ctx);
    });
    for (const ctx of created) await ctx.close().catch(() => {});
  },
  /**
   * The API is fail-closed: sign the request context in as the owner first so
   * specs exercise real authenticated flows instead of preview-owner access.
   */
  request: async ({ request }, use) => {
    const login = await request.post('/api/auth/login', {
      data: { email: 'owner@ironandneedle.com', password: MASTER_PASSWORD },
    });
    if (!login.ok()) {
      throw new Error(`e2e fixture login failed: ${login.status()} ${await login.text()}`);
    }
    await use(request);
  },
});

module.exports = { test, expect: base.expect, isolate };
