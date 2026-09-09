// Backend contract: every route in server.js answers, with the shape the frontend reads.
const { test, expect } = require('./fixtures');

const j = async (res) => { expect(res.ok(), `${res.url()} -> ${res.status()} ${await res.text()}`).toBeTruthy(); return res.json(); };

test.describe('API contract', () => {
  test('root, auth and team', async ({ request }) => {
    expect((await j(await request.get('/api'))).status).toBe('ok');
    const me = await j(await request.get('/api/auth/me'));
    expect(me.user.role).toBe('owner');
    expect(me).toMatchObject({ needsCode: false, revoked: false });
    const team = await j(await request.get('/api/team'));
    expect(team).toEqual(expect.objectContaining({ accessCode: expect.stringMatching(/^TR-/), seatsUsed: expect.any(Number), maxMembers: 3, members: expect.any(Array), pendingCount: expect.any(Number) }));
    expect(team.members[0].role).toBe('owner');
    const bad = await request.post('/api/auth/login', { data: { email: 'x@y.z', password: 'wrong' } });
    expect(bad.status()).toBe(401);
    expect((await request.get('/api/auth/google/start', { maxRedirects: 0 })).status()).toBe(302);
    const approvals = await j(await request.get('/api/approvals'));
    expect(approvals).toEqual(expect.objectContaining({ approvals: expect.any(Array), items: expect.any(Array), pendingCount: expect.any(Number) }));
    expect((await request.post('/api/approvals/nope/approve')).status()).toBe(404);
    expect((await request.post('/api/approvals/nope/reject')).status()).toBe(404);
    const staged = await j(await request.post('/api/approvals/stage', { data: { title: 'API stage', description: 'desc', category: 'ad_spend', meta: { amount: 10 } } }));
    expect(staged.approval.id).toMatch(/^appr_/);
    const list = await j(await request.get('/api/approvals'));
    const row = list.approvals.find((a) => a.id === staged.approval.id);
    expect(row).toMatchObject({ type: 'ad_spend', summary: 'desc', requestedByName: expect.any(String), createdAt: expect.any(String) });
    await j(await request.post(`/api/approvals/${staged.approval.id}/reject`, { data: { reason: 'api test' } }));
    expect((await request.post(`/api/approvals/${staged.approval.id}/reject`)).status()).toBe(409);
    expect((await request.post('/api/team/member/usr_owner_01/revoke')).status()).toBe(400);
    expect((await request.post('/api/team/member/missing/restore')).status()).toBe(404);
  });

  test('overview, content, coach, vault, calendar, strategy', async ({ request }) => {
    const ov = await j(await request.get('/api/overview'));
    expect(ov).toEqual(expect.objectContaining({ brand: expect.any(Object), hero: expect.any(Object), weekly: expect.any(Array) }));
    const prompts = await j(await request.get('/api/content/prompts'));
    expect(prompts.distribution.length).toBe(5);
    expect(prompts.distribution[0]).toHaveProperty('connected');
    await j(await request.get('/api/content/local-events'));
    await j(await request.get('/api/content/presets'));
    await j(await request.get('/api/content/distribution'));
    expect((await request.get('/api/connections/pathways')).ok()).toBeTruthy();
    const copy = await j(await request.post('/api/content/copy', { data: { transcript: 'hello' } }));
    expect(copy.drafts).toEqual(expect.objectContaining({ gbp: expect.any(String), facebook: expect.any(String), instagram: expect.any(String) }));
    const critic = await j(await request.post('/api/content/critic', { data: { index: 1 } }));
    expect(critic.report.overall).toBe('WEAK');
    const pub = await j(await request.post('/api/content/publish-all', { data: { assetId: 'a', caption: 'c' } }));
    expect(pub).toEqual(expect.objectContaining({ publishedCount: expect.any(Number), totalPathways: 5, results: expect.any(Array), live: expect.any(Boolean) }));

    const bp = await j(await request.get('/api/content/brand-profile'));
    await j(await request.put('/api/content/brand-profile', { data: { ...bp } }));

    const tmpl = await j(await request.post('/api/coach/template', { data: { topic: 'API topic' } }));
    expect(tmpl.template).toEqual(expect.objectContaining({ title: expect.any(String), keyElements: expect.any(Array), shotList: expect.any(Array), whereItGoes: expect.any(Array), successCheck: expect.any(Array), offerTemplate: expect.any(Array), whyItWorks: expect.any(String) }));
    expect((await j(await request.get('/api/coach/templates'))).templates.some((t) => t.id === tmpl.id)).toBeTruthy();
    const pdf = await request.get(`/api/coach/template/${tmpl.id}/pdf`);
    expect(pdf.headers()['content-type']).toContain('application/pdf');
    const cal = await j(await request.post(`/api/coach/template/${tmpl.id}/to-calendar`));
    expect(cal.addedCount).toBe(3);
    expect(cal.weeks).toBeInstanceOf(Array);
    expect((await request.get('/api/coach/template/nope/pdf')).status()).toBe(404);
    await j(await request.delete(`/api/coach/template/${tmpl.id}`));
    expect((await request.delete(`/api/coach/template/${tmpl.id}`)).status()).toBe(404);

    const vault = await j(await request.get('/api/vault'));
    expect(vault).toEqual(expect.objectContaining({ prompts: expect.any(Array), capturedCount: expect.any(Number), totalPrompts: 4, totalVideos: expect.any(Number), custom: expect.any(Array) }));
    const init = await j(await request.post('/api/content/critic/upload/init', { data: { filename: 'api.mp4' } }));
    const chunk = await request.post('/api/content/critic/upload/chunk', { multipart: { uploadId: init.uploadId, index: '0', chunk: { name: 'chunk', mimeType: 'application/octet-stream', buffer: Buffer.alloc(2048, 1) } } });
    expect((await j(chunk)).bytes).toBe(2048);
    expect((await request.post('/api/content/critic/upload/chunk', { multipart: { uploadId: 'nope', index: '0', chunk: { name: 'c', mimeType: 'application/octet-stream', buffer: Buffer.alloc(10) } } })).status()).toBe(404);
    const analysis = await j(await request.post('/api/content/critic/analyze', { data: { uploadId: init.uploadId, filename: 'api.mp4' } }));
    expect(analysis.videoUrl).toBe(`/api/content/critic/video/${init.uploadId}`);
    expect((await request.get(analysis.videoUrl)).headers()['content-type']).toContain('video/mp4');
    expect((await request.post('/api/content/critic/analyze', { data: { uploadId: 'missing' } })).status()).toBe(404);
    const saved = await j(await request.post('/api/vault/save', { data: { uploadId: init.uploadId, filename: 'api.mp4', promptId: 'v_p3', title: 'API clip' } }));
    expect(saved.promptId).toBe('v_p3');
    expect((await j(await request.get('/api/vault'))).prompts.find((p) => p.id === 'v_p3').video.id).toBe(saved.id);
    expect((await request.get(`/api/vault/video/${saved.id}`)).status()).toBe(200);
    const feat = await j(await request.post(`/api/vault/${saved.id}/feature`));
    expect(feat).toMatchObject({ featured: true, note: expect.any(String) });
    expect((await j(await request.get('/api/maximizer/drip'))).featured.id).toBe(saved.id);
    await j(await request.delete(`/api/vault/${saved.id}`));
    expect((await request.get(`/api/vault/video/${saved.id}`)).status()).toBe(404);

    const calendar = await j(await request.get('/api/content/calendar'));
    expect(calendar.weeks[0].days.length).toBe(7);
    expect((await request.post('/api/content/calendar/post', { data: { title: 'x' } })).status()).toBe(400);
    const date = calendar.weeks[0].days[1].date;
    const added = await j(await request.post('/api/content/calendar/post', { data: { date, title: 'API post', surface: 'Meta Act-Now Ads', time: '09:00', idea: 'x' } }));
    expect(added.added).toMatchObject({ date, surface: 'Facebook Reels', time: '09:00', source: 'event' });
    const day = added.weeks[0].days.find((d) => d.date === date);
    expect(day.posts.some((p) => p.id === added.added.id)).toBeTruthy();
    await j(await request.post('/api/content/calendar/remove', { data: { id: added.added.id } }));
    expect((await request.post('/api/content/calendar/remove', { data: { id: added.added.id } })).status()).toBe(404);
    expect((await j(await request.post('/api/content/calendar/add-week'))).weeksPlanned).toBeGreaterThanOrEqual(3);
    expect((await j(await request.post('/api/content/calendar/reset'))).weeksPlanned).toBe(2);

    const strat = await j(await request.get('/api/content/strategy'));
    expect(strat).toEqual(expect.objectContaining({ industry: expect.any(String), industries: expect.any(Array), pacing: expect.any(Object), videos: expect.any(Array) }));
    expect((await request.post('/api/content/industries', { data: { label: '' } })).status()).toBe(400);
    const addInd = await j(await request.post('/api/content/industries', { data: { label: 'API Industry', advisor: 'a', cadence: 'c', window: 'w', rotation: 'r' } }));
    expect(addInd.industries.some((i) => i.id === addInd.added)).toBeTruthy();
    expect(addInd.pacing).toBeTruthy();
    const upd = await j(await request.put(`/api/content/industries/${addInd.added}`, { data: { label: 'API Industry 2' } }));
    expect(upd.industries.find((i) => i.id === addInd.added).label).toBe('API Industry 2');
    await j(await request.put('/api/content/strategy', { data: { industry: addInd.added } }));
    const del = await j(await request.delete(`/api/content/industries/${addInd.added}`));
    expect(del.industry).not.toBe(addInd.added);
    expect((await request.delete(`/api/content/industries/${addInd.added}`)).status()).toBe(404);
    expect((await request.put('/api/content/strategy', { data: { industry: 'nope' } })).status()).toBe(400);
  });

  test('maximizer: games, plan, prizes, spin, redeem, members, imports, reports', async ({ request }) => {
    const games = await j(await request.get('/api/maximizer/games'));
    expect(games).toEqual(expect.objectContaining({ games: expect.any(Array), active: expect.objectContaining({ tagline: expect.any(String), source: expect.any(String) }), playFrequencyDays: expect.any(Number) }));
    const plan = await j(await request.get('/api/maximizer/game-plan'));
    expect(plan.weeks.length).toBe(4);
    expect(plan).toEqual(expect.objectContaining({ games: expect.any(Array), settings: expect.objectContaining({ enabled: expect.any(Boolean) }) }));
    expect((await request.put('/api/maximizer/game-plan/week', { data: { gameId: 'x' } })).status()).toBe(400);
    expect((await request.put('/api/maximizer/game-plan/week', { data: { weekStart: plan.weeks[1].weekStart, gameId: 'bogus' } })).status()).toBe(400);
    const wk = await j(await request.put('/api/maximizer/game-plan/week', { data: { weekStart: plan.weeks[1].weekStart, gameId: 'scratch_card' } }));
    expect(wk.weeks[1].gameId).toBe('scratch_card');
    await j(await request.put('/api/maximizer/game-plan/week', { data: { weekStart: plan.weeks[1].weekStart, gameId: null } }));
    const settings = await j(await request.put('/api/maximizer/game-settings', { data: { codeExpiryDays: 14 } }));
    expect(settings.settings.codeExpiryDays).toBe(14);
    await j(await request.put('/api/maximizer/game-settings', { data: { codeExpiryDays: 7 } }));
    expect((await request.put('/api/maximizer/games/active', { data: { gameId: 'bogus' } })).status()).toBe(400);
    const active = await j(await request.put('/api/maximizer/games/active', { data: { gameId: 'mystery_box' } }));
    expect(active.active.source).toBe('admin_override');
    await j(await request.put('/api/maximizer/games/active', { data: { gameId: null } }));

    const board = await j(await request.get('/api/maximizer/prize-board'));
    expect((await request.put('/api/maximizer/prize-board', { data: { goodPrizes: [{ label: 'only one' }] } })).status()).toBe(400);
    await j(await request.put('/api/maximizer/prize-board', { data: board }));

    const spinDud = await j(await request.post('/api/maximizer/spin', { data: { isNewGuest: false, segment: 'promo_pool', spaceId: 'admin-demo' } }));
    expect(spinDud.tier).toBe('standard');
    expect(spinDud.reward).toBe(board.dudPrize.label);
    const spinNew = await j(await request.post('/api/maximizer/spin', { data: { isNewGuest: true, segment: 'new', spaceId: 'admin-demo' } }));
    expect(spinNew.tier).toBe('highValue');
    expect((await request.post('/api/maximizer/spin', { data: { agree: false, email: 'a@b.c' } })).status()).toBe(400);
    const email = `api-${Date.now()}@example.com`;
    const first = await j(await request.post('/api/maximizer/spin', { data: { agree: true, email, spaceId: 'API Spot' } }));
    const second = await request.post('/api/maximizer/spin', { data: { agree: true, email, spaceId: 'API Spot' } });
    expect(second.status()).toBe(429);
    expect((await second.json()).detail).toMatchObject({ existingCode: first.code, reward: first.reward });
    expect((await j(await request.get('/api/maximizer/members'))).members.some((m) => m.email === email)).toBeTruthy();

    const redeem = await j(await request.post('/api/maximizer/redeem', { data: { code: first.code, netSales: 40 } }));
    expect(redeem).toMatchObject({ ok: true, status: 'ok', reward: first.reward, posCode: first.posCode });
    const dup = await j(await request.post('/api/maximizer/redeem', { data: { code: first.code } }));
    expect(dup).toMatchObject({ ok: false, status: 'already_redeemed', reason: expect.any(String) });
    expect((await j(await request.post('/api/maximizer/redeem', { data: { code: 'HV-ZZZZZZ' } }))).status).toBe('not_found');
    expect((await request.post('/api/maximizer/redeem', { data: {} })).status()).toBe(400);
    const dash = await j(await request.get('/api/maximizer/redemptions/dashboard'));
    expect(dash.recent).toBeInstanceOf(Array);
    expect((await j(await request.get('/api/maximizer/redemptions-dashboard'))).recent).toBeInstanceOf(Array);

    const issued = await j(await request.post('/api/codes/issue', { data: { code: `OL-API-${Date.now().toString(36).toUpperCase()}`, reward: 'API reward', masterPosCode: 'API-POS', tier: 'grand' } }));
    expect((await request.post('/api/codes/issue', { data: { code: issued.redemption.code } })).status()).toBe(409);
    const voucher = await j(await request.post('/api/codes/redeem-voucher', { data: { code: issued.redemption.code, netSales: 90 } }));
    expect(voucher.status).toBe('ok');
    expect((await request.post('/api/codes/redeem-voucher', { data: { code: issued.redemption.code } })).status()).toBe(400);
    expect((await request.post('/api/codes/redeem-voucher', { data: { code: 'NOPE' } })).status()).toBe(404);
    expect((await j(await request.get(`/api/codes/voucher-lookup?q=${issued.redemption.code}`))).total).toBe(1);

    const qr = await j(await request.get('/api/maximizer/spin/qr?spaceId=Bag&base=https://example.com'));
    expect(qr.playUrl).toBe('https://example.com/spin?space=Bag');
    expect(qr.qrDataUri).toMatch(/^data:image\/png/);
    for (const p of ['/api/maximizer/qr-sheet.pdf', '/api/maximizer/table-tent.pdf?spaceId=Bag', '/api/maximizer/weekly-report.pdf']) {
      const r = await request.get(p);
      expect(r.headers()['content-type'], p).toContain('application/pdf');
      expect((await r.body()).subarray(0, 4).toString()).toBe('%PDF');
    }
    expect((await request.get('/api/maximizer/members/export.csv')).headers()['content-type']).toContain('text/csv');
    expect((await request.get('/api/codes/export.csv')).headers()['content-type']).toContain('text/csv');

    const seg = await j(await request.get('/api/maximizer/segments'));
    expect(seg.verification).toEqual(expect.objectContaining({ codesIssued: expect.any(Number), codesRedeemed: expect.any(Number), redemptionRate: expect.any(Number) }));
    const drip = await j(await request.get('/api/maximizer/drip'));
    expect(drip).toEqual(expect.objectContaining({ totalLeads: expect.any(Number), releasedSoFar: expect.any(Number), dailyRate: expect.any(Number), days: 30, remaining: expect.any(Number), vaultCount: expect.any(Number) }));
    await j(await request.get('/api/maximizer/import-status'));
    const loc = await j(await request.get('/api/maximizer/locations'));
    expect(loc.spots.some((s) => s.name === 'API Spot')).toBeTruthy();
    await j(await request.post('/api/maximizer/scan', { data: { spaceId: 'API Spot' } }));

    const sample = await j(await request.get('/api/maximizer/sample-customer-csv'));
    expect(sample.csv).toContain('name,email');
    const imp = await j(await request.post('/api/maximizer/import-csv', { data: { csv: sample.csv } }));
    expect(imp).toEqual(expect.objectContaining({ imported: expect.any(Number), updated: expect.any(Number), newCustomersQueued: expect.any(Number), segments: expect.any(Object) }));
    expect((await request.post('/api/maximizer/import-csv', { data: { csv: '' } })).status()).toBe(400);
    const wq = await j(await request.get('/api/maximizer/welcome-queue'));
    expect(wq).toEqual(expect.objectContaining({ queue: expect.any(Array), script: expect.any(String), ownerVideoUrl: expect.any(String) }));
    const idx = wq.queue.findIndex((q) => q.status === 'pending');
    if (idx >= 0) {
      const sent = await j(await request.post('/api/email/send-welcome', { data: { index: idx } }));
      expect(sent.result).toEqual(expect.objectContaining({ status: expect.stringMatching(/sent|stubbed/), headers: expect.any(Object) }));
      expect((await j(await request.get('/api/maximizer/welcome-queue'))).queue[idx].status).toBe('sent');
    }

    const codes = await j(await request.get('/api/codes/current'));
    expect(codes.tiers.length).toBe(4);
    expect((await j(await request.post('/api/codes/generate', { data: { length: 10 } }))).length).toBe(10);
    const sampleCodes = await j(await request.get('/api/codes/sample-csv'));
    const rec = await j(await request.post('/api/codes/reconcile', { data: { csv: sampleCodes.csv } }));
    expect(rec).toEqual(expect.objectContaining({ issued: expect.any(Number), redeemed: expect.any(Number), invalid: expect.any(Number), rows: expect.any(Array) }));
    expect(rec.rows.some((r) => r.valid === false)).toBeTruthy();
    expect((await request.post('/api/codes/reconcile', { data: { csv: '' } })).status()).toBe(400);

    const ad = await j(await request.post('/api/maximizer/ad-spend', { data: { platform: 'facebook', label: 'api', amount: 12 } }));
    expect((await j(await request.get('/api/maximizer/ad-spend'))).entries.some((e) => e.id === ad.entry.id)).toBeTruthy();
    await j(await request.delete(`/api/maximizer/ad-spend/${ad.entry.id}`));
    expect((await request.post('/api/maximizer/ad-spend', { data: { amount: 0 } })).status()).toBe(400);

    const report = await j(await request.get('/api/maximizer/weekly-report'));
    expect(report).toEqual(expect.objectContaining({ weekOf: expect.any(String), current: expect.any(Object), channels: expect.any(Array), topSpot: expect.any(Object), topGame: expect.any(Object) }));
    const cfg = await j(await request.get('/api/maximizer/report-email'));
    expect((await request.put('/api/maximizer/report-email', { data: { recipient: 'not-an-email' } })).status()).toBe(400);
    await j(await request.put('/api/maximizer/report-email', { data: { recipient: cfg.recipient } }));
    const sent = await j(await request.post('/api/maximizer/report-email/send-now'));
    expect(sent).toEqual(expect.objectContaining({ status: expect.stringMatching(/sent|stubbed/), to: cfg.recipient, subject: expect.any(String) }));
    expect((await j(await request.get('/api/maximizer/report-email'))).lastSentAt).toBeTruthy();
    await j(await request.get('/api/email/trickle-plan?total=3000'));
    await j(await request.post('/api/email/preview', { data: { content: 'hi' } }));
  });

  test('cadence, executioner, connections, print, attribution, knowledge, tracks, copilot, payments', async ({ request }) => {
    await j(await request.get('/api/campaign/cadence'));
    expect((await j(await request.post('/api/campaign/cadence/rest'))).cadence.mode).toBe('rest_nurture');
    expect((await j(await request.post('/api/campaign/cadence/sprint', { data: { days: 7 } }))).cadence.mode).toBe('sprint');
    await j(await request.post('/api/campaign/cadence/margin-floor', { data: { maxDiscountPct: 30, minSpendReq: 50 } }));

    const reports = await j(await request.get('/api/executioner/reports'));
    expect(reports.reports.length).toBeGreaterThanOrEqual(2);
    await j(await request.get('/api/executioner/allocation'));
    const rec = await j(await request.post('/api/executioner/reconcile'));
    expect(rec.report.weekOf > reports.reports[reports.reports.length - 1].weekOf).toBeTruthy();
    expect((await j(await request.get('/api/executioner/reports'))).reports.length).toBe(reports.reports.length + 1);
    const sample = await j(await request.get('/api/executioner/sample-transactions-csv'));
    const imp = await j(await request.post('/api/executioner/import-transactions', { data: { csv: sample.csv, source: 'square' } }));
    expect(imp).toMatchObject({ imported: 6, skipped: 1, mapping: expect.any(Object) });
    expect(imp.weeks.length).toBeGreaterThan(0);
    expect((await j(await request.get('/api/executioner/reports'))).reports.pop().dataSource).toBe('real');
    expect((await request.post('/api/executioner/import-transactions', { data: { csv: 'nope' } })).status()).toBe(400);
    const plan = await j(await request.get('/api/executioner/recommended-plan'));
    expect(plan).toEqual(expect.objectContaining({ strategyA: expect.objectContaining({ perChannel: expect.any(Object), excludedChannels: expect.any(Array) }), strategyB: expect.any(Object), diversificationTip: expect.any(String) }));
    await j(await request.post('/api/executioner/clear-transactions'));
    await j(await request.post('/api/executioner/reset'));
    expect((await j(await request.get('/api/executioner/reports'))).reports.length).toBe(2);

    const conn = await j(await request.get('/api/connections'));
    expect(conn.platforms.length).toBe(5);
    await j(await request.get('/api/connections/oauth/youtube/start'));
    const cb = await j(await request.post('/api/connections/oauth/callback', { data: { platform: 'youtube', code: 'demo' } }));
    expect(cb.platforms.find((p) => p.id === 'youtube').connected).toBe(true);
    const off = await j(await request.put('/api/connections', { data: { platform: 'youtube', connected: false } }));
    expect(off.platforms.find((p) => p.id === 'youtube').connected).toBe(false);
    await j(await request.get('/api/google-business/start'));
    await j(await request.get('/api/google-business/status'));
    await j(await request.get('/api/google-business/locations'));
    await j(await request.put('/api/google-business/location', { data: { name: 'x', title: 'y' } }));
    await j(await request.delete('/api/google-business/connection'));

    const tpls = await j(await request.get('/api/print-studio/templates'));
    expect(tpls.templates.length).toBeGreaterThan(0);
    const gen = await j(await request.post('/api/print-studio/generate', { data: { templateId: tpls.templates[0].id, surface: tpls.templates[0].surface, headline: 'h', subhead: 's', cta: 'c' } }));
    expect(gen.qrDataUri).toMatch(/^data:image\/png/);

    for (const s of ['meta', 'tiktok', 'gbp', 'pos']) {
      const csv = await (await request.get(`/api/attribution/samples/${s}`)).text();
      expect(csv.split('\n').length).toBeGreaterThan(1);
      await j(await request.post('/api/attribution/import', { data: { source: s, csv } }));
    }
    expect((await request.post('/api/attribution/import', { data: { source: 'meta' } })).status()).toBe(400);
    const sources = await j(await request.get('/api/attribution/sources'));
    expect(sources.summary.blendedRoas).toBeGreaterThan(0);
    await j(await request.post('/api/attribution/clear'));
    const cleared = await j(await request.get('/api/attribution/sources'));
    expect(cleared.summary).toMatchObject({ totalSpend: 0, totalAttributedRevenue: 0, blendedRoas: 0, hasData: false });
    for (const s of ['meta', 'tiktok', 'gbp', 'pos']) {
      await j(await request.post('/api/attribution/import', { data: { source: s, csv: await (await request.get(`/api/attribution/samples/${s}`)).text() } }));
    }

    const kn = await j(await request.get('/api/knowledge/profile'));
    expect(kn.maturity).toEqual(expect.objectContaining({ stage: expect.any(Number), stages: expect.any(Array) }));
    await j(await request.post('/api/knowledge/advance-maturity'));
    const tracks = await j(await request.get('/api/campaigns/tracks'));
    expect(tracks.tracks.length).toBe(4);
    const t = await j(await request.post('/api/campaigns/tracks/track_c/toggle'));
    expect(t.track.status).not.toBe(tracks.tracks.find((x) => x.id === 'track_c').status);
    await j(await request.post('/api/campaigns/tracks/track_c/toggle'));
    await j(await request.post('/api/campaigns/schedule', { data: { track: 'track_a', campaignName: 'api', weeklyBudget: 100 } }));
    await j(await request.post('/api/brand/contacts/update', { data: { phone: '555-0000' } }));

    expect((await j(await request.get('/api/copilot/tools'))).tools.length).toBe(11);
    expect((await request.post('/api/copilot/chat', { data: { message: '' } })).status()).toBe(400);
    const margin = await j(await request.post('/api/copilot/chat', { data: { message: 'Tune margin floor to 30% discount ceiling and $50 minimum spend', history: [], activeView: 'overview' } }));
    expect(margin.functionCalls[0].name).toBe('tune_margin_floor');
    const redeem = await j(await request.post('/api/copilot/chat', { data: { message: 'Redeem the next open voucher code with $150 net sales' } }));
    expect(redeem.functionCalls[0].name).toBe('redeem_voucher_code');
    expect(redeem.functionCalls[0].args.code).not.toBe('TAT50-PROMO');
    const nav = await j(await request.post('/api/copilot/chat', { data: { message: 'go to the multi-track campaigns view' } }));
    expect(nav.functionCalls[0].name).toBe('navigate_view');

    const co = await j(await request.post('/api/payments/checkout', { data: { lookup_key: 'omnilocal_monthly', origin_url: 'http://x' } }));
    expect(co.checkout_url).toContain('/payment/success?session_id=');
    expect((await j(await request.get(`/api/payments/status/${co.session_id}`))).payment_status).toBe('paid');
    expect((await request.get('/api/payments/status/nope')).status()).toBe(404);
    expect((await request.get('/api/does-not-exist')).status()).toBe(404);
  });

  test('a signed-out browser gets 401 and a stale member gets 403 with the lock-out detail', async ({ request, playwright }) => {
    const ctx = await playwright.request.newContext({ baseURL: request.storageState ? undefined : undefined });
    const out = await playwright.request.newContext({ baseURL: process.env.BASE_URL || 'http://localhost:3000' });
    await out.post('/api/auth/logout');
    expect((await out.get('/api/auth/me')).status()).toBe(401);
    expect((await out.get('/api/overview')).status()).toBe(401);
    expect((await out.get('/api/maximizer/games')).ok()).toBeTruthy(); // public play page still works
    const team = await j(await request.get('/api/team'));
    const member = await playwright.request.newContext({ baseURL: process.env.BASE_URL || 'http://localhost:3000' });
    const staleEmail = `stale-${Date.now()}@example.com`; // unique: this member ends the test revoked
    await j(await member.post('/api/auth/login', { data: { email: staleEmail, password: team.accessCode } }));
    expect((await member.get('/api/team')).status()).toBe(403);
    await j(await request.post('/api/team/rotate-code'));
    const locked = await member.get('/api/overview');
    expect(locked.status()).toBe(403);
    expect((await locked.json()).detail).toBe('access_code_required');
    const me = await j(await member.get('/api/auth/me'));
    expect(me.needsCode).toBe(true);
    const newTeam = await j(await request.get('/api/team'));
    await j(await member.post('/api/auth/activate', { data: { code: newTeam.accessCode } }));
    expect((await member.get('/api/overview')).ok()).toBeTruthy();
    const id = newTeam.members.find((m) => m.email === staleEmail).user_id;
    await j(await request.post(`/api/team/member/${id}/revoke`));
    const rev = await member.get('/api/overview');
    expect([401, 403]).toContain(rev.status());
    await ctx.dispose(); await out.dispose(); await member.dispose();
  });
});
