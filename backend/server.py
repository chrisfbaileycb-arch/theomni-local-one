"""
OmniLocal #1 — Unified Restaurant Revenue Engine (backend).

Phase 0 (Persistence): all application state lives in MongoDB (motor, async).
  A `state` collection stores singleton blobs (reports, connections, oauth_tokens,
  welcome_queue, current_batch, game_override, customers, calendar, brand_profile).
  Startup seeds any missing key so demos work, but real data now survives restarts.

Phase 1A (Real AI): the Content Director copywriter is a real Claude Sonnet 4.6 call
  (official Anthropic/OpenAI SDKs via ai.py, keyed by ANTHROPIC_API_KEY /
  OPENAI_API_KEY), grounded in a stored Brand Brain. Every generation is logged
  to the `ai_generations` collection. No template fallback.

Still stubbed (future phases): video critic metrics, ad-platform posting, Resend
  sending, Unified social OAuth, POS transaction feed (executioner still uses seeded
  weekly transactions until Phase 2).
"""

from fastapi import FastAPI, APIRouter, HTTPException, UploadFile, File, Form, Request
from fastapi.responses import Response
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import re
import json
import uuid
import random
import asyncio
import base64
import shutil
import tempfile
import subprocess
import logging
import requests
import imageio_ffmpeg
import segno
from zoneinfo import ZoneInfo
import io
import csv as csvmod
from fpdf import FPDF
from urllib.parse import quote
from pathlib import Path
from pydantic import BaseModel
from typing import List, Optional, Dict
from datetime import datetime, timezone, timedelta

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

app = FastAPI(title="OmniLocal #1 Revenue Engine")
api = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("omnilocal")

# ---------------------------------------------------------------------------
# MongoDB (motor, async) — Phase 0 persistence
# ---------------------------------------------------------------------------
mongo = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = mongo[os.environ["DB_NAME"]]

import ai  # noqa: E402
import auth  # noqa: E402
import payments  # noqa: E402
import google_business  # noqa: E402
auth.init(db)

AI_MODEL = ("anthropic", os.environ.get("AI_MODEL", "claude-sonnet-4-6"))


async def state_get(key, default=None):
    doc = await db.state.find_one({"_id": key})
    return doc["value"] if doc else default


async def state_set(key, value):
    await db.state.update_one({"_id": key}, {"$set": {"value": value}}, upsert=True)


# ---------------------------------------------------------------------------
# Brand Brain — default profile fed into every AI call (stored in DB)
# ---------------------------------------------------------------------------
DEFAULT_BRAND_PROFILE = {
    "name": "Nonna's Corner Deli",
    "city": "Springfield",
    "cuisine": "Italian-American deli",
    "signatureItem": "The Sunday Gravy Sub",
    "voice": ("Warm, proud, family-run and unpretentious. Speaks like a neighbor who loves "
              "feeding people — confident about quality, never corporate or salesy."),
    "menuHighlights": "Sunday Gravy Sub, house-pulled mozzarella, six-hour Sunday gravy, fresh-baked hero rolls",
    "backstory": "A three-generation family deli; recipes carried from Naples by Nonna herself.",
    "igHandle": "nonnascorner",
    "orderUrl": "https://order.nonnascorner.com",
}

# ===========================================================================
# CONTENT DIRECTOR — shooting prompts
# ===========================================================================
SHOOTING_PROMPTS = [
    {"id": "ingredient-story", "title": "Ingredient Story",
     "prompt": "Pick up the most interesting ingredient in your kitchen right now and tell us where it comes from — farm, supplier, region, or family connection.",
     "guidance": "Hold the ingredient in frame. Lead with the name before any backstory. Keep it under 60 seconds."},
    {"id": "operational-hustle", "title": "Operational Hustle",
     "prompt": "Walk us through one thing that happens before we open that customers never see — the prep, the ritual, the grind.",
     "guidance": "Film the actual action while you talk. Fast-moving hands read best on mobile."},
    {"id": "behind-the-counter-secret", "title": "Behind-the-Counter Secret",
     "prompt": "Share one technique, ratio, or decision that makes your dish different — something a regular might never guess.",
     "guidance": "Be specific: a temperature, a time, a tool. Vague secrets get skipped."},
    {"id": "community-gratitude", "title": "Community Gratitude",
     "prompt": "Thank a specific corner of your community — a supplier, a neighboring business, or the regulars who kept you open.",
     "guidance": "Name the person or business. Generic 'thanks everyone' posts underperform by 40% vs named shout-outs."},
    {"id": "demographic-pivot", "title": "Demographic Pivot",
     "prompt": "Describe one way you adapted a menu item or your hours to better serve a group in your neighborhood that others overlook.",
     "guidance": "Lead with the community, then the change. Avoid generalizations — be hyper-local."},
    {"id": "menu-focus", "title": "Menu Focus",
     "prompt": "Pick your single best-seller this week and explain — in one sentence — why a first-time guest should order it.",
     "guidance": "Say the item name in the first three seconds. Sell the outcome, not the process."},
    {"id": "staff-spotlight", "title": "Staff Spotlight",
     "prompt": "Introduce one team member: their name, how long they've been here, and one thing they do better than anyone else.",
     "guidance": "Get the team member on camera. Authenticity beats polish — a candid laugh outperforms a rehearsed line."},
    {"id": "honest-entrepreneur", "title": "Honest Entrepreneur",
     "prompt": "Share one genuine challenge you faced this month — a supplier issue, a slow week, a lesson learned — and how you moved through it.",
     "guidance": "Vulnerability is the hook. Let the struggle breathe for at least ten seconds."},
]


def daily_prompt(date_str: str) -> dict:
    h = 0
    for ch in date_str:
        h = (h * 31 + ord(ch)) & 0xFFFFFFFF
    return SHOOTING_PROMPTS[h % len(SHOOTING_PROMPTS)]


# ===========================================================================
# CONTENT DIRECTOR — transcript normalizer (light cleanup for display)
# ===========================================================================
STANDALONE_FILLERS = ["you know what i mean", "you know", "i mean", "so yeah",
                      "um", "uh", "hmm", "hm", "er", "ah"]


def normalize_transcript(verbatim: str) -> str:
    if not verbatim or not verbatim.strip():
        return ""
    text = verbatim
    for phrase in STANDALONE_FILLERS:
        text = re.sub(r"(?:,\s*|\s+|^)" + re.escape(phrase) + r"(?:\s*,|\s+|(?=[,.!?;:])|\s*$)",
                      " ", text, flags=re.IGNORECASE)
    text = re.sub(r",\s*like\s*,", ",", text, flags=re.IGNORECASE)
    text = re.sub(r"\b(\w+)((?:[,\s]+\1\b)+)", r"\1", text, flags=re.IGNORECASE)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\s*,\s*,", ",", text)
    text = re.sub(r"\s+([.!?;:,])", r"\1", text)
    return text.strip()


# ===========================================================================
# CONTENT DIRECTOR — Real AI copywriter (Claude Sonnet 4.6)
# ===========================================================================
def _parse_drafts(text: str) -> dict:
    t = (text or "").strip()
    if t.startswith("```"):
        t = re.sub(r"^```[a-zA-Z]*\n?", "", t)
        t = re.sub(r"\n?```$", "", t).strip()
    s, e = t.find("{"), t.rfind("}")
    if s != -1 and e != -1:
        t = t[s:e + 1]
    data = json.loads(t)
    return {"gbp": str(data.get("gbp", "")).strip(),
            "facebook": str(data.get("facebook", "")).strip(),
            "instagram": str(data.get("instagram", "")).strip()}


# ---------------------------------------------------------------------------
# CONTENT DIRECTOR GOVERNANCE — burst model, disclaimers, multi-industry pacing
# ---------------------------------------------------------------------------
OPERATIONAL_DISCLAIMER = (
    "WARNING / STRATEGIC NOTICE: Gamified promotions are designed to drive high-density engagement. "
    "Running continuous broad-spectrum promotions can dilute your brand value, lower customer response "
    "rates, and overwhelm staff and operations. We strongly recommend staggering campaigns across short, "
    "limited timeframes to maintain high campaign yield and protect service quality.")

INDUSTRY_PACING = {
    "restaurant": {
        "label": "Restaurant",
        "advisor": "Limit flash drops to off-peak hours and days (think Mon-Wed afternoons) to prevent kitchen bottlenecks. Protect Friday-Sunday service from promo surges.",
        "cadence": "2-3 day bursts, max one gamified campaign per week",
        "window": "Off-peak: Mon-Wed, 2-5pm drops",
        "rotation": "Social/SMS one week -> boxes, bags & local print QR the next",
    },
    "salon": {
        "label": "Salon / Spa",
        "advisor": "Stagger offers toward off-peak mid-week appointment slots (Tue-Thu) to protect weekend prime-time books.",
        "cadence": "2-day bursts targeting slow booking windows",
        "window": "Tue-Thu, late morning and early afternoon slots",
        "rotation": "Instagram/SMS one week -> in-mirror QR & partner shops the next",
    },
    "tattoo": {
        "label": "Tattoo Parlor",
        "advisor": "Point bursts at mid-week walk-in gaps and flash-sheet days; keep weekend appointment books full-price.",
        "cadence": "Limited-window runs (48-72h flash drops)",
        "window": "Tue-Thu walk-in hours",
        "rotation": "Instagram one week -> shop-window QR & local print the next",
    },
    "auto_repair": {
        "label": "Auto Repair",
        "advisor": "Focus bursts around seasonal maintenance checks (tires, AC, brakes) and low-bay-utilization days.",
        "cadence": "Seasonal pushes plus 2-3 day mid-week bursts",
        "window": "Low-bay days: typically Tue-Wed",
        "rotation": "SMS/Google one week -> counter QR & mailers the next",
    },
    "contractor": {
        "label": "Service Contractor",
        "advisor": "Focus bursts around seasonal maintenance windows and shoulder-season gaps; avoid peak-project months.",
        "cadence": "Seasonal bursts, 1-2 weeks before demand spikes",
        "window": "Shoulder seasons and slow scheduling weeks",
        "rotation": "Google/SMS one week -> door hangers & yard-sign QR the next",
    },
    "real_estate": {
        "label": "Real Estate Agent",
        "advisor": "Focus bursts around listing launches and open-house weekends - tease a lead-gen game 2-3 days before each open house and protect weekend showings from unrelated promos.",
        "cadence": "Burst 2-3 days ahead of each listing launch or open house",
        "window": "Thu-Fri teasers before weekend tours",
        "rotation": "Facebook/Instagram one week -> yard-sign QR & postcard farming the next",
    },
    "saas": {
        "label": "Software / SaaS",
        "advisor": "Focus bursts around demo days, launches, trade shows and niche community events - tease a giveaway or trial-upgrade game 2-3 days ahead, then go quiet and follow up with signups.",
        "cadence": "2-3 day bursts around launches, events and demo pushes",
        "window": "Tue-Thu business hours, when decision-makers are at their desks",
        "rotation": "LinkedIn/Facebook one week -> event-flyer QR & partner newsletters the next",
    },
}

DEFAULT_INDUSTRIES = [{"id": k, **v} for k, v in INDUSTRY_PACING.items()]

DEFAULT_STRATEGY = {
    "industry": "restaurant",
    "videos": [
        {"id": "flash-campaigns", "title": "How to Run High-Converting Flash Campaigns", "youtubeUrl": ""},
        {"id": "rules-of-engagement", "title": "Rules of Engagement for Gamification", "youtubeUrl": ""},
    ],
}


def _governance_directive(ind: dict) -> str:
    return ("GOVERNANCE - Limited-Run Burst Model (enforce in every recommendation, schedule and copy): "
            "never recommend continuous, non-stop gamified promotions; limit high-friction gamification "
            "campaigns to short targeted bursts of 2-3 specific days per week or limited-window runs; "
            "rotate promotional channels week to week (e.g. social/SMS one week, local print/QR the next) "
            f"instead of hitting every platform simultaneously. Industry pacing ({ind['label']}): {ind['advisor']}")


async def _get_industries():
    return await state_get("industries", DEFAULT_INDUSTRIES)


async def _current_industry():
    strat = await state_get("strategy", DEFAULT_STRATEGY)
    inds = await _get_industries()
    return next((i for i in inds if i["id"] == strat.get("industry")), inds[0])


async def _governance_text() -> str:
    return _governance_directive(await _current_industry())


async def ai_generate_drafts(transcript: str, brand: dict) -> dict:
    ind = await _current_industry()
    gov = _governance_directive(ind)
    system = (
        f"You are the expert social media copywriter for {brand.get('name')}, a "
        f"{brand.get('cuisine', 'local')} {ind['label'].lower()} in {brand.get('city')}. "
        f"Write everything in this exact brand voice: {brand.get('voice')}. "
        f"Signature item: {brand.get('signatureItem')}. Menu highlights: {brand.get('menuHighlights')}. "
        f"Backstory: {brand.get('backstory')}. Never sound corporate, generic, or templated. "
        f"{gov} "
        "You always respond with ONLY valid minified JSON — no markdown, no commentary."
    )
    prompt = (
        f'The owner just recorded this rough note (verbatim):\n"""{transcript}"""\n\n'
        "Turn it into three genuinely different, platform-native posts:\n"
        f"- gbp: a Google Business Profile local post — concrete, locally relevant, one clear "
        f"call to action, and include the order link {brand.get('orderUrl')}.\n"
        "- facebook: a warm, story-driven post that invites engagement and ends with a question.\n"
        f"- instagram: a punchy caption with short lines and 5-7 relevant local hashtags; "
        f"mention @{brand.get('igHandle')}.\n\n"
        'Return ONLY JSON in this exact shape: {"gbp":"...","facebook":"...","instagram":"..."}'
    )
    text = await asyncio.wait_for(
        ai.claude_complete(system=system, prompt=prompt, model=AI_MODEL[1]), timeout=45)
    return _parse_drafts(text)


# ===========================================================================
# CONTENT DIRECTOR — Brutal Honesty Video Critic (deterministic; Phase 1B later)
# ===========================================================================
GRADE_RANK = {"WEAK": 0, "MODERATE": 1, "IMPROVABLE": 2, "STRONG": 3}


def _score_hook(h):
    if not h["startsWithAction"] or h["secondsBeforeSubject"] > 2:
        secs = int(h["secondsBeforeSubject"]) + 1
        return {"grade": "WEAK",
                "critique": f'Your hook does not grab attention. "{h["firstWords"]}" is not an action opener — viewers scroll past in under 2 seconds.',
                "recommendation": f"Cut the first {secs}s. Start mid-action or lead with the single most interesting word. The subject must appear within 2 seconds."}
    if h["secondsBeforeSubject"] > 1:
        return {"grade": "IMPROVABLE",
                "critique": f'Action opener detected but the subject arrives at {h["secondsBeforeSubject"]:.1f}s — borderline. Some of your audience will drop off.',
                "recommendation": "Trim the opening by half a second so the subject is visible immediately after the action word."}
    return {"grade": "STRONG", "critique": "Hook opens with action and subject is on screen within 1 second. This is correct.",
            "recommendation": "Maintain this pattern on every clip."}


def _score_audio(a):
    snr = a["avgLoudnessDb"] - a["backgroundNoiseDb"]
    if snr <= 10:
        return {"grade": "MODERATE",
                "critique": f"Background noise ({a['backgroundNoiseDb']} dBFS) is within {snr:.0f} dB of your voice. Likely culprit: an exhaust fan or kitchen equipment nearby.",
                "recommendation": "Turn off the exhaust fan while filming, or move 10 feet away. Noise ruins perceived production value."}
    if a["energy"] == "flat":
        return {"grade": "IMPROVABLE", "critique": "Audio energy is flat. Your delivery sounds monotone, which loses viewers even when the content is good.",
                "recommendation": "Add vocal variation: speed up on exciting details, pause before key words, let enthusiasm into your voice."}
    return {"grade": "STRONG", "critique": "Voice is clearly above background noise and energy is readable. Audio passes.",
            "recommendation": "Keep the exhaust off during filming and maintain this energy level."}


def _score_framing(f):
    if f["subjectLit"] == "back":
        return {"grade": "IMPROVABLE", "critique": "You are back-lit. The camera sees the bright window behind you, turning your face into a silhouette.",
                "recommendation": "Step toward the window light so it falls on your face. Natural front-lighting is free and looks professional."}
    if f["subjectCutOff"]:
        return {"grade": "WEAK", "critique": "Part of the subject is cut off frame. Viewers notice something is wrong even if they can't name it.",
                "recommendation": "Step back until the full subject — head to waist minimum — is in frame with a small buffer at each edge."}
    if f["clutterScore"] > 0.6:
        return {"grade": "MODERATE", "critique": f"Background clutter is {f['clutterScore']*100:.0f}% — too much visual noise competes with the subject.",
                "recommendation": "Clear a 3-foot zone behind you: move boxes, bins, or random equipment out of shot."}
    if f["subjectLit"] == "side":
        return {"grade": "IMPROVABLE", "critique": "Side lighting creates harsh shadows on half the face. Acceptable but not ideal for talking-head content.",
                "recommendation": "Rotate 45° toward the light source for a soft 3/4 front-light instead of a hard side split."}
    return {"grade": "STRONG", "critique": "Subject is front-lit, fully in frame, and the background is clean. Framing passes.",
            "recommendation": "Keep this setup as your default for all talking-head clips."}


def score_video(a: dict) -> dict:
    hook, audio, framing = _score_hook(a["hook"]), _score_audio(a["audio"]), _score_framing(a["framing"])
    overall = min([hook["grade"], audio["grade"], framing["grade"]], key=lambda g: GRADE_RANK[g])
    return {"filename": a["filename"], "hook": hook, "audio": audio, "framing": framing, "overall": overall}


SAMPLE_VIDEOS = [
    {"filename": "dinner-rush-sub.mov", "label": "Cook building the Sunday Gravy Sub (dinner rush)",
     "hook": {"startsWithAction": True, "firstWords": "Watch this", "secondsBeforeSubject": 0.8},
     "audio": {"avgLoudnessDb": -12, "backgroundNoiseDb": -34, "energy": "high"},
     "framing": {"subjectLit": "front", "subjectCutOff": False, "clutterScore": 0.2}},
    {"filename": "owner-intro.mov", "label": "Owner intro filmed by the front window",
     "hook": {"startsWithAction": False, "firstWords": "Um, hi everyone, so today", "secondsBeforeSubject": 4.5},
     "audio": {"avgLoudnessDb": -18, "backgroundNoiseDb": -24, "energy": "flat"},
     "framing": {"subjectLit": "back", "subjectCutOff": False, "clutterScore": 0.4}},
    {"filename": "menu-tour.mov", "label": "Quick menu tour behind the counter",
     "hook": {"startsWithAction": True, "firstWords": "Here's the special", "secondsBeforeSubject": 1.4},
     "audio": {"avgLoudnessDb": -14, "backgroundNoiseDb": -30, "energy": "moderate"},
     "framing": {"subjectLit": "side", "subjectCutOff": True, "clutterScore": 0.7}},
]

ASSET_VAULT = [
    {"id": "av1", "title": "Chef plating during service", "category": "Signature Prep", "clips": 12},
    {"id": "av2", "title": "Fresh dough at 6am", "category": "Operational Hustle", "clips": 8},
    {"id": "av3", "title": "Regulars at the counter", "category": "Community", "clips": 15},
    {"id": "av4", "title": "Happy Birthday evergreen", "category": "Evergreen / Holidays", "clips": 5},
    {"id": "av5", "title": "Thanksgiving thank-you", "category": "Evergreen / Holidays", "clips": 4},
    {"id": "av6", "title": "The Sunday Gravy Sub build", "category": "Hero Product", "clips": 9},
]

# ===========================================================================
# QUALITY CONTENT EXECUTIONER — strategies + closed-loop budget engine
# ===========================================================================
STRATEGY_A = {"id": "A", "displayName": "Paid Local Velocity", "prefix": "STRATA",
              "channels": ["facebook_act_now_ads", "google_maps_pin_boost"]}
STRATEGY_B = {"id": "B", "displayName": "Organic Community Outreach", "prefix": "STRATB",
              "channels": ["gbp_organic_boost", "local_story_drip"]}
CHANNEL_LABELS = {
    "facebook_act_now_ads": "Facebook Act-Now Ads", "google_maps_pin_boost": "Google Maps Pin Boost",
    "gbp_organic_boost": "Google Business Profile", "local_story_drip": "Local Story Drip (Reels)",
    "tiktok_spark_ads": "TikTok Spark Ads", "youtube_shorts": "YouTube Shorts",
}
WEEKLY_BUDGET = 299.0


def _round(n):
    return round(n + 1e-9, 2)


def _split(channels, dollars):
    c = len(channels)
    base = round(dollars / c, 2)
    alloc, running = {}, 0.0
    for i, ch in enumerate(channels):
        if i == c - 1:
            alloc[ch] = _round(dollars - running)
        else:
            alloc[ch] = base
            running += base
    return alloc


def _strategy_alloc(share, total, channels):
    dollars = _round(share * total)
    return {"share": share, "dollars": dollars, "perChannel": _split(channels, dollars)}


def build_allocation(week_of, share_a, total=WEEKLY_BUDGET):
    return {"weekOf": week_of, "totalBudget": total,
            "strategyA": _strategy_alloc(share_a, total, STRATEGY_A["channels"]),
            "strategyB": _strategy_alloc(_round(1 - share_a), total, STRATEGY_B["channels"])}


def _metrics(txs, prefix, spend):
    attributed = [t for t in txs if (t.get("promo_code") or "").startswith(prefix)]
    customers = {t["customer_id"] for t in attributed if t.get("customer_id")}
    revenue = _round(sum(t["net_sales"] for t in attributed))
    new_customers = len(customers)
    cac = _round(spend / new_customers) if new_customers else None
    roas = _round(revenue / spend) if spend else 0
    clicks = sum(t.get("clicks", 0) for t in attributed) or len(attributed) * 14
    return {"newCustomers": new_customers, "revenue": revenue, "cac": cac,
            "roas": roas, "clicks": clicks, "conversions": len(attributed), "spend": spend}


def _zip_breakdown(txs):
    m = {}
    for t in txs:
        z = t.get("postal_code")
        if not z:
            continue
        m.setdefault(z, {"customers": 0, "revenue": 0.0})
        if t.get("customer_id"):
            m[z]["customers"] += 1
        m[z]["revenue"] = _round(m[z]["revenue"] + t["net_sales"])
    return m


def _decide(ma, mb):
    if ma["cac"] is None and mb["cac"] is None:
        return {"winner": "tie", "winnerShare": 0.5}
    if ma["cac"] is None:
        return {"winner": "B", "winnerShare": 0.7}
    if mb["cac"] is None:
        return {"winner": "A", "winnerShare": 0.7}
    return {"winner": "A" if ma["roas"] >= mb["roas"] else "B", "winnerShare": 0.7}


def _seed_week_txs(week_index, share_a):
    rng = random.Random(1000 + week_index)
    zips = ["01103", "01104", "01108", "01109", "01118"]
    txs = []
    spend_a = share_a * WEEKLY_BUDGET
    spend_b = (1 - share_a) * WEEKLY_BUDGET
    a_orders = int(spend_a / 4.4) + week_index
    b_orders = int(spend_b / 7.2)
    for i in range(a_orders):
        txs.append({"promo_code": f"STRATA-{rng.randint(1000,9999)}", "customer_id": f"A{week_index}-{i}",
                    "net_sales": _round(rng.uniform(16, 42)), "postal_code": rng.choice(zips),
                    "clicks": rng.randint(8, 24)})
    for i in range(b_orders):
        txs.append({"promo_code": f"STRATB-{rng.randint(1000,9999)}", "customer_id": f"B{week_index}-{i}",
                    "net_sales": _round(rng.uniform(12, 30)), "postal_code": rng.choice(zips),
                    "clicks": rng.randint(4, 12)})
    return txs, _round(spend_a), _round(spend_b)


def _monday(offset_weeks=0):
    d = datetime.now(timezone.utc)
    monday = d - timedelta(days=d.weekday()) + timedelta(weeks=offset_weeks)
    return monday.strftime("%Y-%m-%d")


INITIAL_WEEKS = 3


def build_reports_history(num_weeks=INITIAL_WEEKS):
    reports = []
    share_a = 0.5
    for w in range(num_weeks):
        week_of = _monday(-(num_weeks - 1 - w))
        txs, spend_a, spend_b = _seed_week_txs(w, share_a)
        alloc = build_allocation(week_of, share_a)
        ma = _metrics(txs, "STRATA", alloc["strategyA"]["dollars"])
        mb = _metrics(txs, "STRATB", alloc["strategyB"]["dollars"])
        decision = _decide(ma, mb)
        reports.append({
            "weekOf": week_of, "allocation": alloc,
            "metrics": {"strategyA": ma, "strategyB": mb},
            "decision": decision, "zipBreakdown": _zip_breakdown(txs),
            "totalRevenue": _round(ma["revenue"] + mb["revenue"]),
            "totalSpend": alloc["totalBudget"],
            "blendedRoas": _round((ma["revenue"] + mb["revenue"]) / alloc["totalBudget"]),
            "dataSource": "demo",
        })
        if decision["winner"] == "A":
            share_a = min(0.8, _round(share_a + 0.075))
        elif decision["winner"] == "B":
            share_a = max(0.2, _round(share_a - 0.075))
    return reports


# ===========================================================================
# QUALITY CUSTOMER MAXIMIZER — odds, RFMD, drip
# ===========================================================================
DEFAULT_PRIZE_BOARD = {
    "goodPrizes": [
        {"label": "Free Sub (BOGO)", "posCode": ""},
        {"label": "30% Off Your Order", "posCode": ""},
        {"label": "Free Side & Drink", "posCode": ""},
        {"label": "20% Off Your Order", "posCode": ""},
    ],
    "dudPrize": {"label": "10% Off Your Order", "posCode": ""},
}


def spin(is_new_guest: bool, segment: str = "new", board: dict = None):
    """Everybody wins. Identified coupon abusers (promo_pool) get the owner's dud;
    everyone else spins randomly across the owner-defined good prizes (slot 1 = headline)."""
    board = board or DEFAULT_PRIZE_BOARD
    rng = random.Random()
    if segment == "promo_pool":
        slot, tier = board["dudPrize"], "standard"
    else:
        good = board.get("goodPrizes") or [board["dudPrize"]]
        idx = rng.randrange(len(good))
        slot, tier = good[idx], ("highValue" if idx == 0 else "standard")
    prefix = "HV-" if tier == "highValue" else "ST-"
    code = prefix + "".join(rng.choice("ABCDEFGHJKLMNPQRSTUVWXYZ23456789") for _ in range(6))
    return {"tier": tier, "reward": slot["label"], "posCode": (slot.get("posCode") or "").strip() or None,
            "couponCode": code, "segment": segment, "guestType": "new" if is_new_guest else "repeat"}


def _seed_customers():
    rng = random.Random(42)
    names = ["Maria G.", "Tom R.", "The Ferris Family", "Dave K.", "Sofia L.", "Ahmed N.",
             "Jenna W.", "Carlos M.", "Priya S.", "The Book Club", "Wes T.", "Grace H.",
             "Leo P.", "Nadia F.", "Sam O."]
    custs = []
    for i, name in enumerate(names):
        custs.append({"customerId": f"C{i}", "name": name, "frequency": rng.randint(1, 14),
                      "avgTicket": _round(rng.uniform(14, 55)),
                      "sensitivity": _round(rng.choice([0.0, 0.1, 0.2, 0.6, 0.8])),
                      "daysSinceLast": rng.randint(1, 58)})
    return custs


def rfmd_segment(customers):
    freqs = [c["frequency"] for c in customers]
    tickets = [c["avgTicket"] for c in customers]
    fmin, fmax = min(freqs), max(freqs)
    tmin, tmax = min(tickets), max(tickets)

    def nrm(v, lo, hi):
        return 0 if hi == lo else (v - lo) / (hi - lo)
    rows = []
    for c in customers:
        fn = nrm(c["frequency"], fmin, fmax)
        vn = nrm(c["avgTicket"], tmin, tmax)
        s = c["sensitivity"]
        rn = max(0, (60 - c["daysSinceLast"]) / 60)
        score = _round(0.3 * fn + 0.3 * vn - 0.4 * s + 0.1 * rn)
        seg = "promo_pool" if s >= 0.70 else ("vip" if score >= 0.35 else "standard")
        row = {**c, "score": score, "segment": seg}
        if seg == "vip":
            row["posNote"] = "VIP Account. Sincere thanks upon checkout. Direct table preference."
        rows.append(row)
    rows.sort(key=lambda r: r["score"], reverse=True)
    return rows


def drip_schedule(total_leads=90, days=30):
    daily = -(-total_leads // days)
    released = min(daily * 12, total_leads)
    return {"totalLeads": total_leads, "days": days, "dailyRate": daily,
            "releasedSoFar": released, "remaining": total_leads - released, "revealAtSeconds": 14,
            "steps": [{"day": d + 1, "released": min(daily, max(0, total_leads - daily * d))} for d in range(days)]}


# ===========================================================================
# CONNECTIONS + distribution pathways + OAuth handshake (stubbed)
# ===========================================================================
PLATFORMS = [
    {"id": "facebook", "label": "Facebook", "default": True},
    {"id": "instagram", "label": "Instagram / Reels", "default": True},
    {"id": "google", "label": "Google Business & Maps", "default": True},
    {"id": "tiktok", "label": "TikTok", "default": False},
    {"id": "youtube", "label": "YouTube", "default": False},
]
CHANNEL_PLATFORM = {
    "facebook_act_now_ads": "facebook", "google_maps_pin_boost": "google",
    "tiktok_spark_ads": "tiktok", "gbp_organic_boost": "google",
    "local_story_drip": "instagram", "youtube_shorts": "youtube",
}
STRATEGY_POTENTIAL = {
    "A": {"displayName": "Paid Local Velocity",
          "channels": ["facebook_act_now_ads", "google_maps_pin_boost", "tiktok_spark_ads"]},
    "B": {"displayName": "Organic Community Outreach",
          "channels": ["gbp_organic_boost", "local_story_drip", "youtube_shorts"]},
}
DISTRIBUTION_PATHWAYS = [
    {"platform": "google", "label": "Google Business Profile (Maps)", "surface": "GBP Post",
     "contentType": "post", "scope": "business.manage"},
    {"platform": "facebook", "label": "Facebook Reels", "surface": "Reel",
     "contentType": "video", "scope": "pages_manage_posts,pages_read_engagement"},
    {"platform": "instagram", "label": "Instagram Reels", "surface": "Reel",
     "contentType": "video", "scope": "instagram_content_publish"},
    {"platform": "tiktok", "label": "TikTok", "surface": "Short Video",
     "contentType": "video", "scope": "video.publish"},
    {"platform": "youtube", "label": "YouTube Shorts", "surface": "Short",
     "contentType": "video", "scope": "youtube.upload"},
]
UNIFIED_PROVIDER = os.environ.get("UNIFIED_SOCIAL_PROVIDER", "unified_api")
UNIFIED_API_KEY = os.environ.get("UNIFIED_API_KEY")


def _connections_payload(connections, tokens):
    return {
        "platforms": [{**p, "connected": connections[p["id"]], "authorized": p["id"] in tokens,
                       "authMode": tokens.get(p["id"], {}).get("mode")} for p in PLATFORMS],
        "connectedCount": sum(1 for v in connections.values() if v),
        "provider": UNIFIED_PROVIDER, "liveOAuth": bool(UNIFIED_API_KEY),
    }


def recommended_plan(reports, connections, total=WEEKLY_BUDGET):
    share_a = reports[-1]["allocation"]["strategyA"]["share"]
    conn = {ch: connections.get(CHANNEL_PLATFORM[ch], False) for ch in CHANNEL_PLATFORM}
    cA = [c for c in STRATEGY_POTENTIAL["A"]["channels"] if conn[c]]
    cB = [c for c in STRATEGY_POTENTIAL["B"]["channels"] if conn[c]]
    exA = [c for c in STRATEGY_POTENTIAL["A"]["channels"] if not conn[c]]
    exB = [c for c in STRATEGY_POTENTIAL["B"]["channels"] if not conn[c]]
    sa = share_a if (cA and cB) else (1.0 if cA else 0.0)

    def strat(chs, dollars):
        return {"dollars": _round(dollars), "perChannel": _split(chs, dollars) if chs else {}}
    dollars_a = _round(sa * total)
    dollars_b = _round(total - dollars_a)
    connected_count = sum(1 for v in connections.values() if v)
    return {
        "totalBudget": total, "connectedCount": connected_count,
        "strategyA": {"displayName": STRATEGY_POTENTIAL["A"]["displayName"], "share": _round(sa),
                      **strat(cA, dollars_a), "excludedChannels": [{"channel": c, "label": CHANNEL_LABELS[c],
                       "platform": CHANNEL_PLATFORM[c]} for c in exA]},
        "strategyB": {"displayName": STRATEGY_POTENTIAL["B"]["displayName"], "share": _round(1 - sa),
                      **strat(cB, dollars_b), "excludedChannels": [{"channel": c, "label": CHANNEL_LABELS[c],
                       "platform": CHANNEL_PLATFORM[c]} for c in exB]},
        "warning": None if (cA or cB) else "No platforms connected — connect at least one to run campaigns.",
        "diversificationTip": ("Connect 3–4 platforms for the widest reach — people are creatures of habit and "
                               "live on one channel ~80% of the time.") if connected_count < 3 else None,
    }


# ===========================================================================
# CODE SYSTEM — weekly probability-weighted redemption batches
# ===========================================================================
CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
REWARD_POOL = [
    {"tier": "grand", "reward": "Free Sub (BOGO)", "weight": 8, "variants": 3},
    {"tier": "high", "reward": "30% Off", "weight": 17, "variants": 4},
    {"tier": "mid", "reward": "20% Off", "weight": 30, "variants": 4},
    {"tier": "low", "reward": "Free Fountain Drink", "weight": 45, "variants": 3},
]


def _gen_code(length, rng):
    return "".join(rng.choice(CODE_ALPHABET) for _ in range(length))


def generate_batch(length=8, week_of=None):
    if length not in (4, 8, 10, 11):
        length = 8
    week_of = week_of or _monday(0)
    rng = random.Random()
    tiers, all_codes = [], {}
    total_weight = sum(t["weight"] for t in REWARD_POOL)
    for t in REWARD_POOL:
        codes = []
        while len(codes) < t["variants"]:
            c = _gen_code(length, rng)
            if c not in all_codes:
                codes.append(c)
                all_codes[c] = {"tier": t["tier"], "reward": t["reward"]}
        tiers.append({"tier": t["tier"], "reward": t["reward"],
                      "probability": _round(t["weight"] / total_weight), "codes": codes})
    expires = (datetime.strptime(week_of, "%Y-%m-%d") + timedelta(days=7)).strftime("%Y-%m-%d")
    return {"weekOf": week_of, "length": length, "issuedAt": week_of, "expiresAt": expires,
            "tiers": tiers, "allCodes": all_codes, "totalCodes": len(all_codes)}


def _sample_csv(batch):
    rng = random.Random(7)
    codes = list(batch["allCodes"].keys())
    picked = rng.sample(codes, max(1, int(len(codes) * 0.6)))
    lines = ["promo_code,net_sales"]
    for c in picked:
        lines.append(f"{c},{_round(rng.uniform(12, 44))}")
    lines.append(f"{_gen_code(batch['length'], rng)},22.00")
    lines.append(f"{_gen_code(batch['length'], rng)},18.50")
    return "\n".join(lines)


def reconcile_csv(csv_text, batch):
    issued = batch["allCodes"]
    redeemed, invalid, revenue = 0, 0, 0.0
    by_tier, rows = {}, []
    for i, line in enumerate(csv_text.strip().splitlines()):
        parts = [p.strip() for p in line.split(",")]
        if len(parts) < 2:
            continue
        code, amt_s = parts[0], parts[1]
        if i == 0 and not amt_s.replace(".", "").isdigit():
            continue
        try:
            amt = float(amt_s)
        except ValueError:
            continue
        if code in issued:
            redeemed += 1
            revenue = _round(revenue + amt)
            tier = issued[code]["tier"]
            by_tier[tier] = by_tier.get(tier, 0) + 1
            rows.append({"code": code, "net_sales": _round(amt), "reward": issued[code]["reward"], "valid": True})
        else:
            invalid += 1
            rows.append({"code": code, "net_sales": _round(amt), "reward": "—", "valid": False})
    total_issued = len(issued)
    return {"issued": total_issued, "redeemed": redeemed, "invalid": invalid,
            "redemptionRate": _round(redeemed / total_issued) if total_issued else 0,
            "revenue": revenue, "byTier": by_tier, "rows": rows}


# ===========================================================================
# QUALITY CUSTOMER MAXIMIZER — 4 rotating games (30-day cycle)
# ===========================================================================
GAMES = [
    {"id": "spin_wheel", "name": "Scan-to-Spin Wheel", "mechanic": "wheel",
     "tagline": "Spin the wheel to reveal your reward.", "month": 1},
    {"id": "scratch_card", "name": "Scratch-to-Win Card", "mechanic": "scratch",
     "tagline": "Scratch the card to uncover your prize.", "month": 2},
    {"id": "mystery_box", "name": "Mystery Prize Vault", "mechanic": "box",
     "tagline": "Choose a vault, unlock a surprise.", "month": 3},
    {"id": "lucky_slots", "name": "Lucky Match Slots", "mechanic": "slots",
     "tagline": "Match three symbols to win big.", "month": 4},
]


def active_game(override):
    if override:
        g = next((x for x in GAMES if x["id"] == override), None)
        if g:
            return {**g, "source": "admin_override"}
    idx = (int(datetime.now(timezone.utc).timestamp()) // (60 * 60 * 24 * 30)) % len(GAMES)
    return {**GAMES[idx], "source": "auto_rotation"}


# ===========================================================================
# WEEKLY CUSTOMER CSV IMPORT — segmentation + welcome trigger
# ===========================================================================
OWNER_VIDEO_URL = os.environ.get(
    "OWNER_WELCOME_VIDEO_URL",
    "https://storage.googleapis.com/omnilocal-assets/owner-welcome-7s.mp4")
WELCOME_SCRIPT = ("Thank you for enrolling and being a part of our rewards program. I'm the owner — "
                  "small businesses are a dying breed, so your support truly matters. Thank you.")


def _segment_customer(visits: int, coupon_ratio: float) -> str:
    if visits <= 1:
        return "new"
    if coupon_ratio >= 0.6:
        return "coupon_only"
    return "loyal"


# ===========================================================================
# LOCAL MARKET INTELLIGENCE — seeded events computed fresh each request
# ===========================================================================
def get_local_events():
    now = datetime.now(timezone.utc)
    defs = [
        {"title": "Regional Youth Baseball Tournament", "category": "sports", "inDays": 4,
         "venue": "Springfield Sports Complex", "distanceMiles": 1.2, "expectedAttendance": 2400,
         "channel": "google_maps_pin_boost", "budgetShift": 60,
         "rationale": "Thousands of out-of-town families will search 'food near me' on Google Maps between games — capture that intent.",
         "contentIdea": "Post a 'Game-Day Sub Combo' offer + a 20s 'fuel up before the first pitch' Reel."},
        {"title": "Downtown Summer Music Festival", "category": "festival", "inDays": 8,
         "venue": "Main Street Green", "distanceMiles": 0.6, "expectedAttendance": 5000,
         "channel": "facebook_act_now_ads", "budgetShift": 45,
         "rationale": "A hyper-local crowd within walking distance — a Facebook Act-Now radius ad converts foot traffic tonight.",
         "contentIdea": "Run a 'festival late-night menu' story and a limited 2-hour post-show discount."},
        {"title": "Saturday Farmers Market", "category": "market", "inDays": 2,
         "venue": "City Hall Plaza", "distanceMiles": 0.9, "expectedAttendance": 1200,
         "channel": "gbp_organic_boost", "budgetShift": 15,
         "rationale": "Regular local foot traffic — an organic Google Business Profile post keeps you top-of-mind for the market crowd.",
         "contentIdea": "Behind-the-counter clip: 'we shop this market too' — tie your ingredients to a local vendor."},
        {"title": "High School Homecoming Game", "category": "sports", "inDays": 12,
         "venue": "Springfield High Stadium", "distanceMiles": 2.1, "expectedAttendance": 3200,
         "channel": "google_maps_pin_boost", "budgetShift": 40,
         "rationale": "Pre- and post-game hunger spikes; families search nearby dining — own the Maps pin that weekend.",
         "contentIdea": "'Team-color combo' post + a family-4-pack deal promoted the day before."},
        {"title": "Craft Beer & Food Truck Night", "category": "community", "inDays": 16,
         "venue": "Riverside Lot", "distanceMiles": 1.7, "expectedAttendance": 900,
         "channel": "local_story_drip", "budgetShift": 20,
         "rationale": "Foodie-leaning local audience — an Instagram/Reels story drip builds anticipation without heavy spend.",
         "contentIdea": "Tease a one-night-only menu item; drive saves and shares with a countdown sticker."},
    ]
    events = []
    for i, d in enumerate(defs):
        date = now + timedelta(days=d["inDays"])
        events.append({"id": f"evt-{i}", "date": date.strftime("%Y-%m-%d"), "daysAway": d["inDays"],
                       "channelLabel": CHANNEL_LABELS.get(d["channel"], d["channel"]), **d})
    events = sorted(events, key=lambda e: e["daysAway"])
    upcoming = [e for e in events if e["daysAway"] <= 14]
    top = max(events, key=lambda e: e["expectedAttendance"])
    total_shift = min(sum(e["budgetShift"] for e in upcoming), 80)
    return {"events": events, "provider": "seeded_local_events",
            "insight": {"upcomingCount": len(upcoming), "topEvent": top["title"],
                        "recommendedChannel": top["channelLabel"], "suggestedShiftPct": total_shift,
                        "headline": (f"{len(upcoming)} high-traffic events within 14 days — "
                                     f"shift ~{total_shift}% of budget toward {top['channelLabel']}.")}}


# ===========================================================================
# CONTENT CALENDAR — operates on a persisted `calendar` state dict
# ===========================================================================
CAL_SURFACES = ["Instagram Reels", "Facebook Reels", "GBP Post", "TikTok", "YouTube Shorts"]


def _cal_week_events(events, monday_str):
    mon = datetime.strptime(monday_str, "%Y-%m-%d").date()
    return [e for e in events
            if mon <= datetime.strptime(e["date"], "%Y-%m-%d").date() <= mon + timedelta(days=6)]


def _cal_populate_week(cal, events, monday_str, week_seed):
    mon = datetime.strptime(monday_str, "%Y-%m-%d")
    for i, (off, time) in enumerate([(0, "10:00"), (2, "12:30"), (4, "17:00")]):
        day = (mon + timedelta(days=off)).strftime("%Y-%m-%d")
        prompt = SHOOTING_PROMPTS[(week_seed * 3 + i) % len(SHOOTING_PROMPTS)]
        cal["posts"].setdefault(day, []).append({
            "id": f"p-{day}-{i}", "date": day, "time": time, "title": prompt["title"],
            "idea": prompt["prompt"], "surface": CAL_SURFACES[(week_seed * 3 + i) % len(CAL_SURFACES)],
            "source": "prompt", "status": "planned"})
    for e in _cal_week_events(events, monday_str):
        ed = datetime.strptime(e["date"], "%Y-%m-%d")
        promo = ed - timedelta(days=1)
        if promo < mon:
            promo = ed
        day = promo.strftime("%Y-%m-%d")
        cal["posts"].setdefault(day, []).append({
            "id": f"evt-post-{e['id']}", "date": day, "time": "09:00",
            "title": f"Promote: {e['title']}", "idea": e["contentIdea"],
            "surface": e["channelLabel"], "source": "event", "status": "planned", "eventId": e["id"]})


def _cal_seed():
    events = get_local_events()["events"]
    cal = {"weeks": [], "posts": {}}
    for w in range(2):
        m = _monday(w)
        cal["weeks"].append(m)
        _cal_populate_week(cal, events, m, w)
    return cal


def _week_label(mon):
    return f"{mon.strftime('%b %d')} – {(mon + timedelta(days=6)).strftime('%b %d')}"


def _cal_payload(cal):
    weeks = []
    for m in cal["weeks"]:
        mon = datetime.strptime(m, "%Y-%m-%d")
        days = []
        for d in range(7):
            dd = mon + timedelta(days=d)
            ds = dd.strftime("%Y-%m-%d")
            days.append({"date": ds, "weekday": dd.strftime("%a"), "dayNum": dd.strftime("%d"),
                         "posts": sorted(cal["posts"].get(ds, []), key=lambda p: p.get("time", ""))})
        weeks.append({"weekOf": m, "label": _week_label(mon), "days": days})
    return {"weeks": weeks, "surfaces": CAL_SURFACES,
            "totalPosts": sum(len(v) for v in cal["posts"].values()), "weeksPlanned": len(cal["weeks"])}


# ===========================================================================
# EMAIL ENGINE (Resend) — Anti-Spam Trickle + Welcome Automation (STUBBED)
# ===========================================================================
RESEND_API_KEY = os.environ.get("RESEND_API_KEY")
SENDER_EMAIL = os.environ.get("SENDER_EMAIL", "owner@omnilocal.example")
REPLY_TO_EMAIL = os.environ.get("REPLY_TO_EMAIL", SENDER_EMAIL)
UNSUBSCRIBE_BASE = os.environ.get("UNSUBSCRIBE_BASE_URL", "https://omnilocal.example/unsubscribe")
THROTTLE_SECONDS = 15


def sanitize_content(text: str) -> dict:
    warnings = []
    words = re.findall(r"[A-Za-z]{4,}", text)
    caps = [w for w in words if w.isupper()]
    if len(caps) >= 3:
        warnings.append(f"{len(caps)} ALL-CAPS words — softens deliverability. Consider sentence case.")
    excl = text.count("!")
    if excl > 2:
        warnings.append(f"{excl} exclamation points — reduce to at most 2 to avoid spam filters.")
    if re.search(r'<img[^>]*(width=["\']?1["\']?|height=["\']?1["\']?)', text, re.IGNORECASE):
        warnings.append("Hidden 1x1 tracking pixel detected — removed for deliverability.")
    cleaned = re.sub(r'<img[^>]*(width=["\']?1["\']?|height=["\']?1["\']?)[^>]*>', "", text, flags=re.IGNORECASE)
    spammy = ["FREE!!!", "ACT NOW", "100% FREE", "CLICK HERE", "LIMITED TIME"]
    hits = [s for s in spammy if s.lower() in text.lower()]
    if hits:
        warnings.append(f"Spam-trigger phrases: {', '.join(hits)}.")
    return {"clean": cleaned, "warnings": warnings, "spamScore": min(len(warnings), 5)}


def build_email_headers(unsub_url: str) -> dict:
    return {
        "Reply-To": REPLY_TO_EMAIL,
        "List-Unsubscribe": f"<{unsub_url}>, <mailto:unsubscribe@{SENDER_EMAIL.split('@')[-1]}>",
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    }


async def send_via_resend(to: str, subject: str, html: str, unsub_url: str) -> dict:
    headers = build_email_headers(unsub_url)
    if not RESEND_API_KEY:
        logger.info(f"[EMAIL STUB] -> {to} | subj='{subject}' | headers={list(headers)}")
        return {"status": "stubbed", "to": to, "headers": headers,
                "note": "Set RESEND_API_KEY to enable live sending."}
    import resend
    resend.api_key = RESEND_API_KEY
    params = {"from": SENDER_EMAIL, "to": [to], "subject": subject, "html": html, "headers": headers}
    res = await asyncio.to_thread(resend.Emails.send, params)
    return {"status": "sent", "to": to, "id": res.get("id"), "headers": headers}


def trickle_sample_content() -> dict:
    html = ("<h2>A quiet Tuesday story from our kitchen</h2>"
            "<p>Our cook Marco has made the Sunday Gravy every week for nine years. "
            "This week he shared why the sauce simmers for six hours — a family ritual "
            "from his grandmother in Naples.</p>"
            "<p><a href='https://youtube.com/watch?v=demo'>Watch the 90-second story »</a></p>"
            "<p>Because you're part of our community, here's 15% off your next sub — "
            "just show this email at the counter this week.</p>")
    return {"subject": "The six-hour secret behind our Sunday Gravy", "html": html}


# ===========================================================================
# Pydantic request models
# ===========================================================================
class CopyReq(BaseModel):
    transcript: str


class CriticReq(BaseModel):
    index: int = 0


class SpinReq(BaseModel):
    isNewGuest: bool = True
    segment: str = "new"
    spaceId: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    name: Optional[str] = None
    agree: bool = False


class RedeemReq(BaseModel):
    code: str
    netSales: Optional[float] = None


class GameReq(BaseModel):
    gameId: Optional[str] = None


class ConnReq(BaseModel):
    platform: str
    connected: bool


class OAuthCallbackReq(BaseModel):
    platform: str
    code: Optional[str] = None


class PublishAllReq(BaseModel):
    assetId: Optional[str] = None
    caption: Optional[str] = None


class CalPostReq(BaseModel):
    date: str
    title: str
    surface: str = "Instagram Reels"
    time: str = "12:00"
    idea: Optional[str] = None


class CalIdReq(BaseModel):
    id: str


class CustomerCsvReq(BaseModel):
    csv: str


class CodeGenReq(BaseModel):
    length: int = 8


class ReconcileReq(BaseModel):
    csv: str


class PreviewReq(BaseModel):
    content: str


class SendWelcomeReq(BaseModel):
    index: int = 0


class BrandProfileReq(BaseModel):
    name: Optional[str] = None
    city: Optional[str] = None
    cuisine: Optional[str] = None
    signatureItem: Optional[str] = None
    voice: Optional[str] = None
    menuHighlights: Optional[str] = None
    backstory: Optional[str] = None
    igHandle: Optional[str] = None
    orderUrl: Optional[str] = None


# ===========================================================================
# ROUTES
# ===========================================================================
@api.get("/")
async def root():
    return {"service": "omnilocal-1-revenue-engine", "status": "ok"}


@api.get("/overview")
async def overview():
    reports = await state_get("reports")
    brand = await state_get("brand_profile", DEFAULT_BRAND_PROFILE)
    total_rev = _round(sum(r["totalRevenue"] for r in reports))
    total_spend = _round(sum(r["totalSpend"] for r in reports))
    total_new = sum(r["metrics"]["strategyA"]["newCustomers"] + r["metrics"]["strategyB"]["newCustomers"]
                    for r in reports)
    latest = reports[-1]
    weekly = [{"weekOf": r["weekOf"], "revenue": r["totalRevenue"], "spend": r["totalSpend"],
               "roas": r["blendedRoas"], "shareA": r["allocation"]["strategyA"]["share"],
               "shareB": r["allocation"]["strategyB"]["share"], "winner": r["decision"]["winner"]}
              for r in reports]
    return {
        "brand": brand,
        "hero": {"totalAttributedRevenue": total_rev, "blendedRoas": latest["blendedRoas"],
                 "newCustomers": total_new, "totalSpend": total_spend,
                 "weeksLearning": len(reports), "activeCampaigns": 4},
        "weekly": weekly, "latestWinner": latest["decision"]["winner"],
        "valpak": {"valpakCost": 750, "valpakHomes": 10000, "valpakTargeted": False, "valpakProof": False,
                   "ourCost": 299, "ourReachNote": "Targeted to converting ZIPs, tracked to revenue",
                   "ourTargeted": True, "ourProof": True},
    }


@api.get("/content/prompts")
async def content_prompts():
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    return {"prompts": SHOOTING_PROMPTS, "today": daily_prompt(today), "assetVault": ASSET_VAULT,
            "distribution": DISTRIBUTION_PATHWAYS,
            "sampleVideos": [{"index": i, "filename": v["filename"], "label": v["label"]}
                             for i, v in enumerate(SAMPLE_VIDEOS)]}


@api.get("/content/brand-profile")
async def get_brand_profile():
    return await state_get("brand_profile", DEFAULT_BRAND_PROFILE)


@api.put("/content/brand-profile")
async def update_brand_profile(req: BrandProfileReq):
    brand = await state_get("brand_profile", DEFAULT_BRAND_PROFILE)
    brand.update({k: v for k, v in req.dict().items() if v is not None})
    await state_set("brand_profile", brand)
    return brand


@api.post("/content/copy")
async def content_copy(req: CopyReq):
    normalized = normalize_transcript(req.transcript)
    brand = await state_get("brand_profile", DEFAULT_BRAND_PROFILE)
    try:
        drafts = await ai_generate_drafts(req.transcript, brand)
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="AI copywriter timed out. Please try again.")
    except Exception as e:
        logger.exception("AI copy generation failed")
        raise HTTPException(status_code=502, detail="AI copywriter failed. Please try again.")
    await db.ai_generations.insert_one({
        "type": "copy", "model": "/".join(AI_MODEL), "transcript": req.transcript,
        "drafts": drafts, "createdAt": datetime.now(timezone.utc).isoformat()})
    return {"normalized": normalized, "drafts": drafts, "model": AI_MODEL[1]}


@api.post("/content/critic")
async def content_critic(req: CriticReq):
    idx = max(0, min(req.index, len(SAMPLE_VIDEOS) - 1))
    return {"report": score_video(SAMPLE_VIDEOS[idx]), "label": SAMPLE_VIDEOS[idx]["label"]}


@api.get("/content/distribution")
async def content_distribution():
    connections = await state_get("connections")
    return {"pathways": DISTRIBUTION_PATHWAYS, "provider": UNIFIED_PROVIDER,
            "connections": {p["id"]: connections[p["id"]] for p in PLATFORMS}}


async def log_activity(action: str, **extra):
    await db.activity_log.insert_one({"id": str(uuid.uuid4()), "action": action,
                                      "at": datetime.now(timezone.utc).isoformat(), **extra})


async def _do_publish_all(payload):
    connections = await state_get("connections")
    tokens = await state_get("oauth_tokens")
    rng = random.Random()
    results, published = [], 0
    for path in DISTRIBUTION_PATHWAYS:
        platform = path["platform"]
        base = {"platform": platform, "label": path["label"], "surface": path["surface"]}
        if connections.get(platform, False):
            if platform == "google" and google_business.is_live():
                res = await google_business.publish_localpost(payload.get("caption") or "New from our business")
                if res.get("ok"):
                    published += 1
                    results.append({**base, "status": "published", "mode": "live",
                                    "postUrl": res.get("postUrl")})
                else:
                    results.append({**base, "status": "error", "reason": str(res.get("error"))[:160]})
                continue
            published += 1
            mode = tokens.get(platform, {}).get("mode", "manual")
            results.append({**base, "status": "published", "mode": mode,
                            "postUrl": f"https://{platform}.example/p/{_gen_code(8, rng)}"})
        else:
            results.append({**base, "status": "skipped", "reason": "not connected"})
    for r in results:
        if r["status"] == "published":
            await log_activity("post_published", platform=r["platform"], surface=r["surface"])
    return {"assetId": payload.get("assetId"), "caption": payload.get("caption"), "publishedCount": published,
            "totalPathways": len(DISTRIBUTION_PATHWAYS), "results": results,
            "queuedAt": datetime.now(timezone.utc).isoformat(), "live": bool(UNIFIED_API_KEY),
            "note": "Stubbed distribution. Live posting activates with UNIFIED_API_KEY."}


@api.post("/content/publish-all")
async def content_publish_all(req: PublishAllReq, request: Request):
    summary = f"Publish-All blast across every connected platform — caption: \u201c{(req.caption or '')[:90]}\u201d"
    return await auth.submit_or_execute(request, "publish_all", req.dict(), summary)


@api.get("/content/local-events")
async def content_local_events():
    return get_local_events()


@api.get("/content/calendar")
async def get_calendar():
    cal = await state_get("calendar")
    if cal is None:
        cal = _cal_seed()
        await state_set("calendar", cal)
    return _cal_payload(cal)


@api.post("/content/calendar/add-week")
async def calendar_add_week():
    cal = await state_get("calendar") or _cal_seed()
    events = get_local_events()["events"]
    last = cal["weeks"][-1] if cal["weeks"] else _monday(0)
    nxt = (datetime.strptime(last, "%Y-%m-%d") + timedelta(days=7)).strftime("%Y-%m-%d")
    cal["weeks"].append(nxt)
    _cal_populate_week(cal, events, nxt, len(cal["weeks"]) - 1)
    await state_set("calendar", cal)
    return _cal_payload(cal)


@api.post("/content/calendar/post")
async def calendar_add_post(req: CalPostReq):
    cal = await state_get("calendar") or _cal_seed()
    pid = f"m-{req.date}-{int(datetime.now(timezone.utc).timestamp() * 1000) % 100000}"
    cal["posts"].setdefault(req.date, []).append({
        "id": pid, "date": req.date, "time": req.time, "title": req.title,
        "idea": req.idea or "", "surface": req.surface, "source": "manual", "status": "planned"})
    await state_set("calendar", cal)
    return _cal_payload(cal)


@api.post("/content/calendar/remove")
async def calendar_remove(req: CalIdReq):
    cal = await state_get("calendar") or _cal_seed()
    for d in list(cal["posts"].keys()):
        cal["posts"][d] = [p for p in cal["posts"][d] if p["id"] != req.id]
    await state_set("calendar", cal)
    return _cal_payload(cal)


@api.post("/content/calendar/reset")
async def calendar_reset():
    cal = _cal_seed()
    await state_set("calendar", cal)
    return _cal_payload(cal)


@api.get("/executioner/allocation")
async def executioner_allocation():
    reports = await state_get("reports")
    return reports[-1]["allocation"]


@api.get("/executioner/reports")
async def executioner_reports():
    reports = await state_get("reports")
    return {"reports": reports, "channelLabels": CHANNEL_LABELS,
            "strategies": {"A": STRATEGY_A, "B": STRATEGY_B}}


@api.post("/executioner/reconcile")
async def executioner_reconcile():
    reports = await state_get("reports")
    last = reports[-1]
    prev = last["allocation"]["strategyA"]["share"]
    winner = last["decision"]["winner"]
    if winner == "A":
        share_a = min(0.8, _round(prev + 0.075))
    elif winner == "B":
        share_a = max(0.2, _round(prev - 0.075))
    else:
        share_a = prev
    w = len(reports)
    week_of = _monday(w - (INITIAL_WEEKS - 1))
    txs, _sa, _sb = _seed_week_txs(w, share_a)
    alloc = build_allocation(week_of, share_a)
    ma = _metrics(txs, "STRATA", alloc["strategyA"]["dollars"])
    mb = _metrics(txs, "STRATB", alloc["strategyB"]["dollars"])
    decision = _decide(ma, mb)
    report = {"weekOf": week_of, "allocation": alloc, "metrics": {"strategyA": ma, "strategyB": mb},
              "decision": decision, "zipBreakdown": _zip_breakdown(txs),
              "totalRevenue": _round(ma["revenue"] + mb["revenue"]), "totalSpend": alloc["totalBudget"],
              "blendedRoas": _round((ma["revenue"] + mb["revenue"]) / alloc["totalBudget"]),
              "dataSource": "demo"}
    reports.append(report)
    await state_set("reports", reports)
    return {"report": report, "reallocatedTo": decision["winner"]}


@api.post("/executioner/reset")
async def executioner_reset():
    reports = build_reports_history(INITIAL_WEEKS)
    await state_set("reports", reports)
    return {"ok": True, "weeks": len(reports)}


@api.get("/executioner/recommended-plan")
async def get_recommended_plan():
    reports = await state_get("reports")
    connections = await state_get("connections")
    return recommended_plan(reports, connections)


# ---------------------------------------------------------------------------
# PHASE 2 — Real POS/CSV transaction ingest (Square / Toast / generic)
# Real orders are stored in `transactions`; the A/B learning loop recomputes
# real weeks from them, labeling each report demo vs real.
# ---------------------------------------------------------------------------
TX_ALIASES = {
    "promo_code": ["promo_code", "promo", "promo code", "discount", "discount_name",
                   "discount name", "coupon", "coupon_code", "code"],
    "net_sales": ["net_sales", "net sales", "net", "net_amount", "net amount", "amount",
                  "total", "total_amount", "gross sales", "sales"],
    "customer_id": ["customer_id", "customer id", "customer", "customer_name", "customer name", "email", "guest"],
    "postal_code": ["postal_code", "postal code", "zip", "zip_code", "zipcode", "postal", "zip code"],
    "clicks": ["clicks", "click"],
    "date": ["date", "order_date", "order date", "created_at", "created at", "transaction_date",
             "transaction date", "closed_at", "business_date", "business date"],
}


def _norm_date(s):
    s = (s or "").strip().replace("T", " ").split(" ")[0]
    for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%m/%d/%y", "%d/%m/%Y", "%Y/%m/%d"):
        try:
            return datetime.strptime(s, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _parse_money(s):
    s = re.sub(r"[^0-9.\-]", "", (s or ""))
    try:
        return round(float(s), 2)
    except ValueError:
        return None


def _week_of_date(date_str):
    d = datetime.strptime(date_str, "%Y-%m-%d")
    return (d - timedelta(days=d.weekday())).strftime("%Y-%m-%d")


def _parse_transactions_csv(text):
    lines = [l for l in (text or "").strip().splitlines() if l.strip()]
    if not lines:
        return {"rows": [], "mapping": {}, "skipped": 0}
    header = [h.strip().lower().strip('"') for h in lines[0].split(",")]
    mapping = {}
    for field, aliases in TX_ALIASES.items():
        for i, h in enumerate(header):
            if h in aliases:
                mapping[field] = i
                break
    rows, skipped = [], 0
    for line in lines[1:]:
        parts = [p.strip().strip('"') for p in line.split(",")]

        def get(f):
            i = mapping.get(f)
            return parts[i] if i is not None and i < len(parts) else ""
        net = _parse_money(get("net_sales"))
        if net is None:
            skipped += 1
            continue
        rows.append({
            "promo_code": get("promo_code") or "",
            "net_sales": net,
            "customer_id": get("customer_id") or f"cust-{len(rows)}",
            "postal_code": get("postal_code") or "",
            "clicks": int(_parse_money(get("clicks")) or 0),
            "date": _norm_date(get("date")),
        })
    return {"rows": rows, "mapping": {f: header[i] for f, i in mapping.items()}, "skipped": skipped}


async def rebuild_reports():
    reports = build_reports_history(INITIAL_WEEKS)  # demo baseline (dataSource=demo)
    weeks = sorted(await db.transactions.distinct("weekOf"))
    share_a = reports[-1]["allocation"]["strategyA"]["share"]
    for wk in weeks:
        txs = await db.transactions.find({"weekOf": wk}, {"_id": 0}).to_list(100000)
        alloc = build_allocation(wk, share_a)
        ma = _metrics(txs, "STRATA", alloc["strategyA"]["dollars"])
        mb = _metrics(txs, "STRATB", alloc["strategyB"]["dollars"])
        decision = _decide(ma, mb)
        total_rev = _round(sum(t["net_sales"] for t in txs))
        reports.append({
            "weekOf": wk, "allocation": alloc, "metrics": {"strategyA": ma, "strategyB": mb},
            "decision": decision, "zipBreakdown": _zip_breakdown(txs), "totalRevenue": total_rev,
            "totalSpend": alloc["totalBudget"],
            "blendedRoas": _round(total_rev / alloc["totalBudget"]) if alloc["totalBudget"] else 0,
            "dataSource": "real", "txCount": len(txs),
            "attributedRevenue": _round(ma["revenue"] + mb["revenue"]),
            "organicRevenue": _round(total_rev - ma["revenue"] - mb["revenue"])})
        if decision["winner"] == "A":
            share_a = min(0.8, _round(share_a + 0.075))
        elif decision["winner"] == "B":
            share_a = max(0.2, _round(share_a - 0.075))
    await state_set("reports", reports)
    return reports


class ImportTxReq(BaseModel):
    csv: str
    source: Optional[str] = "generic"


@api.get("/executioner/sample-transactions-csv")
async def sample_transactions_csv(source: str = "square"):
    rng = random.Random(5)
    zips = ["01103", "01104", "01108", "01109"]
    today = datetime.now(timezone.utc)
    lines = ["Date,Net Sales,Customer ID,Postal Code,Clicks,Discount"]
    for wkoff in (1, 0):
        base = today - timedelta(days=wkoff * 7)
        for _ in range(14):
            strat = "STRATA" if rng.random() < 0.55 else "STRATB"
            code = f"{strat}-{rng.randint(1000, 9999)}"
            d = (base - timedelta(days=rng.randint(0, 4))).strftime("%m/%d/%Y")
            amt = round(rng.uniform(12, 46), 2)
            lines.append(f"{d},{amt},CUST{rng.randint(100, 999)},{rng.choice(zips)},{rng.randint(3, 20)},{code}")
    return {"csv": "\n".join(lines), "source": source,
            "format": "Square-style export (Date, Net Sales, Customer ID, Postal Code, Clicks, Discount)"}


@api.post("/executioner/import-transactions")
async def import_transactions(req: ImportTxReq):
    parsed = _parse_transactions_csv(req.csv)
    if not parsed["rows"]:
        raise HTTPException(status_code=422,
                            detail="No valid rows found. Ensure the CSV has a net sales/amount column.")
    now = datetime.now(timezone.utc).isoformat()
    docs = []
    for r in parsed["rows"]:
        docs.append({"id": str(uuid.uuid4()), **r, "weekOf": _week_of_date(r["date"]),
                     "source": req.source, "importedAt": now})
    await db.transactions.insert_many([dict(d) for d in docs])
    await rebuild_reports()
    weeks = sorted({d["weekOf"] for d in docs})
    total = await db.transactions.count_documents({})
    return {"imported": len(docs), "skipped": parsed["skipped"], "mapping": parsed["mapping"],
            "weeks": weeks, "totalTransactionsStored": total,
            "revenueImported": _round(sum(d["net_sales"] for d in docs))}


@api.post("/executioner/clear-transactions")
async def clear_transactions():
    await db.transactions.delete_many({})
    await rebuild_reports()
    return {"ok": True, "cleared": True}


REDEMPTION_TTL_DAYS = 14


def _seed_redemptions():
    """Starter ledger so the dashboard reflects real accumulated history on a fresh DB."""
    rng = random.Random(202)
    tiers = [("grand", "Free Sub (BOGO)"), ("high", "30% Off"), ("mid", "20% Off"), ("low", "Free Fountain Drink")]
    spaces = ["Table Tent", "Counter QR", "Receipt", "Window Decal"]
    now = datetime.now(timezone.utc)
    docs = []
    for i in range(46):
        t = rng.choices(tiers, weights=[8, 17, 30, 45])[0]
        issued_at = now - timedelta(days=rng.randint(0, 20), hours=rng.randint(0, 23))
        redeemed = rng.random() < 0.58
        prefix = "HV-" if t[0] in ("grand", "high") else "ST-"
        code = prefix + "".join(rng.choice(CODE_ALPHABET) for _ in range(6))
        doc = {"id": str(uuid.uuid4()), "code": code, "tier": t[0], "reward": t[1],
               "segment": rng.choice(["new", "vip", "promo_pool"]), "guestType": rng.choice(["new", "repeat"]),
               "gameId": rng.choice([g["id"] for g in GAMES]), "gameName": "Scan-to-Spin",
               "spaceId": rng.choice(spaces), "issuedAt": issued_at.isoformat(),
               "expiresAt": (issued_at + timedelta(days=REDEMPTION_TTL_DAYS)).isoformat()}
        if redeemed:
            doc.update({"status": "redeemed",
                        "redeemedAt": (issued_at + timedelta(days=rng.randint(0, 6))).isoformat(),
                        "netSales": round(rng.uniform(14, 48), 2)})
        else:
            doc.update({"status": "issued", "redeemedAt": None, "netSales": None})
        docs.append(doc)
    return docs


async def _unique_code(prefix):
    for _ in range(12):
        code = prefix + "".join(random.choice(CODE_ALPHABET) for _ in range(6))
        if not await db.redemptions.find_one({"code": code}):
            return code
    return prefix + "".join(random.choice(CODE_ALPHABET) for _ in range(8))


async def _redemptions_summary():
    issued = await db.redemptions.count_documents({})
    redeemed = await db.redemptions.count_documents({"status": "redeemed"})
    agg = await db.redemptions.aggregate([
        {"$match": {"status": "redeemed"}},
        {"$group": {"_id": "$tier", "count": {"$sum": 1}, "rev": {"$sum": {"$ifNull": ["$netSales", 0]}}}},
    ]).to_list(100)
    by_tier = {a["_id"]: a["count"] for a in agg}
    revenue = round(sum(a["rev"] for a in agg), 2)
    recent = await db.redemptions.find({}, {"_id": 0}).sort("issuedAt", -1).to_list(8)
    return {"codesIssued": issued, "codesRedeemed": redeemed,
            "redemptionRate": round(redeemed / issued, 2) if issued else 0,
            "revenueFromRedemptions": revenue, "byTier": by_tier, "recent": recent}


def _norm_email(e):
    return (e or "").strip().lower()


def _norm_phone(p):
    digits = re.sub(r"\D", "", p or "")
    return digits[-10:] if len(digits) >= 10 else digits


async def _find_member(email, phone):
    ors = []
    if email:
        ors.append({"email": email})
    if phone:
        ors.append({"phone": phone})
    if not ors:
        return None
    return await db.members.find_one({"$or": ors}, {"_id": 0})


MEMBER_SEG_TO_SPIN = {"coupon_only": "promo_pool", "loyal": "vip", "new": "new"}


@api.post("/maximizer/spin")
async def maximizer_spin(req: SpinReq, request: Request):
    game = await resolve_active_game()
    if not game:
        raise HTTPException(status_code=423, detail="The game is taking a quick break — check back soon!")
    staff = await auth.get_session_user(request)
    email, phone = _norm_email(req.email), _norm_phone(req.phone)
    now = datetime.now(timezone.utc)
    member = None
    if staff and not (email or phone):
        seg, is_new = req.segment, req.isNewGuest
    else:
        if not req.agree:
            raise HTTPException(status_code=400, detail="You must agree to join the rewards club to play.")
        if not email and not phone:
            raise HTTPException(status_code=400, detail="Enter an email or mobile number to play.")
        member = await _find_member(email, phone)
        settings = await get_game_settings()
        window = timedelta(days=settings["playFrequencyDays"])
        freq_label = "week" if settings["playFrequencyDays"] == 7 else "two weeks"
        if member:
            last = member.get("lastSpinAt")
            if last and now - datetime.fromisoformat(last) < window:
                next_at = (datetime.fromisoformat(last) + window).strftime("%b %d")
                active = await db.redemptions.find_one(
                    {"memberKey": member["memberKey"], "status": "issued"}, {"_id": 0},
                    sort=[("issuedAt", -1)])
                raise HTTPException(status_code=429, detail={
                    "reason": f"One play per {freq_label} — come back {next_at}!",
                    "existingCode": active["code"] if active else None,
                    "reward": active["reward"] if active else None,
                    "expiresAt": active["expiresAt"] if active else None})
            seg = MEMBER_SEG_TO_SPIN.get(member["segment"], "new")
            is_new = member["segment"] == "new"
            if req.name and not member.get("name"):
                await db.members.update_one({"memberKey": member["memberKey"]}, {"$set": {"name": req.name}})
        else:
            member = {"memberKey": email or phone, "email": email or None, "phone": phone or None,
                      "name": req.name or "", "visits": 0, "couponRatio": 0.0, "segment": "new",
                      "source": "spin_signup", "signupSpace": (req.spaceId or "direct")[:48],
                      "consentAt": now.isoformat(),
                      "createdAt": now.isoformat(), "updatedAt": now.isoformat(), "lastSpinAt": None}
            await db.members.insert_one(dict(member))
            queue = await state_get("welcome_queue") or []
            queue.append({"name": member["name"] or (email or phone), "email": email or phone,
                          "status": "queued", "scheduledAt": (now + timedelta(hours=2)).isoformat(),
                          "channel": "email" if email else "sms"})
            await state_set("welcome_queue", queue)
            seg, is_new = "new", True
        await db.members.update_one({"memberKey": member["memberKey"]},
                                    {"$set": {"lastSpinAt": now.isoformat(), "updatedAt": now.isoformat()}})
    base = spin(is_new, seg, await state_get("prize_board", DEFAULT_PRIZE_BOARD))
    expiry_days = (await get_game_settings())["codeExpiryDays"]
    prefix = "HV-" if base["tier"] == "highValue" else "ST-"
    code = await _unique_code(prefix)
    doc = {"id": str(uuid.uuid4()), "code": code, "tier": base["tier"], "reward": base["reward"],
           "posCode": base.get("posCode"),
           "segment": base["segment"], "guestType": base["guestType"], "gameId": game["id"],
           "gameName": game["name"], "spaceId": req.spaceId or "direct", "status": "issued",
           "memberKey": member["memberKey"] if member else None,
           "memberEmail": (member or {}).get("email"), "memberPhone": (member or {}).get("phone"),
           "issuedAt": now.isoformat(), "expiresAt": (now + timedelta(days=expiry_days)).isoformat(),
           "redeemedAt": None, "netSales": None}
    await db.redemptions.insert_one(dict(doc))
    doc.pop("posCode", None)
    return {**doc, "couponCode": code, "revealAtSeconds": 5, "mystery": True,
            "memberSegment": member["segment"] if member else None}


DEFAULT_GAME_SETTINGS = {"playFrequencyDays": 7, "codeExpiryDays": 7, "enabled": True}


async def get_game_settings():
    s = await state_get("game_settings")
    return {**DEFAULT_GAME_SETTINGS, **(s or {})}


async def resolve_active_game():
    settings = await get_game_settings()
    if not settings.get("enabled", True):
        return None
    schedule = await state_get("game_schedule") or {}
    gid = schedule.get(_monday(0))
    if gid == "none":
        return None
    if gid:
        g = next((x for x in GAMES if x["id"] == gid), None)
        if g:
            return {**g, "source": "weekly_schedule"}
    return active_game(await state_get("game_override"))


class GameWeekReq(BaseModel):
    weekStart: str
    gameId: Optional[str] = None


class GameSettingsReq(BaseModel):
    playFrequencyDays: Optional[int] = None
    codeExpiryDays: Optional[int] = None
    enabled: Optional[bool] = None


@api.get("/maximizer/game-plan")
async def game_plan():
    schedule = await state_get("game_schedule") or {}
    settings = await get_game_settings()
    weeks = [{"weekStart": _monday(w), "gameId": schedule.get(_monday(w))} for w in range(4)]
    return {"weeks": weeks, "settings": settings,
            "games": [{"id": g["id"], "name": g["name"]} for g in GAMES]}


@api.put("/maximizer/game-plan/week")
async def set_game_week(req: GameWeekReq):
    if req.gameId and req.gameId != "none" and not any(g["id"] == req.gameId for g in GAMES):
        raise HTTPException(status_code=400, detail="Unknown game")
    schedule = await state_get("game_schedule") or {}
    if req.gameId:
        schedule[req.weekStart] = req.gameId
    else:
        schedule.pop(req.weekStart, None)
    await state_set("game_schedule", schedule)
    return {"ok": True, "schedule": schedule}


@api.put("/maximizer/game-settings")
async def set_game_settings(req: GameSettingsReq):
    settings = await get_game_settings()
    if req.enabled is not None:
        settings["enabled"] = bool(req.enabled)
    if req.playFrequencyDays is not None:
        if req.playFrequencyDays not in (7, 14):
            raise HTTPException(status_code=400, detail="Play frequency must be 7 or 14 days")
        settings["playFrequencyDays"] = req.playFrequencyDays
    if req.codeExpiryDays is not None:
        if req.codeExpiryDays not in (7, 14):
            raise HTTPException(status_code=400, detail="Code expiry must be 7 or 14 days")
        settings["codeExpiryDays"] = req.codeExpiryDays
    await state_set("game_settings", settings)
    return {"ok": True, "settings": settings}


@api.get("/maximizer/members/export.csv")
async def export_members_csv():
    members = await db.members.find({}, {"_id": 0}).sort("createdAt", 1).to_list(100000)
    buf = io.StringIO()
    w = csvmod.writer(buf)
    w.writerow(["name", "email", "phone", "segment", "source", "visits", "coupon_ratio",
                "joined", "last_spin", "last_redeemed"])
    for m in members:
        w.writerow([m.get("name", ""), m.get("email") or "", m.get("phone") or "",
                    m.get("segment", ""), m.get("source", ""), m.get("visits", 0),
                    m.get("couponRatio", 0), (m.get("createdAt") or "")[:10],
                    (m.get("lastSpinAt") or "")[:10], (m.get("lastRedeemedAt") or "")[:10]])
    return Response(content=buf.getvalue(), media_type="text/csv",
                    headers={"Content-Disposition": "attachment; filename=reward-members.csv"})


@api.get("/maximizer/members")
async def maximizer_members():
    members = await db.members.find({}, {"_id": 0}).sort("createdAt", -1).to_list(2000)
    counts = {"total": len(members),
              "couponers": sum(1 for m in members if m["segment"] == "coupon_only"),
              "quality": sum(1 for m in members if m["segment"] == "loyal"),
              "new": sum(1 for m in members if m["segment"] == "new"),
              "wheelSignups": sum(1 for m in members if m.get("source") == "spin_signup")}
    return {"members": members[:200], "counts": counts}


@api.get("/maximizer/spin/qr")
async def spin_qr(spaceId: str = "Table Tent", base: str = ""):
    if base and not base.startswith(("http://", "https://")):
        base = ""
    play_url = (f"{base.rstrip('/')}/spin?space={quote(spaceId)}" if base else f"/spin?space={quote(spaceId)}")
    qr = segno.make(play_url, error="m")
    buff = io.BytesIO()
    qr.save(buff, kind="png", scale=6, border=2, dark="#1A1A1A", light="#FFFFFF")
    data_uri = "data:image/png;base64," + base64.b64encode(buff.getvalue()).decode()
    return {"spaceId": spaceId, "playUrl": play_url, "qrDataUri": data_uri}


SPOT_PRESETS = ["Pizza Box", "Bag Sticker", "Door Decal", "Table Tent", "Counter QR", "Receipt", "Window Decal"]


@api.get("/maximizer/qr-sheet.pdf")
async def qr_sheet_pdf(base: str = ""):
    if base and not base.startswith(("http://", "https://")):
        base = ""
    brand = await state_get("brand_profile", DEFAULT_BRAND_PROFILE)
    game = await resolve_active_game()

    def _latin(s):
        return str(s).encode("latin-1", "replace").decode("latin-1")

    tmp = tempfile.mkdtemp(prefix="qrsheet_")
    try:
        pdf = FPDF(orientation="P", unit="mm", format="A4")
        pdf.set_auto_page_break(False)
        pdf.add_page()
        pdf.set_font("Helvetica", "B", 17)
        pdf.cell(0, 8, _latin(f"{brand.get('name', 'Your Business')} - Scan-to-Play QR Sheet"),
                 new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("Helvetica", "", 8.5)
        pdf.set_text_color(90, 90, 90)
        game_line = (f"Current game: {game['name']}." if game
                     else "Games are paused right now - scans still register while you get ready.")
        pdf.multi_cell(0, 4.2, _latin(
            "These QR codes are UNIQUE to your business - each opens YOUR play page and tags the scan "
            f"with its placement, so Location Analytics shows which spot earns its keep. {game_line} "
            "Print this page at any print shop, on regular paper or sticker paper - cut along the dashed lines, "
            "then tape or laminate each code at its spot."), new_x="LMARGIN", new_y="NEXT")
        pdf.set_x(10)

        cells = list(SPOT_PRESETS)
        for i, spot in enumerate(cells):
            col, row = i % 2, i // 2
            x0, y0 = 12 + col * 96, 38 + row * 62
            qrpath = os.path.join(tmp, f"qr{i}.png")
            play_url = (f"{base.rstrip('/')}/spin?space={quote(spot)}" if base else f"/spin?space={quote(spot)}")
            segno.make(play_url, error="m").save(qrpath, scale=10, border=1, dark="#1A1A1A")
            pdf.set_draw_color(150, 150, 150)
            pdf.set_dash_pattern(dash=1.6, gap=1.6)
            pdf.rect(x0, y0, 90, 58)
            pdf.set_dash_pattern()
            pdf.image(qrpath, x=x0 + 25, y=y0 + 3, w=40, h=40)
            pdf.set_xy(x0, y0 + 45)
            pdf.set_text_color(26, 26, 26)
            pdf.set_font("Helvetica", "B", 11.5)
            pdf.cell(90, 6, _latin(spot), align="C")
            pdf.set_xy(x0, y0 + 51)
            pdf.set_text_color(120, 120, 120)
            pdf.set_font("Helvetica", "", 7.5)
            pdf.cell(90, 4, "Scan - Play - Win a real prize", align="C")

        # instructions block fills the 8th slot
        x0, y0 = 12 + 96, 38 + 3 * 62
        pdf.set_draw_color(211, 84, 0)
        pdf.rect(x0, y0, 90, 58)
        pdf.set_xy(x0 + 4, y0 + 4)
        pdf.set_text_color(211, 84, 0)
        pdf.set_font("Helvetica", "B", 10)
        pdf.cell(82, 5, "How your QR codes work", new_x="LMARGIN", new_y="NEXT")
        pdf.set_text_color(60, 60, 60)
        pdf.set_font("Helvetica", "", 7.8)
        tips = [
            "Every code opens YOUR play page - no other business shares it.",
            "The label after 'space=' tells the system where it was scanned.",
            "Best spots go HOME with the customer - mailers, social posts, boxes & bags. Whole households scan to compare prizes, and every scan joins your list.",
            "Need a new spot? Type any label in the QR generator inside the Rewards module and print it.",
        ]
        for tip in tips:
            pdf.set_x(x0 + 4)
            pdf.multi_cell(82, 3.9, _latin(f"-  {tip}"), new_x="LMARGIN", new_y="NEXT")
        out = pdf.output()
        return Response(content=bytes(out), media_type="application/pdf",
                        headers={"Content-Disposition": "attachment; filename=spot-qr-sheet.pdf"})
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


@api.get("/maximizer/table-tent.pdf")
async def table_tent_pdf(spaceId: str = "Table Tent", base: str = ""):
    if base and not base.startswith(("http://", "https://")):
        base = ""
    play_url = (f"{base.rstrip('/')}/spin?space={quote(spaceId)}" if base else f"/spin?space={quote(spaceId)}")
    brand = await state_get("brand_profile", DEFAULT_BRAND_PROFILE)
    game = await resolve_active_game()
    board = await state_get("prize_board", DEFAULT_PRIZE_BOARD)
    headline = (board.get("goodPrizes") or [{}])[0].get("label", "a top prize")
    tmp = tempfile.mkdtemp(prefix="tent_")
    qrpath = os.path.join(tmp, "qr.png")
    try:
        segno.make(play_url, error="m").save(qrpath, scale=12, border=1, dark="#1A1A1A")
        pdf = FPDF(orientation="P", unit="mm", format="A4")
        pdf.set_auto_page_break(False)
        pdf.add_page()
        W = 210
        # top brand band
        pdf.set_fill_color(211, 84, 0)
        pdf.rect(0, 0, W, 34, style="F")
        pdf.set_text_color(255, 255, 255)
        pdf.set_font("Helvetica", "B", 26)
        pdf.set_xy(0, 9)
        pdf.cell(W, 10, brand.get("name", "Our Business"), align="C")
        pdf.set_font("Helvetica", "", 12)
        pdf.set_xy(0, 21)
        pdf.cell(W, 8, brand.get("city", ""), align="C")
        # headline
        pdf.set_text_color(26, 26, 26)
        pdf.set_font("Times", "B", 46)
        pdf.set_xy(0, 52)
        pdf.cell(W, 20, "SCAN. PLAY. WIN.", align="C")
        pdf.set_font("Helvetica", "", 15)
        pdf.set_text_color(92, 90, 86)
        pdf.set_xy(0, 76)
        pdf.cell(W, 8, "Point your phone camera at the code below", align="C")
        # QR centered
        qr_size = 88
        pdf.image(qrpath, x=(W - qr_size) / 2, y=90, w=qr_size, h=qr_size)
        # reward + game
        pdf.set_text_color(39, 174, 96)
        pdf.set_font("Helvetica", "B", 20)
        pdf.set_xy(0, 186)
        pdf.cell(W, 10, f"Win up to {headline} - instantly".encode("latin-1", "replace").decode("latin-1"), align="C")
        pdf.set_text_color(26, 26, 26)
        pdf.set_font("Helvetica", "", 13)
        pdf.set_xy(0, 199)
        game_tag = (f"Play the {game['name']} - a reward every time you scan" if game
                    else "A reward every time you scan - game starts soon")
        pdf.cell(W, 8, game_tag, align="C")
        # divider
        pdf.set_draw_color(232, 230, 223)
        pdf.line(45, 216, W - 45, 216)
        # fine print
        pdf.set_text_color(120, 118, 114)
        pdf.set_font("Helvetica", "", 9)
        pdf.set_xy(25, 222)
        pdf.multi_cell(W - 50, 5,
                       "One play per visit. Rewards and odds vary by game. Coupons are single-use and expire "
                       "14 days after issue. Show your winning code at the counter to redeem. No purchase "
                       "necessary to play.", align="C")
        # footer
        pdf.set_text_color(211, 84, 0)
        pdf.set_font("Helvetica", "B", 11)
        pdf.set_xy(0, 285)
        pdf.cell(W, 6, "Powered by OmniLocal #1", align="C")
        out = pdf.output()
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    return Response(content=bytes(out), media_type="application/pdf",
                    headers={"Content-Disposition": 'inline; filename="omnilocal-table-tent.pdf"'})


@api.post("/maximizer/redeem")
async def maximizer_redeem(req: RedeemReq):
    code = (req.code or "").strip().upper()
    doc = await db.redemptions.find_one({"code": code})
    if not doc:
        return {"ok": False, "status": "invalid",
                "reason": "Code not found — this coupon was never issued by OmniLocal #1."}
    now = datetime.now(timezone.utc)
    if doc["status"] == "redeemed":
        return {"ok": False, "status": "already_redeemed", "reward": doc["reward"],
                "reason": f"Already redeemed on {(doc.get('redeemedAt') or '')[:10]} — one use only."}
    if doc.get("expiresAt") and now > datetime.fromisoformat(doc["expiresAt"]):
        await db.redemptions.update_one({"code": code}, {"$set": {"status": "expired"}})
        return {"ok": False, "status": "expired", "reward": doc["reward"],
                "reason": f"This coupon expired on {doc['expiresAt'][:10]}."}
    await db.redemptions.update_one(
        {"code": code}, {"$set": {"status": "redeemed", "redeemedAt": now.isoformat(), "netSales": req.netSales}})
    if doc.get("memberKey"):
        await db.members.update_one({"memberKey": doc["memberKey"]},
                                    {"$inc": {"visits": 1}, "$set": {"lastRedeemedAt": now.isoformat()}})
    return {"ok": True, "status": "redeemed", "reward": doc["reward"], "tier": doc["tier"],
            "posCode": doc.get("posCode"), "netSales": req.netSales, "code": code}


@api.get("/maximizer/redemptions/dashboard")
async def redemptions_dashboard():
    return await _redemptions_summary()


# ---------------------------------------------------------------------------
# LOCATION ANALYTICS — every sticker spot earns its keep
# ---------------------------------------------------------------------------
class ScanReq(BaseModel):
    spaceId: Optional[str] = None


@api.post("/maximizer/scan")
async def maximizer_scan(req: ScanReq):
    space = (req.spaceId or "direct").strip()[:48] or "direct"
    await db.scan_events.insert_one({"id": str(uuid.uuid4()), "spaceId": space,
                                     "at": datetime.now(timezone.utc).isoformat()})
    return {"ok": True}


@api.get("/maximizer/locations")
async def maximizer_locations():
    scans = {a["_id"]: a["n"] for a in await db.scan_events.aggregate(
        [{"$group": {"_id": "$spaceId", "n": {"$sum": 1}}}]).to_list(200)}
    plays_agg = await db.redemptions.aggregate([
        {"$match": {"spaceId": {"$nin": [None, "admin-demo"]}}},
        {"$group": {"_id": "$spaceId", "plays": {"$sum": 1},
                    "redeemed": {"$sum": {"$cond": [{"$eq": ["$status", "redeemed"]}, 1, 0]}},
                    "revenue": {"$sum": {"$ifNull": ["$netSales", 0]}}}}]).to_list(200)
    plays = {a["_id"]: a for a in plays_agg}
    signups = {a["_id"]: a["n"] for a in await db.members.aggregate(
        [{"$match": {"signupSpace": {"$ne": None}}},
         {"$group": {"_id": "$signupSpace", "n": {"$sum": 1}}}]).to_list(200)}
    rows = []
    for space in set(scans) | set(plays) | set(signups):
        p = plays.get(space, {})
        n_scans, n_plays = scans.get(space, 0), p.get("plays", 0)
        rows.append({"spaceId": space, "scans": n_scans, "plays": n_plays,
                     "signups": signups.get(space, 0), "redeemed": p.get("redeemed", 0),
                     "revenue": round(p.get("revenue", 0), 2),
                     "scanToPlay": round(n_plays / n_scans, 2) if n_scans else None})
    rows.sort(key=lambda r: (-r["plays"], -r["scans"], r["spaceId"]))
    totals = {k: sum(r[k] for r in rows) for k in ("scans", "plays", "signups", "redeemed")}
    totals["revenue"] = round(sum(r["revenue"] for r in rows), 2)
    return {"rows": rows, "totals": totals, "topSpot": rows[0]["spaceId"] if rows else None}


# ---------------------------------------------------------------------------
# WEEKLY WIN REPORT — last completed Mon–Sun week, hard stop Sunday
# ---------------------------------------------------------------------------
async def _win_window(start, end):
    s, e = start.isoformat(), end.isoformat()
    spins = await db.redemptions.count_documents(
        {"issuedAt": {"$gte": s, "$lt": e}, "spaceId": {"$ne": "admin-demo"}})
    new_members = await db.members.count_documents({"createdAt": {"$gte": s, "$lt": e}})
    scans = await db.scan_events.count_documents({"at": {"$gte": s, "$lt": e}})
    agg = await db.redemptions.aggregate([
        {"$match": {"status": "redeemed", "redeemedAt": {"$gte": s, "$lt": e}}},
        {"$group": {"_id": None, "n": {"$sum": 1}, "rev": {"$sum": {"$ifNull": ["$netSales", 0]}}}},
    ]).to_list(1)
    return {"scans": scans, "spins": spins, "newMembers": new_members,
            "redeemed": agg[0]["n"] if agg else 0,
            "revenue": round(agg[0]["rev"], 2) if agg else 0}


async def _weekly_report_data():
    now = datetime.now(timezone.utc)
    this_monday = (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = this_monday - timedelta(days=7)
    prev_start = week_start - timedelta(days=7)
    current = await _win_window(week_start, this_monday)
    previous = await _win_window(prev_start, week_start)
    so_far = await _win_window(this_monday, now)
    s, e = week_start.isoformat(), this_monday.isoformat()
    top = await db.redemptions.aggregate([
        {"$match": {"issuedAt": {"$gte": s, "$lt": e}, "spaceId": {"$nin": [None, "admin-demo"]}}},
        {"$group": {"_id": "$spaceId", "n": {"$sum": 1}}}, {"$sort": {"n": -1}}, {"$limit": 1}]).to_list(1)
    top_game = await db.redemptions.aggregate([
        {"$match": {"issuedAt": {"$gte": s, "$lt": e}, "gameName": {"$ne": None}}},
        {"$group": {"_id": "$gameName", "n": {"$sum": 1}}}, {"$sort": {"n": -1}}, {"$limit": 1}]).to_list(1)
    # POS import accountability (imports logged during the report week)
    last_import = await db.activity_log.find_one({"action": "pos_import"}, {"_id": 0}, sort=[("at", -1)])
    imports_in_week = await db.activity_log.count_documents({"action": "pos_import", "at": {"$gte": s, "$lt": e}})
    # prize payout breakdown — reconcile against the POS
    prize_agg = await db.redemptions.aggregate([
        {"$match": {"status": "redeemed", "redeemedAt": {"$gte": s, "$lt": e}}},
        {"$group": {"_id": "$reward", "redeemed": {"$sum": 1}, "revenue": {"$sum": {"$ifNull": ["$netSales", 0]}}}},
        {"$sort": {"redeemed": -1}}]).to_list(20)
    prize_breakdown = [{"reward": p["_id"], "redeemed": p["redeemed"], "revenue": round(p["revenue"], 2)}
                       for p in prize_agg]
    # channel activity — REAL actions only; engagement metrics slot in when platforms go live
    connections = await state_get("connections") or {}
    pub_agg = await db.activity_log.aggregate([
        {"$match": {"action": "post_published", "at": {"$gte": s, "$lt": e}}},
        {"$group": {"_id": "$platform", "n": {"$sum": 1}}}]).to_list(20)
    pubs = {a["_id"]: a["n"] for a in pub_agg}
    welcome_sent = await db.activity_log.count_documents({"action": "welcome_email", "at": {"$gte": s, "$lt": e}})
    cal = await state_get("calendar") or {"posts": {}}
    week_dates = [(week_start + timedelta(days=i)).strftime("%Y-%m-%d") for i in range(7)]
    cal_posts = sum(len(cal.get("posts", {}).get(dd, [])) for dd in week_dates)
    channels = [{"channel": "wheel", "label": "Gamification Wheel", "live": True,
                 "lines": [f"{current['scans']} QR scans", f"{current['spins']} spins played",
                           f"{current['newMembers']} new members joined"]}]
    for path in DISTRIBUTION_PATHWAYS:
        p = path["platform"]
        n = pubs.get(p, 0)
        channels.append({"channel": p, "label": path["label"], "live": False,
                         "connected": bool(connections.get(p)),
                         "lines": [f"{n} post{'s' if n != 1 else ''} published"],
                         "note": "Actionable clicks & engagement unlock when this platform goes live."})
    channels.append({"channel": "calendar", "label": "Content Calendar", "live": True,
                     "lines": [f"{cal_posts} posts planned for the week"]})
    channels.append({"channel": "email", "label": "Welcome Emails", "live": bool(RESEND_API_KEY),
                     "lines": [f"{welcome_sent} sent" + ("" if RESEND_API_KEY else " (stub mode)")]})
    # ad spend — what the owner boosted during the report week (and the week before)
    week_end_date = (this_monday - timedelta(days=1)).strftime("%Y-%m-%d")
    spend_entries = await db.ad_spend.find(
        {"date": {"$gte": week_start.strftime("%Y-%m-%d"), "$lte": week_end_date}},
        {"_id": 0}).sort("date", 1).to_list(100)
    prev_spend = await db.ad_spend.aggregate([
        {"$match": {"date": {"$gte": prev_start.strftime("%Y-%m-%d"),
                             "$lt": week_start.strftime("%Y-%m-%d")}}},
        {"$group": {"_id": None, "t": {"$sum": "$amount"}}}]).to_list(1)
    spend_total = round(sum(x["amount"] for x in spend_entries), 2)
    prev_total = round(prev_spend[0]["t"], 2) if prev_spend else 0
    spend_by_platform = {}
    for x in spend_entries:
        spend_by_platform[x["platform"]] = round(spend_by_platform.get(x["platform"], 0) + x["amount"], 2)
    for ch in channels:
        if ch["channel"] in spend_by_platform:
            ch["lines"].append(f"${spend_by_platform[ch['channel']]:,.2f} boosted")
    return {"weekOf": week_start.strftime("%Y-%m-%d"),
            "weekEnd": (this_monday - timedelta(days=1)).strftime("%Y-%m-%d"),
            "generatedAt": now.isoformat(), "current": current, "previous": previous,
            "deltas": {k: round(current[k] - previous[k], 2) for k in current}, "soFar": so_far,
            "posImport": {"importedThisWeek": imports_in_week > 0, "importsInWeek": imports_in_week,
                          "lastImportAt": last_import["at"] if last_import else None},
            "adSpend": {"total": spend_total, "prevTotal": prev_total,
                        "delta": round(spend_total - prev_total, 2), "entries": spend_entries},
            "prizeBreakdown": prize_breakdown, "channels": channels,
            "topSpot": {"spaceId": top[0]["_id"], "plays": top[0]["n"]} if top else None,
            "topGame": {"name": top_game[0]["_id"], "plays": top_game[0]["n"]} if top_game else None}


@api.get("/maximizer/weekly-report")
async def weekly_report():
    return await _weekly_report_data()


@api.get("/maximizer/weekly-report.pdf")
async def weekly_report_pdf():
    d = await _weekly_report_data()
    brand = await state_get("brand_profile", DEFAULT_BRAND_PROFILE)

    def _latin(s):
        return str(s).encode("latin-1", "replace").decode("latin-1")

    pdf = FPDF(orientation="P", unit="mm", format="A4")
    pdf.set_auto_page_break(True, margin=14)
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 20)
    pdf.cell(0, 10, "Weekly Win Report", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(90, 90, 90)
    pdf.cell(0, 6, _latin(f"{brand.get('name', 'Your Restaurant')} - Week of {d['weekOf']} to {d['weekEnd']} (hard stop Sunday)"),
             new_x="LMARGIN", new_y="NEXT")
    pdf.ln(4)

    rows = [("Deals Redeemed", d["current"]["redeemed"], d["deltas"]["redeemed"], False),
            ("Revenue Proven", d["current"]["revenue"], d["deltas"]["revenue"], True),
            ("QR Scans", d["current"]["scans"], d["deltas"]["scans"], False),
            ("Spins Played", d["current"]["spins"], d["deltas"]["spins"], False),
            ("New Members", d["current"]["newMembers"], d["deltas"]["newMembers"], False)]
    pdf.set_text_color(211, 84, 0)
    pdf.set_font("Helvetica", "B", 12)
    pdf.cell(0, 8, "Proven at the Register", new_x="LMARGIN", new_y="NEXT")
    for label, val, delta, money in rows:
        pdf.set_text_color(30, 30, 30)
        pdf.set_font("Helvetica", "", 11)
        pdf.cell(60, 9, _latin(label))
        pdf.set_font("Helvetica", "B", 13)
        pdf.cell(35, 9, _latin(f"${val:,.2f}" if money else f"{val}"))
        pdf.set_font("Helvetica", "", 10)
        if delta > 0:
            pdf.set_text_color(39, 174, 96)
        elif delta < 0:
            pdf.set_text_color(192, 57, 43)
        else:
            pdf.set_text_color(120, 120, 120)
        sign = "+" if delta > 0 else ""
        dtxt = f"{sign}${delta:,.2f}" if money else f"{sign}{int(delta)}"
        pdf.cell(0, 9, _latin(f"{dtxt} vs prior week"), new_x="LMARGIN", new_y="NEXT")
    pdf.ln(1)
    pi = d["posImport"]
    if pi["importedThisWeek"]:
        pdf.set_text_color(39, 174, 96)
        recon = f"POS CSV imported during the week ({pi['importsInWeek']}x) - numbers reconciled."
    else:
        pdf.set_text_color(192, 57, 43)
        recon = "POS CSV was NOT imported during the week - numbers not reconciled with your register."
    pdf.set_font("Helvetica", "B", 9)
    pdf.multi_cell(0, 5, _latin(recon), new_x="LMARGIN", new_y="NEXT")
    ad = d["adSpend"]
    pdf.set_text_color(90, 90, 90)
    pdf.set_font("Helvetica", "B", 9)
    pdf.multi_cell(0, 5, _latin(f"Ad spend during the week: ${ad['total']:,.2f} (prior week ${ad['prevTotal']:,.2f}) "
                                f"- against ${d['current']['revenue']:,.2f} proven at the register."),
                   new_x="LMARGIN", new_y="NEXT")
    pdf.ln(2)

    if d["prizeBreakdown"]:
        pdf.set_text_color(211, 84, 0)
        pdf.set_font("Helvetica", "B", 12)
        pdf.cell(0, 8, "Prize Payouts (compare to your POS)", new_x="LMARGIN", new_y="NEXT")
        for p in d["prizeBreakdown"][:8]:
            pdf.set_text_color(30, 30, 30)
            pdf.set_font("Helvetica", "", 10)
            pdf.cell(80, 6.5, _latin(p["reward"][:44]))
            pdf.set_font("Helvetica", "B", 10)
            pdf.cell(30, 6.5, _latin(f"{p['redeemed']} redeemed"))
            pdf.set_text_color(39, 174, 96)
            pdf.cell(0, 6.5, _latin(f"${p['revenue']:,.2f}"), new_x="LMARGIN", new_y="NEXT")
        pdf.ln(2)

    pdf.set_text_color(211, 84, 0)
    pdf.set_font("Helvetica", "B", 12)
    pdf.cell(0, 8, "Channel Activity - what drove the business", new_x="LMARGIN", new_y="NEXT")
    for ch in d["channels"]:
        pdf.set_text_color(30, 30, 30)
        pdf.set_font("Helvetica", "B", 9.5)
        line = f"{ch['label']}: " + " - ".join(ch["lines"])
        if not ch.get("live") and ch.get("note"):
            line += "  (" + ch["note"] + ")"
        pdf.set_font("Helvetica", "", 9.5)
        pdf.multi_cell(0, 5.4, _latin(f"-  {line}"), new_x="LMARGIN", new_y="NEXT")
    pdf.set_x(10)
    pdf.ln(2)

    pdf.set_text_color(211, 84, 0)
    pdf.set_font("Helvetica", "B", 12)
    pdf.cell(0, 8, "What's Working", new_x="LMARGIN", new_y="NEXT")
    pdf.set_text_color(30, 30, 30)
    pdf.set_font("Helvetica", "", 11)
    spot = f"Top sticker spot: {d['topSpot']['spaceId']} ({d['topSpot']['plays']} plays)" if d["topSpot"] else "Top sticker spot: no spot-tagged plays last week - get QR stickers out there."
    game = f"Top game: {d['topGame']['name']} ({d['topGame']['plays']} plays)" if d["topGame"] else "Top game: no plays recorded last week."
    pdf.multi_cell(0, 7, _latin(f"-  {spot}"), new_x="LMARGIN", new_y="NEXT")
    pdf.multi_cell(0, 7, _latin(f"-  {game}"), new_x="LMARGIN", new_y="NEXT")
    pdf.ln(3)

    sf = d["soFar"]
    pdf.set_text_color(90, 90, 90)
    pdf.set_font("Helvetica", "I", 10)
    pdf.multi_cell(0, 6, _latin(f"This week so far: {sf['spins']} spins, {sf['newMembers']} new members, "
                                f"{sf['redeemed']} redeemed, ${sf['revenue']:,.2f} proven."),
                   new_x="LMARGIN", new_y="NEXT")
    pdf.ln(2)
    pdf.set_font("Helvetica", "I", 8)
    pdf.set_text_color(150, 150, 150)
    pdf.cell(0, 6, _latin("OmniLocal #1 - start campaigns any day, hard stop Sunday. New week, new play."),
             new_x="LMARGIN", new_y="NEXT")
    out = pdf.output()
    return Response(content=bytes(out), media_type="application/pdf",
                    headers={"Content-Disposition": f"attachment; filename=weekly-win-report-{d['weekOf']}.pdf"})


# ---------------------------------------------------------------------------
# WEEKLY WIN REPORT AUTO-EMAIL — Mondays 8am local, live once RESEND_API_KEY set
# ---------------------------------------------------------------------------
WIN_REPORT_HOUR_LOCAL = 8
DEFAULT_REPORT_TZ = "America/New_York"


def _win_report_html(d, brand):
    def delta_cell(v, money=False):
        color = "#27AE60" if v > 0 else ("#C0392B" if v < 0 else "#888888")
        sign = "+" if v > 0 else ""
        txt = f"{sign}${v:,.2f}" if money else f"{sign}{int(v)}"
        return f"<td style='padding:6px 12px;color:{color};font-size:13px'>{txt} wk/wk</td>"

    stats = [("Deals Redeemed", "redeemed", False), ("Revenue Proven", "revenue", True),
             ("QR Scans", "scans", False), ("Spins Played", "spins", False),
             ("New Members", "newMembers", False)]
    rows = ""
    for label, key, money in stats:
        val = f"${d['current'][key]:,.2f}" if money else d["current"][key]
        rows += (f"<tr style='border-bottom:1px solid #eee'><td style='padding:6px 12px'>{label}</td>"
                 f"<td style='padding:6px 12px'><b>{val}</b></td>{delta_cell(d['deltas'][key], money)}</tr>")
    pi = d["posImport"]
    recon = ("<p style='color:#27AE60;font-size:13px'><b>POS CSV imported during the week - numbers reconciled.</b></p>"
             if pi["importedThisWeek"] else
             "<p style='color:#C0392B;font-size:13px'><b>POS CSV was NOT imported during the week - "
             "numbers not reconciled with your register.</b></p>")
    ad = d["adSpend"]
    spend_line = (f"<p style='color:#555;font-size:13px'><b>Ad spend: ${ad['total']:,.2f}</b> "
                  f"(prior week ${ad['prevTotal']:,.2f}) - against ${d['current']['revenue']:,.2f} "
                  f"proven at the register.</p>")
    prizes = ""
    if d["prizeBreakdown"]:
        prows = "".join(f"<tr><td style='padding:4px 12px'>{p['reward']}</td>"
                        f"<td style='padding:4px 12px'><b>{p['redeemed']} redeemed</b></td>"
                        f"<td style='padding:4px 12px;color:#27AE60'>${p['revenue']:,.2f}</td></tr>"
                        for p in d["prizeBreakdown"][:8])
        prizes = (f"<h3 style='margin-bottom:4px'>Prize Payouts (compare to your POS)</h3>"
                  f"<table style='border-collapse:collapse'>{prows}</table>")
    chan_rows = ""
    for ch in d["channels"]:
        note = "" if ch.get("live") or not ch.get("note") else f" <span style='color:#aaa'>({ch['note']})</span>"
        chan_rows += (f"<li style='margin-bottom:4px'><b>{ch['label']}</b>: "
                      f"{' &middot; '.join(ch['lines'])}{note}</li>")
    spot = (f"Top spot: <b>{d['topSpot']['spaceId']}</b> ({d['topSpot']['plays']} plays)"
            if d["topSpot"] else "No spot-tagged plays last week - get QR stickers out there.")
    game = (f"Top game: <b>{d['topGame']['name']}</b> ({d['topGame']['plays']} plays)"
            if d["topGame"] else "No plays recorded last week.")
    return (f"<h2 style='margin-bottom:2px'>Weekly Win Report</h2>"
            f"<p style='color:#888;margin-top:0'>{brand.get('name', 'Your Restaurant')} - week of "
            f"{d['weekOf']} to {d['weekEnd']} (hard stop Sunday)</p>"
            f"{recon}"
            f"{spend_line}"
            f"<table style='border-collapse:collapse'>{rows}</table>"
            f"{prizes}"
            f"<h3 style='margin-bottom:4px'>Channel Activity - what drove the business</h3>"
            f"<ul style='padding-left:18px;font-size:14px'>{chan_rows}</ul>"
            f"<p style='margin-top:10px'>{spot}<br/>{game}</p>"
            f"<p style='color:#888;font-size:12px'>Start campaigns any day - the week closes hard on Sunday. "
            f"New week, new play. - OmniLocal #1</p>")


async def _send_win_report_email():
    d = await _weekly_report_data()
    brand = await state_get("brand_profile", DEFAULT_BRAND_PROFILE)
    s = await state_get("win_report_email") or {}
    recipient = s.get("recipient")
    if not recipient:
        owner = await db.users.find_one({"role": "owner"}, {"_id": 0})
        recipient = (owner or {}).get("email")
    if not recipient:
        raise HTTPException(status_code=400, detail="No owner email on file - set a recipient first.")
    subject = (f"Weekly Win Report - {d['current']['spins']} spins, "
               f"${d['current']['revenue']:,.2f} proven ({d['weekOf']})")
    res = await send_via_resend(recipient, subject, _win_report_html(d, brand), f"{UNSUBSCRIBE_BASE}?u=owner")
    s.update({"lastSentWeekOf": d["weekOf"], "lastSentAt": datetime.now(timezone.utc).isoformat(),
              "lastResult": res["status"]})
    await state_set("win_report_email", s)
    return {**res, "weekOf": d["weekOf"], "subject": subject}


async def _win_report_scheduler():
    await asyncio.sleep(20)
    while True:
        try:
            s = await state_get("win_report_email") or {}
            tz = ZoneInfo(s.get("timezone") or DEFAULT_REPORT_TZ)
            local = datetime.now(tz)
            if s.get("enabled", True) and local.weekday() == 0 and local.hour >= WIN_REPORT_HOUR_LOCAL:
                d = await _weekly_report_data()
                if s.get("lastSentWeekOf") != d["weekOf"]:
                    await _send_win_report_email()
                    logger.info("Weekly Win Report auto-email dispatched.")
            if local.weekday() == 4 and local.hour >= 10:
                n, monday = await _pos_imports_this_week()
                nudge_state = await state_get("import_nudge") or {}
                week_key = monday.strftime("%Y-%m-%d")
                if n == 0 and nudge_state.get("lastNudgeWeekOf") != week_key:
                    recipient = s.get("recipient")
                    if not recipient:
                        owner = await db.users.find_one({"role": "owner"}, {"_id": 0})
                        recipient = (owner or {}).get("email")
                    if recipient:
                        res = await _send_import_nudge_email(recipient)
                        await state_set("import_nudge", {"lastNudgeWeekOf": week_key,
                                                         "sentAt": datetime.now(timezone.utc).isoformat(),
                                                         "result": res["status"]})
                        logger.info("Friday POS-import nudge dispatched.")
        except Exception:
            logger.exception("Win report scheduler tick failed")
        await asyncio.sleep(900)


class ReportEmailReq(BaseModel):
    enabled: Optional[bool] = None
    recipient: Optional[str] = None
    timezone: Optional[str] = None


async def _report_email_view():
    s = await state_get("win_report_email") or {}
    recipient = s.get("recipient")
    if not recipient:
        owner = await db.users.find_one({"role": "owner"}, {"_id": 0})
        recipient = (owner or {}).get("email")
    tz = s.get("timezone") or DEFAULT_REPORT_TZ
    return {"enabled": s.get("enabled", True), "recipient": recipient, "timezone": tz,
            "lastSentWeekOf": s.get("lastSentWeekOf"), "lastSentAt": s.get("lastSentAt"),
            "lastResult": s.get("lastResult"), "liveSending": bool(RESEND_API_KEY),
            "schedule": f"Mondays {WIN_REPORT_HOUR_LOCAL}:00am ({tz})"}


@api.get("/maximizer/report-email")
async def report_email_get():
    return await _report_email_view()


@api.put("/maximizer/report-email")
async def report_email_put(req: ReportEmailReq):
    s = await state_get("win_report_email") or {}
    if req.enabled is not None:
        s["enabled"] = req.enabled
    if req.recipient is not None:
        s["recipient"] = req.recipient.strip() or None
    if req.timezone is not None:
        try:
            ZoneInfo(req.timezone)
        except Exception:
            raise HTTPException(status_code=400, detail="Unknown timezone.")
        s["timezone"] = req.timezone
    await state_set("win_report_email", s)
    return await _report_email_view()


@api.post("/maximizer/report-email/send-now")
async def report_email_send_now():
    return await _send_win_report_email()


# ---------------------------------------------------------------------------
# AD SPEND LOG — owners record what they boosted; report shows spend vs results
# ---------------------------------------------------------------------------
_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


class AdSpendReq(BaseModel):
    platform: str
    label: str
    amount: float
    date: Optional[str] = None


@api.post("/maximizer/ad-spend")
async def ad_spend_add(req: AdSpendReq):
    label = req.label.strip()[:80]
    if not label:
        raise HTTPException(status_code=400, detail="Say what you boosted.")
    if not 0 < req.amount <= 100000:
        raise HTTPException(status_code=400, detail="Enter a spend amount above $0.")
    date = (req.date or datetime.now(timezone.utc).strftime("%Y-%m-%d")).strip()
    if not _DATE_RE.match(date):
        raise HTTPException(status_code=400, detail="Date must be YYYY-MM-DD.")
    doc = {"id": str(uuid.uuid4()), "platform": req.platform.strip().lower()[:24] or "other",
           "label": label, "amount": round(req.amount, 2), "date": date,
           "at": datetime.now(timezone.utc).isoformat()}
    await db.ad_spend.insert_one(dict(doc))
    return doc


@api.get("/maximizer/ad-spend")
async def ad_spend_list():
    return {"entries": await db.ad_spend.find({}, {"_id": 0}).sort([("date", -1), ("at", -1)]).to_list(50)}


@api.delete("/maximizer/ad-spend/{sid}")
async def ad_spend_delete(sid: str):
    r = await db.ad_spend.delete_one({"id": sid})
    if r.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Spend entry not found.")
    return {"ok": True}


# ---------------------------------------------------------------------------
# POS IMPORT ACCOUNTABILITY — Friday nudge if the weekly CSV isn't in yet
# ---------------------------------------------------------------------------
async def _pos_imports_this_week():
    now = datetime.now(timezone.utc)
    monday = (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
    n = await db.activity_log.count_documents({"action": "pos_import", "at": {"$gte": monday.isoformat()}})
    return n, monday


@api.get("/maximizer/import-status")
async def import_status():
    n, monday = await _pos_imports_this_week()
    last = await db.activity_log.find_one({"action": "pos_import"}, {"_id": 0}, sort=[("at", -1)])
    s = await state_get("win_report_email") or {}
    local = datetime.now(ZoneInfo(s.get("timezone") or DEFAULT_REPORT_TZ))
    return {"importedThisWeek": n > 0, "importsThisWeek": n,
            "lastImportAt": last["at"] if last else None,
            "weekOf": monday.strftime("%Y-%m-%d"),
            "nudge": n == 0 and local.weekday() >= 4}


async def _send_import_nudge_email(recipient):
    html = ("<h2>This week's POS CSV isn't in yet</h2>"
            "<p>It's Friday and no POS CSV has been imported this week. Import it before Sunday close "
            "so Monday's Win Report reconciles with your register — no import, no reconciled numbers.</p>"
            "<p style='color:#888;font-size:12px'>OmniLocal #1 - Rewards module &rarr; Import weekly POS CSV.</p>")
    return await send_via_resend(recipient, "Heads up: this week's POS CSV isn't imported yet",
                                 html, f"{UNSUBSCRIBE_BASE}?u=owner")


@api.get("/maximizer/segments")
async def maximizer_segments():
    customers = await state_get("customers")
    rows = rfmd_segment(customers)
    counts = {"vip": 0, "standard": 0, "promo_pool": 0}
    for r in rows:
        counts[r["segment"]] += 1
    dash = await _redemptions_summary()
    member_total = await db.members.count_documents({})
    if member_total:
        couponers = await db.members.count_documents({"segment": "coupon_only"})
        quality = await db.members.count_documents({"segment": "loyal"})
        note = (f"Live from {member_total} real reward members (POS imports + wheel signups) and the "
                "redemptions ledger — every code is tracked issued → redeemed → revenue.")
    else:
        couponers, quality = counts["promo_pool"], counts["vip"]
        note = ("Live from the redemptions ledger — every scan-to-spin code is tracked "
                "issued → redeemed → revenue, so couponers and quality regulars are separated by real behavior.")
    verification = {"codesIssued": dash["codesIssued"], "codesRedeemed": dash["codesRedeemed"],
                    "redemptionRate": dash["redemptionRate"], "revenueFromRedemptions": dash["revenueFromRedemptions"],
                    "couponers": couponers, "qualityCustomers": quality,
                    "note": note}
    return {"rows": rows, "counts": counts, "verification": verification}


@api.get("/maximizer/drip")
async def maximizer_drip():
    plan = drip_schedule()
    videos = await db.vault.find({}, {"_id": 0}).sort("uploadedAt", 1).to_list(200)
    plan["vaultCount"] = len(videos)
    featured = next((x for x in videos if x.get("featured")), None)
    plan["featured"] = {"id": featured["id"], "title": featured["title"]} if featured else None
    if videos:
        pool = [v for v in videos if not v.get("featured")] or videos
        for i, step in enumerate(plan["steps"]):
            v = featured if (featured and i % 3 == 0) else pool[i % len(pool)]
            step["video"] = {"id": v["id"], "title": v["title"], "url": f"/api/vault/video/{v['id']}"}
    return plan


@api.get("/maximizer/games")
async def maximizer_games():
    override = await state_get("game_override")
    settings = await get_game_settings()
    return {"games": GAMES, "active": await resolve_active_game(), "rotationDays": 30,
            "override": override, "playFrequencyDays": settings["playFrequencyDays"],
            "codeExpiryDays": settings["codeExpiryDays"], "enabled": settings.get("enabled", True)}


@api.put("/maximizer/games/active")
async def maximizer_set_game(req: GameReq):
    override = req.gameId or None
    await state_set("game_override", override)
    return {"active": active_game(override), "override": override}


# ---------------------------------------------------------------------------
# PRIZE BOARD — owner-defined slots mapped to their own POS codes
# ---------------------------------------------------------------------------
class PrizeSlot(BaseModel):
    label: str
    posCode: Optional[str] = ""


class PrizeBoardReq(BaseModel):
    goodPrizes: List[PrizeSlot]
    dudPrize: PrizeSlot


@api.get("/maximizer/prize-board")
async def prize_board_get():
    return await state_get("prize_board", DEFAULT_PRIZE_BOARD)


@api.put("/maximizer/prize-board")
async def prize_board_put(req: PrizeBoardReq):
    good = [{"label": p.label.strip()[:60], "posCode": (p.posCode or "").strip()[:24]}
            for p in req.goodPrizes if p.label.strip()]
    if not 2 <= len(good) <= 6:
        raise HTTPException(status_code=400, detail="Add between 2 and 6 good prizes.")
    if not req.dudPrize.label.strip():
        raise HTTPException(status_code=400, detail="The coupon-abuser dud prize needs a label.")
    board = {"goodPrizes": good,
             "dudPrize": {"label": req.dudPrize.label.strip()[:60],
                          "posCode": (req.dudPrize.posCode or "").strip()[:24]}}
    await state_set("prize_board", board)
    return board


@api.get("/maximizer/sample-customer-csv")
async def sample_customer_csv():
    rng = random.Random(11)
    names = ["Grace H.", "Leo P.", "The Ruiz Family", "Nina B.", "Marcus D.", "Priya S.",
             "Owen T.", "Sasha K.", "Deli Regular", "First Timer Joe", "Coupon Carl", "Loyal Lucy"]
    lines = ["name,email,phone,visits,coupon_ratio,reward_points"]
    for i, n in enumerate(names):
        v = 1 if i < 3 else rng.randint(2, 12)
        cr = 0.1 if i < 3 else _round(rng.choice([0.0, 0.1, 0.2, 0.7, 0.9]))
        email = n.lower().replace(" ", ".").replace("'", "") + "@example.com"
        phone = f"555{rng.randint(1000000, 9999999)}"
        lines.append(f"{n},{email},{phone},{v},{cr},{rng.randint(0, 500)}")
    return {"csv": "\n".join(lines)}


CSV_COL_ALIASES = {
    "name": {"name", "customer", "customer name", "customer_name", "full name"},
    "email": {"email", "e-mail", "email address", "contact email", "contact_email"},
    "phone": {"phone", "number", "mobile", "phone number", "phone_number", "contact", "contact number", "cell"},
    "visits": {"visits", "visit", "orders", "order count", "order_count", "frequency", "total orders", "total_orders"},
    "coupon_ratio": {"coupon_ratio", "coupon ratio", "coupons", "coupon rate", "coupon_rate",
                     "discount ratio", "discount_ratio", "discount rate", "discount_rate"},
}


def _map_csv_header(header):
    mapping = {}
    for idx, raw in enumerate(header):
        key = raw.strip().lower()
        for field, aliases in CSV_COL_ALIASES.items():
            if key in aliases and field not in mapping:
                mapping[field] = idx
    return mapping if "name" in mapping and ("email" in mapping or "phone" in mapping) else None


@api.post("/maximizer/import-csv")
async def maximizer_import_csv(req: CustomerCsvReq):
    queue = await state_get("welcome_queue")
    counts = {"new": 0, "coupon_only": 0, "loyal": 0}
    rows, new_queued = [], 0
    parsed = [r for r in csvmod.reader(io.StringIO(req.csv.strip())) if r]
    if not parsed:
        return {"imported": 0, "segments": counts, "rows": [], "newCustomersQueued": 0}
    mapping = _map_csv_header(parsed[0])
    data_rows = parsed[1:] if mapping else parsed
    if mapping is None:
        mapping = {"name": 0, "email": 1, "visits": 2, "coupon_ratio": 3}
        if data_rows and len(data_rows[0]) >= 3 and data_rows[0][2].strip().lower() in ("visits", "visit"):
            data_rows = data_rows[1:]

    def col(parts, field):
        i = mapping.get(field)
        return parts[i].strip() if i is not None and i < len(parts) else ""

    for parts in data_rows:
        name = col(parts, "name")
        email = _norm_email(col(parts, "email"))
        phone = _norm_phone(col(parts, "phone"))
        if not name or (not email and not phone):
            continue
        try:
            visits = int(float(col(parts, "visits") or 1))
        except ValueError:
            visits = 1
        try:
            coupon_ratio = float(col(parts, "coupon_ratio") or 0.0)
        except ValueError:
            coupon_ratio = 0.0
        seg = _segment_customer(visits, coupon_ratio)
        counts[seg] += 1
        rows.append({"name": name, "email": email, "phone": phone or None,
                     "visits": visits, "couponRatio": coupon_ratio, "segment": seg})
        if seg == "new":
            new_queued += 1
            scheduled = (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat()
            queue.append({"name": name, "email": email or phone, "status": "queued",
                          "scheduledAt": scheduled, "channel": "email" if email else "sms"})
    now_iso = datetime.now(timezone.utc).isoformat()
    for r_ in rows:
        key = r_["email"] or r_["phone"]
        await db.members.update_one(
            {"memberKey": key},
            {"$set": {"email": r_["email"] or None, "phone": r_["phone"], "name": r_["name"],
                      "visits": r_["visits"], "couponRatio": r_["couponRatio"], "segment": r_["segment"],
                      "source": "pos_import", "updatedAt": now_iso},
             "$setOnInsert": {"memberKey": key, "createdAt": now_iso, "lastSpinAt": None}},
            upsert=True)
    await state_set("welcome_queue", queue)
    await log_activity("pos_import", imported=len(rows), newQueued=new_queued)
    return {"imported": len(rows), "segments": counts, "rows": rows, "newCustomersQueued": new_queued}


@api.get("/maximizer/welcome-queue")
async def maximizer_welcome_queue(request: Request):
    queue = await state_get("welcome_queue")
    v = await _welcome_vault_video()
    if v:
        return {"queue": queue, "ownerVideoUrl": _abs_url(request, f"/api/vault/video/{v['id']}"),
                "videoTitle": v["title"], "script": WELCOME_SCRIPT, "videoSource": "vault"}
    return {"queue": queue, "ownerVideoUrl": OWNER_VIDEO_URL, "script": WELCOME_SCRIPT, "videoSource": "stub"}


@api.get("/connections")
async def get_connections():
    return _connections_payload(await state_get("connections"), await state_get("oauth_tokens"))


@api.put("/connections")
async def set_connection(req: ConnReq):
    connections = await state_get("connections")
    tokens = await state_get("oauth_tokens")
    if req.platform in connections:
        connections[req.platform] = req.connected
        if not req.connected:
            tokens.pop(req.platform, None)
        await state_set("connections", connections)
        await state_set("oauth_tokens", tokens)
    return _connections_payload(connections, tokens)


@api.get("/connections/pathways")
async def connection_pathways():
    return {"pathways": DISTRIBUTION_PATHWAYS, "provider": UNIFIED_PROVIDER, "liveOAuth": bool(UNIFIED_API_KEY)}


@api.get("/connections/oauth/{platform}/start")
async def oauth_start(platform: str):
    connections = await state_get("connections")
    if platform not in connections:
        raise HTTPException(status_code=404, detail="unknown platform")
    state = "".join(random.choice(CODE_ALPHABET) for _ in range(16))
    authorize_url = (f"https://auth.{UNIFIED_PROVIDER}.example/authorize"
                     f"?platform={platform}&state={state}&provider={UNIFIED_PROVIDER}")
    return {"platform": platform, "state": state, "provider": UNIFIED_PROVIDER,
            "authorizeUrl": authorize_url, "live": bool(UNIFIED_API_KEY),
            "note": "Stubbed handshake. Set UNIFIED_API_KEY to route through the live provider."}


@api.post("/connections/oauth/callback")
async def oauth_callback(req: OAuthCallbackReq):
    connections = await state_get("connections")
    tokens = await state_get("oauth_tokens")
    if req.platform not in connections:
        raise HTTPException(status_code=404, detail="unknown platform")
    token = {"accessToken": "stub_" + "".join(random.choice(CODE_ALPHABET) for _ in range(24)),
             "provider": UNIFIED_PROVIDER, "connectedAt": datetime.now(timezone.utc).isoformat(),
             "mode": "live" if UNIFIED_API_KEY else "stubbed"}
    tokens[req.platform] = token
    connections[req.platform] = True
    await state_set("connections", connections)
    await state_set("oauth_tokens", tokens)
    payload = _connections_payload(connections, tokens)
    payload["authorized"] = {"platform": req.platform, "mode": token["mode"], "connectedAt": token["connectedAt"]}
    return payload


@api.get("/codes/current")
async def codes_current():
    b = await state_get("current_batch")
    return {k: v for k, v in b.items() if k != "allCodes"}


@api.post("/codes/generate")
async def codes_generate(req: CodeGenReq):
    b = generate_batch(req.length)
    await state_set("current_batch", b)
    return {k: v for k, v in b.items() if k != "allCodes"}


@api.get("/codes/sample-csv")
async def codes_sample_csv():
    b = await state_get("current_batch")
    return {"csv": _sample_csv(b)}


@api.post("/codes/reconcile")
async def codes_reconcile(req: ReconcileReq):
    b = await state_get("current_batch")
    return reconcile_csv(req.csv, b)


@api.post("/email/preview")
async def email_preview(req: PreviewReq):
    return sanitize_content(req.content)


@api.get("/email/trickle-plan")
async def email_trickle_plan(total: int = 3000):
    days = 30
    per_day = -(-total // days)
    sample = trickle_sample_content()
    san = sanitize_content(sample["html"])
    return {"totalList": total, "days": days, "perDay": per_day, "throttleSeconds": THROTTLE_SECONDS,
            "provider": "resend", "liveSending": bool(RESEND_API_KEY),
            "headers": build_email_headers(UNSUBSCRIBE_BASE + "?u=example"),
            "sampleContent": sample, "sanitization": san,
            "philosophy": ("Quality-first: long-form story or video, offer at the end. "
                           f"~{per_day} recipients/day, 1 email every {THROTTLE_SECONDS}s — never a mass blast.")}


async def _do_send_welcome(payload):
    queue = await state_get("welcome_queue")
    if not queue:
        return {"status": "empty", "note": "No new customers queued. Import a CSV first."}
    idx = max(0, min(payload.get("index", 0), len(queue) - 1))
    item = queue[idx]
    unsub = f"{UNSUBSCRIBE_BASE}?e={item['email']}"
    v = await _welcome_vault_video()
    video_src = f"/api/vault/video/{v['id']}" if v else OWNER_VIDEO_URL
    html = (f"<div style='font-family:sans-serif'><h2>A personal thank-you</h2>"
            f"<p><video src='{video_src}' controls width='320'></video></p>"
            f"<p>{WELCOME_SCRIPT}</p></div>")
    res = await send_via_resend(item["email"], "A personal thank-you from the owner", html, unsub)
    item["status"] = "sent" if res["status"] in ("sent", "stubbed") else "failed"
    item["deliveryMode"] = res["status"]
    await state_set("welcome_queue", queue)
    await log_activity("welcome_email", channel=item.get("channel", "email"), delivery=res["status"])
    return {"result": res, "videoUrl": video_src, "videoSource": "vault" if v else "stub", "queueItem": item}


@api.post("/email/send-welcome")
async def email_send_welcome(req: SendWelcomeReq, request: Request):
    queue = await state_get("welcome_queue") or []
    who = queue[max(0, min(req.index, len(queue) - 1))]["email"] if queue else "the welcome queue"
    summary = f"Send the owner welcome-video email to {who}"
    return await auth.submit_or_execute(request, "send_welcome", req.dict(), summary)


# ===========================================================================
# PHASE 1B — REAL VIDEO CRITIC (upload → Whisper + vision → grades)
# Object storage (S3), pip-bundled ffmpeg for audio/frames, Whisper
# transcription, gpt-4o vision framing analysis, fed into the same rubric.
# ===========================================================================
FFMPEG_EXE = imageio_ffmpeg.get_ffmpeg_exe()
UPLOAD_DIR = Path(tempfile.gettempdir()) / "omnilocal_uploads"
UPLOAD_DIR.mkdir(exist_ok=True)
MAX_UPLOAD_BYTES = 80 * 1024 * 1024
VIDEO_MIME = {"mp4": "video/mp4", "mov": "video/quicktime", "webm": "video/webm",
              "m4v": "video/x-m4v", "avi": "video/x-msvideo"}
ACTION_OPENERS = {"watch", "look", "check", "grab", "taste", "try", "meet", "stop", "listen",
                  "see", "come", "welcome", "here's", "here", "introducing", "new", "this"}

APP_NAME = "omnilocal"
STORAGE_BUCKET = os.environ.get("S3_BUCKET")
_s3_client = None


def init_storage():
    """Create the S3 client (standard AWS credential chain) and verify the bucket."""
    global _s3_client
    if _s3_client is None:
        if not STORAGE_BUCKET:
            raise RuntimeError("S3_BUCKET is not configured.")
        import boto3
        _s3_client = boto3.client(
            "s3",
            region_name=os.environ.get("S3_REGION") or None,
            endpoint_url=os.environ.get("S3_ENDPOINT_URL") or None,
        )
        _s3_client.head_bucket(Bucket=STORAGE_BUCKET)
    return _s3_client


def put_object(path, data, content_type):
    init_storage().put_object(Bucket=STORAGE_BUCKET, Key=path, Body=data, ContentType=content_type)
    return {"path": path}


def get_object(path):
    obj = init_storage().get_object(Bucket=STORAGE_BUCKET, Key=path)
    return obj["Body"].read(), obj.get("ContentType", "application/octet-stream")


def _parse_duration(stderr):
    m = re.search(r"Duration:\s*(\d+):(\d+):(\d+\.?\d*)", stderr or "")
    if not m:
        return 0.0
    return int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3))


def _parse_astats(stderr):
    rms = re.findall(r"RMS level dB:\s*(-?\d+\.?\d*)", stderr or "")
    noise = re.findall(r"Noise floor dB:\s*(-?\d+\.?\d*)", stderr or "")
    rms_v = float(rms[-1]) if rms else None
    noise_v = float(noise[-1]) if noise else None
    return rms_v, noise_v


def _ffmpeg_extract(video_bytes, ext):
    """Blocking ffmpeg work — run via asyncio.to_thread. Extracts a 16k mono WAV,
    duration, real audio levels (astats), and a few early JPEG frames (base64)."""
    tmp = tempfile.mkdtemp(prefix="critic_")
    inp = os.path.join(tmp, f"in.{ext}")
    wav = os.path.join(tmp, "audio.wav")
    with open(inp, "wb") as f:
        f.write(video_bytes)
    r1 = subprocess.run([FFMPEG_EXE, "-y", "-i", inp, "-vn", "-ac", "1", "-ar", "16000", wav],
                        capture_output=True, text=True)
    duration = _parse_duration(r1.stderr)
    has_audio = os.path.exists(wav) and os.path.getsize(wav) > 1024
    rms_v = noise_v = None
    if has_audio:
        r2 = subprocess.run([FFMPEG_EXE, "-i", inp, "-af", "astats=metadata=1:reset=0", "-f", "null", "-"],
                            capture_output=True, text=True)
        rms_v, noise_v = _parse_astats(r2.stderr)
        if rms_v is None:
            r3 = subprocess.run([FFMPEG_EXE, "-i", inp, "-af", "volumedetect", "-f", "null", "-"],
                                capture_output=True, text=True)
            mv = re.search(r"mean_volume:\s*(-?\d+\.?\d*)", r3.stderr or "")
            rms_v = float(mv.group(1)) if mv else -20.0
            noise_v = rms_v - 30.0
    span = max(0.2, (duration or 3.0) - 0.15)
    times = sorted({round(min(t, span), 2) for t in [0.3, 0.8, 1.5, 2.5, (duration or 3.0) * 0.6]})
    frames = []
    for i, t in enumerate(times):
        out = os.path.join(tmp, f"f{i}.jpg")
        subprocess.run([FFMPEG_EXE, "-y", "-ss", str(t), "-i", inp, "-frames:v", "1",
                        "-vf", "scale=512:-1", "-q:v", "5", out], capture_output=True, text=True)
        if os.path.exists(out):
            frames.append(base64.b64encode(Path(out).read_bytes()).decode())
    return {"tmpdir": tmp, "audioPath": wav if has_audio else None, "hasAudio": has_audio,
            "duration": duration, "rmsDb": rms_v, "noiseDb": noise_v, "frames": frames, "frameTimes": times}


async def _transcribe(wav_path):
    if not wav_path:
        return ""
    return await asyncio.wait_for(ai.transcribe_wav(wav_path), timeout=90)


async def _vision_frames(frames, frame_times):
    default = {"subjectFirstVisibleSeconds": 2.0, "subjectLit": "front", "subjectCutOff": False, "clutterScore": 0.3}
    if not frames:
        return default
    system = "You are a brutally precise short-form video framing analyst for local-business marketing. You reply ONLY with minified JSON."
    prompt = (
        f"These {len(frames)} JPEG frames are sampled in chronological order at approximately "
        f"{frame_times} seconds from the start of a vertical marketing video. The SUBJECT is the "
        "person talking or the food/product being shown. Analyze and return ONLY this JSON:\n"
        '{"subjectFirstVisibleSeconds": <number: the earliest listed time where a clear subject '
        'fills a meaningful part of the frame; if never clearly visible use the last time>, '
        '"subjectLit": "front"|"side"|"back" (direction the main light hits the subject; "back" '
        'means the subject is a dark silhouette against a bright background), '
        '"subjectCutOff": true|false (is the subject clipped awkwardly by a frame edge), '
        '"clutterScore": <0..1 how visually busy/distracting the background is>}'
    )
    text = await asyncio.wait_for(
        ai.openai_vision_complete(system=system, prompt=prompt, images_base64=frames), timeout=75)
    try:
        t = text.strip()
        if t.startswith("```"):
            t = re.sub(r"^```[a-zA-Z]*\n?", "", t)
            t = re.sub(r"\n?```$", "", t).strip()
        s, e = t.find("{"), t.rfind("}")
        data = json.loads(t[s:e + 1])
        return {**default, **{k: data[k] for k in default if k in data}}
    except Exception:
        logger.warning("Vision JSON parse failed: %s", text[:200])
        return default


def _assemble_report(filename, transcript, proc, vision):
    words = re.findall(r"[A-Za-z']+", transcript)
    first_words = " ".join(transcript.split()[:5]) or "(no speech detected)"
    first_word = words[0].lower() if words else ""
    starts_action = first_word in ACTION_OPENERS
    dur = proc["duration"] or max(len(words) / 2.5, 1)
    wpm = (len(words) / (dur / 60)) if dur else 0
    energy = "high" if wpm > 150 else ("moderate" if wpm >= 100 else "flat")
    try:
        subj_secs = float(vision.get("subjectFirstVisibleSeconds", 2.0))
    except (TypeError, ValueError):
        subj_secs = 2.0
    analysis = {
        "filename": filename,
        "hook": {"startsWithAction": starts_action, "firstWords": first_words, "secondsBeforeSubject": subj_secs},
        "audio": {"avgLoudnessDb": round(proc["rmsDb"] if proc["rmsDb"] is not None else -20.0, 1),
                  "backgroundNoiseDb": round(proc["noiseDb"] if proc["noiseDb"] is not None else -50.0, 1),
                  "energy": energy if proc["hasAudio"] else "flat"},
        "framing": {"subjectLit": vision.get("subjectLit", "front"),
                    "subjectCutOff": bool(vision.get("subjectCutOff", False)),
                    "clutterScore": float(vision.get("clutterScore", 0.3))},
    }
    report = score_video(analysis)
    report["measured"] = {"durationSec": round(dur, 1), "wordsPerMinute": round(wpm),
                          "hasAudio": proc["hasAudio"], "framesAnalyzed": len(proc["frames"])}
    return report, analysis


class UploadInitReq(BaseModel):
    filename: str


class AnalyzeReq(BaseModel):
    uploadId: str
    filename: str
    templateId: Optional[str] = None


_UPLOAD_ID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")


def _upload_part(upload_id: str):
    if not _UPLOAD_ID_RE.match(upload_id or ""):
        raise HTTPException(status_code=400, detail="Invalid uploadId.")
    return UPLOAD_DIR / f"{upload_id}.part"


@api.post("/content/critic/upload/init")
async def critic_upload_init(req: UploadInitReq):
    uid = str(uuid.uuid4())
    (UPLOAD_DIR / f"{uid}.part").write_bytes(b"")
    return {"uploadId": uid, "filename": req.filename}


@api.post("/content/critic/upload/chunk")
async def critic_upload_chunk(uploadId: str = Form(...), index: int = Form(...), chunk: UploadFile = File(...)):
    part = _upload_part(uploadId)
    if not part.exists():
        raise HTTPException(status_code=404, detail="Unknown uploadId. Re-initialize the upload.")
    data = await chunk.read()
    with open(part, "ab") as f:
        f.write(data)
    size = part.stat().st_size
    if size > MAX_UPLOAD_BYTES:
        part.unlink(missing_ok=True)
        raise HTTPException(status_code=413, detail="Video too large (max 80MB). Upload a shorter clip.")
    return {"uploadId": uploadId, "index": index, "size": size}


@api.post("/content/critic/analyze")
async def critic_analyze(req: AnalyzeReq):
    part = _upload_part(req.uploadId)
    if not part.exists() or part.stat().st_size == 0:
        raise HTTPException(status_code=404, detail="No uploaded video found for this uploadId.")
    video_bytes = part.read_bytes()
    ext = (req.filename.rsplit(".", 1)[-1] if "." in req.filename else "mp4").lower()
    if ext not in VIDEO_MIME:
        ext = "mp4"
    proc = await asyncio.to_thread(_ffmpeg_extract, video_bytes, ext)
    try:
        if not proc["frames"] and not proc["hasAudio"]:
            raise HTTPException(status_code=422,
                                detail="Couldn't read video or audio from this file. Upload an MP4/MOV with sound.")
        transcript = await _transcribe(proc["audioPath"])
        vision = await _vision_frames(proc["frames"], proc["frameTimes"])
        report, analysis = _assemble_report(req.filename, transcript, proc, vision)
        plan_check = None
        if req.templateId:
            tdoc = await db.coach_templates.find_one({"id": req.templateId}, {"_id": 0})
            if tdoc:
                try:
                    plan_check = await ai_plan_check(tdoc["template"], transcript, report)
                except Exception:
                    logger.exception("Plan check failed (analysis still returned)")
        video_id = str(uuid.uuid4())
        video_url = None
        try:
            path = f"{APP_NAME}/critic/{video_id}.{ext}"
            await asyncio.to_thread(put_object, path, video_bytes, VIDEO_MIME.get(ext, "video/mp4"))
            video_url = f"/api/content/critic/video/{video_id}"
        except Exception:
            logger.exception("Object storage upload failed (analysis still returned)")
            path = None
        await db.video_critiques.insert_one({
            "id": video_id, "filename": req.filename, "storagePath": path,
            "contentType": VIDEO_MIME.get(ext, "video/mp4"), "transcript": transcript,
            "analysis": analysis, "report": report, "planCheck": plan_check,
            "createdAt": datetime.now(timezone.utc).isoformat()})
        return {"report": report, "transcript": transcript, "analysis": analysis,
                "videoUrl": video_url, "id": video_id, "planCheck": plan_check}
    except HTTPException:
        raise
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="Analysis timed out. Try a shorter clip.")
    except Exception as e:
        logger.exception("Video critic analysis failed")
        raise HTTPException(status_code=502, detail="Analysis failed. Please try again.")
    finally:
        shutil.rmtree(proc["tmpdir"], ignore_errors=True)
        part.unlink(missing_ok=True)


@api.get("/content/critic/video/{video_id}")
async def critic_video(video_id: str):
    doc = await db.video_critiques.find_one({"id": video_id})
    if not doc or not doc.get("storagePath"):
        raise HTTPException(status_code=404, detail="Video not found.")
    data, ct = await asyncio.to_thread(get_object, doc["storagePath"])
    return Response(content=data, media_type=doc.get("contentType", ct))


# ===========================================================================
# ONBOARDING VIDEO VAULT — film-once guided capture, feeds emails & drip
# ===========================================================================
VAULT_PROMPTS = [
    {"id": "tour", "title": "Walk through your whole place", "category": "tour",
     "direction": "One take, phone in hand. Walk the path a customer takes, door to counter. Don't tidy up first — raw is the point."},
    {"id": "menu_items", "title": "Your best sellers, up close", "category": "menu",
     "direction": "Get close. Texture, motion, detail — the thing people come to you for. 15–30 seconds each. No narration needed."},
    {"id": "kitchen", "title": "Your team at work behind the scenes", "category": "kitchen",
     "direction": "The crew mid-shift, hands moving. Real motion, real sound. This is proof, not production."},
    {"id": "dining_room", "title": "Where your customers experience it", "category": "tour",
     "direction": "A slow pan when there's a little life in the room. Imperfect lighting is fine — it reads as real."},
    {"id": "exterior", "title": "The outside of your business", "category": "tour",
     "direction": "Walk up to the front door like a first-timer. Include the sign and the street."},
    {"id": "owner_intro", "title": "\u201cHello, welcome\u201d — your story", "category": "intro",
     "direction": "Long take. Who you are, why you started, what you'd recommend first. Talk to one regular, not a camera."},
    {"id": "birthday", "title": "\u201cHappy birthday from all of us\u201d", "category": "greeting",
     "direction": "Ten seconds, big smile, maybe the crew behind you. This goes out on members' birthdays forever."},
    {"id": "holiday", "title": "\u201cMerry Christmas / happy holidays\u201d", "category": "greeting",
     "direction": "One warm holiday wish. Film it once, it works every year."},
    {"id": "rewards_thanks", "title": "\u201cThank you for joining our rewards team\u201d", "category": "rewards",
     "direction": "Thank them for supporting a small business — it means a lot, so say it like it does. This is your welcome email."},
    {"id": "new_dish", "title": "The product or offer you're pushing right now", "category": "campaign",
     "direction": "The thing you want everyone buying this month. Show it, name it, done."},
]


def _abs_url(request, path):
    host = request.headers.get("x-forwarded-host") or request.headers.get("host")
    proto = request.headers.get("x-forwarded-proto", "https")
    return f"{proto}://{host}{path}" if host else path


async def _welcome_vault_video():
    for q in ({"promptId": "rewards_thanks"}, {"featured": True}, {"promptId": "owner_intro"}):
        v = await db.vault.find_one(q, {"_id": 0})
        if v:
            return v
    return None


class VaultSaveReq(BaseModel):
    uploadId: str
    filename: str
    promptId: Optional[str] = None
    title: Optional[str] = None


@api.get("/vault")
async def vault_list():
    videos = await db.vault.find({}, {"_id": 0}).sort("uploadedAt", 1).to_list(500)
    by_prompt = {v["promptId"]: v for v in videos if v.get("promptId")}
    prompts = [{**p, "video": by_prompt.get(p["id"])} for p in VAULT_PROMPTS]
    custom = [v for v in videos if not v.get("promptId")]
    featured = next((v for v in videos if v.get("featured")), None)
    return {"prompts": prompts, "custom": custom, "capturedCount": len(by_prompt),
            "totalPrompts": len(VAULT_PROMPTS), "totalVideos": len(videos), "featured": featured}


@api.post("/vault/save")
async def vault_save(req: VaultSaveReq):
    part = _upload_part(req.uploadId)
    if not part.exists() or part.stat().st_size == 0:
        raise HTTPException(status_code=404, detail="No uploaded video found for this uploadId.")
    prompt = next((p for p in VAULT_PROMPTS if p["id"] == req.promptId), None) if req.promptId else None
    if req.promptId and not prompt:
        raise HTTPException(status_code=400, detail="Unknown prompt")
    title = (req.title or "").strip() or (prompt["title"] if prompt else req.filename)
    ext = (req.filename.rsplit(".", 1)[-1] if "." in req.filename else "mp4").lower()
    if ext not in VIDEO_MIME:
        ext = "mp4"
    vid = str(uuid.uuid4())
    data = part.read_bytes()
    path = f"{APP_NAME}/vault/{vid}.{ext}"
    try:
        await asyncio.to_thread(put_object, path, data, VIDEO_MIME.get(ext, "video/mp4"))
    except Exception:
        logger.exception("Vault storage upload failed")
        raise HTTPException(status_code=502, detail="Storage upload failed. Please try again.")
    finally:
        part.unlink(missing_ok=True)
    if prompt:
        await db.vault.delete_many({"promptId": req.promptId})
    doc = {"id": vid, "promptId": req.promptId, "title": title,
           "category": prompt["category"] if prompt else "campaign",
           "storagePath": path, "contentType": VIDEO_MIME.get(ext, "video/mp4"),
           "size": len(data), "featured": False,
           "uploadedAt": datetime.now(timezone.utc).isoformat()}
    await db.vault.insert_one(dict(doc))
    return {"ok": True, "video": doc, "videoUrl": f"/api/vault/video/{vid}"}


@api.get("/vault/video/{vid}")
async def vault_video(vid: str):
    doc = await db.vault.find_one({"id": vid})
    if not doc:
        raise HTTPException(status_code=404, detail="Video not found.")
    data, ct = await asyncio.to_thread(get_object, doc["storagePath"])
    return Response(content=data, media_type=doc.get("contentType", ct))


@api.delete("/vault/{vid}")
async def vault_delete(vid: str):
    res = await db.vault.delete_one({"id": vid})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Video not found.")
    return {"ok": True}


@api.post("/vault/{vid}/feature")
async def vault_feature(vid: str):
    doc = await db.vault.find_one({"id": vid}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Video not found.")
    now_featured = not doc.get("featured", False)
    await db.vault.update_many({}, {"$set": {"featured": False}})
    if now_featured:
        await db.vault.update_one({"id": vid}, {"$set": {"featured": True}})
    return {"ok": True, "featured": now_featured,
            "note": (f"\u201c{doc['title']}\u201d now leads the 30-day flow." if now_featured
                     else "Flow returns to an even spread of your vault.")}


# ---------------------------------------------------------------------------
# STRATEGY & BEST PRACTICES — governance panel (industry, pacing, video plaques)
# ---------------------------------------------------------------------------
_YT_RE = re.compile(r"^https://(www\.)?(youtube\.com|youtu\.be)/")


class StrategyVideoReq(BaseModel):
    id: str
    title: str
    youtubeUrl: Optional[str] = ""


class StrategyReq(BaseModel):
    industry: Optional[str] = None
    videos: Optional[List[StrategyVideoReq]] = None


async def _strategy_view():
    s = await state_get("strategy", DEFAULT_STRATEGY)
    inds = await _get_industries()
    current = next((i for i in inds if i["id"] == s.get("industry")), inds[0])
    return {**s, "pacing": current, "industries": inds, "disclaimer": OPERATIONAL_DISCLAIMER}


@api.get("/content/strategy")
async def strategy_get():
    return await _strategy_view()


@api.put("/content/strategy")
async def strategy_put(req: StrategyReq):
    s = await state_get("strategy", DEFAULT_STRATEGY)
    if req.industry is not None:
        inds = await _get_industries()
        if not any(i["id"] == req.industry for i in inds):
            raise HTTPException(status_code=400, detail="Unknown industry vertical.")
        s["industry"] = req.industry
    if req.videos is not None:
        vids = []
        for v in req.videos[:6]:
            url = (v.youtubeUrl or "").strip()
            if url and not _YT_RE.match(url):
                raise HTTPException(status_code=400, detail="Video links must be YouTube URLs.")
            vids.append({"id": v.id[:40], "title": v.title.strip()[:80], "youtubeUrl": url})
        s["videos"] = vids
    await state_set("strategy", s)
    return await _strategy_view()


# ---------------------------------------------------------------------------
# INDUSTRY MANAGER — owner adds/edits verticals without touching code
# ---------------------------------------------------------------------------
class IndustryReq(BaseModel):
    label: str
    advisor: str = ""
    cadence: str = ""
    window: str = ""
    rotation: str = ""


def _industry_slug(label: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", label.lower()).strip("_")[:32] or "industry"


def _industry_fields(req: IndustryReq) -> dict:
    return {"label": req.label.strip()[:40], "advisor": req.advisor.strip()[:300],
            "cadence": req.cadence.strip()[:120], "window": req.window.strip()[:120],
            "rotation": req.rotation.strip()[:160]}


@api.post("/content/industries")
async def industry_add(req: IndustryReq, request: Request):
    auth.require_owner(request)
    if not req.label.strip():
        raise HTTPException(status_code=400, detail="Give the industry a name.")
    inds = await _get_industries()
    base = _industry_slug(req.label)
    iid, n = base, 2
    while any(i["id"] == iid for i in inds):
        iid, n = f"{base}_{n}", n + 1
    inds.append({"id": iid, **_industry_fields(req)})
    await state_set("industries", inds)
    return await _strategy_view()


@api.put("/content/industries/{iid}")
async def industry_update(iid: str, req: IndustryReq, request: Request):
    auth.require_owner(request)
    if not req.label.strip():
        raise HTTPException(status_code=400, detail="Give the industry a name.")
    inds = await _get_industries()
    ind = next((i for i in inds if i["id"] == iid), None)
    if not ind:
        raise HTTPException(status_code=404, detail="Industry not found.")
    ind.update(_industry_fields(req))
    await state_set("industries", inds)
    return await _strategy_view()


@api.delete("/content/industries/{iid}")
async def industry_delete(iid: str, request: Request):
    auth.require_owner(request)
    inds = await _get_industries()
    if not any(i["id"] == iid for i in inds):
        raise HTTPException(status_code=404, detail="Industry not found.")
    if len(inds) <= 1:
        raise HTTPException(status_code=400, detail="Keep at least one industry.")
    strat = await state_get("strategy", DEFAULT_STRATEGY)
    if strat.get("industry") == iid:
        raise HTTPException(status_code=400, detail="Switch to another industry before deleting the selected one.")
    await state_set("industries", [i for i in inds if i["id"] != iid])
    return await _strategy_view()


# ===========================================================================
# THE COACH — build templates on demand + accountability plan-checks
# ===========================================================================
async def ai_build_template(topic: str, brand: dict) -> dict:
    ind = await _current_industry()
    gov = _governance_directive(ind)
    system = (
        f"You are the marketing coach for {brand.get('name')}, a {brand.get('cuisine', 'local')} "
        f"{ind['label'].lower()} in {brand.get('city')}. Brand voice: {brand.get('voice')}. "
        f"Signature item: {brand.get('signatureItem')}. "
        "You NEVER make content for the owner — you hand them a tight, practical build template "
        "they execute themselves on their own phone. Raw beats polished: too-polished content reads "
        "as AI and gets scrolled past. Keep every line short and concrete. "
        f"{gov} "
        "You always respond with ONLY valid minified JSON — no markdown, no commentary."
    )
    prompt = (
        f'The owner asked: "How does this work: {topic}?"\n\n'
        "Give them a one-page build template. Return ONLY JSON in this exact shape:\n"
        '{"title":"...","whyItWorks":"one short paragraph",'
        '"keyElements":["4-6 short must-have elements"],'
        '"offerTemplate":["3-4 fill-in-the-blank lines using ___ blanks, e.g. This week only: ___ for $___, ends ___"],'
        '"shotList":[{"shot":"what to film","where":"where at your business","tip":"one raw-phone-video tip"}],'
        '"whereItGoes":["3-4 lines: platform/surface + when to post it"],'
        '"successCheck":["2-3 measurable ways to know it worked"]}\n'
        "shotList must have exactly 3-4 items."
    )
    text = await asyncio.wait_for(
        ai.claude_complete(system=system, prompt=prompt, model=AI_MODEL[1]), timeout=60)
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end == -1:
        raise RuntimeError("Coach returned an unreadable template.")
    return json.loads(text[start:end + 1])


async def ai_plan_check(template: dict, transcript: str, report: dict) -> dict:
    system = (
        "You are a no-nonsense but encouraging content coach for a local business. The owner filmed a video "
        "for a specific campaign plan. Compare what they made against the plan. Be SHORT — 'that content "
        "isn't matched up to what we recommended, but we can make this work' energy. Recommend edits or "
        "re-films, never offer to make it for them. "
        "Respond with ONLY valid minified JSON."
    )
    grades = {k: v.get("grade") for k, v in report.items() if isinstance(v, dict) and "grade" in v}
    prompt = (
        f"THE PLAN (build template): {json.dumps(template)}\n\n"
        f'WHAT THEY FILMED — transcript: "{transcript[:1200]}"\n'
        f"Technical grades from the critic: {json.dumps(grades)}\n\n"
        "Return ONLY JSON: {\"verdict\":\"ON-PLAN\"|\"CLOSE\"|\"OFF-PLAN\","
        "\"matched\":[\"1-2 short things that match the plan\"],"
        "\"fix\":[\"2-3 short, specific edit or re-film actions with where/how\"]}"
    )
    text = await asyncio.wait_for(
        ai.claude_complete(system=system, prompt=prompt, model=AI_MODEL[1]), timeout=45)
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end == -1:
        raise RuntimeError("Plan check returned unreadable output.")
    return json.loads(text[start:end + 1])


class CoachTemplateReq(BaseModel):
    topic: str


@api.post("/coach/template")
async def coach_template(req: CoachTemplateReq):
    topic = req.topic.strip()
    if not topic:
        raise HTTPException(status_code=400, detail="Tell the coach what you want to build.")
    brand = await state_get("brand_profile", DEFAULT_BRAND_PROFILE)
    try:
        template = await ai_build_template(topic, brand)
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="The coach timed out. Try again.")
    except Exception:
        logger.exception("Coach template generation failed")
        raise HTTPException(status_code=502, detail="The coach hit a snag. Please try again.")
    doc = {"id": str(uuid.uuid4()), "topic": topic, "template": template,
           "createdAt": datetime.now(timezone.utc).isoformat()}
    await db.coach_templates.insert_one(dict(doc))
    return {"id": doc["id"], "topic": topic, "template": template, "model": AI_MODEL[1]}


@api.get("/coach/templates")
async def coach_templates():
    docs = await db.coach_templates.find({}, {"_id": 0}).sort("createdAt", -1).to_list(25)
    return {"templates": docs}


@api.delete("/coach/template/{tid}")
async def coach_template_delete(tid: str):
    res = await db.coach_templates.delete_one({"id": tid})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Template not found")
    return {"ok": True}


_SURFACE_KEYWORDS = [("instagram", "Instagram"), ("facebook", "Facebook"), ("tiktok", "TikTok"),
                     ("google", "Google Business"), ("gbp", "Google Business"), ("email", "Email"),
                     ("sms", "SMS"), ("youtube", "YouTube"), ("in-store", "In-Store"),
                     ("table", "In-Store"), ("counter", "In-Store"), ("nextdoor", "Nextdoor")]


def _surface_from(line):
    low = line.lower()
    for k, label in _SURFACE_KEYWORDS:
        if k in low:
            return label
    return "Multi-platform"


@api.post("/coach/template/{tid}/to-calendar")
async def coach_template_to_calendar(tid: str):
    doc = await db.coach_templates.find_one({"id": tid}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Template not found")
    t = doc["template"]
    lines = t.get("whereItGoes", [])[:8]
    if not lines:
        raise HTTPException(status_code=400, detail="This template has no posting plan.")
    cal = await state_get("calendar") or _cal_seed()
    start = datetime.now(timezone.utc) + timedelta(days=1)
    added = []
    for i, line in enumerate(lines):
        date = (start + timedelta(days=i * 2)).strftime("%Y-%m-%d")
        week = (start + timedelta(days=i * 2) - timedelta(days=(start + timedelta(days=i * 2)).weekday())).strftime("%Y-%m-%d")
        if week not in cal["weeks"]:
            cal["weeks"].append(week)
            cal["weeks"].sort()
        pid = f"c-{date}-{uuid.uuid4().hex[:8]}"
        post = {"id": pid, "date": date, "time": "11:30 AM",
                "title": t.get("title", doc["topic"]), "idea": line,
                "surface": _surface_from(line), "source": "coach", "status": "planned"}
        cal["posts"].setdefault(date, []).append(post)
        added.append(post)
    await state_set("calendar", cal)
    payload = _cal_payload(cal)
    payload["added"] = added
    payload["addedCount"] = len(added)
    return payload


@api.get("/coach/template/{tid}/pdf")
async def coach_template_pdf(tid: str):
    doc = await db.coach_templates.find_one({"id": tid}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Template not found")
    t = doc["template"]

    def _latin(s):
        return str(s).encode("latin-1", "replace").decode("latin-1")

    pdf = FPDF(orientation="P", unit="mm", format="A4")
    pdf.set_auto_page_break(True, margin=14)
    pdf.add_page()

    def mcell(h, txt, **kw):
        pdf.multi_cell(0, h, _latin(txt), new_x="LMARGIN", new_y="NEXT", **kw)

    pdf.set_font("Helvetica", "B", 18)
    mcell(9, t.get("title", doc["topic"]))
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(90, 90, 90)
    mcell(5, t.get("whyItWorks", ""))
    pdf.ln(3)

    def section(header, lines):
        pdf.set_text_color(211, 84, 0)
        pdf.set_font("Helvetica", "B", 12)
        pdf.cell(0, 8, _latin(header), new_x="LMARGIN", new_y="NEXT")
        pdf.set_text_color(30, 30, 30)
        pdf.set_font("Helvetica", "", 10)
        for ln in lines:
            mcell(5.5, f"-  {ln}")
        pdf.ln(2)

    section("Key Elements", t.get("keyElements", []))
    section("Your Offer (fill in the blanks)", t.get("offerTemplate", []))
    section("Shot List (film on your phone - raw beats polished)",
            [f"{s.get('shot')} - {s.get('where')}. Tip: {s.get('tip')}" for s in t.get("shotList", [])])
    section("Where It Goes", t.get("whereItGoes", []))
    section("How You'll Know It Worked", t.get("successCheck", []))
    pdf.set_text_color(150, 150, 150)
    pdf.set_font("Helvetica", "I", 8)
    pdf.cell(0, 6, _latin("OmniLocal #1 - build it yourself, we hold you accountable."), new_x="LMARGIN", new_y="NEXT")
    out = pdf.output()
    data = bytes(out) if not isinstance(out, (bytes, bytearray)) else bytes(out)
    return Response(content=data, media_type="application/pdf",
                    headers={"Content-Disposition": "attachment; filename=build-template.pdf"})


# ===========================================================================
# STARTUP — seed any missing state (real data persists across restarts)
# ===========================================================================
async def _ensure_indexes():
    specs = [
        (db.sessions, [("token", 1)]),
        (db.redemptions, [("code", 1)]),
        (db.redemptions, [("issuedAt", 1)]),
        (db.redemptions, [("redeemedAt", 1)]),
        (db.redemptions, [("memberKey", 1)]),
        (db.members, [("memberKey", 1)]),
        (db.members, [("createdAt", 1)]),
        (db.scan_events, [("at", 1)]),
        (db.scan_events, [("spaceId", 1)]),
        (db.activity_log, [("action", 1), ("at", 1)]),
        (db.coach_templates, [("createdAt", -1)]),
        (db.ad_spend, [("date", -1)]),
        (db.login_attempts, [("identifier", 1)]),
        (db.user_sessions, [("session_token", 1)]),
    ]
    for coll, keys in specs:
        try:
            await coll.create_index(keys)
        except Exception:
            logger.exception(f"Index creation failed for {coll.name}")
    try:
        await db.login_attempts.create_index("updatedAt", expireAfterSeconds=1800)
    except Exception:
        logger.exception("TTL index creation failed for login_attempts")
    try:
        await db.google_oauth_states.create_index("expiresAt", expireAfterSeconds=0)
    except Exception:
        logger.exception("TTL index creation failed for google_oauth_states")


@app.on_event("startup")
async def seed_state():
    seeders = {
        "reports": lambda: build_reports_history(INITIAL_WEEKS),
        "connections": lambda: {p["id"]: p["default"] for p in PLATFORMS},
        "oauth_tokens": lambda: {},
        "welcome_queue": lambda: [],
        "current_batch": lambda: generate_batch(8),
        "customers": lambda: _seed_customers(),
        "calendar": lambda: _cal_seed(),
        "brand_profile": lambda: DEFAULT_BRAND_PROFILE,
        "prize_board": lambda: DEFAULT_PRIZE_BOARD,
        "strategy": lambda: DEFAULT_STRATEGY,
        "industries": lambda: DEFAULT_INDUSTRIES,
    }
    for key, builder in seeders.items():
        if await db.state.find_one({"_id": key}) is None:
            await state_set(key, builder())
    if await db.redemptions.count_documents({}) == 0:
        await db.redemptions.insert_many(_seed_redemptions())
    await auth.get_team_settings()
    try:
        await asyncio.to_thread(init_storage)
        logger.info("Object storage initialized.")
    except Exception as e:
        logger.error(f"Object storage init failed (video playback may be unavailable): {e}")
    await _ensure_indexes()
    await auth.seed_master_password()
    asyncio.create_task(_win_report_scheduler())
    logger.info("OmniLocal state seeded / verified in MongoDB.")


auth.EXECUTORS.update({"publish_all": _do_publish_all, "send_welcome": _do_send_welcome})
payments.init(db)
google_business.init(db, state_get, state_set)
app.include_router(auth.router)
app.include_router(auth.team_router)
app.include_router(auth.approvals_router)
app.include_router(api)
app.include_router(payments.router)
app.include_router(google_business.router)
app.middleware("http")(auth.auth_middleware)
app.add_middleware(
    CORSMiddleware, allow_credentials=True,
    allow_origins=[o.strip() for o in os.environ.get("CORS_ORIGINS", "").split(",") if o.strip() and o.strip() != "*"],
    allow_methods=["*"], allow_headers=["*"],
)

# Single-container deploys: serve the built React app from the backend (same
# origin, so no CORS_ORIGINS or REACT_APP_BACKEND_URL configuration is needed).
FRONTEND_BUILD = ROOT_DIR.parent / "frontend" / "build"
if FRONTEND_BUILD.is_dir():
    from fastapi.responses import FileResponse
    from fastapi.staticfiles import StaticFiles

    app.mount("/static", StaticFiles(directory=FRONTEND_BUILD / "static"), name="static")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        target = FRONTEND_BUILD / full_path
        if full_path and ".." not in full_path and target.is_file():
            return FileResponse(target)
        return FileResponse(FRONTEND_BUILD / "index.html")
