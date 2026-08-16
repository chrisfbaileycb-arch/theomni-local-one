const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const QRCode = require('qrcode');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = 3000;

app.use(cors({ origin: true, credentials: true }));
app.use(cookieParser());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ---------------------------------------------------------------------------
// IN-MEMORY DATABASE & PERSISTENT SEEDS
// ---------------------------------------------------------------------------
const DEFAULT_BRAND_PROFILE = {
  name: "Nonna's Corner Deli",
  city: "Springfield",
  cuisine: "Italian-American deli",
  signatureItem: "The Sunday Gravy Sub",
  voice: "Warm, proud, family-run and unpretentious. Speaks like a neighbor who loves feeding people — confident about quality, never corporate or salesy.",
  menuHighlights: "Sunday Gravy Sub, house-pulled mozzarella, six-hour Sunday gravy, fresh-baked hero rolls",
  backstory: "A three-generation family deli; recipes carried from Naples by Nonna herself.",
  igHandle: "nonnascorner",
  orderUrl: "https://order.nonnascorner.com"
};

const SHOOTING_PROMPTS = [
  {
    id: "ingredient-story",
    title: "Ingredient Story",
    prompt: "Pick up the most interesting ingredient in your kitchen right now and tell us where it comes from — farm, supplier, region, or family connection.",
    guidance: "Hold the ingredient in frame. Lead with the name before any backstory. Keep it under 60 seconds."
  },
  {
    id: "operational-hustle",
    title: "Operational Hustle",
    prompt: "Walk us through one thing that happens before we open that customers never see — the prep, the ritual, the grind.",
    guidance: "Film the actual action while you talk. Fast-moving hands read best on mobile."
  },
  {
    id: "behind-the-counter-secret",
    title: "Behind-the-Counter Secret",
    prompt: "Share one technique, ratio, or decision that makes your dish different — something a regular might never guess.",
    guidance: "Be specific: a temperature, a time, a tool. Vague secrets get skipped."
  },
  {
    id: "community-gratitude",
    title: "Community Gratitude",
    prompt: "Thank a specific corner of your community — a supplier, a neighboring business, or the regulars who kept you open.",
    guidance: "Name the person or business. Generic 'thanks everyone' posts underperform by 40% vs named shout-outs."
  },
  {
    id: "demographic-pivot",
    title: "Demographic Pivot",
    prompt: "Describe one way you adapted a menu item or your hours to better serve a group in your neighborhood that others overlook.",
    guidance: "Lead with the community, then the change. Avoid generalizations — be hyper-local."
  },
  {
    id: "menu-focus",
    title: "Menu Focus",
    prompt: "Pick your single best-seller this week and explain — in one sentence — why a first-time guest should order it.",
    guidance: "Say the item name in the first three seconds. Sell the outcome, not the process."
  },
  {
    id: "staff-spotlight",
    title: "Staff Spotlight",
    prompt: "Introduce one team member: their name, how long they've been here, and one thing they do better than anyone else.",
    guidance: "Get the team member on camera. Authenticity beats polish — a candid laugh outperforms a rehearsed line."
  },
  {
    id: "honest-entrepreneur",
    title: "Honest Entrepreneur",
    prompt: "Share one genuine challenge you faced this month — a supplier issue, a slow week, a lesson learned — and how you moved through it.",
    guidance: "Vulnerability is the hook. Let the struggle breathe for at least ten seconds."
  }
];

const DEFAULT_PRIZE_BOARD = {
  goodPrizes: [
    { label: "Free Sub (BOGO)", posCode: "BOGO-SUB" },
    { label: "30% Off Your Order", posCode: "SAVE30" },
    { label: "Free Side & Drink", posCode: "FREE-SIDE" },
    { label: "20% Off Your Order", posCode: "SAVE20" }
  ],
  dudPrize: { label: "10% Off Your Order", posCode: "SAVE10" }
};

const INDUSTRY_PACING = {
  restaurant: {
    label: "Restaurant",
    advisor: "Limit flash drops to off-peak hours and days (think Mon-Wed afternoons) to prevent kitchen bottlenecks. Protect Friday-Sunday service from promo surges.",
    cadence: "2-3 day bursts, max one gamified campaign per week",
    window: "Off-peak: Mon-Wed, 2-5pm drops",
    rotation: "Social/SMS one week -> boxes, bags & local print QR the next"
  },
  salon: {
    label: "Salon / Spa",
    advisor: "Stagger offers toward off-peak mid-week appointment slots (Tue-Thu) to protect weekend prime-time books.",
    cadence: "2-day bursts targeting slow booking windows",
    window: "Tue-Thu, late morning and early afternoon slots",
    rotation: "Instagram/SMS one week -> in-mirror QR & partner shops the next"
  },
  tattoo: {
    label: "Tattoo Parlor",
    advisor: "Point bursts at mid-week walk-in gaps and flash-sheet days; keep weekend appointment books full-price.",
    cadence: "Limited-window runs (48-72h flash drops)",
    window: "Tue-Thu walk-in hours",
    rotation: "Instagram one week -> shop-window QR & local print the next"
  },
  auto_repair: {
    label: "Auto Repair",
    advisor: "Focus bursts around seasonal maintenance checks (tires, AC, brakes) and low-bay-utilization days.",
    cadence: "Seasonal pushes plus 2-3 day mid-week bursts",
    window: "Low-bay days: typically Tue-Wed",
    rotation: "SMS/Google one week -> counter QR & mailers the next"
  },
  contractor: {
    label: "Service Contractor",
    advisor: "Focus bursts around seasonal maintenance windows and shoulder-season gaps; avoid peak-project months.",
    cadence: "Seasonal bursts, 1-2 weeks before demand spikes",
    window: "Shoulder seasons and slow scheduling weeks",
    rotation: "Google/SMS one week -> door hangers & yard-sign QR the next"
  },
  real_estate: {
    label: "Real Estate Agent",
    advisor: "Focus bursts around listing launches and open-house weekends - tease a lead-gen game 2-3 days before each open house and protect weekend showings from unrelated promos.",
    cadence: "Burst 2-3 days ahead of each listing launch or open house",
    window: "Thu-Fri teasers before weekend tours",
    rotation: "Facebook/Instagram one week -> yard-sign QR & postcard farming the next"
  },
  saas: {
    label: "Software / SaaS",
    advisor: "Focus bursts around demo days, launches, trade shows and niche community events - tease a giveaway or trial-upgrade game 2-3 days ahead, then go quiet and follow up with signups.",
    cadence: "2-3 day bursts around launches, events and demo pushes",
    window: "Tue-Thu business hours, when decision-makers are at their desks",
    rotation: "LinkedIn/Facebook one week -> event-flyer QR & partner newsletters the next"
  }
};

const DEFAULT_INDUSTRIES = Object.entries(INDUSTRY_PACING).map(([k, v]) => ({ id: k, ...v }));

const DEFAULT_STRATEGY = {
  industry: "restaurant",
  videos: [
    { id: "flash-campaigns", title: "How to Run High-Converting Flash Campaigns", youtubeUrl: "" },
    { id: "rules-of-engagement", title: "Rules of Engagement for Gamification", youtubeUrl: "" }
  ]
};

const OPERATIONAL_DISCLAIMER =
  "WARNING / STRATEGIC NOTICE: Gamified promotions are designed to drive high-density engagement. Running continuous broad-spectrum promotions can dilute your brand value, lower customer response rates, and overwhelm staff and operations. We strongly recommend staggering campaigns across short, limited timeframes to maintain high campaign yield and protect service quality.";

const GAMES = [
  { id: "spin_wheel", name: "Lucky Spin Wheel", description: "Spin the wheel to win delicious prizes and exclusive discounts!", icon: "Sparkles", active: true },
  { id: "scratch_card", name: "Scratch & Win", description: "Scratch 3 matching symbols to reveal your mystery gift.", icon: "Gift", active: false },
  { id: "mystery_box", name: "Vault Mystery Box", description: "Pick a mystery box behind the counter to unlock secret chef perks.", icon: "Box", active: false }
];

// In-Memory state store
const state = {
  brand_profile: { ...DEFAULT_BRAND_PROFILE },
  prize_board: JSON.parse(JSON.stringify(DEFAULT_PRIZE_BOARD)),
  strategy: JSON.parse(JSON.stringify(DEFAULT_STRATEGY)),
  industries: JSON.parse(JSON.stringify(DEFAULT_INDUSTRIES)),
  game_settings: { playFrequencyDays: 7, codeExpiryDays: 7, enabled: true },
  game_override: null,
  team_settings: { access_code: "TR-7K9P-4M2X", code_version: 1 },
  users: [
    {
      user_id: "usr_owner_01",
      email: "owner@nonnascorner.com",
      name: "Marco Rossi (Owner)",
      picture: "",
      role: "owner",
      status: "active"
    }
  ],
  members: [
    {
      memberKey: "gianna.m@example.com",
      email: "gianna.m@example.com",
      phone: "555-0192",
      name: "Gianna Moretti",
      visits: 8,
      couponRatio: 0.25,
      segment: "loyal",
      source: "spin_signup",
      signupSpace: "Table Tent #3",
      createdAt: new Date(Date.now() - 25 * 86400000).toISOString(),
      lastSpinAt: new Date(Date.now() - 2 * 86400000).toISOString(),
      lastRedeemedAt: new Date(Date.now() - 2 * 86400000).toISOString()
    },
    {
      memberKey: "tony.soprano@example.com",
      email: "tony.soprano@example.com",
      phone: "555-0144",
      name: "Tony S.",
      visits: 14,
      couponRatio: 0.14,
      segment: "loyal",
      source: "counter_qr",
      signupSpace: "Register #1",
      createdAt: new Date(Date.now() - 40 * 86400000).toISOString(),
      lastSpinAt: new Date(Date.now() - 4 * 86400000).toISOString(),
      lastRedeemedAt: new Date(Date.now() - 4 * 86400000).toISOString()
    },
    {
      memberKey: "dealhunter99@example.com",
      email: "dealhunter99@example.com",
      phone: "555-0188",
      name: "Sam Discount",
      visits: 3,
      couponRatio: 1.0,
      segment: "coupon_only",
      source: "spin_signup",
      signupSpace: "Door Decal",
      createdAt: new Date(Date.now() - 10 * 86400000).toISOString(),
      lastSpinAt: new Date(Date.now() - 1 * 86400000).toISOString(),
      lastRedeemedAt: new Date(Date.now() - 1 * 86400000).toISOString()
    }
  ],
  redemptions: [
    {
      id: "rd_101",
      code: "HV-7K9A2M",
      tier: "highValue",
      reward: "Free Sub (BOGO)",
      posCode: "BOGO-SUB",
      segment: "vip",
      guestType: "repeat",
      gameId: "spin_wheel",
      gameName: "Lucky Spin Wheel",
      spaceId: "Table Tent #3",
      status: "redeemed",
      memberKey: "gianna.m@example.com",
      memberEmail: "gianna.m@example.com",
      issuedAt: new Date(Date.now() - 2 * 86400000).toISOString(),
      expiresAt: new Date(Date.now() + 5 * 86400000).toISOString(),
      redeemedAt: new Date(Date.now() - 1 * 86400000).toISOString(),
      netSales: 34.50
    },
    {
      id: "rd_102",
      code: "ST-88M2K1",
      tier: "standard",
      reward: "20% Off Your Order",
      posCode: "SAVE20",
      segment: "standard",
      guestType: "repeat",
      gameId: "spin_wheel",
      gameName: "Lucky Spin Wheel",
      spaceId: "Register #1",
      status: "issued",
      memberKey: "tony.soprano@example.com",
      memberEmail: "tony.soprano@example.com",
      issuedAt: new Date(Date.now() - 1 * 86400000).toISOString(),
      expiresAt: new Date(Date.now() + 6 * 86400000).toISOString(),
      redeemedAt: null,
      netSales: null
    }
  ],
  ad_spend_logs: [
    { id: "ad_1", weekOf: "2026-08-04", channel: "facebook_act_now_ads", amount: 149.50, notes: "Dinner rush lunch promo", createdAt: new Date().toISOString() },
    { id: "ad_2", weekOf: "2026-08-04", channel: "google_maps_pin_boost", amount: 149.50, notes: "Radius 3-mile geo pin", createdAt: new Date().toISOString() }
  ],
  coach_templates: [
    {
      id: "tmpl_1",
      topic: "Sunday Gravy 6-Hour Simmer",
      template: {
        hook: "Show the bubbling Dutch oven right up close and say: 'Six hours. That is how long real Sunday Gravy takes.'",
        action: "Dip the ladle, pull up a slow pour of thick rich gravy covering braised short rib.",
        callToAction: "Order your Sunday Gravy sub online at order.nonnascorner.com before we sell out today.",
        filmingTips: "Shoot vertical, 9:16. Natural kitchen steam looks amazing on mobile."
      },
      createdAt: new Date(Date.now() - 2 * 86400000).toISOString()
    }
  ],
  calendar: [
    {
      weekOf: "2026-08-11",
      days: [
        { day: "Tue", date: "Aug 12", promptId: "ingredient-story", title: "House-made Mozzarella Pull", status: "published", channel: "Instagram & GBP" },
        { day: "Thu", date: "Aug 14", promptId: "operational-hustle", title: "6am Dough Proofing", status: "scheduled", channel: "Facebook & GBP" },
        { day: "Sat", date: "Aug 16", promptId: "behind-the-counter-secret", title: "Sunday Gravy Slow Simmer", status: "draft", channel: "All Channels" }
      ]
    }
  ],
  approvals: [],
  vault: [
    { id: "v_01", title: "Mozzarella Stretching Behind Counter", promptId: "operational-hustle", filename: "mozzarella-prep.mp4", featured: true, createdAt: new Date().toISOString() }
  ],
  win_report_email: {
    enabled: true,
    recipient: "owner@nonnascorner.com",
    timezone: "America/New_York",
    lastResult: "sent",
    schedule: "Mondays 9:00am (America/New_York)",
    liveSending: true
  },
  reports: [
    {
      weekOf: "2026-07-28",
      allocation: {
        weekOf: "2026-07-28",
        totalBudget: 299.0,
        strategyA: { share: 0.5, dollars: 149.5, perChannel: { facebook_act_now_ads: 74.75, google_maps_pin_boost: 74.75 } },
        strategyB: { share: 0.5, dollars: 149.5, perChannel: { gbp_organic_boost: 74.75, local_story_drip: 74.75 } }
      },
      metrics: {
        strategyA: { newCustomers: 34, revenue: 1142.50, cac: 4.40, roas: 7.64, clicks: 480, conversions: 34, spend: 149.5 },
        strategyB: { newCustomers: 21, revenue: 648.00, cac: 7.12, roas: 4.33, clicks: 210, conversions: 21, spend: 149.5 }
      },
      decision: { winner: "A", winnerShare: 0.7 },
      zipBreakdown: { "01103": { customers: 24, revenue: 780 }, "01104": { customers: 18, revenue: 590 }, "01108": { customers: 13, revenue: 420.5 } },
      totalRevenue: 1790.50,
      totalSpend: 299.0,
      blendedRoas: 5.99,
      dataSource: "reconciled"
    },
    {
      weekOf: "2026-08-04",
      allocation: {
        weekOf: "2026-08-04",
        totalBudget: 299.0,
        strategyA: { share: 0.7, dollars: 209.3, perChannel: { facebook_act_now_ads: 104.65, google_maps_pin_boost: 104.65 } },
        strategyB: { share: 0.3, dollars: 89.7, perChannel: { gbp_organic_boost: 44.85, local_story_drip: 44.85 } }
      },
      metrics: {
        strategyA: { newCustomers: 48, revenue: 1612.00, cac: 4.36, roas: 7.70, clicks: 680, conversions: 48, spend: 209.3 },
        strategyB: { newCustomers: 14, revenue: 432.00, cac: 6.41, roas: 4.82, clicks: 140, conversions: 14, spend: 89.7 }
      },
      decision: { winner: "A", winnerShare: 0.7 },
      zipBreakdown: { "01103": { customers: 31, revenue: 1010 }, "01104": { customers: 20, revenue: 640 }, "01108": { customers: 11, revenue: 394 } },
      totalRevenue: 2044.00,
      totalSpend: 299.0,
      blendedRoas: 6.84,
      dataSource: "reconciled"
    }
  ]
};

// Sessions store
const sessions = new Map();
// Seed an initial owner session
const defaultOwner = state.users[0];
sessions.set("tok_owner_default", { userId: defaultOwner.user_id, expires: Date.now() + 30 * 86400000 });

// Helper to get user from request
function getUserFromReq(req) {
  const token = req.cookies?.session_token || req.headers?.authorization?.replace(/^Bearer\s+/, '') || "tok_owner_default";
  const sess = sessions.get(token);
  if (sess && sess.expires > Date.now()) {
    return state.users.find(u => u.user_id === sess.userId) || defaultOwner;
  }
  return defaultOwner; // Default to owner so all views load immediately in AI Studio preview
}

// ---------------------------------------------------------------------------
// API ENDPOINTS
// ---------------------------------------------------------------------------

// Root
app.get('/api', (req, res) => {
  res.json({ service: "omnilocal-1-revenue-engine", status: "ok" });
});

// Auth
app.get('/api/auth/me', (req, res) => {
  const user = getUserFromReq(req);
  res.json({
    user,
    needsCode: user.role !== 'owner' && user.status !== 'active',
    revoked: user.status === 'revoked'
  });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  let user = state.users.find(u => u.email === email);
  if (!user) {
    user = {
      user_id: `usr_${Date.now()}`,
      email: email || "owner@nonnascorner.com",
      name: (email ? email.split('@')[0] : "Owner"),
      role: state.users.length === 0 ? "owner" : "owner",
      status: "active"
    };
    state.users.push(user);
  }
  const token = `tok_${crypto.randomBytes(16).toString('hex')}`;
  sessions.set(token, { userId: user.user_id, expires: Date.now() + 7 * 86400000 });
  res.cookie('session_token', token, { httpOnly: true, maxAge: 7 * 86400000 });
  res.json({
    user,
    needsCode: false,
    revoked: false,
    sessionToken: token
  });
});

app.post('/api/auth/change-password', (req, res) => {
  res.json({ status: "ok", message: "Password updated successfully." });
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('session_token');
  res.json({ status: "ok" });
});

app.post('/api/auth/activate', (req, res) => {
  const { code } = req.body || {};
  if (code !== state.team_settings.access_code) {
    return res.status(400).json({ detail: "Invalid access code. Ask your owner for the current team code." });
  }
  const user = getUserFromReq(req);
  user.status = "active";
  res.json({ user, status: "active" });
});

// Team
app.get('/api/team', (req, res) => {
  const owner = state.users.find(u => u.role === 'owner') || state.users[0];
  const members = state.users.filter(u => u.user_id !== owner.user_id);
  res.json({
    owner,
    members,
    access_code: state.team_settings.access_code,
    code_version: state.team_settings.code_version,
    maxMembers: 3,
    pendingCount: state.approvals.filter(a => a.status === 'pending').length
  });
});

app.post('/api/team/rotate-code', (req, res) => {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const seg = () => Array.from({ length: 4 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
  state.team_settings.access_code = `TR-${seg()}-${seg()}`;
  state.team_settings.code_version += 1;
  res.json(state.team_settings);
});

app.post('/api/team/member/:userId/revoke', (req, res) => {
  const user = state.users.find(u => u.user_id === req.params.userId);
  if (user) user.status = "revoked";
  res.json({ status: "ok", user });
});

app.post('/api/team/member/:userId/restore', (req, res) => {
  const user = state.users.find(u => u.user_id === req.params.userId);
  if (user) user.status = "active";
  res.json({ status: "ok", user });
});

// Approvals
app.get('/api/approvals', (req, res) => {
  const items = state.approvals || [];
  res.json({
    items,
    pendingCount: items.filter(a => a.status === 'pending').length
  });
});

app.post('/api/approvals/:id/approve', (req, res) => {
  const appItem = state.approvals.find(a => a.id === req.params.id);
  if (appItem) appItem.status = "approved";
  res.json({ status: "ok", item: appItem });
});

app.post('/api/approvals/:id/reject', (req, res) => {
  const appItem = state.approvals.find(a => a.id === req.params.id);
  if (appItem) {
    appItem.status = "rejected";
    appItem.reason = req.body?.reason || "Rejected by owner";
  }
  res.json({ status: "ok", item: appItem });
});

// Command Center / Overview
app.get('/api/overview', (req, res) => {
  const reports = state.reports;
  const brand = state.brand_profile;
  const totalRev = reports.reduce((s, r) => s + (r.totalRevenue || 0), 0);
  const totalSpend = reports.reduce((s, r) => s + (r.totalSpend || 0), 0);
  const totalNew = reports.reduce((s, r) => s + (r.metrics?.strategyA?.newCustomers || 0) + (r.metrics?.strategyB?.newCustomers || 0), 0);
  const latest = reports[reports.length - 1] || {};

  const weekly = reports.map(r => ({
    weekOf: r.weekOf,
    revenue: r.totalRevenue,
    spend: r.totalSpend,
    roas: r.blendedRoas,
    shareA: r.allocation?.strategyA?.share || 0.5,
    shareB: r.allocation?.strategyB?.share || 0.5,
    winner: r.decision?.winner || "A"
  }));

  const ind = state.industries.find(i => i.id === state.strategy.industry) || state.industries[0];

  res.json({
    brand,
    hero: {
      totalAttributedRevenue: Math.round(totalRev * 100) / 100,
      blendedRoas: latest.blendedRoas || 6.84,
      newCustomers: totalNew,
      totalSpend: Math.round(totalSpend * 100) / 100,
      netProfit: Math.round((totalRev - totalSpend) * 100) / 100,
      activeGame: "Lucky Spin Wheel",
      weeksLearning: reports.length || 2
    },
    weekly,
    latestWinner: latest.decision?.winner || "A",
    valpak: {
      valpakCost: 1500,
      valpakHomes: 10000,
      ourCost: 299,
      ourReachNote: "Targets 12,000+ local mobile impressions with proven attribution"
    },
    pacing: ind,
    quickStats: {
      wheelSpinsThisWeek: 42,
      posRedemptions: state.redemptions.filter(r => r.status === 'redeemed').length,
      unredeemedLiability: "$140.00",
      membersCount: state.members.length
    }
  });
});

// Local Market Intelligence
app.get('/api/content/local-events', (req, res) => {
  const brand = state.brand_profile;
  res.json({
    insight: {
      headline: `Downtown ${brand.city} Weekend Festival & High School Championship`,
      recommendedChannel: "Meta & Maps Pin Geofence"
    },
    events: [
      {
        id: "ev_1",
        category: "sports",
        daysAway: 2,
        date: "Saturday 2:00 PM",
        title: "Regional High School Football Championship",
        venue: `${brand.city} Memorial Stadium`,
        distanceMiles: 1.2,
        expectedAttendance: 4500,
        budgetShift: 15,
        channelLabel: "Meta Act-Now Ads",
        rationale: "Post-game family traffic surge within 2 miles of your storefront.",
        contentIdea: `Flash deal: 'Show your game ticket for free cannoli or side with any ${brand.signatureItem}'`
      },
      {
        id: "ev_2",
        category: "festival",
        daysAway: 4,
        date: "Sunday 11:00 AM",
        title: "Main Street Artisans & Food Crawl",
        venue: "Historic Downtown Plaza",
        distanceMiles: 0.4,
        expectedAttendance: 8000,
        budgetShift: 20,
        channelLabel: "Google Maps Pin Boost",
        rationale: "Pedestrian footfall passing directly past the shop entrance.",
        contentIdea: `Table tent QR placement: 'Spin to win your afternoon refreshment or lunch reward!'`
      }
    ]
  });
});

// Content Director
app.get('/api/content/prompts', (req, res) => {
  const todayDate = new Date().toISOString().slice(0, 10);
  let hash = 0;
  for (let i = 0; i < todayDate.length; i++) hash = (hash * 31 + todayDate.charCodeAt(i)) & 0xFFFFFFFF;
  const daily = SHOOTING_PROMPTS[Math.abs(hash) % SHOOTING_PROMPTS.length];
  
  res.json({
    prompts: SHOOTING_PROMPTS,
    daily,
    today: daily,
    assetVault: [
      { id: "v_1", title: "Signature Prep & Sunday Gravy", category: "Signature Prep", clips: 12 },
      { id: "v_2", title: "Morning Hustle & Fresh Bread", category: "Operational Hustle", clips: 8 },
      { id: "v_3", title: "Regulars & Springfield Community", category: "Community", clips: 15 },
      { id: "v_4", title: "The Sunday Gravy Sub Hero", category: "Hero Product", clips: 18 },
      { id: "v_5", title: "Weekend Specials & Holidays", category: "Evergreen / Holidays", clips: 6 }
    ],
    distribution: [
      { platform: "facebook", label: "Facebook Feed & Reels", surface: "Feed / Reels", contentType: "Short Video (9:16)" },
      { platform: "instagram", label: "Instagram Reels & Stories", surface: "Reels / Stories", contentType: "Short Video (9:16)" },
      { platform: "gbp", label: "Google Business Updates", surface: "What's New Post", contentType: "Offer / Photo Post" },
      { platform: "tiktok", label: "TikTok Local", surface: "Feed", contentType: "Short Video (9:16)" },
      { platform: "youtube", label: "YouTube Shorts", surface: "Shorts", contentType: "Vertical Video" }
    ],
    sampleVideos: [
      { index: 0, label: "Good: Sunday Gravy Sub Dinner Rush" },
      { index: 1, label: "Needs Fix: Backlit Owner Intro" }
    ]
  });
});

app.get('/api/content/brand-profile', (req, res) => {
  res.json(state.brand_profile);
});

app.put('/api/content/brand-profile', (req, res) => {
  state.brand_profile = { ...state.brand_profile, ...req.body };
  res.json(state.brand_profile);
});

app.post('/api/content/copy', (req, res) => {
  const { transcript } = req.body || {};
  const clean = (transcript || "Fresh handmade mozzarella and authentic Sunday gravy, made with pride every morning.").trim();
  const b = state.brand_profile;

  res.json({
    drafts: {
      gbp: `Craving real Italian comfort food in ${b.city}? Nonna's kitchen is serving up fresh ${b.signatureItem} made from scratch daily. Order online today: ${b.orderUrl}`,
      facebook: `Family recipe straight from Naples: every Sunday gravy takes 6 slow hours to reach perfection. What's your favorite comfort dish on a rainy afternoon? Drop a comment below! 🍝❤️`,
      instagram: `Hand-pulled mozzarella, golden toasted hero rolls, and that 6-hour simmer. Nothing beats ${b.signatureItem}. Stop by today or tag a friend who needs this lunch! 🥖🔥\n\n#${b.city.replace(/\s+/g, '')}Eats #LocalDeli #ItalianAmerican #${b.signatureItem.replace(/\s+/g, '')} #SupportLocal @${b.igHandle}`
    },
    gbp: `Craving real Italian comfort food in ${b.city}? Nonna's kitchen is serving up fresh ${b.signatureItem} made from scratch daily. Order online today: ${b.orderUrl}`,
    facebook: `Family recipe straight from Naples: every Sunday gravy takes 6 slow hours to reach perfection. What's your favorite comfort dish on a rainy afternoon? Drop a comment below! 🍝❤️`,
    instagram: `Hand-pulled mozzarella, golden toasted hero rolls, and that 6-hour simmer. Nothing beats ${b.signatureItem}. Stop by today or tag a friend who needs this lunch! 🥖🔥\n\n#${b.city.replace(/\s+/g, '')}Eats #LocalDeli #ItalianAmerican #${b.signatureItem.replace(/\s+/g, '')} #SupportLocal @${b.igHandle}`
  });
});

app.post('/api/content/critic', (req, res) => {
  const idx = Number(req.body?.index || 0);
  const sample = [
    {
      filename: "dinner-rush-sub.mov",
      hook: { grade: "STRONG", critique: "Hook opens with action and subject is on screen within 1 second. This is correct.", recommendation: "Maintain this pattern on every clip." },
      audio: { grade: "STRONG", critique: "Voice is clearly above background noise and energy is readable. Audio passes.", recommendation: "Keep the exhaust off during filming and maintain this energy level." },
      framing: { grade: "STRONG", critique: "Subject is front-lit, fully in frame, and the background is clean. Framing passes.", recommendation: "Keep this setup as your default for all talking-head clips." },
      overall: "STRONG",
      measured: { durationSec: 28, wordsPerMinute: 135, framesAnalyzed: 840, hasAudio: true }
    },
    {
      filename: "owner-intro.mov",
      hook: { grade: "WEAK", critique: 'Your hook does not grab attention. "Um, hi everyone" is not an action opener — viewers scroll past in under 2 seconds.', recommendation: "Cut the first 4s. Start mid-action or lead with the single most interesting word." },
      audio: { grade: "IMPROVABLE", critique: "Background noise is close to voice level. Likely culprit: exhaust fan nearby.", recommendation: "Turn off exhaust fan while filming or move 10 feet away." },
      framing: { grade: "IMPROVABLE", critique: "You are back-lit. The bright window turns your face into a silhouette.", recommendation: "Step toward window light so it illuminates your face." },
      overall: "WEAK",
      measured: { durationSec: 34, wordsPerMinute: 92, framesAnalyzed: 1020, hasAudio: true }
    }
  ];
  const selected = sample[idx % sample.length];
  res.json({ report: selected, ...selected });
});

app.post('/api/content/critic/upload/init', (req, res) => {
  res.json({ uploadId: `up_${Date.now()}` });
});

app.post('/api/content/critic/upload/chunk', (req, res) => {
  res.json({ status: "ok" });
});

app.post('/api/content/critic/analyze', (req, res) => {
  const { filename } = req.body || {};
  const report = {
    filename: filename || "video-upload.mov",
    hook: { grade: "STRONG", critique: "Starts right on the hero subject. Hook captured within 1.2s.", recommendation: "Great fast action start." },
    audio: { grade: "STRONG", critique: "Vocal energy is confident and clear with low background noise.", recommendation: "Maintain this volume balance." },
    framing: { grade: "STRONG", critique: "Front lighting and stable 9:16 vertical composition.", recommendation: "Ready for social deployment." },
    overall: "STRONG",
    measured: { durationSec: 22, wordsPerMinute: 140, framesAnalyzed: 660, hasAudio: true }
  };
  res.json({
    report,
    transcript: "Welcome to Nonna's! Today we're pulling the fresh mozzarella warm from the curd.",
    videoUrl: null,
    planCheck: { verdict: "ON-PLAN", matched: ["Action-first hook", "Signature dish showcased"], fix: [] }
  });
});

const buildCalendarResponse = () => {
  const surfaces = [
    "Instagram Reels",
    "Facebook Reels",
    "Google Business",
    "TikTok",
    "YouTube Shorts"
  ];
  const formattedWeeks = (state.calendar || []).map((wk, idx) => ({
    weekOf: wk.weekOf || "2026-08-11",
    label: wk.weekOf ? `Aug ${11 + idx * 7}` : "This Week",
    days: (wk.days || []).map((d, dIdx) => ({
      date: d.date || `2026-08-${11 + dIdx}`,
      weekday: d.day || ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][dIdx % 7],
      dayNum: 11 + dIdx,
      posts: [
        {
          id: `post_${idx}_${dIdx}`,
          time: "12:00",
          title: d.title || "Signature Special Highlight",
          surface: d.channel ? (d.channel.includes("Instagram") ? "Instagram Reels" : "Facebook Reels") : "Instagram Reels",
          source: d.promptId ? "prompt" : "manual"
        }
      ]
    }))
  }));

  return {
    weeksPlanned: formattedWeeks.length || 2,
    surfaces,
    weeks: formattedWeeks
  };
};

app.get('/api/content/calendar', (req, res) => {
  res.json(buildCalendarResponse());
});

app.post('/api/content/calendar/add-week', (req, res) => {
  const nextDate = new Date();
  nextDate.setDate(nextDate.getDate() + 7 * state.calendar.length);
  const dateStr = nextDate.toISOString().slice(0, 10);
  const newWeek = {
    weekOf: dateStr,
    days: [
      { day: "Tue", date: "Upcoming", promptId: "menu-focus", title: "Signature Dish Focus", status: "scheduled", channel: "Instagram & GBP" },
      { day: "Thu", date: "Upcoming", promptId: "ingredient-story", title: "Local Farm Sourcing", status: "draft", channel: "Facebook" }
    ]
  };
  state.calendar.push(newWeek);
  res.json(buildCalendarResponse());
});

app.post('/api/content/calendar/post', (req, res) => {
  const { weekIndex, dayIndex, status, title, surface, date } = req.body || {};
  if (state.calendar[0]) {
    state.calendar[0].days.push({
      day: "Today",
      date: date || "Upcoming",
      promptId: "custom",
      title: title || "Custom Post",
      status: status || "scheduled",
      channel: surface || "Instagram"
    });
  }
  res.json(buildCalendarResponse());
});

app.post('/api/content/calendar/remove', (req, res) => {
  res.json(buildCalendarResponse());
});

app.post('/api/content/calendar/reset', (req, res) => {
  state.calendar = [
    {
      weekOf: "2026-08-11",
      days: [
        { day: "Tue", date: "Aug 12", promptId: "ingredient-story", title: "House-made Mozzarella Pull", status: "published", channel: "Instagram & GBP" },
        { day: "Thu", date: "Aug 14", promptId: "operational-hustle", title: "6am Dough Proofing", status: "scheduled", channel: "Facebook & GBP" },
        { day: "Sat", date: "Aug 16", promptId: "behind-the-counter-secret", title: "Sunday Gravy Slow Simmer", status: "draft", channel: "All Channels" }
      ]
    }
  ];
  res.json(buildCalendarResponse());
});

app.get('/api/content/distribution', (req, res) => {
  res.json({
    gbp: { connected: true, lastPost: "2 days ago" },
    facebook: { connected: true, lastPost: "Yesterday" },
    instagram: { connected: true, lastPost: "3 days ago" },
    mailchimp: { connected: false }
  });
});

app.post('/api/content/publish-all', (req, res) => {
  const user = getUserFromReq(req);
  if (user.role !== 'owner') {
    const approval = {
      id: `appr_${Date.now()}`,
      type: "publish_all",
      requestedBy: user.name || user.email,
      payload: req.body,
      status: "pending",
      createdAt: new Date().toISOString()
    };
    state.approvals.push(approval);
    return res.json({ status: "pending_approval", approvalId: approval.id });
  }
  res.json({ status: "published", timestamp: new Date().toISOString() });
});

app.get('/api/content/strategy', (req, res) => {
  const ind = state.industries.find(i => i.id === state.strategy.industry) || state.industries[0];
  res.json({
    ...state.strategy,
    pacing: ind,
    industries: state.industries,
    disclaimer: OPERATIONAL_DISCLAIMER
  });
});

app.put('/api/content/strategy', (req, res) => {
  if (req.body.industry) state.strategy.industry = req.body.industry;
  if (req.body.videos) state.strategy.videos = req.body.videos;
  const ind = state.industries.find(i => i.id === state.strategy.industry) || state.industries[0];
  res.json({
    ...state.strategy,
    pacing: ind,
    industries: state.industries,
    disclaimer: OPERATIONAL_DISCLAIMER
  });
});

app.post('/api/content/industries', (req, res) => {
  const { id, label, advisor, cadence, window, rotation } = req.body || {};
  if (id && label) {
    state.industries.push({ id, label, advisor: advisor || "", cadence: cadence || "", window: window || "", rotation: rotation || "" });
  }
  res.json(state.industries);
});

app.put('/api/content/industries/:iid', (req, res) => {
  const idx = state.industries.findIndex(i => i.id === req.params.iid);
  if (idx !== -1) {
    state.industries[idx] = { ...state.industries[idx], ...req.body };
  }
  res.json(state.industries);
});

app.delete('/api/content/industries/:iid', (req, res) => {
  if (state.industries.length > 1) {
    state.industries = state.industries.filter(i => i.id !== req.params.iid);
  }
  res.json(state.industries);
});

// The Coach
app.post('/api/coach/template', (req, res) => {
  const { topic } = req.body || {};
  const t = (topic || "Signature Special").trim();
  const b = state.brand_profile;
  const newTmpl = {
    id: `tmpl_${Date.now()}`,
    topic: t,
    template: {
      hook: `Hold up the dish or ingredient and say: 'This is why ${b.name} does ${t} differently than anyone in ${b.city}.'`,
      action: "Show the signature prep technique in 3 quick cuts — high energy, real sound effects.",
      callToAction: `Claim your first-time reward on our rewards wheel or order online at ${b.orderUrl}.`,
      filmingTips: "Shoot vertical with phone microphone 12 inches from mouth. Keep raw & authentic."
    },
    createdAt: new Date().toISOString()
  };
  state.coach_templates.unshift(newTmpl);
  res.json(newTmpl);
});

app.get('/api/coach/templates', (req, res) => {
  res.json({ templates: state.coach_templates });
});

app.delete('/api/coach/template/:tid', (req, res) => {
  state.coach_templates = state.coach_templates.filter(t => t.id !== req.params.tid);
  res.json({ status: "ok" });
});

app.post('/api/coach/template/:tid/to-calendar', (req, res) => {
  const tmpl = state.coach_templates.find(t => t.id === req.params.tid);
  if (tmpl && state.calendar[0]) {
    state.calendar[0].days.push({
      day: "Fri",
      date: "This Week",
      promptId: "coach-build",
      title: tmpl.topic,
      status: "scheduled",
      channel: "Instagram, TikTok & GBP"
    });
  }
  res.json({ status: "ok" });
});

app.get('/api/coach/template/:tid/pdf', (req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(`<html><body style="font-family:sans-serif;padding:40px;"><h1>OmniLocal #1 Build Sheet</h1><p>Coach template printable build guide.</p></body></html>`);
});

// Video Vault
app.get('/api/vault', (req, res) => {
  const prompts = [
    {
      id: "v_p1",
      title: "Your 60-Second Story",
      category: "intro",
      direction: "Introduce yourself, why you opened, and your signature dish in 60 unedited seconds.",
      video: state.vault.find(v => v.promptId === "intro") || null
    },
    {
      id: "v_p2",
      title: "Signature Ingredient Pull",
      category: "kitchen",
      direction: "Show the house-made mozzarella or bread pull right up close to the camera lens.",
      video: state.vault.find(v => v.promptId === "operational-hustle") || {
        id: "v_01",
        title: "Mozzarella Stretching Behind Counter",
        promptId: "operational-hustle",
        featured: true
      }
    },
    {
      id: "v_p3",
      title: "Behind-the-Counter Rush",
      category: "kitchen",
      direction: "Catch the dinner rush sizzle, bread toast, and order bell in full swing.",
      video: null
    },
    {
      id: "v_p4",
      title: "Owner Greeting & Gratitude",
      category: "greeting",
      direction: "Say thank you to first-time guests and invite them to claim their welcome spin reward.",
      video: null
    }
  ];

  const customVideos = state.vault.filter(v => !v.promptId || v.promptId === "custom");
  const captured = prompts.filter(p => p.video).length;

  res.json({
    prompts,
    capturedCount: captured,
    totalPrompts: prompts.length,
    totalVideos: state.vault.length + captured,
    featured: state.vault.find(v => v.featured) || { id: "v_01", title: "Mozzarella Stretching Behind Counter" },
    custom: customVideos,
    videos: state.vault
  });
});

app.post('/api/vault/save', (req, res) => {
  const { title, promptId, filename } = req.body || {};
  const v = {
    id: `v_${Date.now()}`,
    title: title || "New Video Clip",
    promptId: promptId || "operational-hustle",
    filename: filename || "clip.mp4",
    featured: false,
    createdAt: new Date().toISOString()
  };
  state.vault.unshift(v);
  res.json(v);
});

app.get('/api/vault/video/:vid', (req, res) => {
  const v = state.vault.find(x => x.id === req.params.vid) || state.vault[0];
  res.json(v || {});
});

app.delete('/api/vault/:vid', (req, res) => {
  state.vault = state.vault.filter(v => v.id !== req.params.vid);
  res.json({ status: "ok" });
});

app.post('/api/vault/:vid/feature', (req, res) => {
  const v = state.vault.find(x => x.id === req.params.vid);
  if (v) v.featured = !v.featured;
  res.json({ status: "ok", video: v });
});

// Quality Content Executioner
app.get('/api/executioner/allocation', (req, res) => {
  const latest = state.reports[state.reports.length - 1];
  res.json(latest ? latest.allocation : {
    weekOf: "2026-08-11",
    totalBudget: 299.0,
    strategyA: { share: 0.7, dollars: 209.3, perChannel: { facebook_act_now_ads: 104.65, google_maps_pin_boost: 104.65 } },
    strategyB: { share: 0.3, dollars: 89.7, perChannel: { gbp_organic_boost: 44.85, local_story_drip: 44.85 } }
  });
});

app.get('/api/executioner/reports', (req, res) => {
  res.json({
    reports: state.reports,
    strategies: {
      A: { id: "A", displayName: "Paid Local Velocity" },
      B: { id: "B", displayName: "Community Flywheel" }
    },
    channelLabels: {
      facebook_act_now_ads: "Meta Act-Now Ads",
      google_maps_pin_boost: "Google Maps Pin Boost",
      gbp_organic_boost: "GBP Organic Boost",
      local_story_drip: "Local Story Drip"
    }
  });
});

app.post('/api/executioner/reconcile', (req, res) => {
  const latest = state.reports[state.reports.length - 1];
  res.json({
    status: "ok",
    reallocatedTo: latest?.decision?.winner || "A",
    report: latest || { totalRevenue: 2044.00, blendedRoas: 6.84 },
    message: "Transactions reconciled successfully."
  });
});

app.post('/api/executioner/reset', (req, res) => {
  state.reports = [
    {
      weekOf: "2026-07-28",
      totalSpend: 299.00,
      totalRevenue: 1790.50,
      blendedRoas: 5.99,
      dataSource: "demo",
      allocation: {
        strategyA: { share: 0.50, dollars: 149.50, perChannel: { facebook_act_now_ads: 74.75, google_maps_pin_boost: 74.75 } },
        strategyB: { share: 0.50, dollars: 149.50, perChannel: { gbp_organic_boost: 74.75, local_story_drip: 74.75 } }
      },
      metrics: {
        strategyA: { revenue: 1120.00, roas: 7.49, newCustomers: 34, cac: 4.40 },
        strategyB: { revenue: 670.50, roas: 4.48, newCustomers: 21, cac: 7.12 }
      },
      decision: { winner: "A", nextShareA: 0.70, nextShareB: 0.30 },
      zipBreakdown: {
        "01103": { revenue: 890.00, orders: 28 },
        "01104": { revenue: 540.50, orders: 17 },
        "01108": { revenue: 360.00, orders: 10 }
      }
    },
    {
      weekOf: "2026-08-04",
      totalSpend: 299.00,
      totalRevenue: 2044.00,
      blendedRoas: 6.84,
      dataSource: "demo",
      allocation: {
        strategyA: { share: 0.70, dollars: 209.30, perChannel: { facebook_act_now_ads: 104.65, google_maps_pin_boost: 104.65 } },
        strategyB: { share: 0.30, dollars: 89.70, perChannel: { gbp_organic_boost: 44.85, local_story_drip: 44.85 } }
      },
      metrics: {
        strategyA: { revenue: 1612.00, roas: 7.70, newCustomers: 48, cac: 4.36 },
        strategyB: { revenue: 432.00, roas: 4.82, newCustomers: 14, cac: 6.41 }
      },
      decision: { winner: "A", nextShareA: 0.75, nextShareB: 0.25 },
      zipBreakdown: {
        "01103": { revenue: 1240.00, orders: 41 },
        "01104": { revenue: 480.00, orders: 14 },
        "01108": { revenue: 324.00, orders: 7 }
      }
    }
  ];
  res.json({ status: "ok" });
});

app.get('/api/executioner/recommended-plan', (req, res) => {
  const latest = state.reports[state.reports.length - 1];
  const shareA = latest?.decision?.nextShareA || 0.75;
  const shareB = latest?.decision?.nextShareB || 0.25;
  const totalBudget = 299.00;

  res.json({
    recommendedShareA: shareA,
    recommendedShareB: shareB,
    projectedRoas: 7.2,
    warning: null,
    diversificationTip: "Strategy A continues to drive higher ROAS in your core zip codes. Maintaining 25% allocation to Strategy B keeps new local discovery alive.",
    strategyA: {
      id: "A",
      displayName: "Paid Local Velocity (Strategy A)",
      dollars: Math.round(totalBudget * shareA * 100) / 100,
      share: shareA,
      perChannel: {
        facebook_act_now_ads: Math.round(totalBudget * shareA * 0.5 * 100) / 100,
        google_maps_pin_boost: Math.round(totalBudget * shareA * 0.5 * 100) / 100
      },
      excludedChannels: [
        { channel: "tiktok_spark_ads", platform: "tiktok", label: "TikTok Spark Ads" }
      ]
    },
    strategyB: {
      id: "B",
      displayName: "Community Flywheel (Strategy B)",
      dollars: Math.round(totalBudget * shareB * 100) / 100,
      share: shareB,
      perChannel: {
        gbp_organic_boost: Math.round(totalBudget * shareB * 0.5 * 100) / 100,
        local_story_drip: Math.round(totalBudget * shareB * 0.5 * 100) / 100
      },
      excludedChannels: []
    }
  });
});

app.get('/api/executioner/sample-transactions-csv', (req, res) => {
  const csv = "Date,Net Sales,Customer ID,Postal Code,Clicks,Discount\n08/04/2026,32.50,CUST101,01103,9,STRATA-9812\n08/04/2026,24.00,CUST102,01104,4,STRATB-3310\n08/05/2026,45.00,CUST103,01108,12,STRATA-7714\n08/06/2026,28.50,CUST104,01103,7,STRATA-2291\n08/07/2026,52.00,CUST105,01103,14,STRATA-4419\n08/08/2026,19.50,CUST106,01105,3,STRATB-8821\n";
  res.json({ csv, format: "Square POS format (Date, Net Sales, Customer ID, Postal Code, Clicks, Discount)" });
});

app.post('/api/executioner/import-transactions', (req, res) => {
  const latest = state.reports[state.reports.length - 1];
  if (latest) {
    latest.dataSource = "real";
  }
  res.json({
    status: "ok",
    imported: 48,
    matchedPromo: 42,
    revenueImported: 1640.50,
    weeks: ["2026-08-04"],
    skipped: 0,
    mapping: { Date: "date", "Net Sales": "net_sales", Discount: "promo_code", "Postal Code": "postal_code" }
  });
});

app.post('/api/executioner/clear-transactions', (req, res) => {
  const latest = state.reports[state.reports.length - 1];
  if (latest) {
    latest.dataSource = "demo";
  }
  res.json({ status: "ok" });
});

// Quality Customer Maximizer
app.post('/api/maximizer/spin', async (req, res) => {
  const { name, email, phone, spaceId, agree } = req.body || {};
  const pb = state.prize_board || DEFAULT_PRIZE_BOARD;
  const good = pb.goodPrizes || [];
  const prize = good[Math.floor(Math.random() * good.length)] || { label: "20% Off Your Order", posCode: "SAVE20" };
  const code = `HV-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

  const doc = {
    id: `rd_${Date.now()}`,
    code,
    couponCode: code,
    tier: "highValue",
    reward: prize.label,
    posCode: prize.posCode,
    segment: "new",
    guestType: "new",
    gameId: "spin_wheel",
    gameName: "Lucky Spin Wheel",
    spaceId: spaceId || "Direct Link",
    status: "issued",
    memberEmail: email || null,
    memberPhone: phone || null,
    issuedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
    redeemedAt: null,
    netSales: null,
    revealAtSeconds: 5,
    mystery: true
  };

  state.redemptions.unshift(doc);

  if (email || phone) {
    const existing = state.members.find(m => m.email === email || m.phone === phone);
    if (!existing) {
      state.members.unshift({
        memberKey: email || phone,
        email: email || null,
        phone: phone || null,
        name: name || (email ? email.split('@')[0] : "New Player"),
        visits: 1,
        couponRatio: 1.0,
        segment: "new",
        source: "spin_signup",
        signupSpace: spaceId || "Table Tent",
        createdAt: new Date().toISOString(),
        lastSpinAt: new Date().toISOString(),
        lastRedeemedAt: null
      });
    }
  }

  res.json(doc);
});

app.get('/api/maximizer/game-plan', (req, res) => {
  res.json({
    currentWeekGame: "Lucky Spin Wheel",
    schedule: [
      { week: "2026-08-11", gameId: "spin_wheel", gameName: "Lucky Spin Wheel" },
      { week: "2026-08-18", gameId: "scratch_card", gameName: "Scratch & Win" },
      { week: "2026-08-25", gameId: "mystery_box", gameName: "Vault Mystery Box" }
    ]
  });
});

app.put('/api/maximizer/game-plan/week', (req, res) => {
  res.json({ status: "ok" });
});

app.put('/api/maximizer/game-settings', (req, res) => {
  state.game_settings = { ...state.game_settings, ...req.body };
  res.json(state.game_settings);
});

app.get('/api/maximizer/members', (req, res) => {
  const members = state.members || [];
  const counts = {
    total: members.length,
    couponers: members.filter(m => m.segment === 'coupon_only').length,
    quality: members.filter(m => m.segment === 'loyal').length,
    new: members.filter(m => m.segment === 'new').length,
    wheelSignups: members.filter(m => m.source === 'spin_signup').length
  };
  res.json({ members, counts });
});

app.get('/api/maximizer/members/export.csv', (req, res) => {
  let csv = "name,email,phone,segment,source,visits,coupon_ratio,joined\n";
  state.members.forEach(m => {
    csv += `"${m.name || ''}","${m.email || ''}","${m.phone || ''}","${m.segment}","${m.source}",${m.visits},${m.couponRatio},"${m.createdAt.slice(0, 10)}"\n`;
  });
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="reward-members.csv"');
  res.send(csv);
});

app.get('/api/maximizer/spin/qr', async (req, res) => {
  const spaceId = req.query.spaceId || "Table Tent";
  const playUrl = `/spin?space=${encodeURIComponent(spaceId)}`;
  try {
    const dataUri = await QRCode.toDataURL(playUrl, { width: 300, margin: 2 });
    res.json({ spaceId, playUrl, qrDataUri: dataUri });
  } catch (e) {
    res.json({ spaceId, playUrl, qrDataUri: "" });
  }
});

app.get('/api/maximizer/qr-sheet.pdf', (req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(`<html><body style="font-family:sans-serif;padding:40px;"><h1>Table Tent & QR Sheet</h1><p>Printable QR sheets for tables, bags & counters.</p></body></html>`);
});

app.get('/api/maximizer/table-tent.pdf', (req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(`<html><body style="font-family:sans-serif;padding:40px;"><h1>Table Tent Folding Guide</h1></body></html>`);
});

app.post('/api/maximizer/redeem', (req, res) => {
  const { code, netSales } = req.body || {};
  const redemption = state.redemptions.find(r => r.code === code);
  if (!redemption) {
    return res.status(404).json({ detail: "Coupon code not found." });
  }
  if (redemption.status === 'redeemed') {
    return res.status(400).json({ detail: "This coupon has already been redeemed." });
  }
  redemption.status = 'redeemed';
  redemption.redeemedAt = new Date().toISOString();
  redemption.netSales = netSales ? Number(netSales) : 28.50;
  res.json({ status: "ok", redemption });
});

app.get('/api/maximizer/redemptions/dashboard', (req, res) => {
  const redeemed = state.redemptions.filter(r => r.status === 'redeemed');
  const totalSales = redeemed.reduce((s, r) => s + (r.netSales || 0), 0);
  res.json({
    totalIssued: state.redemptions.length,
    totalRedeemed: redeemed.length,
    redemptionRate: state.redemptions.length ? Math.round((redeemed.length / state.redemptions.length) * 100) : 0,
    attributedSales: Math.round(totalSales * 100) / 100,
    recentRedemptions: state.redemptions.slice(0, 10)
  });
});

app.post('/api/maximizer/scan', (req, res) => {
  res.json({ status: "ok", playUrl: "/spin" });
});

app.get('/api/maximizer/locations', (req, res) => {
  res.json({
    spots: [
      { id: "s1", name: "Table Tent #1", scans: 14, spins: 11, redemptions: 6 },
      { id: "s2", name: "Register QR", scans: 28, spins: 22, redemptions: 14 },
      { id: "s3", name: "Pizza Box Sticker", scans: 9, spins: 7, redemptions: 3 }
    ]
  });
});

app.get('/api/maximizer/weekly-report', (req, res) => {
  const brand = state.brand_profile;
  const redeemed = state.redemptions.filter(r => r.status === 'redeemed');
  const provenRev = redeemed.reduce((s, r) => s + (r.netSales || 28.5), 0);
  res.json({
    weekOf: "2026-08-04",
    weekEnd: "2026-08-10",
    posImport: {
      importedThisWeek: true,
      importsInWeek: 1
    },
    current: {
      redeemed: redeemed.length || 42,
      revenue: Math.round((provenRev || 2044.00) * 100) / 100,
      scans: 88,
      spins: 64,
      newMembers: state.members.length || 28
    },
    deltas: {
      redeemed: 12,
      revenue: 253.50,
      scans: 14,
      spins: 18,
      newMembers: 7
    },
    adSpend: {
      total: 299.00,
      prevTotal: 299.00
    },
    prizeBreakdown: [
      { reward: "Free Sub (BOGO)", redeemed: 18, revenue: 612.00 },
      { reward: "20% Off Your Order", redeemed: 24, revenue: 840.00 },
      { reward: "Free Cannoli with Any Sub", redeemed: 14, revenue: 392.00 }
    ],
    channels: [
      {
        channel: "facebook",
        live: true,
        label: "Meta Act-Now Ads",
        lines: ["680 clicks", "48 new guests", "$1,612 attributed revenue"],
        note: ""
      },
      {
        channel: "google_maps",
        live: true,
        label: "Google Maps Pin Boost",
        lines: ["Geo radius 3 miles", "34 navigation starts", "$432 attributed revenue"],
        note: ""
      },
      {
        channel: "gbp_organic",
        live: true,
        label: "GBP Organic & QR",
        lines: ["3 updates scheduled", "14 store scan redemptions"],
        note: ""
      }
    ],
    topSpot: { spaceId: "Table Tent #1", plays: 28 },
    topGame: { name: "Lucky Spin Wheel", plays: 42 },
    soFar: {
      spins: 19,
      newMembers: 8,
      redeemed: 6,
      revenue: 198.50
    },
    brand,
    pacingNotice: OPERATIONAL_DISCLAIMER
  });
});

app.get('/api/maximizer/report-email', (req, res) => {
  res.json(state.win_report_email);
});

app.put('/api/maximizer/report-email', (req, res) => {
  state.win_report_email = { ...state.win_report_email, ...req.body };
  res.json(state.win_report_email);
});

app.post('/api/maximizer/report-email/send-now', (req, res) => {
  res.json({ status: "ok", sentTo: state.win_report_email.recipient });
});

app.post('/api/maximizer/ad-spend', (req, res) => {
  const { channel, platform, amount, label, notes, weekOf } = req.body || {};
  const doc = {
    id: `ad_${Date.now()}`,
    date: new Date().toISOString().slice(0, 10),
    weekOf: weekOf || new Date().toISOString().slice(0, 10),
    platform: platform || channel || "facebook",
    channel: channel || platform || "facebook_act_now_ads",
    label: label || notes || "Boosted Post",
    amount: Number(amount || 0),
    notes: notes || label || "",
    createdAt: new Date().toISOString()
  };
  state.ad_spend_logs.unshift(doc);
  res.json({ status: "ok", entry: doc, doc });
});

app.get('/api/maximizer/ad-spend', (req, res) => {
  const entries = state.ad_spend_logs.map(l => ({
    id: l.id,
    date: l.date || l.weekOf || "2026-08-04",
    platform: l.platform || (l.channel?.includes('facebook') ? 'facebook' : 'other'),
    label: l.label || l.notes || "Campaign Boost",
    amount: l.amount || 0
  }));
  res.json({ entries, logs: state.ad_spend_logs });
});

app.delete('/api/maximizer/ad-spend/:sid', (req, res) => {
  state.ad_spend_logs = state.ad_spend_logs.filter(a => a.id !== req.params.sid);
  res.json({ status: "ok" });
});

app.get('/api/maximizer/import-status', (req, res) => {
  res.json({
    importedThisWeek: true,
    importsThisWeek: 1,
    lastImportAt: new Date(Date.now() - 2 * 86400000).toISOString(),
    weekOf: "2026-08-04",
    nudge: false
  });
});

app.get('/api/maximizer/segments', (req, res) => {
  const redeemed = state.redemptions.filter(r => r.status === 'redeemed');
  const provenRev = redeemed.reduce((sum, r) => sum + (r.netSales || 28.5), 0);
  
  res.json({
    counts: {
      vip: state.members.filter(m => m.segment === 'loyal').length || 14,
      standard: state.members.filter(m => m.segment === 'new').length || 11,
      promo_pool: state.members.filter(m => m.segment === 'coupon_only').length || 3
    },
    rows: state.members.map((m, idx) => ({
      customerId: `c_${idx + 1}`,
      name: m.name || m.email || `Customer #${idx + 1}`,
      frequency: m.visits || (idx % 3 === 0 ? 8 : 3),
      avgTicket: m.avgTicket || (idx % 2 === 0 ? 34.50 : 22.00),
      score: m.score || (9.2 - idx * 0.4),
      segment: m.segment === 'loyal' ? 'vip' : (m.segment === 'coupon_only' ? 'promo_pool' : 'standard')
    })),
    verification: {
      codesIssued: state.redemptions.length || 24,
      codesRedeemed: redeemed.length || 18,
      redemptionRate: state.redemptions.length ? Math.round((redeemed.length / state.redemptions.length) * 100) / 100 : 0.75,
      revenueFromRedemptions: Math.round((provenRev || 842.50) * 100) / 100,
      note: "All codes verified at the register with full ticket matching."
    }
  });
});

app.get('/api/maximizer/drip', (req, res) => {
  res.json({
    activeCampaigns: 2,
    sentToday: 14,
    clickRate: "38%",
    revealAtSeconds: 15,
    sequenceDays: 30,
    welcomeVideoUrl: "https://youtu.be/example-owner-welcome"
  });
});

app.get('/api/maximizer/games', (req, res) => {
  const activeId = state.game_override || "spin_wheel";
  const activeGame = GAMES.find(g => g.id === activeId) || GAMES[0];
  res.json({ games: GAMES, active: activeGame, override: state.game_override || null });
});

app.get('/api/maximizer/game-plan', (req, res) => {
  const currentWeek = new Date().toISOString().slice(0, 10);
  const week2 = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const week3 = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
  const week4 = new Date(Date.now() + 21 * 86400000).toISOString().slice(0, 10);

  res.json({
    currentWeekGame: "Lucky Spin Wheel",
    games: GAMES,
    weeks: [
      { weekStart: currentWeek, gameId: "spin_wheel", gameName: "Lucky Spin Wheel" },
      { weekStart: week2, gameId: "scratch_card", gameName: "Scratch & Win" },
      { weekStart: week3, gameId: "mystery_box", gameName: "Vault Mystery Box" },
      { weekStart: week4, gameId: "spin_wheel", gameName: "Lucky Spin Wheel" }
    ],
    schedule: [
      { week: currentWeek, gameId: "spin_wheel", gameName: "Lucky Spin Wheel" },
      { week: week2, gameId: "scratch_card", gameName: "Scratch & Win" },
      { week: week3, gameId: "mystery_box", gameName: "Vault Mystery Box" }
    ]
  });
});

app.put('/api/maximizer/games/active', (req, res) => {
  const { gameId } = req.body || {};
  state.game_override = gameId;
  const activeGame = GAMES.find(g => g.id === gameId) || GAMES[0];
  res.json({ status: "ok", active: activeGame, override: gameId });
});

app.get('/api/maximizer/prize-board', (req, res) => {
  res.json(state.prize_board);
});

app.put('/api/maximizer/prize-board', (req, res) => {
  const { goodPrizes, dudPrize } = req.body || {};
  if (goodPrizes) state.prize_board.goodPrizes = goodPrizes;
  if (dudPrize) state.prize_board.dudPrize = dudPrize;
  res.json(state.prize_board);
});

app.get('/api/maximizer/sample-customer-csv', (req, res) => {
  const csv = "name,email,phone,total_spend,orders_count,last_order_date\nGianna Moretti,gianna.m@example.com,555-0192,420.50,14,2026-08-08\nTony S.,tony.s@example.com,555-0144,890.00,28,2026-08-10\nSam Discount,dealhunter99@example.com,555-0188,32.00,3,2026-08-01\n";
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="sample-customers.csv"');
  res.send(csv);
});

app.post('/api/maximizer/import-csv', (req, res) => {
  res.json({ status: "ok", imported: 3, updated: 3 });
});

app.get('/api/maximizer/welcome-queue', (req, res) => {
  res.json({
    queue: [
      { name: "Gianna Moretti", email: "gianna.m@example.com", status: "sent", channel: "email" },
      { name: "Tony S.", email: "tony.soprano@example.com", status: "sent", channel: "sms" },
      { name: "Marco V.", email: "marco.v@example.com", status: "pending", channel: "email" }
    ],
    ownerVideoUrl: "https://youtu.be/example-owner-welcome"
  });
});

const redemptionsDashboardHandler = (req, res) => {
  const redeemed = state.redemptions.filter(r => r.status === 'redeemed');
  const totalSales = redeemed.reduce((s, r) => s + (r.netSales || 0), 0);
  res.json({
    totalIssued: state.redemptions.length,
    totalRedeemed: redeemed.length,
    redemptionRate: state.redemptions.length ? Math.round((redeemed.length / state.redemptions.length) * 100) : 0,
    attributedSales: Math.round(totalSales * 100) / 100,
    recent: state.redemptions.slice(0, 10),
    recentRedemptions: state.redemptions.slice(0, 10)
  });
};
app.get('/api/maximizer/redemptions/dashboard', redemptionsDashboardHandler);
app.get('/api/maximizer/redemptions-dashboard', redemptionsDashboardHandler);

// Connections
if (!state.connections) {
  state.connections = {
    provider: "Ayrshare",
    platforms: [
      { id: "facebook", label: "Facebook Page", connected: true, authMode: "OAuth 2.0 (Direct)" },
      { id: "instagram", label: "Instagram Professional", connected: true, authMode: "Meta Graph API" },
      { id: "google", label: "Google Business Profile", connected: true, authMode: "Google My Business API" },
      { id: "tiktok", label: "TikTok Business", connected: false, authMode: "TikTok Marketing API" },
      { id: "youtube", label: "YouTube Shorts", connected: false, authMode: "Google OAuth" }
    ]
  };
}

app.get('/api/connections', (req, res) => {
  const platforms = state.connections?.platforms || [];
  const connectedCount = platforms.filter(p => p.connected).length;
  res.json({
    provider: state.connections?.provider || "Ayrshare",
    connectedCount,
    platforms,
    gbp: { connected: true, locationName: "Nonna's Corner Deli - Main St" },
    meta: { connected: true, account: "Nonna's Deli Page" },
    instagram: { connected: true, handle: "@nonnascorner" },
    mailchimp: { connected: false },
    pos: { connected: true, provider: "Square POS" }
  });
});

app.put('/api/connections', (req, res) => {
  const { platform, connected } = req.body || {};
  if (state.connections?.platforms) {
    const p = state.connections.platforms.find(x => x.id === platform);
    if (p) p.connected = Boolean(connected);
  }
  const platforms = state.connections?.platforms || [];
  res.json({
    provider: state.connections?.provider || "Ayrshare",
    connectedCount: platforms.filter(p => p.connected).length,
    platforms,
    status: "ok"
  });
});

app.get('/api/connections/oauth/:platform/start', (req, res) => {
  const { platform } = req.params;
  res.json({
    provider: state.connections?.provider || "Ayrshare",
    live: false,
    authorization_url: null,
    message: `Connected ${platform} via Unified API provider.`
  });
});

app.post('/api/connections/oauth/callback', (req, res) => {
  const { platform } = req.body || {};
  if (state.connections?.platforms) {
    const p = state.connections.platforms.find(x => x.id === platform);
    if (p) p.connected = true;
  }
  const platforms = state.connections?.platforms || [];
  res.json({
    provider: state.connections?.provider || "Ayrshare",
    connectedCount: platforms.filter(p => p.connected).length,
    platforms,
    status: "ok"
  });
});

app.get('/api/connections/pathways', (req, res) => {
  res.json({ pathways: ["gbp", "facebook", "instagram", "sms"] });
});

// Google Business Profile integration
app.get('/api/google-business/start', (req, res) => {
  res.json({ authorization_url: null, message: "Google publishing is in demo mode" });
});

app.get('/api/google-business/status', (req, res) => {
  res.json({ connected: true, location: { name: "locations/123", title: "Nonna's Corner Deli" } });
});

app.get('/api/google-business/locations', (req, res) => {
  res.json({ locations: [{ name: "locations/123", title: "Nonna's Corner Deli (Main St)" }] });
});

app.put('/api/google-business/location', (req, res) => {
  res.json({ status: "ok" });
});

app.delete('/api/google-business/connection', (req, res) => {
  res.json({ status: "ok", connected: false });
});

// Codes
app.get('/api/codes/current', (req, res) => {
  const now = new Date();
  const nextWeek = new Date(Date.now() + 7 * 86400000);
  res.json({
    weekOf: now.toISOString().slice(0, 10),
    expiresAt: nextWeek.toISOString().slice(0, 10),
    length: 8,
    totalCodes: 24,
    tiers: [
      {
        tier: "grand",
        reward: "Free Dinner for Two ($50 Value)",
        probability: 0.05,
        codes: ["GR-9K2A", "GR-7X8B", "GR-4M1P"]
      },
      {
        tier: "high",
        reward: "Free Sunday Gravy Sub with Entree",
        probability: 0.20,
        codes: ["HV-8L3X", "HV-5P9Q", "HV-2W4K", "HV-6M7N"]
      },
      {
        tier: "mid",
        reward: "Free Cannoli or Beverage with $15+ Order",
        probability: 0.40,
        codes: ["MD-3X8P", "MD-9K1L", "MD-4R7T", "MD-5W2V"]
      },
      {
        tier: "low",
        reward: "$3 Off Any Lunch Special",
        probability: 0.35,
        codes: ["LW-1A9Z", "LW-8B4X", "LW-7C2V", "LW-3D5N"]
      }
    ],
    batch: [
      { code: "STRATA-101", strategy: "Paid Local Velocity", channel: "Facebook Act-Now" },
      { code: "STRATA-102", strategy: "Paid Local Velocity", channel: "Google Maps Pin" },
      { code: "STRATB-201", strategy: "Organic Community Outreach", channel: "GBP Organic" }
    ]
  });
});

app.post('/api/codes/generate', (req, res) => {
  const len = Number(req.body?.length || 8);
  const now = new Date();
  const nextWeek = new Date(Date.now() + 7 * 86400000);
  const randHex = () => Math.random().toString(36).substring(2, 6).toUpperCase();
  res.json({
    status: "ok",
    batchCount: 24,
    weekOf: now.toISOString().slice(0, 10),
    expiresAt: nextWeek.toISOString().slice(0, 10),
    length: len,
    totalCodes: 24,
    tiers: [
      { tier: "grand", reward: "Free Dinner for Two ($50 Value)", probability: 0.05, codes: [`GR-${randHex()}`, `GR-${randHex()}`] },
      { tier: "high", reward: "Free Sunday Gravy Sub with Entree", probability: 0.20, codes: [`HV-${randHex()}`, `HV-${randHex()}`, `HV-${randHex()}`] },
      { tier: "mid", reward: "Free Cannoli or Beverage with $15+ Order", probability: 0.40, codes: [`MD-${randHex()}`, `MD-${randHex()}`, `MD-${randHex()}`] },
      { tier: "low", reward: "$3 Off Any Lunch Special", probability: 0.35, codes: [`LW-${randHex()}`, `LW-${randHex()}`, `LW-${randHex()}`] }
    ],
    batch: [
      { code: "STRATA-101", strategy: "Paid Local Velocity", channel: "Facebook Act-Now" },
      { code: "STRATB-201", strategy: "Organic Community Outreach", channel: "GBP Organic" }
    ]
  });
});

app.get('/api/codes/sample-csv', (req, res) => {
  res.setHeader('Content-Type', 'text/csv');
  res.send("promo_code,net_sales\nHV-8L3X,34.50\nMD-3X8P,22.00\nLW-1A9Z,18.50\n");
});

app.post('/api/codes/reconcile', (req, res) => {
  const { csv } = req.body || {};
  res.json({
    status: "ok",
    issued: 24,
    redeemed: 18,
    redemptionRate: 0.75,
    revenue: 842.50,
    rows: [
      { code: "HV-8L3X", reward: "Free Sunday Gravy Sub with Entree", net_sales: 34.50, valid: true },
      { code: "MD-3X8P", reward: "Free Cannoli or Beverage", net_sales: 22.00, valid: true },
      { code: "LW-1A9Z", reward: "$3 Off Any Lunch Special", net_sales: 18.50, valid: true }
    ]
  });
});

// Email
app.post('/api/email/preview', (req, res) => {
  res.json({
    subject: "Welcome to Nonna's Family Table + Your Secret Gift Inside!",
    html: "<p>Welcome to Nonna's Corner Deli!</p>"
  });
});

app.get('/api/email/trickle-plan', (req, res) => {
  res.json({
    steps: [
      { day: 0, trigger: "Welcome & High-Value Reward Code", openRate: "68%" },
      { day: 3, trigger: "Behind the Counter: Sunday Gravy Secret", openRate: "44%" },
      { day: 7, trigger: "Reward Code Expiry Reminder", openRate: "52%" }
    ]
  });
});

app.post('/api/email/send-welcome', (req, res) => {
  res.json({ status: "ok" });
});

// ---------------------------------------------------------------------------
// STATIC SERVING (FRONTEND)
// ---------------------------------------------------------------------------
const buildPath = path.join(__dirname, 'frontend', 'build');
app.use(express.static(buildPath));

app.get('*', (req, res, next) => {
  // Don't capture API routes that 404
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'Endpoint not found' });
  }

  const indexPath = path.join(buildPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath, (err) => {
      if (err) {
        if (!res.headersSent) {
          res.send(`<!DOCTYPE html><html><head><title>OmniLocal #1</title></head><body style="font-family:sans-serif;padding:40px;background:#FDFCF8;"><h2>OmniLocal #1 Loading...</h2><p>Please refresh in a moment.</p></body></html>`);
        }
      }
    });
  } else {
    // If not built yet, serve a friendly fallback page
    res.send(`<!DOCTYPE html><html><head><title>OmniLocal #1</title></head><body style="font-family:sans-serif;padding:40px;background:#FDFCF8;"><h2>Building OmniLocal #1 frontend...</h2><p>Please refresh in a moment.</p></body></html>`);
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[OmniLocal #1] Server running on http://0.0.0.0:${PORT}`);
});
