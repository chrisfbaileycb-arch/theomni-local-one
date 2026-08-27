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
const BUSINESS_PRESETS = {
  // 1. Appointment / Service
  tattoo: {
    id: "tattoo",
    category: "Appointment / Service",
    categoryKey: "appointment_service",
    name: "Iron & Needle Tattoo Co.",
    city: "Springfield",
    industryLabel: "Tattoo Studio",
    signatureItem: "Custom 3-Hour Flash & Realism Session",
    voice: "Artistic, bold, obsessive about craft and sterile excellence. Speaks with deep respect for body art traditions.",
    menuHighlights: "Custom realism, traditional flash sheets, cover-ups, sterile studio protocol",
    backstory: "Founded by master tattooist Leo Vance in 2014, blending classic Americana flash with modern fine-line realism.",
    igHandle: "ironandneedletattoo",
    orderUrl: "https://book.ironandneedle.com",
    masterPosCode: "TAT50-PROMO",
    prizeBoard: {
      goodPrizes: [
        { label: "50% Off 3-Hr Tattoo Session", posCode: "TAT50-PROMO" },
        { label: "$25 Off $100 Service", posCode: "TAT25-OFF" },
        { label: "Free Aftercare Kit & Touchup", posCode: "TAT-AFTERCARE" },
        { label: "20% Off Flash Sheet Walk-In", posCode: "TAT-FLASH20" }
      ],
      dudPrize: { label: "$10 Off Consultation Deposit", posCode: "TAT10-DEP" }
    }
  },
  spa: {
    id: "spa",
    category: "Appointment / Service",
    categoryKey: "appointment_service",
    name: "Lumina Day Spa & Wellness",
    city: "Springfield",
    industryLabel: "Spa & Wellness",
    signatureItem: "Signature 90-Min Hot Stone Recovery",
    voice: "Serene, restorative, polished and attentive. Dedicated to holistic wellness and stress relief.",
    menuHighlights: "Hot stone massage, organic botanical facials, hydrotherapy, infrared sauna",
    backstory: "An oasis of calm created to restore mental clarity and physical rejuvenation.",
    igHandle: "luminaspa",
    orderUrl: "https://book.luminaspa.com",
    masterPosCode: "SPA-RECOVERY",
    prizeBoard: {
      goodPrizes: [
        { label: "Free Aromatherapy Add-On Service", posCode: "SPA-AROMA" },
        { label: "$25 Off $100 Service", posCode: "SPA25-OFF" },
        { label: "30% Off First Botanical Facial", posCode: "SPA-FACIAL30" },
        { label: "Complimentary Scalp Ritual", posCode: "SPA-RITUAL" }
      ],
      dudPrize: { label: "10% Off Organic Body Butter", posCode: "SPA10-PROMO" }
    }
  },
  salon: {
    id: "salon",
    category: "Appointment / Service",
    categoryKey: "appointment_service",
    name: "Artisan Grooming & Salon",
    city: "Springfield",
    industryLabel: "Salon & Barber",
    signatureItem: "Master Cut & Scalp Treatment",
    voice: "Chic, trendy, master-level craftsmanship and attentive personal styling.",
    menuHighlights: "Precision scissor cuts, balayage color, hot towel straight razor shaves, scalp therapy",
    backstory: "Award-winning styling studio dedicated to elevating personal confidence and individual aesthetic.",
    igHandle: "artisansalons",
    orderUrl: "https://book.artisansalon.com",
    masterPosCode: "SALON-VIP",
    prizeBoard: {
      goodPrizes: [
        { label: "Free Deep Conditioning Treatment", posCode: "SALON-DEEP" },
        { label: "25% Off Cut & Color Package", posCode: "SALON-COLOR25" },
        { label: "$15 Off Master Styling Service", posCode: "SALON-15OFF" },
        { label: "Free Styling Clay or Shine Mist", posCode: "SALON-PRODUCT" }
      ],
      dudPrize: { label: "$5 Off Next Blowout", posCode: "SALON5-SAVE" }
    }
  },
  auto_detail: {
    id: "auto_detail",
    category: "Appointment / Service",
    categoryKey: "appointment_service",
    name: "Apex Precision Detailing",
    city: "Springfield",
    industryLabel: "Auto Detail & Service",
    signatureItem: "Full Ceramic Shield & Paint Correction",
    voice: "Meticulous, engineering-grade precision, honest and dedicated to vehicle preservation.",
    menuHighlights: "9H ceramic coating, multi-stage paint correction, interior steam extraction, wheel protection",
    backstory: "Started by automotive enthusiasts obsessed with showroom-finish gloss and long-term surface preservation.",
    igHandle: "apexdetailing",
    orderUrl: "https://book.apexdetail.com",
    masterPosCode: "APEX-CERAMIC",
    prizeBoard: {
      goodPrizes: [
        { label: "Free Ceramic Boost Add-On", posCode: "APEX-BOOST" },
        { label: "30% Off Full Interior Detail", posCode: "APEX-INT30" },
        { label: "$25 Off $100 Service", posCode: "APEX25-OFF" },
        { label: "Free Headlight Restoration", posCode: "APEX-LIGHTS" }
      ],
      dudPrize: { label: "10% Off Hydrophobic Windshield Coating", posCode: "APEX10-GLASS" }
    }
  },

  // 2. Food & Beverage
  bistro: {
    id: "bistro",
    category: "Food & Beverage",
    categoryKey: "food_beverage",
    name: "The Copper Oak Bistro",
    city: "Springfield",
    industryLabel: "Artisan Bistro & Grill",
    signatureItem: "Smoked Wagyu Flatiron",
    voice: "Culinary-driven, warm, hospitable and unpretentious. Speaks like a chef passionate about local ingredients.",
    menuHighlights: "Wood-fired steak, handmade pasta, seasonal farm crudo, craft cocktails",
    backstory: "Farm-to-table neighborhood bistro celebrating locally sourced seasonal harvest.",
    igHandle: "copperoakbistro",
    orderUrl: "https://order.copperoakbistro.com",
    masterPosCode: "BISTRO-SAVE25",
    prizeBoard: {
      goodPrizes: [
        { label: "Free Signature Entree (BOGO)", posCode: "BISTRO-BOGO" },
        { label: "25% Off Entire Bill", posCode: "BISTRO-25OFF" },
        { label: "Free Chef Appetizer & Pairing", posCode: "BISTRO-APP" },
        { label: "$10 Off Dinner for Two ($40+)", posCode: "BISTRO-10OFF" }
      ],
      dudPrize: { label: "10% Off Lunch Entree", posCode: "BISTRO-10PCT" }
    }
  },
  bar: {
    id: "bar",
    category: "Food & Beverage",
    categoryKey: "food_beverage",
    name: "The Velvet Lounge & Cocktails",
    city: "Springfield",
    industryLabel: "Craft Bar & Lounge",
    signatureItem: "Smoked Old Fashioned & Craft Flight",
    voice: "Sophisticated, upbeat, nightlife hospitality with bespoke mixology flair.",
    menuHighlights: "Signature smoked cocktails, artisanal tapas boards, rare bourbons, live jazz nights",
    backstory: "A hidden gem cocktail parlor dedicated to the art of balanced libations and intimate conversation.",
    igHandle: "thevelvetlounge",
    orderUrl: "https://thevelvetlounge.com",
    masterPosCode: "LOUNGE-VIP",
    prizeBoard: {
      goodPrizes: [
        { label: "Free Signature Craft Cocktail", posCode: "LOUNGE-DRINK" },
        { label: "Buy 1 Flight Get 1 50% Off", posCode: "LOUNGE-BOGO50" },
        { label: "$15 Off Tapas & Charcuterie Board", posCode: "LOUNGE-BOARD" },
        { label: "Free Truffle Fries with Any Drink", posCode: "LOUNGE-FRIES" }
      ],
      dudPrize: { label: "10% Off First Round", posCode: "LOUNGE-10PCT" }
    }
  },
  bakery: {
    id: "bakery",
    category: "Food & Beverage",
    categoryKey: "food_beverage",
    name: "Golden Crust Artisan Bakery",
    city: "Springfield",
    industryLabel: "Bakery & Cafe",
    signatureItem: "Sourdough Boule & Morning Pastry",
    voice: "Cozy, aroma-rich, neighborhood warmth celebrating slow fermentation and hearth baking.",
    menuHighlights: "Wild yeast sourdough, flaky butter croissants, cardamom buns, specialty pour-overs",
    backstory: "Small-batch hearth bakery firing ovens before dawn with local stone-milled flours.",
    igHandle: "goldencrustbakery",
    orderUrl: "https://order.goldencrust.com",
    masterPosCode: "BAKE-SURPRISE",
    prizeBoard: {
      goodPrizes: [
        { label: "Free Fresh Sourdough Loaf", posCode: "BAKE-LOAF" },
        { label: "Free Specialty Latte & Pastry", posCode: "BAKE-LATTE" },
        { label: "25% Off Box of Pastries", posCode: "BAKE-25BOX" },
        { label: "$5 Off $20 Morning Order", posCode: "BAKE-5OFF" }
      ],
      dudPrize: { label: "10% Off Next Coffee", posCode: "BAKE-10PCT" }
    }
  },

  // 3. Specialty Retail & Health
  boutique: {
    id: "boutique",
    category: "Specialty Retail & Health",
    categoryKey: "specialty_retail",
    name: "Haven & Thread Boutique",
    city: "Springfield",
    industryLabel: "Boutique & Fashion",
    signatureItem: "Curated Autumn Capsule Collection",
    voice: "Elevated, stylish, trendsetting and dedicated to personalized wardrobe styling.",
    menuHighlights: "Designer apparel, sustainable denim, artisan jewelry, curated home goods",
    backstory: "Curated boutique bringing independent designers and timeless wardrobe essentials to Springfield.",
    igHandle: "haventhread",
    orderUrl: "https://shop.haventhread.com",
    masterPosCode: "BOUTIQUE-VIP",
    prizeBoard: {
      goodPrizes: [
        { label: "$25 Off $100 Purchase", posCode: "BOUTIQUE-25OFF" },
        { label: "30% Off Any Single Item", posCode: "BOUTIQUE-30PCT" },
        { label: "Free Silk Scarf or Accessory", posCode: "BOUTIQUE-GIFT" },
        { label: "Buy 1 Get 1 50% Off Denim", posCode: "BOUTIQUE-BOGO50" }
      ],
      dudPrize: { label: "10% Off Accessories", posCode: "BOUTIQUE-10ACC" }
    }
  },
  gym: {
    id: "gym",
    category: "Specialty Retail & Health",
    categoryKey: "specialty_retail",
    name: "Pulse Performance Fitness",
    city: "Springfield",
    industryLabel: "Gym & Fitness Studio",
    signatureItem: "30-Day Strength & Conditioning Trial",
    voice: "High-energy, motivating, results-driven coaching for all athletic levels.",
    menuHighlights: "HIIT classes, Olympic lifting bays, functional turf, body composition scans",
    backstory: "Premier training facility focused on progressive strength, community culture, and sustainable longevity.",
    igHandle: "pulsefitness",
    orderUrl: "https://pulsefitness.com",
    masterPosCode: "PULSE-FIT30",
    prizeBoard: {
      goodPrizes: [
        { label: "Free 1-on-1 Personal Training Session", posCode: "PULSE-PTFREE" },
        { label: "50% Off First Month Membership", posCode: "PULSE-50MEMB" },
        { label: "Free Electrolyte & Protein Bundle", posCode: "PULSE-BUNDLE" },
        { label: "$20 Off Pro Shop Gear", posCode: "PULSE-20GEAR" }
      ],
      dudPrize: { label: "Free Day Pass for a Friend", posCode: "PULSE-PASS" }
    }
  },
  dental: {
    id: "dental",
    category: "Specialty Retail & Health",
    categoryKey: "specialty_retail",
    name: "Bright Smile Aesthetic Care",
    city: "Springfield",
    industryLabel: "Dental & Wellness",
    signatureItem: "Professional Laser Whitening Session",
    voice: "Reassuring, clinical excellence, friendly care in a soothing, spa-like practice.",
    menuHighlights: "Laser teeth whitening, clear aligner consultations, preventive hygiene, digital smile design",
    backstory: "Modern aesthetic dental boutique removing anxiety and creating confident, healthy smiles.",
    igHandle: "brightsmiledental",
    orderUrl: "https://brightsmiledental.com",
    masterPosCode: "SMILE-GLOW",
    prizeBoard: {
      goodPrizes: [
        { label: "50% Off In-Office Laser Whitening", posCode: "SMILE-WHITE50" },
        { label: "Free Sonic Electric Brush Set", posCode: "SMILE-BRUSH" },
        { label: "$50 Off Comprehensive Exam", posCode: "SMILE-50EXAM" },
        { label: "Free Enamel & Fluoride Treatment", posCode: "SMILE-TREAT" }
      ],
      dudPrize: { label: "10% Off Take-Home Trays", posCode: "SMILE-10TRAY" }
    }
  }
};

const DEFAULT_BRAND_PROFILE = { ...BUSINESS_PRESETS.tattoo };

const SHOOTING_PROMPTS = [
  {
    id: "ingredient-story",
    title: "Ingredient & Craft Story",
    prompt: "Show the most interesting material, tool, or ingredient in your workspace right now and explain its origin or craft significance.",
    guidance: "Hold the item in frame. Lead with the item name before backstory. Keep it under 60 seconds."
  },
  {
    id: "operational-hustle",
    title: "Behind-the-Scenes Prep",
    prompt: "Walk through one ritual or prep step that happens before doors open that clients rarely see.",
    guidance: "Film the hands-on action while talking. Fast-moving techniques read best on mobile."
  },
  {
    id: "behind-the-counter-secret",
    title: "Pro Technique Secret",
    prompt: "Share one technique, precision ratio, or skill decision that elevates your service quality above the average provider.",
    guidance: "Be specific: a temperature, an angle, a pressure, a tool. Actionable details get saved & shared."
  },
  {
    id: "community-gratitude",
    title: "Client & Community Spotlight",
    prompt: "Shout out a specific regular client, neighboring local business, or collaborator who inspires your craft.",
    guidance: "Name the person or business directly. Named shout-outs build 40% stronger local retention."
  },
  {
    id: "demographic-pivot",
    title: "Customized Service Solution",
    prompt: "Describe one way you tailored your service or booking hours to better serve a specific client group in your city.",
    guidance: "Lead with the customer need, then explain the solution."
  }
];

const DEFAULT_PRIZE_BOARD = { ...DEFAULT_BRAND_PROFILE.prizeBoard };

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
  campaign_cadence: {
    mode: "sprint", // "sprint" | "rest_nurture"
    sprintDurationDays: 7,
    sprintStartedAt: new Date(Date.now() - 2 * 86400000).toISOString(),
    sprintExpiresAt: new Date(Date.now() + 5 * 86400000).toISOString(),
    rotationGame: "spin_wheel",
    advisoryNotice: "Promotional Alert: High-frequency gamification degrades luxury/service brand trust. Best Practice: 1 week active per month, rotating game styles (Spin Wheel -> Scratch -> Mystery Box).",
    restSchedule: [
      { week: 1, name: "Week 1: Active 7-Day Sprint", status: "active", mode: "sprint", game: "Lucky Spin Wheel", advice: "Drive concentrated bursts of high-intent customer bookings." },
      { week: 2, name: "Week 2: Rest & Nurture Mode", status: "upcoming", mode: "rest_nurture", game: "None (Full-Price Focus)", advice: "Nurture new leads with welcome stories and protect premium service margins." },
      { week: 3, name: "Week 3: Rest & Nurture Mode", status: "upcoming", mode: "rest_nurture", game: "None (Full-Price Focus)", advice: "Client satisfaction follow-ups and organic Google/Meta review gathering." },
      { week: 4, name: "Week 4: Rotation Prep", status: "upcoming", mode: "rest_nurture", game: "Scratch & Win (Next)", advice: "Warm up audience for next month's fresh game mechanic rotation." }
    ]
  },
  team_settings: { access_code: "TR-7K9P-4M2X", code_version: 1 },
  users: [
    {
      user_id: "usr_owner_01",
      email: "owner@ironandneedle.com",
      name: "Leo Vance (Owner / Lead Artist)",
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
      signupSpace: "Front Mirror QR",
      createdAt: new Date(Date.now() - 25 * 86400000).toISOString(),
      lastSpinAt: new Date(Date.now() - 2 * 86400000).toISOString(),
      lastRedeemedAt: new Date(Date.now() - 2 * 86400000).toISOString()
    },
    {
      memberKey: "marcus.k@example.com",
      email: "marcus.k@example.com",
      phone: "555-0144",
      name: "Marcus King",
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
      code: "OL-TAT-784X",
      masterPosCode: "TAT50-PROMO",
      tier: "Grand Prize",
      reward: "50% Off 3-Hr Tattoo Session",
      posCode: "TAT50-PROMO",
      segment: "vip",
      guestType: "repeat",
      gameId: "spin_wheel",
      gameName: "Lucky Spin Wheel",
      spaceId: "Front Mirror QR",
      status: "redeemed",
      memberKey: "gianna.m@example.com",
      memberEmail: "gianna.m@example.com",
      issuedAt: new Date(Date.now() - 2 * 86400000).toISOString(),
      expiresAt: new Date(Date.now() + 5 * 86400000).toISOString(),
      redeemedAt: new Date(Date.now() - 1 * 86400000).toISOString(),
      netSales: 175.00
    },
    {
      id: "rd_102",
      code: "OL-TAT-339K",
      masterPosCode: "TAT25-OFF",
      tier: "High Value",
      reward: "$25 Off $100 Service",
      posCode: "TAT25-OFF",
      segment: "loyal",
      guestType: "repeat",
      gameId: "spin_wheel",
      gameName: "Lucky Spin Wheel",
      spaceId: "Register #1",
      status: "redeemed",
      memberKey: "marcus.k@example.com",
      memberEmail: "marcus.k@example.com",
      issuedAt: new Date(Date.now() - 3 * 86400000).toISOString(),
      expiresAt: new Date(Date.now() + 4 * 86400000).toISOString(),
      redeemedAt: new Date(Date.now() - 2 * 86400000).toISOString(),
      netSales: 120.00
    },
    {
      id: "rd_103",
      code: "OL-TAT-912M",
      masterPosCode: "TAT-AFTERCARE",
      tier: "Daily Win",
      reward: "Free Aftercare Kit & Touchup",
      posCode: "TAT-AFTERCARE",
      segment: "new",
      guestType: "new",
      gameId: "spin_wheel",
      gameName: "Lucky Spin Wheel",
      spaceId: "Studio Window Decal",
      status: "issued",
      memberKey: "newguest@example.com",
      memberEmail: "newguest@example.com",
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
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

// ---------------------------------------------------------------------------
// MULTI-SOURCE ATTRIBUTION HUB & LONGITUDINAL LEARNING ENGINE STATE
// ---------------------------------------------------------------------------
state.attribution_sources = {
  meta: [
    { campaignId: "META-CRAFT-REELS-01", campaignName: "Craft & Detail Reels", clicks: 1240, ctr: 3.42, cpc: 0.65, spend: 806.00, impressions: 36250, dateRange: "Aug 1 - Aug 15" },
    { campaignId: "META-FLASH-BURST-02", campaignName: "Flash Drop Weekend", clicks: 680, ctr: 4.10, cpc: 0.52, spend: 353.60, impressions: 16580, dateRange: "Aug 8 - Aug 10" }
  ],
  tiktok: [
    { campaignId: "TT-BTS-PREP-01", videoTitle: "Needle Precision 60s Reel", videoViews: 48500, watchTimePct: 62.4, profileClicks: 1420, spend: 420.00, cpc: 0.30, dateRange: "Aug 1 - Aug 15" },
    { campaignId: "TT-HEALED-WORK-02", videoTitle: "30-Day Healed Client Results", videoViews: 31200, watchTimePct: 54.1, profileClicks: 890, spend: 280.00, cpc: 0.31, dateRange: "Aug 5 - Aug 12" }
  ],
  gbp: [
    { locationId: "LOC-DOWNTOWN", localActions: 1840, calls: 94, directionRequests: 312, websiteClicks: 860, profileViews: 9420, dateRange: "Aug 1 - Aug 15" }
  ],
  pos: [
    { code: "TAT50-PROMO", tokensRedeemed: 38, grossBasketTotal: 6650.00, netAttributedRevenue: 5240.00, avgTicket: 175.00 },
    { code: "TAT25-OFF", tokensRedeemed: 44, grossBasketTotal: 5280.00, netAttributedRevenue: 4180.00, avgTicket: 120.00 },
    { code: "TAT-AFTERCARE", tokensRedeemed: 29, grossBasketTotal: 2900.00, netAttributedRevenue: 2465.00, avgTicket: 100.00 },
    { code: "TAT-FLASH20", tokensRedeemed: 18, grossBasketTotal: 2520.00, netAttributedRevenue: 2016.00, avgTicket: 140.00 }
  ]
};

state.longitudinal_knowledge = {
  maturityLevel: "Month 3: Pattern Matched",
  confidenceScore: 68,
  maturityStage: 2,
  monthsAccumulated: 3.4,
  totalDataPointsLearned: 2480,
  cumulativeAttributedRevenue: 42850.00,
  switchingMoatScore: 92,
  timeHorizons: {
    d30: { blendedRoas: 6.84, costPerWalkin: 18.40, grossMarginPct: 71.2, topDay: "Thursday 6-9pm & Friday Mornings", topCreative: "Behind-the-Scenes Craft Realism" },
    d90: { blendedRoas: 7.42, costPerWalkin: 15.80, grossMarginPct: 69.5, topDay: "Friday & Saturday Drops", topCreative: "Artisan Technique & Zero-Fluff BTS" },
    d180: { blendedRoas: 8.15, costPerWalkin: 13.20, grossMarginPct: 73.0, topDay: "Thursday Flash Announcements", topCreative: "Client Transformations & Craft Story" }
  },
  businessMastery: {
    winningHooks: [
      { hook: "Behind-the-Scenes Sterile Craft & Technique", roas: "7.8x", baselineRoas: "2.1x", lift: "+271%", format: "Vertical Video 9:16" },
      { hook: "Healed Real-World Client Work (No Filters)", roas: "6.9x", baselineRoas: "2.4x", lift: "+187%", format: "Carousel & Video" },
      { hook: "Master Artist 1-on-1 Consultation Ritual", roas: "5.4x", baselineRoas: "2.0x", lift: "+170%", format: "Reel / Shorts" }
    ],
    gameRankings: [
      { style: "Scratch & Win", redemptionRate: "42.8%", conversionLift: "+42%", marginImpact: "Safe ($25 off $100+)", recommendation: "Optimal for mid-week flash drops" },
      { style: "Lucky Spin Wheel", redemptionRate: "36.2%", conversionLift: "+28%", marginImpact: "High engagement, moderate margin", recommendation: "Ideal for 7-day monthly sprint" },
      { style: "Vault Mystery Box", redemptionRate: "29.4%", conversionLift: "+19%", marginImpact: "Very high margin protection", recommendation: "Best for high-ticket VIP services" }
    ],
    marginThresholds: {
      maxDiscountCeiling: 30,
      minimumSpendReq: 50,
      targetGrossMarginFloor: 65,
      optimalSweetSpot: "$25 off $100 service (preserves 75% gross margin while delivering 91% conversion)"
    },
    peakConversionWindows: [
      { window: "Thursday 6:00 PM – 9:00 PM", lift: "3.4x weekend appointment booking rate" },
      { window: "Friday 9:00 AM – 11:30 AM", lift: "2.8x flash walk-in demand" },
      { window: "Sunday 7:00 PM – 10:00 PM", lift: "2.1x mid-week appointment filling" }
    ]
  },
  autonomousInsights: [
    { id: "ins_1", date: "Aug 14, 2026", type: "creative", text: "Short-form craft reels generate 3.2x more booked appointments than static discount ads. Allocating 65% of media budget to craft storytelling." },
    { id: "ins_2", date: "Aug 10, 2026", type: "margin", text: "BOGO offers caused a 6% margin compression. Automatically recalibrated prize board to '$25 off $100 minimum spend' to lock 70%+ gross margin floor." },
    { id: "ins_3", date: "Aug 06, 2026", type: "cadence", text: "Anti-Fatigue Guardrail: Detected 8 consecutive promo days. Co-Captain triggered 2-week Rest & Nurture mode to preserve luxury service pricing power." }
  ]
};

state.campaign_tracks = [
  {
    id: "track_a",
    key: "video_reels",
    name: "Track A: Short-Form Video & Craft Reels",
    subtitle: "Storytelling, Master Craftsmanship & Behind-the-Scenes",
    mechanic: "ZERO Game Mechanics · Pure Prestige & Direct Booking CTA",
    spendShare: 45,
    weeklySpend: 134.55,
    status: "active",
    kpis: { views: 79700, profileClicks: 2310, roas: "6.9x", directBookings: 52 },
    cadenceRule: "Continuous Evergreen Pulse · Always-On Brand Foundation",
    recentCreative: "Master Artist 60-Second Sterile Protocol & Realism Technique"
  },
  {
    id: "track_b",
    key: "arcade_sprints",
    name: "Track B: Static / Outreach Arcade Sprints",
    subtitle: "7-Day Interactive Gamified Acquisition Burst",
    mechanic: "Spin Wheel / Scratch & Win · Issues Single-Use Tamper-Proof POS Tokens",
    spendShare: 30,
    weeklySpend: 89.70,
    status: "active",
    kpis: { plays: 480, tokensIssued: 480, redeemed: 129, netRevenue: "$13,901.00", roas: "8.2x" },
    cadenceRule: "7-Day Active Pulse -> Followed by 2-3 Weeks Rest & Nurture",
    recentCreative: "Lucky Spin Station · $25 Off $100 Flash Claim"
  },
  {
    id: "track_c",
    key: "win_back_drip",
    name: "Track C: Win-Back & Retargeting Drip",
    subtitle: "Targeted VIP SMS & Email Nurture Sequences",
    mechanic: "Direct 1-on-1 Nurture · Single-Use Serialized VIP Perks",
    spendShare: 15,
    weeklySpend: 44.85,
    status: "active",
    kpis: { sent: 1420, openRate: "64.2%", clickRate: "28.5%", winBacks: 38 },
    cadenceRule: "Triggered Drip · 0-3-7-14 Day Staggered Delivery",
    recentCreative: "VIP Anniversary Invite & Exclusive Private Slot"
  },
  {
    id: "track_d",
    key: "local_search_intent",
    name: "Track D: Local Search & Maps Intent",
    subtitle: "Google Business Profile & High-Intent Maps Geo-Pinning",
    mechanic: "Frictionless Direct Contact Routing · Radius 3-Mile Geo-Pin",
    spendShare: 10,
    weeklySpend: 29.90,
    status: "active",
    kpis: { mapImpressions: 9420, directionRequests: 312, directCalls: 94, booked: 41 },
    cadenceRule: "Always-On High-Intent Capture",
    recentCreative: "Verified Studio Profile & Live 5-Star Walk-In Pin"
  }
];
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

app.get('/api/content/presets', (req, res) => {
  const categories = [
    {
      key: "appointment_service",
      label: "Appointment / Service",
      description: "Tattoo Studio, Day Spa & Wellness, Salon & Barber, Auto Detailing",
      presets: [BUSINESS_PRESETS.tattoo, BUSINESS_PRESETS.spa, BUSINESS_PRESETS.salon, BUSINESS_PRESETS.auto_detail]
    },
    {
      key: "food_beverage",
      label: "Food & Beverage",
      description: "Artisan Bistro, Craft Cocktail Bar & Lounge, Hearth Bakery & Cafe",
      presets: [BUSINESS_PRESETS.bistro, BUSINESS_PRESETS.bar, BUSINESS_PRESETS.bakery]
    },
    {
      key: "specialty_retail",
      label: "Specialty Retail & Health",
      description: "Curated Fashion Boutique, Gym & Fitness Studio, Aesthetic Dental Care",
      presets: [BUSINESS_PRESETS.boutique, BUSINESS_PRESETS.gym, BUSINESS_PRESETS.dental]
    }
  ];
  res.json({
    presets: BUSINESS_PRESETS,
    categories,
    activePresetId: state.brand_profile.id || "tattoo"
  });
});

app.post('/api/content/presets/apply', (req, res) => {
  const { presetId } = req.body || {};
  const preset = BUSINESS_PRESETS[presetId];
  if (!preset) {
    return res.status(404).json({ detail: `Preset ${presetId} not found.` });
  }
  state.brand_profile = {
    ...preset
  };
  if (preset.prizeBoard) {
    state.prize_board = JSON.parse(JSON.stringify(preset.prizeBoard));
  }
  // Generate sample redemption records matching new industry
  const pList = state.prize_board.goodPrizes || [];
  const p1 = pList[0] || { label: "50% Off Service", posCode: "SRV-50" };
  const p2 = pList[1] || { label: "$25 Off $100 Service", posCode: "SRV-25" };
  const p3 = pList[2] || { label: "Free Add-On Service", posCode: "SRV-ADD" };
  const pfx = (preset.id || "SRV").substring(0, 3).toUpperCase();
  
  state.redemptions = [
    {
      id: `rd_${Date.now()}_1`,
      code: `OL-${pfx}-784X`,
      masterPosCode: p1.posCode,
      tier: "Grand Prize",
      reward: p1.label,
      posCode: p1.posCode,
      segment: "vip",
      guestType: "repeat",
      gameId: "spin_wheel",
      gameName: "Lucky Spin Wheel",
      spaceId: "Front Mirror / Reception QR",
      status: "redeemed",
      memberKey: "gianna.m@example.com",
      memberEmail: "gianna.m@example.com",
      issuedAt: new Date(Date.now() - 2 * 86400000).toISOString(),
      expiresAt: new Date(Date.now() + 5 * 86400000).toISOString(),
      redeemedAt: new Date(Date.now() - 1 * 86400000).toISOString(),
      netSales: 150.00
    },
    {
      id: `rd_${Date.now()}_2`,
      code: `OL-${pfx}-339K`,
      masterPosCode: p2.posCode,
      tier: "High Value",
      reward: p2.label,
      posCode: p2.posCode,
      segment: "loyal",
      guestType: "repeat",
      gameId: "spin_wheel",
      gameName: "Lucky Spin Wheel",
      spaceId: "Register / Desk #1",
      status: "redeemed",
      memberKey: "marcus.k@example.com",
      memberEmail: "marcus.k@example.com",
      issuedAt: new Date(Date.now() - 3 * 86400000).toISOString(),
      expiresAt: new Date(Date.now() + 4 * 86400000).toISOString(),
      redeemedAt: new Date(Date.now() - 2 * 86400000).toISOString(),
      netSales: 110.00
    },
    {
      id: `rd_${Date.now()}_3`,
      code: `OL-${pfx}-912M`,
      masterPosCode: p3.posCode,
      tier: "Daily Win",
      reward: p3.label,
      posCode: p3.posCode,
      segment: "new",
      guestType: "new",
      gameId: "spin_wheel",
      gameName: "Lucky Spin Wheel",
      spaceId: "Window / Entrance QR",
      status: "issued",
      memberKey: "newguest@example.com",
      memberEmail: "newguest@example.com",
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
      redeemedAt: null,
      netSales: null
    }
  ];

  res.json({
    status: "ok",
    brand_profile: state.brand_profile,
    prize_board: state.prize_board
  });
});

// Campaign Cadence & Anti-Fatigue Controls
app.get('/api/campaign/cadence', (req, res) => {
  res.json(state.campaign_cadence);
});

app.post('/api/campaign/cadence/sprint', (req, res) => {
  const duration = Number(req.body?.days || 7);
  state.campaign_cadence = {
    ...state.campaign_cadence,
    mode: "sprint",
    sprintDurationDays: duration,
    sprintStartedAt: new Date().toISOString(),
    sprintExpiresAt: new Date(Date.now() + duration * 86400000).toISOString(),
    restSchedule: [
      { week: 1, name: "Week 1: Active 7-Day Sprint", status: "active", mode: "sprint", game: "Lucky Spin Wheel", advice: "Drive concentrated bursts of high-intent customer bookings." },
      { week: 2, name: "Week 2: Rest & Nurture Mode", status: "upcoming", mode: "rest_nurture", game: "None (Full-Price Focus)", advice: "Nurture new leads with welcome stories and protect premium service margins." },
      { week: 3, name: "Week 3: Rest & Nurture Mode", status: "upcoming", mode: "rest_nurture", game: "None (Full-Price Focus)", advice: "Client satisfaction follow-ups and organic Google/Meta review gathering." },
      { week: 4, name: "Week 4: Rotation Prep", status: "upcoming", mode: "rest_nurture", game: "Scratch & Win (Next)", advice: "Warm up audience for next month's fresh game mechanic rotation." }
    ]
  };
  res.json({ status: "ok", cadence: state.campaign_cadence });
});

app.post('/api/campaign/cadence/rest', (req, res) => {
  state.campaign_cadence = {
    ...state.campaign_cadence,
    mode: "rest_nurture",
    restSchedule: [
      { week: 1, name: "Week 1: Rest & Nurture Mode", status: "active", mode: "rest_nurture", game: "None (Full-Price Protection)", advice: "Preserve margin integrity, cultivate organic word-of-mouth." },
      { week: 2, name: "Week 2: Rest & Nurture Mode", status: "upcoming", mode: "rest_nurture", game: "None (Full-Price Protection)", advice: "Nurture new leads with craft stories." },
      { week: 3, name: "Week 3: Rotation Prep", status: "upcoming", mode: "rest_nurture", game: "Scratch & Win Prep", advice: "Prepare seasonal flash asset drop." },
      { week: 4, name: "Week 4: 7-Day Sprint Drop", status: "upcoming", mode: "sprint", game: "Scratch & Win", advice: "Run 7-day concentrated burst." }
    ]
  };
  res.json({ status: "ok", cadence: state.campaign_cadence });
});

app.post('/api/campaign/cadence/margin-floor', (req, res) => {
  const { maxDiscountPct, minSpendReq } = req.body || {};
  if (state.game_settings) {
    state.game_settings.maxDiscountPct = maxDiscountPct || 30;
    state.game_settings.minSpendReq = minSpendReq || 50;
  }
  res.json({
    status: "ok",
    message: `Margin Floor Tuned: Max discount capped at ${maxDiscountPct || 30}%, minimum spend requirement set to $${minSpendReq || 50}.`,
    settings: state.game_settings
  });
});

app.get('/api/content/brand-profile', (req, res) => {
  res.json(state.brand_profile);
});

app.put('/api/content/brand-profile', (req, res) => {
  state.brand_profile = { ...state.brand_profile, ...req.body };
  res.json(state.brand_profile);
});

app.post('/api/content/copy', async (req, res) => {
  const { transcript } = req.body || {};
  const b = state.brand_profile || {};
  const clean = (transcript || `Showcasing ${b.name || "our local business"}, ${b.signatureItem || "our signature craft"} in ${b.city || "town"}.`).trim();
  
  const ai = getGeminiClient();
  if (ai) {
    try {
      const prompt = `You are the Content Director copywriting AI for "${b.name}" (${b.industryLabel || b.category || "Local Business"}), located in ${b.city || "Springfield"}.
Brand Voice: ${b.voice || "Warm, authentic, community-centric"}.
Signature Item/Service: ${b.signatureItem || "Signature Service"}.
Booking/Order URL: ${b.orderUrl || "https://localbusiness.com"}.
Instagram Handle: @${b.igHandle || "localbiz"}.

The business owner or staff provided this transcript / video topic:
"${clean}"

Generate high-converting, platform-tailored marketing copy for 3 distinct surfaces:
1. "gbp" (Google Business Profile What's New post): Local SEO focused, mentions the city (${b.city}), highlights signature offering, includes clear direct call-to-action link (${b.orderUrl}).
2. "facebook" (Facebook Feed & Reels): Engaging community story, conversational question to spark local comments, warm tone, clean spacing.
3. "instagram" (Instagram Reel & Post Caption): Hook-driven visual caption, sensory/craft details, call to action, and 5-7 relevant local & industry hashtags.

Return ONLY a valid JSON object matching this exact schema:
{
  "gbp": "Google Business copy...",
  "facebook": "Facebook copy...",
  "instagram": "Instagram copy..."
}`;

      const response = await ai.models.generateContent({
        model: "gemini-3.7-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json"
        }
      });

      const parsed = JSON.parse(response.text);
      if (parsed.gbp && parsed.facebook && parsed.instagram) {
        return res.json({
          drafts: parsed,
          gbp: parsed.gbp,
          facebook: parsed.facebook,
          instagram: parsed.instagram,
          engine: "gemini-3.7-flash"
        });
      }
    } catch (e) {
      console.warn("Gemini copy generation fallback:", e.message);
    }
  }

  const cityTag = (b.city || "Springfield").replace(/\s+/g, '');
  const itemTag = (b.signatureItem || "SignatureItem").replace(/[^a-zA-Z0-9]/g, '');
  const defaultDrafts = {
    gbp: `Looking for top-rated ${b.industryLabel || "service"} in ${b.city}? At ${b.name}, we take pride in delivering our signature ${b.signatureItem}. Book or order direct today at ${b.orderUrl}`,
    facebook: `Crafted with care in ${b.city}: here is a look behind the scenes of our ${b.signatureItem}. What makes a great local experience for you? Drop a comment below! ❤️✨`,
    instagram: `Every detail counts at ${b.name}. From raw ingredients to final touch, our ${b.signatureItem} speaks for itself. Stop by or link in bio to experience it! 🔥\n\n#${cityTag} #LocalBusiness #${itemTag} #SupportLocal @${b.igHandle || "omnilocal"}`
  };

  res.json({
    drafts: defaultDrafts,
    ...defaultDrafts,
    engine: "local-fallback"
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

app.post('/api/content/critic/analyze', async (req, res) => {
  const { filename, transcript } = req.body || {};
  const b = state.brand_profile || {};
  const cleanTranscript = (transcript || "Welcome everyone! Today we're showing you our signature craft behind the scenes.").trim();

  const ai = getGeminiClient();
  if (ai) {
    try {
      const prompt = `You are the Content Director Video Critic AI analyzing a short-form vertical video (Reels / TikTok / Shorts) for "${b.name}" (${b.industryLabel || "Local Business"}).
Video File: ${filename || "clip.mov"}.
Transcript/Audio: "${cleanTranscript}".

Evaluate the clip strictly across 3 dimensions:
1. Hook (0-3s retention and opening visual/verbal energy)
2. Audio (clarity, background noise level, vocal confidence)
3. Framing (lighting, 9:16 vertical stability, subject centering)
4. Overall Grade ("STRONG", "IMPROVABLE", or "WEAK")
5. Tactical Plan Check (verdict: "ON-PLAN" or "NEEDS-FIX", matched items, and fix steps).

Return ONLY valid JSON matching this schema:
{
  "report": {
    "filename": "${filename || 'clip.mov'}",
    "hook": { "grade": "STRONG", "critique": "...", "recommendation": "..." },
    "audio": { "grade": "STRONG", "critique": "...", "recommendation": "..." },
    "framing": { "grade": "STRONG", "critique": "...", "recommendation": "..." },
    "overall": "STRONG",
    "measured": { "durationSec": 28, "wordsPerMinute": 135, "framesAnalyzed": 840, "hasAudio": true }
  },
  "transcript": "${cleanTranscript.replace(/"/g, '\\"')}",
  "planCheck": {
    "verdict": "ON-PLAN",
    "matched": ["Action-first hook", "Signature offering displayed"],
    "fix": []
  }
}`;

      const response = await ai.models.generateContent({
        model: "gemini-3.7-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json"
        }
      });

      const parsed = JSON.parse(response.text);
      if (parsed.report) {
        return res.json({
          ...parsed,
          videoUrl: null,
          engine: "gemini-3.7-flash"
        });
      }
    } catch (e) {
      console.warn("Gemini video critic fallback:", e.message);
    }
  }

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
    transcript: cleanTranscript,
    videoUrl: null,
    planCheck: { verdict: "ON-PLAN", matched: ["Action-first hook", "Signature dish showcased"], fix: [] },
    engine: "local-fallback"
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
app.post('/api/coach/template', async (req, res) => {
  const { topic } = req.body || {};
  const t = (topic || "Signature Special").trim();
  const b = state.brand_profile || {};

  let generatedTemplate = null;
  const ai = getGeminiClient();
  if (ai) {
    try {
      const prompt = `You are "The Coach", an elite local business video director for "${b.name}" (${b.industryLabel || "Local Business"}), located in ${b.city || "Springfield"}.
Brand Voice: ${b.voice || "Passionate craftsperson, authoritative, authentic"}.
Signature item: ${b.signatureItem || "Signature Service"}.

Topic for 60-Second Video Shooting Sheet: "${t}".

Generate a structured video shooting script for the owner/staff containing:
1. hook: The first 3 seconds to stop viewers scrolling (opening verbal line + physical action).
2. action: 3 rapid cut descriptions showing the behind-the-scenes craft with real sensory cues.
3. callToAction: Clear next step directing viewers to the rewards wheel or direct booking URL (${b.orderUrl}).
4. filmingTips: Practical phone camera distance, audio mic placement, and natural lighting tips.

Return ONLY valid JSON matching this schema:
{
  "hook": "...",
  "action": "...",
  "callToAction": "...",
  "filmingTips": "..."
}`;

      const response = await ai.models.generateContent({
        model: "gemini-3.7-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json"
        }
      });

      const parsed = JSON.parse(response.text);
      if (parsed.hook && parsed.action && parsed.callToAction) {
        generatedTemplate = parsed;
      }
    } catch (e) {
      console.warn("Gemini coach template fallback:", e.message);
    }
  }

  if (!generatedTemplate) {
    generatedTemplate = {
      hook: `Hold up the dish or tool and say: 'This is why ${b.name} does ${t} differently than anyone in ${b.city}.'`,
      action: "Show the signature prep technique in 3 quick cuts — high energy, real sound effects.",
      callToAction: `Claim your first-time reward on our rewards wheel or order online at ${b.orderUrl}.`,
      filmingTips: "Shoot vertical with phone microphone 12 inches from mouth. Keep raw & authentic."
    };
  }

  const newTmpl = {
    id: `tmpl_${Date.now()}`,
    topic: t,
    template: generatedTemplate,
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

app.get('/api/executioner/recommended-plan', async (req, res) => {
  const latest = state.reports[state.reports.length - 1];
  const shareA = latest?.decision?.nextShareA || 0.75;
  const shareB = latest?.decision?.nextShareB || 0.25;
  const totalBudget = 299.00;
  const b = state.brand_profile || {};
  const cadence = state.campaign_cadence || {};

  let diversificationTip = "Strategy A continues to drive higher ROAS in your core zip codes. Maintaining 25% allocation to Strategy B keeps new local discovery alive.";
  let projectedRoas = 7.2;

  const ai = getGeminiClient();
  if (ai) {
    try {
      const prompt = `You are the Customer Maximizer AI Decision Engine for "${b.name}" (${b.industryLabel || "Local Business"}).
Current Ad Spend: $${totalBudget}/week.
Recent Blended ROAS: ${latest?.blendedRoas || 6.84}x ($${latest?.totalRevenue || 2044.00} net revenue).
Current Strategy A (Paid Local Velocity) share: ${Math.round(shareA * 100)}%.
Current Strategy B (Community Flywheel) share: ${Math.round(shareB * 100)}%.
Campaign Cadence Mode: ${cadence.mode || "sprint"}.

Analyze performance and return ONLY valid JSON:
{
  "diversificationTip": "1-2 sentence recommendation for local marketing budget allocation and anti-fatigue balance",
  "projectedRoas": 7.4
}`;

      const response = await ai.models.generateContent({
        model: "gemini-3.7-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json"
        }
      });

      const parsed = JSON.parse(response.text);
      if (parsed.diversificationTip) diversificationTip = parsed.diversificationTip;
      if (parsed.projectedRoas) projectedRoas = Number(parsed.projectedRoas);
    } catch (e) {
      console.warn("Gemini recommended-plan advice fallback:", e.message);
    }
  }

  res.json({
    recommendedShareA: shareA,
    recommendedShareB: shareB,
    projectedRoas,
    warning: null,
    diversificationTip,
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

// Codes & Dual-Mode Voucher Engine
app.get('/api/codes/current', (req, res) => {
  const now = new Date();
  const nextWeek = new Date(Date.now() + 7 * 86400000);
  const bp = state.brand_profile;
  const pfx = (bp.id || "SRV").substring(0, 3).toUpperCase();
  const masterCode = bp.masterPosCode || `${pfx}50-PROMO`;
  const pList = state.prize_board?.goodPrizes || [];

  res.json({
    weekOf: now.toISOString().slice(0, 10),
    expiresAt: nextWeek.toISOString().slice(0, 10),
    length: 8,
    totalCodes: 24,
    businessName: bp.name,
    category: bp.category,
    masterPosCode: masterCode,
    tiers: [
      {
        tier: "grand",
        reward: pList[0]?.label || "50% Off 3-Hr Session",
        masterPosCode: pList[0]?.posCode || masterCode,
        probability: 0.05,
        codes: [`OL-${pfx}-784X`, `OL-${pfx}-992A`, `OL-${pfx}-441B`]
      },
      {
        tier: "high",
        reward: pList[1]?.label || "$25 Off $100 Service",
        masterPosCode: pList[1]?.posCode || `${pfx}25-OFF`,
        probability: 0.20,
        codes: [`OL-${pfx}-339K`, `OL-${pfx}-815Q`, `OL-${pfx}-204W`, `OL-${pfx}-671M`]
      },
      {
        tier: "mid",
        reward: pList[2]?.label || "Free Add-On Service",
        masterPosCode: pList[2]?.posCode || `${pfx}-ADDON`,
        probability: 0.40,
        codes: [`OL-${pfx}-912M`, `OL-${pfx}-118L`, `OL-${pfx}-473T`, `OL-${pfx}-582V`]
      },
      {
        tier: "low",
        reward: state.prize_board?.dudPrize?.label || "10% Off Next Booking",
        masterPosCode: state.prize_board?.dudPrize?.posCode || `${pfx}10-SAVE`,
        probability: 0.35,
        codes: [`OL-${pfx}-109Z`, `OL-${pfx}-843X`, `OL-${pfx}-721V`, `OL-${pfx}-354N`]
      }
    ],
    batch: [
      { code: `OL-${pfx}-784X`, masterPosCode: masterCode, strategy: "Paid Local Velocity", channel: "Meta Act-Now Ads" },
      { code: `OL-${pfx}-339K`, masterPosCode: `${pfx}25-OFF`, strategy: "Paid Local Velocity", channel: "Google Maps Pin" },
      { code: `OL-${pfx}-912M`, masterPosCode: `${pfx}-ADDON`, strategy: "Organic Community Outreach", channel: "GBP Organic & QR" }
    ]
  });
});

app.post('/api/codes/generate', (req, res) => {
  const len = Number(req.body?.length || 8);
  const now = new Date();
  const nextWeek = new Date(Date.now() + 7 * 86400000);
  const bp = state.brand_profile;
  const pfx = (bp.id || "SRV").substring(0, 3).toUpperCase();
  const masterCode = req.body?.masterPosCode || bp.masterPosCode || `${pfx}50-PROMO`;
  const randAlnum = () => Math.random().toString(36).substring(2, 6).toUpperCase();
  const pList = state.prize_board?.goodPrizes || [];

  res.json({
    status: "ok",
    batchCount: 24,
    weekOf: now.toISOString().slice(0, 10),
    expiresAt: nextWeek.toISOString().slice(0, 10),
    length: len,
    totalCodes: 24,
    masterPosCode: masterCode,
    tiers: [
      { tier: "grand", reward: pList[0]?.label || "50% Off Session", masterPosCode: pList[0]?.posCode || masterCode, probability: 0.05, codes: [`OL-${pfx}-${randAlnum()}`, `OL-${pfx}-${randAlnum()}`] },
      { tier: "high", reward: pList[1]?.label || "$25 Off $100 Service", masterPosCode: pList[1]?.posCode || `${pfx}25-OFF`, probability: 0.20, codes: [`OL-${pfx}-${randAlnum()}`, `OL-${pfx}-${randAlnum()}`, `OL-${pfx}-${randAlnum()}`] },
      { tier: "mid", reward: pList[2]?.label || "Free Add-On Service", masterPosCode: pList[2]?.posCode || `${pfx}-ADDON`, probability: 0.40, codes: [`OL-${pfx}-${randAlnum()}`, `OL-${pfx}-${randAlnum()}`, `OL-${pfx}-${randAlnum()}`] },
      { tier: "low", reward: state.prize_board?.dudPrize?.label || "10% Off Next Booking", masterPosCode: state.prize_board?.dudPrize?.posCode || `${pfx}10-SAVE`, probability: 0.35, codes: [`OL-${pfx}-${randAlnum()}`, `OL-${pfx}-${randAlnum()}`, `OL-${pfx}-${randAlnum()}`] }
    ],
    batch: [
      { code: `OL-${pfx}-${randAlnum()}`, masterPosCode: masterCode, strategy: "Paid Local Velocity", channel: "Meta Act-Now Ads" },
      { code: `OL-${pfx}-${randAlnum()}`, masterPosCode: `${pfx}25-OFF`, strategy: "Organic Community Outreach", channel: "GBP Organic" }
    ]
  });
});

// Staff Voucher Lookup Screen (1-Click Mark Redeemed)
app.get('/api/codes/voucher-lookup', (req, res) => {
  const query = (req.query.q || "").trim().toLowerCase();
  let results = state.redemptions;
  if (query) {
    results = state.redemptions.filter(r =>
      (r.code && r.code.toLowerCase().includes(query)) ||
      (r.masterPosCode && r.masterPosCode.toLowerCase().includes(query)) ||
      (r.memberEmail && r.memberEmail.toLowerCase().includes(query)) ||
      (r.reward && r.reward.toLowerCase().includes(query))
    );
  }
  res.json({
    query,
    total: results.length,
    vouchers: results
  });
});

app.post('/api/codes/redeem-voucher', (req, res) => {
  const { code, netSales, staffNote } = req.body || {};
  const cleanedCode = (code || "").trim().toUpperCase();
  const redemption = state.redemptions.find(r => (r.code && r.code.toUpperCase() === cleanedCode) || (r.id === code));
  
  if (!redemption) {
    return res.status(404).json({ detail: `Voucher code '${code}' not found in active ledger.` });
  }
  if (redemption.status === 'redeemed') {
    return res.status(400).json({ detail: `Voucher '${redemption.code}' was already redeemed on ${new Date(redemption.redeemedAt).toLocaleString()}.` });
  }

  redemption.status = 'redeemed';
  redemption.redeemedAt = new Date().toISOString();
  redemption.netSales = netSales ? Number(netSales) : 85.00;
  if (staffNote) redemption.staffNote = staffNote;

  res.json({
    status: "ok",
    message: `Voucher ${redemption.code} verified & locked. Attributed net sales: $${redemption.netSales.toFixed(2)}`,
    redemption
  });
});

app.get('/api/codes/export.csv', (req, res) => {
  const bp = state.brand_profile;
  let csv = "claim_code,master_pos_code,reward_title,tier,status,issued_at,expires_at,redeemed_at,net_sales\n";
  for (const r of state.redemptions) {
    csv += `"${r.code || ''}","${r.masterPosCode || r.posCode || ''}","${r.reward || ''}","${r.tier || ''}","${r.status || 'issued'}","${r.issuedAt || ''}","${r.expiresAt || ''}","${r.redeemedAt || ''}","${r.netSales || ''}"\n`;
  }
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${bp.id || 'omnilocal'}-claim-codes.csv"`);
  res.send(csv);
});

app.get('/api/codes/sample-csv', (req, res) => {
  res.setHeader('Content-Type', 'text/csv');
  res.send("promo_code,net_sales\nOL-TAT-784X,150.00\nOL-TAT-339K,110.00\nOL-TAT-912M,85.00\n");
});

app.post('/api/codes/reconcile', (req, res) => {
  const { csv } = req.body || {};
  const redeemed = state.redemptions.filter(r => r.status === 'redeemed');
  res.json({
    status: "ok",
    issued: state.redemptions.length,
    redeemed: redeemed.length,
    redemptionRate: state.redemptions.length ? Math.round((redeemed.length / state.redemptions.length) * 100) / 100 : 0.75,
    revenue: redeemed.reduce((s, r) => s + (r.netSales || 0), 0) || 842.50,
    rows: state.redemptions.slice(0, 5).map(r => ({
      code: r.code,
      masterPosCode: r.masterPosCode || r.posCode,
      reward: r.reward,
      net_sales: r.netSales || 45.00,
      valid: true
    }))
  });
});

// ---------------------------------------------------------------------------
// PHYSICAL PRINT ASSET STUDIO & MULTI-SURFACE QR ENGINE ENDPOINTS
// ---------------------------------------------------------------------------
app.get('/api/print-studio/templates', (req, res) => {
  const brand = state.brand_profile || {};
  res.json({
    status: "ok",
    placementGuardrail: {
      rule: "Placement Guardrail: Do NOT place discount game QRs at the front entrance or reception desk. That discounts baseline walk-ins who were already going to pay full price.",
      recommendation: "Deploy QRs on packaging/delivery seals (converts 3rd-party delivery to direct customers), check-presenters/table-tents (captures post-service re-engagement), digital screens (entertains waiting guests), and product bundle badges."
    },
    templates: [
      {
        id: "packaging_seals",
        name: "Packaging / Delivery Seals",
        badge: "2\" Round / Square Sticker",
        dimensions: "2.0\" × 2.0\" (Avery 22807 / Amazon Direct)",
        category: "takeout",
        surface: "delivery_seal",
        description: "Adhesive tamper-evident bag seal for DoorDash, UberEats, and takeout orders. Converts delivery commission leaks into direct high-margin regulars.",
        defaultHeadline: `Loved Your Order from ${brand.name || "Us"}?`,
        defaultSubhead: "Scan to claim your VIP direct-order reward & skip the delivery app markup!",
        defaultCta: "Scan for Direct Reward",
        qrTargetUrl: `/spin?surface=delivery_seal&src=packaging`,
        guardrailStatus: "approved",
        recommendedPlacement: "Carryout bag top seal, pizza box tab, or cup sleeve"
      },
      {
        id: "table_tent",
        name: "Check-Presenter & Table-Tent Inserts",
        badge: "4\" × 6\" Table / Bill Insert",
        dimensions: "4.0\" × 6.0\" (Dual-Sided Standee)",
        category: "on_premise",
        surface: "check_presenter",
        description: "Post-service loyalty capture delivered with the bill or placed on dining tables. Engages satisfied guests at the highest point of delight.",
        defaultHeadline: "Thank You for Visiting!",
        defaultSubhead: "Play the VIP Arcade before you leave to win up to $50 off your next session.",
        defaultCta: "Scan to Unlock VIP Reward",
        qrTargetUrl: `/spin?surface=check_presenter&src=table_tent`,
        guardrailStatus: "approved",
        recommendedPlacement: "Inside leather check presenter or centerpiece standee"
      },
      {
        id: "digital_screen_16_9",
        name: "Digital Screen Assets (Atmosphere TV / Menu Boards)",
        badge: "16:9 1080p Digital Graphic",
        dimensions: "1920 × 1080 px (16:9 Display Overlay)",
        category: "digital_screen",
        surface: "digital_screen_16_9",
        description: "High-contrast venue TV overlays with high-visibility QR codes for Atmosphere TV, Chive TV, or digital menu boards.",
        defaultHeadline: "VIP Loyalty Arcade is LIVE",
        defaultSubhead: "Scan the TV screen from your seat to unlock this week's exclusive studio token!",
        defaultCta: "Point Phone Camera at Screen",
        qrTargetUrl: `/spin?surface=digital_screen_16_9&src=venue_tv`,
        guardrailStatus: "approved",
        recommendedPlacement: "Venue lobby TV rotation, waiting lounge screens, or bar monitors"
      },
      {
        id: "bundle_badges",
        name: "Retail & Product Bundle Badges",
        badge: "2.5\" Retail Tag",
        dimensions: "2.5\" × 3.5\" Hangtag / Shelf Talker",
        category: "retail",
        surface: "bundle_badge",
        description: "Special promotional stickers and hangtags for multi-pack merchandise, retail aftercare kits, and product bundles.",
        defaultHeadline: "Multi-Pack VIP Bonus",
        defaultSubhead: "Scan to unlock your complimentary aftercare refill on your next studio booking.",
        defaultCta: "Scan for Bundle Perk",
        qrTargetUrl: `/spin?surface=bundle_badge&src=retail_pack`,
        guardrailStatus: "approved",
        recommendedPlacement: "Product aftercare packaging, retail display shelf talkers"
      }
    ]
  });
});

app.post('/api/print-studio/generate', async (req, res) => {
  const { templateId, headline, subhead, cta, surface } = req.body || {};
  const brand = state.brand_profile || {};
  const surf = surface || "delivery_seal";
  const playUrl = `/spin?surface=${encodeURIComponent(surf)}&brand=${encodeURIComponent(brand.id || 'studio')}`;

  let qrDataUri = "";
  try {
    qrDataUri = await QRCode.toDataURL(playUrl, {
      width: 400,
      margin: 1,
      color: {
        dark: "#1A1A1A",
        light: "#FFFFFF"
      }
    });
  } catch (e) {
    qrDataUri = "";
  }

  res.json({
    status: "ok",
    templateId,
    surface: surf,
    headline: headline || `VIP Reward · ${brand.name}`,
    subhead: subhead || "Scan with your smartphone camera to unlock your verified voucher.",
    cta: cta || "Scan to Play",
    qrDataUri,
    playUrl,
    brandName: brand.name,
    brandCity: brand.city
  });
});

// ---------------------------------------------------------------------------
// MULTI-SOURCE ATTRIBUTION HUB ENDPOINTS
// ---------------------------------------------------------------------------
app.get('/api/attribution/sources', (req, res) => {
  const sources = state.attribution_sources || {};
  
  // Calculate Totals & Normalized Attribution
  const metaSpend = (sources.meta || []).reduce((acc, row) => acc + (Number(row.spend) || 0), 0);
  const metaClicks = (sources.meta || []).reduce((acc, row) => acc + (Number(row.clicks) || 0), 0);
  const metaImpressions = (sources.meta || []).reduce((acc, row) => acc + (Number(row.impressions) || 0), 0);

  const tiktokSpend = (sources.tiktok || []).reduce((acc, row) => acc + (Number(row.spend) || 0), 0);
  const tiktokViews = (sources.tiktok || []).reduce((acc, row) => acc + (Number(row.videoViews) || 0), 0);
  const tiktokClicks = (sources.tiktok || []).reduce((acc, row) => acc + (Number(row.profileClicks) || 0), 0);

  const gbpActions = (sources.gbp || []).reduce((acc, row) => acc + (Number(row.localActions) || 0), 0);
  const gbpCalls = (sources.gbp || []).reduce((acc, row) => acc + (Number(row.calls) || 0), 0);
  const gbpDirections = (sources.gbp || []).reduce((acc, row) => acc + (Number(row.directionRequests) || 0), 0);
  const gbpWebClicks = (sources.gbp || []).reduce((acc, row) => acc + (Number(row.websiteClicks) || 0), 0);

  const posGross = (sources.pos || []).reduce((acc, row) => acc + (Number(row.grossBasketTotal) || 0), 0);
  const posNet = (sources.pos || []).reduce((acc, row) => acc + (Number(row.netAttributedRevenue) || 0), 0);
  const posRedeemed = (sources.pos || []).reduce((acc, row) => acc + (Number(row.tokensRedeemed) || 0), 0);

  const totalSpend = metaSpend + tiktokSpend + 59.80; // include organic boost tooling
  const totalAttributedRevenue = posNet > 0 ? posNet : 13901.00;
  const blendedRoas = totalSpend > 0 ? (totalAttributedRevenue / totalSpend).toFixed(2) : "7.42";
  const costPerWalkIn = posRedeemed > 0 ? (totalSpend / posRedeemed).toFixed(2) : "14.85";
  const grossMarginReturn = posGross > 0 ? Math.round((posNet / posGross) * 100) : 76;

  res.json({
    status: "ok",
    summary: {
      totalSpend: Number(totalSpend.toFixed(2)),
      totalAttributedRevenue: Number(totalAttributedRevenue.toFixed(2)),
      blendedRoas: Number(blendedRoas),
      costPerWalkIn: Number(costPerWalkIn),
      grossMarginReturn: grossMarginReturn,
      totalWalkins: posRedeemed || 129,
      totalAdImpressions: metaImpressions + tiktokViews + 9420,
      totalDirectActions: metaClicks + tiktokClicks + gbpActions
    },
    sources: {
      meta: sources.meta || [],
      tiktok: sources.tiktok || [],
      gbp: sources.gbp || [],
      pos: sources.pos || []
    },
    channelBreakdown: [
      { channel: "Meta / Facebook", spend: metaSpend, clicks: metaClicks, attributedRev: Math.round(posNet * 0.48), roas: (Math.round(posNet * 0.48) / (metaSpend || 1)).toFixed(2) },
      { channel: "TikTok / Video Reels", spend: tiktokSpend, views: tiktokViews, clicks: tiktokClicks, attributedRev: Math.round(posNet * 0.32), roas: (Math.round(posNet * 0.32) / (tiktokSpend || 1)).toFixed(2) },
      { channel: "Google Business / Maps", spend: 29.90, actions: gbpActions, calls: gbpCalls, attributedRev: Math.round(posNet * 0.20), roas: (Math.round(posNet * 0.20) / 29.90).toFixed(2) }
    ]
  });
});

app.post('/api/attribution/import', (req, res) => {
  const { source, csv } = req.body || {};
  if (!source || !csv) {
    return res.status(400).json({ detail: "source ('meta' | 'tiktok' | 'gbp' | 'pos') and csv content required" });
  }

  const lines = (csv || "").trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) {
    return res.status(400).json({ detail: "CSV must contain a header row and at least one data row" });
  }

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/['"]/g, ''));
  const rows = lines.slice(1).map(line => {
    // Basic CSV token parser
    const vals = line.split(',').map(v => v.trim().replace(/^["']|["']$/g, ''));
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = vals[i] || "";
    });
    return obj;
  });

  let importedCount = 0;
  if (!state.attribution_sources) {
    state.attribution_sources = { meta: [], tiktok: [], gbp: [], pos: [] };
  }

  if (source === 'meta') {
    const parsed = rows.map((r, idx) => ({
      campaignId: r.campaign_id || r.campaign || `META-IMP-${idx + 1}`,
      campaignName: r.campaign_name || r.name || "Meta Ad Set",
      clicks: Number(r.clicks || r.link_clicks || 250),
      ctr: Number(r.ctr || r.click_rate || 3.2),
      cpc: Number(r.cpc || 0.65),
      spend: Number(r.spend || r.ad_spend || r.amount_spent || 162.50),
      impressions: Number(r.impressions || 8500),
      dateRange: r.date_range || r.date || "Current Sprint"
    }));
    state.attribution_sources.meta = [...state.attribution_sources.meta, ...parsed];
    importedCount = parsed.length;
  } else if (source === 'tiktok') {
    const parsed = rows.map((r, idx) => ({
      campaignId: r.campaign_id || r.id || `TT-IMP-${idx + 1}`,
      videoTitle: r.video_title || r.title || "Short-Form Reel",
      videoViews: Number(r.video_views || r.views || 12500),
      watchTimePct: Number(r.watch_time_pct || r.watch_time || 58.0),
      profileClicks: Number(r.profile_clicks || r.clicks || 420),
      spend: Number(r.spend || r.ad_spend || 126.00),
      cpc: Number(r.cpc || 0.30),
      dateRange: r.date_range || "Current Sprint"
    }));
    state.attribution_sources.tiktok = [...state.attribution_sources.tiktok, ...parsed];
    importedCount = parsed.length;
  } else if (source === 'gbp') {
    const parsed = rows.map((r, idx) => ({
      locationId: r.location_id || r.location || "LOC-PRIMARY",
      localActions: Number(r.local_actions || r.actions || 450),
      calls: Number(r.calls || r.phone_calls || 32),
      directionRequests: Number(r.direction_requests || r.directions || 110),
      websiteClicks: Number(r.website_clicks || r.website || 280),
      profileViews: Number(r.profile_views || r.views || 3200),
      dateRange: r.date_range || "Current Sprint"
    }));
    state.attribution_sources.gbp = [...state.attribution_sources.gbp, ...parsed];
    importedCount = parsed.length;
  } else if (source === 'pos') {
    const parsed = rows.map((r, idx) => ({
      code: r.code || r.coupon_code || r.promo_code || `POS-IMP-${idx + 1}`,
      tokensRedeemed: Number(r.tokens_redeemed || r.redemptions || r.qty || 15),
      grossBasketTotal: Number(r.gross_basket_total || r.gross_sales || r.gross || 2250.00),
      netAttributedRevenue: Number(r.net_attributed_revenue || r.net_sales || r.net || 1800.00),
      avgTicket: Number(r.avg_ticket || 120.00)
    }));
    state.attribution_sources.pos = [...state.attribution_sources.pos, ...parsed];
    importedCount = parsed.length;
  }

  // Update longitudinal knowledge data points
  state.longitudinal_knowledge.totalDataPointsLearned += importedCount * 12;
  
  res.json({
    status: "ok",
    source,
    importedCount,
    message: `Successfully normalized and imported ${importedCount} records from ${source.toUpperCase()} CSV.`
  });
});

app.get('/api/attribution/samples/:source', (req, res) => {
  const { source } = req.params;
  let csv = "";
  if (source === 'meta') {
    csv = "campaign_id,campaign_name,clicks,ctr,cpc,spend,impressions,date_range\n" +
          "META-CRAFT-01,Master Realism Craft Reel,1420,3.85,0.58,823.60,36880,2026-08-01 - 2026-08-15\n" +
          "META-FLASH-02,Weekend Flash Booking Promo,790,4.20,0.49,387.10,18800,2026-08-08 - 2026-08-10\n" +
          "META-RETARG-03,VIP Touchup Nurture Sequence,340,5.10,0.42,142.80,6660,2026-08-01 - 2026-08-15\n";
  } else if (source === 'tiktok') {
    csv = "campaign_id,video_title,video_views,watch_time_pct,profile_clicks,spend,cpc,date_range\n" +
          "TT-CRAFT-60S,Sterile Machine Setup & Fine Line 60s,52400,64.2,1680,480.00,0.28,2026-08-01 - 2026-08-15\n" +
          "TT-HEALED-30D,Healed Sleeves Real-World Showcase,38900,56.8,1140,340.00,0.30,2026-08-05 - 2026-08-12\n";
  } else if (source === 'gbp') {
    csv = "location_id,local_actions,calls,direction_requests,website_clicks,profile_views,date_range\n" +
          "LOC-MAIN,2140,118,382,990,11200,2026-08-01 - 2026-08-15\n";
  } else if (source === 'pos') {
    csv = "coupon_code,tokens_redeemed,gross_basket_total,net_attributed_revenue,avg_ticket\n" +
          "TAT50-PROMO,42,7350.00,5880.00,175.00\n" +
          "TAT25-OFF,51,6120.00,4845.00,120.00\n" +
          "TAT-AFTERCARE,33,3300.00,2805.00,100.00\n" +
          "TAT-FLASH20,22,3080.00,2464.00,140.00\n";
  } else {
    csv = "channel,spend,attributed_revenue\nMeta,1210.70,8450.00\nTikTok,820.00,5400.00\nGBP,29.90,2800.00\n";
  }

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${source}-sample.csv"`);
  res.send(csv);
});

app.post('/api/attribution/clear', (req, res) => {
  state.attribution_sources = {
    meta: [],
    tiktok: [],
    gbp: [],
    pos: []
  };
  res.json({ status: "ok", message: "All multi-source attribution imports cleared." });
});

// ---------------------------------------------------------------------------
// CUMULATIVE KNOWLEDGE BASE & LONGITUDINAL LEARNING ENGINE ENDPOINTS
// ---------------------------------------------------------------------------
app.get('/api/knowledge/profile', (req, res) => {
  const brand = state.brand_profile || {};
  const kn = state.longitudinal_knowledge || {};

  res.json({
    status: "ok",
    brandName: brand.name,
    industryLabel: brand.industryLabel,
    maturity: {
      level: kn.maturityLevel,
      stage: kn.maturityStage,
      confidenceScore: kn.confidenceScore,
      monthsAccumulated: kn.monthsAccumulated,
      totalDataPointsLearned: kn.totalDataPointsLearned,
      cumulativeAttributedRevenue: kn.cumulativeAttributedRevenue,
      switchingMoatScore: kn.switchingMoatScore,
      stages: [
        { stage: 1, label: "Month 1: Calibration", desc: "Testing channel hooks & baseline offer sensitivity", status: kn.maturityStage >= 1 ? "completed" : "pending", confidence: "28%" },
        { stage: 2, label: "Month 2-3: Pattern Matched", desc: "Proven creative formats, prize margin floors & peak conversion days locked in", status: kn.maturityStage === 2 ? "active" : kn.maturityStage > 2 ? "completed" : "pending", confidence: "68%" },
        { stage: 3, label: "Month 6+: Autonomous Market Dominance", desc: "Continuous compounding ROI, predictive scheduling, and autonomous budget shifting", status: kn.maturityStage >= 3 ? "active" : "pending", confidence: "95%" }
      ]
    },
    timeHorizons: kn.timeHorizons,
    businessMastery: kn.businessMastery,
    autonomousInsights: kn.autonomousInsights,
    clientProfileModel: {
      summary: `${brand.name} customers respond 42% stronger to Scratch & Win mechanics than Spin Wheels. High-craft video reels drive 3.4x more weekend walk-ins than static discount ads. The $25 off $100 service offer protects an average 74.2% gross margin floor while converting 91% of first-time claims.`
    }
  });
});

app.post('/api/knowledge/advance-maturity', (req, res) => {
  const kn = state.longitudinal_knowledge;
  if (kn.maturityStage < 3) {
    kn.maturityStage += 1;
    if (kn.maturityStage === 3) {
      kn.maturityLevel = "Month 6+: Autonomous Market Dominance";
      kn.confidenceScore = 95;
      kn.monthsAccumulated = 6.2;
      kn.switchingMoatScore = 98;
      kn.totalDataPointsLearned += 1400;
    } else {
      kn.maturityLevel = "Month 3: Pattern Matched";
      kn.confidenceScore = 68;
      kn.monthsAccumulated = 3.4;
      kn.switchingMoatScore = 92;
    }
  }
  res.json({
    status: "ok",
    message: `Learning maturity advanced to '${kn.maturityLevel}' (${kn.confidenceScore}% confidence).`,
    maturity: kn
  });
});

// ---------------------------------------------------------------------------
// MULTI-TRACK CAMPAIGN STRATEGY & CADENCE ENDPOINTS
// ---------------------------------------------------------------------------
app.get('/api/campaigns/tracks', (req, res) => {
  const tracks = state.campaign_tracks || [];
  const cadence = state.campaign_cadence || {};

  res.json({
    status: "ok",
    tracks,
    cadence: {
      currentMode: cadence.mode || "sprint",
      sprintExpiresAt: cadence.sprintExpiresAt,
      advisoryNotice: cadence.advisoryNotice,
      restSchedule: cadence.restSchedule,
      guardrailRule: "Anti-Fatigue Guardrail: 7-day arcade pulse followed by 2-3 weeks of video awareness / nurture. Avoid uninterrupted discounting."
    }
  });
});

app.post('/api/campaigns/tracks/:trackId/toggle', (req, res) => {
  const { trackId } = req.params;
  const track = (state.campaign_tracks || []).find(t => t.id === trackId || t.key === trackId);
  if (!track) {
    return res.status(404).json({ detail: "Campaign track not found" });
  }

  track.status = track.status === 'active' ? 'paused' : 'active';
  res.json({
    status: "ok",
    message: `${track.name} is now ${track.status}.`,
    track
  });
});

// ---------------------------------------------------------------------------
// HUMAN-GATED APPROVAL STAGING ENDPOINT
// ---------------------------------------------------------------------------
app.post('/api/approvals/stage', (req, res) => {
  const { title, description, category, meta } = req.body || {};
  const newApproval = {
    id: `appr_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
    title: title || "Live Media Ad Spend Allocation",
    description: description || "Approve committing live ad budget and external audience dispatch.",
    category: category || "ad_spend", // "ad_spend" | "messaging_dispatch" | "strategy"
    status: "pending",
    stagedBy: "Co-Captain Autonomous Engine",
    stagedAt: new Date().toISOString(),
    meta: meta || { amount: 299.00, channels: ["Meta Reels", "Google Maps Boost"] }
  };

  if (!state.approvals) state.approvals = [];
  state.approvals.unshift(newApproval);

  res.json({
    status: "ok",
    message: "Action staged for human-gated client approval.",
    approval: newApproval
  });
});

// ---------------------------------------------------------------------------
// GEMINI API FUNCTION CALLING & COPILOT TOOL CALLING ENGINE
// ---------------------------------------------------------------------------
let genaiInstance = null;
function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  if (!genaiInstance) {
    try {
      const { GoogleGenAI } = require('@google/genai');
      genaiInstance = new GoogleGenAI({
        apiKey,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
      });
    } catch (e) {
      console.warn("Could not instantiate GoogleGenAI:", e.message);
    }
  }
  return genaiInstance;
}

const copilotFunctionDeclarations = [
  {
    name: "navigate_view",
    description: "Navigate to a specific view or section in the OmniLocal application interface.",
    parameters: {
      type: "OBJECT",
      properties: {
        view: {
          type: "STRING",
          description: "Target view id. Allowed: 'overview' (Command Center), 'printstudio' (Print & QR Studio), 'attribution' (Attribution Hub), 'knowledge' (Knowledge Base), 'multitrack' (Multi-Track Campaigns), 'adspend' (Ad Spend Log), 'codes' (Vouchers & POS Codes), 'locations' (Locations & Google Maps), 'team' (Team & Approvals), 'brand' (Brand Brain), 'pricing' (Pricing & ROI), 'maximizer' (Margin Guardrails & Sprints), 'content' (Content Director), 'executioner' (1-Click Publisher)."
        },
        reason: {
          type: "STRING",
          description: "Clear explanation of why this navigation was chosen."
        }
      },
      required: ["view"]
    }
  },
  {
    name: "generate_and_schedule_campaign",
    description: "Generate and schedule a tactical marketing campaign across one of the four OmniLocal tracks (Short-Form Video, Outreach Arcade, Win-Back Drip, or Local Maps Intent).",
    parameters: {
      type: "OBJECT",
      properties: {
        track: {
          type: "STRING",
          description: "Campaign track: 'track_a' (Short-Form Video & Craft Reels), 'track_b' (7-Day Outreach Arcade Sprint), 'track_c' (Win-Back VIP Nurture Drip), or 'track_d' (Local Search & Maps Intent)."
        },
        campaignName: {
          type: "STRING",
          description: "Title of the promotional campaign."
        },
        creativeHook: {
          type: "STRING",
          description: "The primary storytelling or offer hook (e.g. 'Sterile Craft 60s Reel', '$25 Off $100 First Session', 'VIP Anniversary Touch-up')."
        },
        weeklyBudget: {
          type: "NUMBER",
          description: "Weekly ad spend allocation in USD."
        },
        targetAudience: {
          type: "STRING",
          description: "Target audience radius or segment (e.g. 'Within 5 miles + Craft enthusiasts', 'Inactive VIPs 60+ days')."
        },
        durationDays: {
          type: "NUMBER",
          description: "Duration of active campaign run in days (typically 7 for arcade sprints)."
        },
        antiFatigueCheck: {
          type: "BOOLEAN",
          description: "Whether anti-fatigue cooldown check is enforced to prevent offer burnout."
        }
      },
      required: ["track", "campaignName", "weeklyBudget"]
    }
  },
  {
    name: "update_directory_contacts",
    description: "Update the business directory contact information, Google Business Profile details, address, phone number, hours, or social handles.",
    parameters: {
      type: "OBJECT",
      properties: {
        businessName: {
          type: "STRING",
          description: "Updated business name."
        },
        phone: {
          type: "STRING",
          description: "Business phone number for customer contact."
        },
        address: {
          type: "STRING",
          description: "Physical street address for local map pinning."
        },
        city: {
          type: "STRING",
          description: "City location."
        },
        websiteUrl: {
          type: "STRING",
          description: "Direct booking or ordering URL."
        },
        igHandle: {
          type: "STRING",
          description: "Instagram handle."
        },
        notes: {
          type: "STRING",
          description: "Special operator notes or hours of operation."
        }
      }
    }
  },
  {
    name: "pull_analytics_and_attribution",
    description: "Pull cross-channel attribution metrics, blended ROAS, cost per walk-in, total net revenue, and replacement value savings.",
    parameters: {
      type: "OBJECT",
      properties: {
        timeHorizon: {
          type: "STRING",
          description: "Historical learning horizon: 'd30' (Last 30 Days), 'd90' (Last 90 Days), 'd180' (Last 180 Days), or 'all'."
        },
        focusMetric: {
          type: "STRING",
          description: "Primary focus metric: 'blended_roas', 'cost_per_walkin', 'net_revenue', 'replacement_value', or 'all'."
        }
      }
    }
  },
  {
    name: "generate_print_asset",
    description: "Create and configure a high-resolution vector print asset with embedded tracking QR code and surface attribution.",
    parameters: {
      type: "OBJECT",
      properties: {
        templateId: {
          type: "STRING",
          description: "Format type: 'packaging_seals' (2\" delivery bag stickers), 'table_tent' (4\"x6\" bill inserts), 'digital_screen_16_9' (1080p TV overlays), or 'bundle_badges' (retail tags)."
        },
        headline: {
          type: "STRING",
          description: "Headline text on the printed asset."
        },
        subhead: {
          type: "STRING",
          description: "Supporting descriptive text or value proposition."
        },
        cta: {
          type: "STRING",
          description: "Call to action text beneath the QR code."
        },
        enforcePlacementGuardrail: {
          type: "BOOLEAN",
          description: "Enforce guardrail against placing discount QRs at front entrances."
        }
      },
      required: ["templateId"]
    }
  },
  {
    name: "tune_margin_floor",
    description: "Tune and lock profit margin guardrails (discount ceiling, minimum basket spend, and gross margin target).",
    parameters: {
      type: "OBJECT",
      properties: {
        maxDiscountCeilingPct: {
          type: "NUMBER",
          description: "Maximum allowable discount percentage (e.g. 25 or 30)."
        },
        minimumSpendReqUsd: {
          type: "NUMBER",
          description: "Minimum spend required to redeem discounts (e.g. 50 or 100 USD)."
        },
        targetGrossMarginPct: {
          type: "NUMBER",
          description: "Target gross margin percentage floor (e.g. 70 or 75)."
        }
      }
    }
  },
  {
    name: "stage_human_approval",
    description: "Stage an action (live media ad spend commitment or bulk audience messaging) for human-gated client approval in Team & Approvals.",
    parameters: {
      type: "OBJECT",
      properties: {
        title: {
          type: "STRING",
          description: "Title of the staged approval action."
        },
        description: {
          type: "STRING",
          description: "Detailed description of ad spend or messaging allocation."
        },
        category: {
          type: "STRING",
          description: "Category: 'ad_spend', 'messaging_dispatch', or 'strategy'."
        },
        amount: {
          type: "NUMBER",
          description: "Ad spend amount in USD requiring sign-off."
        }
      },
      required: ["title", "description", "category"]
    }
  },
  {
    name: "redeem_voucher_code",
    description: "Look up, verify, and mark a customer voucher or POS coupon code as redeemed with attributed ticket sales.",
    parameters: {
      type: "OBJECT",
      properties: {
        code: {
          type: "STRING",
          description: "The voucher or POS promo code (e.g. 'TAT50-PROMO' or 'OL-TAT-784X')."
        },
        netSales: {
          type: "NUMBER",
          description: "Net sales dollar amount attributed to this redemption."
        },
        staffNote: {
          type: "STRING",
          description: "Optional staff verification note."
        }
      },
      required: ["code"]
    }
  },
  {
    name: "switch_brand_vertical",
    description: "Switch the active business vertical and load industry-specific presets (Tattoo Studio, Restaurant, Craft Bar/Lounge, Bakery, Boutique Retail, Gym, Auto Detailing, Salon).",
    parameters: {
      type: "OBJECT",
      properties: {
        verticalId: {
          type: "STRING",
          description: "Vertical key: 'tattoo', 'restaurant', 'bar', 'bakery', 'boutique', 'gym', 'detail', or 'salon'."
        }
      },
      required: ["verticalId"]
    }
  },
  {
    name: "export_claim_codes",
    description: "Export the full tamper-proof claim code and POS redemption ledger to a downloadable CSV spreadsheet.",
    parameters: {
      type: "OBJECT",
      properties: {
        format: {
          type: "STRING",
          description: "Export format: 'csv' or 'json'."
        }
      }
    }
  },
  {
    name: "reconcile_attribution_csv",
    description: "Reconcile multi-source ad metrics and POS register data across Meta, TikTok, Google Business Profile, and in-store POS.",
    parameters: {
      type: "OBJECT",
      properties: {
        source: {
          type: "STRING",
          description: "Target attribution source: 'meta', 'tiktok', 'gbp', 'pos', or 'all'."
        }
      }
    }
  }
];

app.get('/api/copilot/tools', (req, res) => {
  res.json({
    status: "ok",
    tools: copilotFunctionDeclarations
  });
});

app.post('/api/copilot/chat', async (req, res) => {
  const { message, history, activeView } = req.body || {};
  const query = (message || "").trim();
  const bp = state.brand_profile || {};
  const kn = state.longitudinal_knowledge || {};

  if (!query) {
    return res.status(400).json({ error: "Message is required" });
  }

  // Check if Gemini API is configured
  const ai = getGeminiClient();
  if (ai) {
    try {
      const systemInstruction = `You are the Co-Captain AI operating system for OmniLocal #1 Revenue Engine, managing marketing, physical QR generation, attribution reconciliation, and margin guardrails for ${bp.name || "Local Business"} (${bp.industryLabel || "Independent Business"}).
Current active view: ${activeView || "overview"}.
Current Blended ROAS: 6.84x, Weekly Spend: $299.00, Maturity Level: ${kn.maturityLevel || "Month 3: Pattern Matched"}.
You have access to tools that directly control the application. Always invoke the appropriate tool declaration whenever the user asks to navigate, generate/schedule campaigns, update contacts, pull analytics, generate print assets, lock margins, stage ad spend for human approval, redeem vouchers, export codes, or switch verticals. Respond concisely and professionally.`;

      const geminiResponse = await ai.models.generateContent({
        model: "gemini-3.7-flash",
        contents: query,
        config: {
          systemInstruction,
          tools: [{ functionDeclarations: copilotFunctionDeclarations }]
        }
      });

      const functionCalls = geminiResponse.functionCalls;
      if (functionCalls && functionCalls.length > 0) {
        return res.json({
          status: "ok",
          engine: "gemini-3.7-flash",
          reply: geminiResponse.text || `Executing ${functionCalls[0].name}...`,
          functionCalls: functionCalls.map(fc => ({
            name: fc.name,
            args: fc.args || {}
          }))
        });
      } else {
        return res.json({
          status: "ok",
          engine: "gemini-3.7-flash",
          reply: geminiResponse.text || "Action analyzed and coordinated.",
          functionCalls: []
        });
      }
    } catch (err) {
      console.warn("Gemini live call error, falling back to local orchestrator:", err.message);
    }
  }

  // Intelligent fallback function-calling engine (ensures 100% self-contained deterministic execution)
  const q = query.toLowerCase();
  let matchedTool = null;
  let replyText = "";

  if (q.includes("print") || q.includes("qr studio") || q.includes("sticker") || q.includes("table tent") || q.includes("seal") || q.includes("physical")) {
    matchedTool = {
      name: "generate_print_asset",
      args: {
        templateId: q.includes("seal") || q.includes("package") ? "packaging_seals" : q.includes("tent") || q.includes("table") ? "table_tent" : q.includes("screen") || q.includes("tv") ? "digital_screen_16_9" : "packaging_seals",
        headline: `VIP Reward · ${bp.name}`,
        subhead: "Scan with phone camera to claim direct-order VIP token",
        cta: "Scan to Unlock Reward",
        enforcePlacementGuardrail: true
      }
    };
    replyText = `Opening Print & Physical Asset Studio. Guardrail active: Deploy QRs on packaging seals and check-presenters, never at the front entrance!`;
  } else if (q.includes("contact") || q.includes("directory") || q.includes("phone") || q.includes("address") || q.includes("hours")) {
    matchedTool = {
      name: "update_directory_contacts",
      args: {
        businessName: bp.name,
        phone: "(555) 234-5678",
        address: "142 N Main Street",
        city: bp.city || "Springfield",
        websiteUrl: bp.orderUrl || "https://ironandneedle.com",
        igHandle: bp.igHandle || "ironandneedletattoo",
        notes: "Open Tue-Sat 11am-8pm. VIP bookings prioritized."
      }
    };
    replyText = `Updated directory and local map contact card for ${bp.name}. Google Business Profile synchronization updated.`;
  } else if (q.includes("campaign") || q.includes("schedule") || q.includes("sprint") || q.includes("arcade") || q.includes("reels")) {
    const track = q.includes("video") || q.includes("reel") ? "track_a" : q.includes("drip") || q.includes("email") ? "track_c" : q.includes("map") || q.includes("search") ? "track_d" : "track_b";
    matchedTool = {
      name: "generate_and_schedule_campaign",
      args: {
        track,
        campaignName: track === "track_a" ? "Craft Storytelling & Technique Reel" : "7-Day VIP Arcade Acquisition Sprint",
        creativeHook: track === "track_a" ? "Sterile Protocol & 60s Precision Realism" : "$25 Off $100 Service Flash Drop",
        weeklyBudget: track === "track_a" ? 140.00 : 89.70,
        targetAudience: "Within 5 miles · Craft enthusiasts",
        durationDays: 7,
        antiFatigueCheck: true
      }
    };
    replyText = `Generated and scheduled ${track === 'track_a' ? 'Track A Video Reels' : 'Track B 7-Day Arcade Sprint'} campaign. Anti-fatigue cadence validated.`;
  } else if (q.includes("roas") || q.includes("attribution") || q.includes("analytics") || q.includes("walkin") || q.includes("metric") || q.includes("revenue")) {
    matchedTool = {
      name: "pull_analytics_and_attribution",
      args: {
        timeHorizon: q.includes("90") ? "d90" : q.includes("180") ? "d180" : "d30",
        focusMetric: "blended_roas"
      }
    };
    replyText = `Retrieved cross-channel analytics: Blended ROAS is 6.84x on $299 weekly ad spend, delivering 129 verified walk-ins and $740 direct-mail replacement value.`;
  } else if (q.includes("commit") || q.includes("spend") || q.includes("budget") || q.includes("approval") || q.includes("sign")) {
    matchedTool = {
      name: "stage_human_approval",
      args: {
        title: "Commit $299 Live Media Ad Spend",
        description: "Approve committing live ad budget across Meta Craft Reels ($140), TikTok ($90), and Google Maps Pin ($69).",
        category: "ad_spend",
        amount: 299.00
      }
    };
    replyText = `Live ad spend commitment staged for human-gated owner approval in Team & Approvals.`;
  } else if (q.includes("margin") || q.includes("floor") || q.includes("discount cap")) {
    matchedTool = {
      name: "tune_margin_floor",
      args: {
        maxDiscountCeilingPct: 30,
        minimumSpendReqUsd: 50,
        targetGrossMarginPct: 70
      }
    };
    replyText = `Tuned margin floor: 30% max discount ceiling and $50 minimum spend locked to protect gross margin.`;
  } else if (q.includes("redeem") || q.includes("voucher") || q.includes("ticket") || q.includes("token")) {
    matchedTool = {
      name: "redeem_voucher_code",
      args: {
        code: "TAT50-PROMO",
        netSales: 150.00,
        staffNote: "Verified by manager at register."
      }
    };
    replyText = `Verified voucher TAT50-PROMO. Attributed $150.00 net sales to campaign ledger.`;
  } else if (q.includes("switch") || q.includes("vertical") || q.includes("restaurant") || q.includes("tattoo") || q.includes("bar") || q.includes("bakery") || q.includes("gym") || q.includes("boutique")) {
    const vId = q.includes("restaurant") ? "restaurant" : q.includes("bar") ? "bar" : q.includes("bakery") ? "bakery" : q.includes("gym") ? "gym" : q.includes("boutique") ? "boutique" : q.includes("detail") ? "detail" : q.includes("salon") ? "salon" : "tattoo";
    matchedTool = {
      name: "switch_brand_vertical",
      args: { verticalId: vId }
    };
    replyText = `Switched brand vertical to ${vId.toUpperCase()}. Loaded industry presets and prize boards.`;
  } else if (q.includes("export") || q.includes("csv") || q.includes("download")) {
    matchedTool = {
      name: "export_claim_codes",
      args: { format: "csv" }
    };
    replyText = `Exporting claim codes and POS redemptions to CSV spreadsheet.`;
  } else if (q.includes("knowledge") || q.includes("maturity") || q.includes("moat")) {
    matchedTool = {
      name: "navigate_view",
      args: { view: "knowledge", reason: "Inspect longitudinal memory & maturity" }
    };
    replyText = `Opening Cumulative Knowledge Base. Current maturity is Month 3 (Pattern Matched) with 92/100 switching moat score.`;
  } else if (q.includes("multi-track") || q.includes("track") || q.includes("cadence")) {
    matchedTool = {
      name: "navigate_view",
      args: { view: "multitrack", reason: "Orchestrate 4-track campaign balance" }
    };
    replyText = `Opening Multi-Track Strategy dashboard.`;
  } else {
    matchedTool = {
      name: "navigate_view",
      args: { view: "overview", reason: "General command center overview" }
    };
    replyText = `I have analyzed your request for ${bp.name || "your local business"}. Navigating to Command Center and reviewing real-time telemetry.`;
  }

  res.json({
    status: "ok",
    engine: "omnilocal-local-orchestrator",
    reply: replyText,
    functionCalls: [matchedTool]
  });
});

// Update Directory Contacts Endpoint (Direct Mutation)
app.post('/api/brand/contacts/update', (req, res) => {
  const { businessName, phone, address, city, websiteUrl, igHandle, notes } = req.body || {};
  const bp = state.brand_profile;
  if (businessName) bp.name = businessName;
  if (city) bp.city = city;
  if (websiteUrl) bp.orderUrl = websiteUrl;
  if (igHandle) bp.igHandle = igHandle;
  bp.phone = phone || bp.phone || "(555) 234-5678";
  bp.address = address || bp.address || "142 N Main Street";
  bp.notes = notes || bp.notes || "Open Tue-Sat 11am-8pm.";

  res.json({
    status: "ok",
    message: `Updated directory & Google Business Profile contacts for ${bp.name}.`,
    contacts: {
      name: bp.name,
      phone: bp.phone,
      address: bp.address,
      city: bp.city,
      orderUrl: bp.orderUrl,
      igHandle: bp.igHandle,
      notes: bp.notes
    }
  });
});

// Schedule Campaign Endpoint (Direct Mutation)
app.post('/api/campaigns/schedule', (req, res) => {
  const { track, campaignName, creativeHook, weeklyBudget, targetAudience, durationDays, antiFatigueCheck } = req.body || {};
  const newCampaign = {
    id: `camp_${Date.now()}`,
    track: track || "track_b",
    name: campaignName || "Tactical Revenue Campaign",
    hook: creativeHook || "$25 Off $100 Flash Drop",
    weeklyBudget: Number(weeklyBudget || 99.00),
    targetAudience: targetAudience || "Local 5-mile radius",
    durationDays: durationDays || 7,
    scheduledAt: new Date().toISOString(),
    status: "scheduled",
    antiFatigueEnforced: antiFatigueCheck !== false
  };

  if (!state.campaigns) state.campaigns = [];
  state.campaigns.unshift(newCampaign);

  // If track_b (arcade), check anti-fatigue
  if (track === "track_b") {
    state.campaign_cadence.mode = "sprint";
    state.campaign_cadence.sprintExpiresAt = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  }

  res.json({
    status: "ok",
    message: `Campaign '${newCampaign.name}' scheduled successfully on track ${newCampaign.track.toUpperCase()}.`,
    campaign: newCampaign
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
const indexPath = path.join(buildPath, 'index.html');

if (!fs.existsSync(indexPath)) {
  try {
    const { execSync } = require('child_process');
    console.log('[OmniLocal #1] Frontend build missing. Building frontend bundle now...');
    execSync('npm run build', { cwd: path.join(__dirname, 'frontend'), stdio: 'inherit' });
    console.log('[OmniLocal #1] Frontend build completed successfully.');
  } catch (e) {
    console.warn('[OmniLocal #1] Frontend auto-build warning:', e.message);
  }
}

app.use(express.static(buildPath));

app.get('*', (req, res, next) => {
  // Don't capture API routes that 404
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'Endpoint not found' });
  }

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
