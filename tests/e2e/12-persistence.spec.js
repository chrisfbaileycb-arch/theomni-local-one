// Memory core: data written through the API survives a full server restart,
// sessions stay valid, uploads are served after restart, backups round-trip,
// and reset returns to the demo seed. Runs its own server on a private port.
const { test, expect } = require('./fixtures');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { MASTER_PASSWORD } = require('./helpers');

const PORT = 3111;
const BASE = `http://localhost:${PORT}`;
const ROOT = path.resolve(__dirname, '..', '..');

async function waitForServer(proc) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return res.json();
    } catch {}
    if (proc.exitCode !== null) throw new Error(`server exited early with code ${proc.exitCode}`);
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('server did not start');
}

function startServer(dataDir) {
  const proc = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), OMNILOCAL_DATA_DIR: dataDir, MASTER_PASSWORD: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  proc.stdout.on('data', () => {});
  proc.stderr.on('data', () => {});
  return proc;
}

async function stopServer(proc) {
  if (proc.exitCode !== null) return;
  await new Promise((resolve) => { proc.once('exit', resolve); proc.kill('SIGTERM'); setTimeout(() => proc.kill('SIGKILL'), 5000); });
}

test.describe('memory core', () => {
  test('state, sessions and uploads survive a restart; backup/restore/reset work', async ({ playwright }) => {
    test.setTimeout(120000);
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'omnilocal-core-'));
    let proc = startServer(dataDir);
    let api = await playwright.request.newContext({ baseURL: BASE });
    try {
      const health = await waitForServer(proc);
      expect(health.storage.driver).toMatch(/sqlite|json-file/);
      expect(health.storage.restoredCollections).toBe(0);

      // Sign in as the owner so the session is a real cookie, then make changes.
      const login = await api.post('/api/auth/login', { data: { email: 'owner@ironandneedle.com', password: MASTER_PASSWORD } });
      expect(login.ok()).toBeTruthy();
      const brand = await (await api.get('/api/content/brand-profile')).json();
      await api.put('/api/content/brand-profile', { data: { ...brand, name: 'Persisted Studio' } });
      const spin = await (await api.post('/api/maximizer/spin', { data: { agree: true, email: 'core@example.com', spaceId: 'Core Test' } })).json();
      const ad = await (await api.post('/api/maximizer/ad-spend', { data: { platform: 'facebook', label: 'core-spend', amount: 12.5 } })).json();
      await api.post('/api/auth/change-password', { data: { currentPassword: MASTER_PASSWORD, newPassword: 'core-password-1' } });
      const up = await (await api.post('/api/content/critic/upload/init', { data: { filename: 'core.mp4', totalChunks: 1 } })).json();
      await api.post('/api/content/critic/upload/chunk', { multipart: { uploadId: up.uploadId, index: '0', chunk: { name: 'chunk', mimeType: 'application/octet-stream', buffer: Buffer.alloc(4096, 3) } } });
      await api.post('/api/content/critic/upload/finalize', { data: { uploadId: up.uploadId } });
      const clip = await (await api.post('/api/vault/save', { data: { uploadId: up.uploadId, filename: 'core.mp4', promptId: 'v_p1', title: 'Core clip' } })).json();
      const resumedUp = await (await api.post('/api/content/critic/upload/init', { data: { filename: 'resume.mp4', totalChunks: 2 } })).json();
      await api.post('/api/content/critic/upload/chunk', { multipart: { uploadId: resumedUp.uploadId, index: '1', chunk: { name: 'chunk', mimeType: 'application/octet-stream', buffer: Buffer.from('second') } } });
      const backup = await (await api.get('/api/admin/backup')).json();
      expect(backup.collections.brand_profile.name).toBe('Persisted Studio');
      expect(backup.collections.master_password_hash).toBeUndefined();

      // Restart.
      await stopServer(proc);
      proc = startServer(dataDir);
      const health2 = await waitForServer(proc);
      expect(health2.storage.restoredCollections).toBeGreaterThan(5);

      // Same cookie jar -> still signed in; data is back.
      const me = await api.get('/api/auth/me');
      expect(me.ok()).toBeTruthy();
      expect((await (await api.get('/api/content/brand-profile')).json()).name).toBe('Persisted Studio');
      const lookup = await (await api.get(`/api/codes/voucher-lookup?q=${spin.code}`)).json();
      expect(lookup.total).toBe(1);
      const spend = await (await api.get('/api/maximizer/ad-spend')).json();
      expect(spend.entries.some((e) => e.id === ad.entry.id)).toBeTruthy();
      const media = await api.get(`/api/vault/video/${clip.id}`);
      expect(media.status()).toBe(200);
      await api.post('/api/content/critic/upload/chunk', { multipart: { uploadId: resumedUp.uploadId, index: '0', chunk: { name: 'chunk', mimeType: 'application/octet-stream', buffer: Buffer.from('first') } } });
      expect((await api.post('/api/content/critic/upload/finalize', { data: { uploadId: resumedUp.uploadId } })).ok()).toBeTruthy();
      const resumedMedia = await api.get(`/api/content/critic/video/${resumedUp.uploadId}`);
      expect((await resumedMedia.body()).toString()).toBe('firstsecond');
      // The changed master password is the one that works now.
      const fresh = await playwright.request.newContext({ baseURL: BASE });
      expect((await fresh.post('/api/auth/login', { data: { email: 'owner@ironandneedle.com', password: MASTER_PASSWORD } })).status()).toBe(401);
      expect((await fresh.post('/api/auth/login', { data: { email: 'owner@ironandneedle.com', password: 'core-password-1' } })).ok()).toBeTruthy();
      await fresh.dispose();

      // Restore an older backup: the brand name in it wins.
      backup.collections.brand_profile.name = 'Restored Studio';
      const restored = await (await api.post('/api/admin/restore', { data: backup })).json();
      expect(restored.status).toBe('ok');
      expect((await (await api.get('/api/content/brand-profile')).json()).name).toBe('Restored Studio');
      expect((await api.post('/api/admin/restore', { data: { nope: true } })).status()).toBe(400);

      // Reset requires confirmation and returns the demo seed, then survives another restart.
      expect((await api.post('/api/admin/reset', { data: {} })).status()).toBe(400);
      await api.post('/api/admin/reset', { data: { confirm: 'RESET' } });
      expect((await (await api.get('/api/content/brand-profile')).json()).name).toBe(brand.name);
      await stopServer(proc);
      proc = startServer(dataDir);
      await waitForServer(proc);
      expect((await (await api.get('/api/content/brand-profile')).json()).name).toBe(brand.name);
      expect((await (await api.get(`/api/codes/voucher-lookup?q=${spin.code}`)).json()).total).toBe(0);
    } finally {
      await api.dispose();
      await stopServer(proc);
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });

  test('non-owners cannot touch the memory core', async ({ request, playwright }) => {
    const team = await (await request.get('/api/team')).json();
    const email = 'core-member@example.com'; // fixed address so repeated runs reuse the seat
    const existing = team.members.find((m) => m.email === email);
    if (existing && existing.status === 'revoked') expect((await request.post(`/api/team/member/${existing.user_id}/restore`)).ok()).toBeTruthy();
    const member = await playwright.request.newContext({ baseURL: process.env.BASE_URL || 'http://localhost:3000' });
    const login = await member.post('/api/auth/login', { data: { email, password: team.accessCode } });
    expect(login.ok(), await login.text()).toBeTruthy();
    expect((await member.get('/api/admin/backup')).status()).toBe(403);
    expect((await member.post('/api/admin/reset', { data: { confirm: 'RESET' } })).status()).toBe(403);
    expect((await member.get('/api/health')).ok()).toBeTruthy();
    await member.dispose();
    // Free the seat again: revoke then keep it revoked (revoked members do not count toward the cap).
    const after = await (await request.get('/api/team')).json();
    const id = after.members.find((m) => m.email === email).user_id;
    expect((await request.post(`/api/team/member/${id}/revoke`)).ok()).toBeTruthy();
  });
});
