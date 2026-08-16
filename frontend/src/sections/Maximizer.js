import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { QrCode, Gift, Crown, Clock, ExternalLink, Gamepad2, Upload, Video, Send, ScanLine, CheckCircle2, XCircle, Printer, Users, Download } from "lucide-react";
import {
  getSegments, getDrip, spin, getGames, setActiveGame,
  getSampleCustomerCsv, importCustomerCsv, getWelcomeQueue, sendWelcome,
  getSpinQr, redeemCode, getRedemptionsDashboard, tableTentUrl, getMembers,
  membersExportUrl, getGamePlan, setGameWeek, setGameSettings, qrSheetUrl,
} from "@/lib/api";
import { SectionTitle, Overline } from "@/components/ui-bits";
import Codes from "@/sections/Codes";
import LocationSpots from "@/sections/LocationSpots";
import PrizeBoard from "@/sections/PrizeBoard";
import { OperationalDisclaimer } from "@/sections/StrategyPanel";

const SPOT_PRESETS = ["Pizza Box", "Bag Sticker", "Door Decal", "Table Tent", "Counter QR", "Receipt", "Window Decal"];

const segColor = { vip: "#27AE60", standard: "#5C5A56", promo_pool: "#F39C12" };
const segLabel = { vip: "VIP", standard: "Standard", promo_pool: "Promo Pool" };
const custSegColor = { new: "#2980B9", coupon_only: "#F39C12", loyal: "#27AE60" };
const custSegLabel = { new: "New Customer", coupon_only: "Coupon-Only", loyal: "Loyal" };

const GUEST_OPTIONS = [
  { key: "new", seg: "new", isNew: true, label: "New Guest", hint: "80% win big — entice them in" },
  { key: "vip", seg: "vip", isNew: false, label: "Quality Regular", hint: "High reward — reward loyalty" },
  { key: "promo_pool", seg: "promo_pool", isNew: false, label: "Couponer", hint: "Small reward — protect margin" },
];

export default function Maximizer() {
  const [segments, setSegments] = useState(null);
  const [drip, setDrip] = useState(null);
  const [games, setGames] = useState(null);
  const [result, setResult] = useState(null);
  const [spinning, setSpinning] = useState(false);
  const [guest, setGuest] = useState(GUEST_OPTIONS[0]);
  const [csv, setCsv] = useState("");
  const [importRes, setImportRes] = useState(null);
  const [welcome, setWelcome] = useState(null);
  const [qr, setQr] = useState(null);
  const [spaceInput, setSpaceInput] = useState("Table Tent");
  const [redeemInput, setRedeemInput] = useState("");
  const [redeemNet, setRedeemNet] = useState("");
  const [redeemResult, setRedeemResult] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [members, setMembers] = useState(null);
  const [plan, setPlan] = useState(null);

  const loadWelcome = () => getWelcomeQueue().then(setWelcome).catch(() => {});
  const loadMembers = () => getMembers().then(setMembers).catch(() => {});
  const loadPlan = () => getGamePlan().then(setPlan).catch(() => {});
  const refreshLedger = () => {
    getSegments().then(setSegments).catch(() => {});
    getRedemptionsDashboard().then(setDashboard).catch(() => {});
  };
  useEffect(() => {
    getSegments().then(setSegments).catch(() => {});
    getDrip().then(setDrip).catch(() => {});
    getGames().then(setGames).catch(() => {});
    getRedemptionsDashboard().then(setDashboard).catch(() => {});
    loadMembers();
    loadPlan();
    loadWelcome();
  }, []);

  const chooseGame = async (id) => {
    const res = await setActiveGame(id);
    setGames((g) => ({ ...g, active: res.active, override: res.override }));
    toast.success(`Active game set: ${res.active.name}`);
  };

  const doSpin = async () => {
    setSpinning(true); setResult(null);
    setTimeout(async () => {
      const res = await spin({ isNewGuest: guest.isNew, segment: guest.seg, spaceId: "admin-demo" });
      setResult(res); setSpinning(false);
      refreshLedger();
      toast[res.tier === "highValue" ? "success" : "message"](`${guest.label} won: ${res.reward}`,
        { description: `Coupon ${res.couponCode} issued & tracked in the ledger` });
    }, 700);
  };

  const genQr = async () => {
    const res = await getSpinQr(spaceInput.trim() || "Table Tent", window.location.origin);
    setQr(res);
    toast.success("QR generated", { description: `Play page: ${res.playUrl}` });
  };

  const doRedeem = async () => {
    if (!redeemInput.trim()) { toast.error("Enter a coupon code"); return; }
    const res = await redeemCode(redeemInput.trim(), redeemNet ? parseFloat(redeemNet) : null);
    setRedeemResult(res);
    if (res.ok) {
      toast.success(`Redeemed: ${res.reward}`);
      setRedeemInput(""); setRedeemNet("");
      refreshLedger();
    } else {
      toast.error(res.reason || "Coupon rejected");
    }
  };

  const loadSampleCustomers = async () => { const { csv } = await getSampleCustomerCsv(); setCsv(csv); toast("Weekly customer export loaded"); };
  const runImport = async () => {
    const r = await importCustomerCsv(csv);
    setImportRes(r); await loadWelcome(); loadMembers();
    toast.success(`Imported ${r.imported} — ${r.newCustomersQueued} new customers queued for welcome video`);
  };
  const triggerWelcome = async (i) => {
    const r = await sendWelcome(i);
    if (r.status === "pending_approval") {
      toast.info("Sent to owner for approval", { description: r.note });
      return;
    }
    await loadWelcome();
    toast.success("Welcome video email triggered", { description: `Mode: ${r.result.status} · headers: ${Object.keys(r.result.headers || {}).join(", ")}` });
  };

  const pickWeek = async (weekStart, gameId) => {
    await setGameWeek(weekStart, gameId);
    await loadPlan();
    getGames().then(setGames).catch(() => {});
    toast.success("Game plan updated");
  };

  const changeRules = async (body) => {
    const r = await setGameSettings(body);
    setPlan((p) => ({ ...p, settings: r.settings }));
    getGames().then(setGames).catch(() => {});
    toast.success("Game rules updated");
  };

  if (!segments || !drip || !games) return <div className="p-10" style={{ color: "var(--text-secondary)" }}>Loading…</div>;

  return (
    <div className="p-6 md:p-12 max-w-[1200px]">
      <SectionTitle kicker="Rewards · Quality Customer Maximizer"
        title="Turn the click into a customer — and prove the order"
        subtitle="Four rotating games keep it fresh, weekly CSV imports segment your customers, new customers get a personal welcome video, and every coupon flows back so OmniLocal #1 knows the ad made real money." />

      <OperationalDisclaimer />

      {/* Four rotating games */}
      <div className="card p-6 md:p-8" data-testid="games-module">
        <div className="flex items-center gap-2"><Gamepad2 size={18} color="var(--primary)" /><Overline>Game Planner · a different game every week</Overline></div>
        <h3 className="serif text-2xl mt-1" data-testid="active-game-title">Active game: {games.active ? games.active.name : "Paused"}</h3>
        <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
          Plan the next four weeks below — the weekly schedule wins, a pinned game is the fallback, and auto-rotation covers the rest. Set a week to "No game" to rest it, or pause everything with the switch below.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
          {(games.games || []).map((g) => {
            const on = games.active?.id === g.id;
            return (
              <button key={g.id} onClick={() => chooseGame(g.id)} data-testid={`game-${g.id}`}
                className="text-left p-4 rounded-lg lift"
                style={{ border: on ? "2px solid var(--primary)" : "1px solid var(--border)",
                         background: on ? "var(--surface-alt)" : "transparent" }}>
                <div className="font-bold text-sm">{g.name}</div>
                <div className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>{g.tagline}</div>
                {on && <div className="overline mt-2" style={{ color: "var(--primary)", fontSize: "0.5rem" }}>● Active ({games.active.source === "admin_override" ? "pinned" : games.active.source === "weekly_schedule" ? "scheduled" : "auto"})</div>}
              </button>
            );
          })}
        </div>
        {plan && (
          <div className="mt-5 pt-4 border-t" style={{ borderColor: "var(--border)" }} data-testid="game-planner">
            <Overline>4-Week Plan · schedule overrides the pin</Overline>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-2">
              {(plan.weeks || []).map((w, i) => (
                <div key={w.weekStart || i}>
                  <div className="text-xs font-bold">{i === 0 ? "This week" : `Week of ${(w.weekStart || "").slice(5)}`}</div>
                  <select data-testid={`week-plan-${i}`} value={w.gameId || ""}
                    onChange={(e) => pickWeek(w.weekStart, e.target.value || null)}
                    className="w-full mt-1 rounded-lg border px-2 py-2 text-xs"
                    style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
                    <option value="">Auto / pinned</option>
                    <option value="none">No game — rest week</option>
                    {(plan.games || []).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-5 mt-4">
              <label className="text-xs flex items-center gap-2" style={{ color: "var(--text-secondary)" }}>
                <input type="checkbox" data-testid="games-enabled-toggle" checked={plan.settings?.enabled !== false}
                  onChange={(e) => changeRules({ enabled: e.target.checked })} />
                {plan.settings?.enabled === false
                  ? <b style={{ color: "#B03A2E" }} data-testid="games-paused-note">Games PAUSED — play page shows "check back soon"</b>
                  : <span>Games running</span>}
              </label>
              <label className="text-xs flex items-center gap-2" style={{ color: "var(--text-secondary)" }}>
                Play limit
                <select data-testid="play-frequency-select" value={plan.settings?.playFrequencyDays || 7}
                  onChange={(e) => changeRules({ playFrequencyDays: Number(e.target.value) })}
                  className="rounded-lg border px-2 py-1.5 text-xs"
                  style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
                  <option value={7}>Once a week</option>
                  <option value={14}>Once every 2 weeks</option>
                </select>
              </label>
              <label className="text-xs flex items-center gap-2" style={{ color: "var(--text-secondary)" }}>
                Codes expire
                <select data-testid="code-expiry-select" value={plan.settings?.codeExpiryDays || 7}
                  onChange={(e) => changeRules({ codeExpiryDays: Number(e.target.value) })}
                  className="rounded-lg border px-2 py-1.5 text-xs"
                  style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
                  <option value={7}>After 7 days</option>
                  <option value={14}>After 14 days</option>
                </select>
              </label>
              <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
                Won this week? Codes die after {plan.settings?.codeExpiryDays || 7} days — no stockpiling plays.
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Owner-defined prize slots */}
      <PrizeBoard />

      {/* Live Scan-to-Spin: real QR + staff redemption */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        <div className="card p-6 md:p-8" data-testid="qr-generator">
          <div className="flex items-center gap-2"><QrCode size={18} color="var(--primary)" /><Overline>In-Store QR · scan to play</Overline></div>
          <h3 className="serif text-2xl mt-1">Send it home with them</h3>
          <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
            Customers scan → play {games.active?.name || "the active game"} on their phone → win a real, tracked coupon code.
            The best spots go home — pizza boxes, bags, mailer ads, social posts — whole households scan
            to compare prizes, and every scan joins your list.
          </p>
          <div className="flex gap-2 mt-4">
            <input value={spaceInput} onChange={(e) => setSpaceInput(e.target.value)} data-testid="qr-space-input"
              placeholder="Placement label, e.g. Table Tent" className="flex-1 p-2.5 rounded-lg text-sm"
              style={{ border: "1px solid var(--border)", background: "var(--surface)" }} />
            <button className="btn btn-primary text-sm" style={{ padding: "0.5rem 1rem" }} onClick={genQr} data-testid="generate-qr-btn">Generate QR</button>
          </div>
          <div className="flex flex-wrap gap-1.5 mt-2" data-testid="spot-presets">
            {SPOT_PRESETS.map((s) => (
              <button key={s} onClick={() => setSpaceInput(s)} data-testid={`spot-chip-${s.toLowerCase().replace(/\s+/g, "-")}`}
                className="text-xs px-2.5 py-1 rounded-full"
                style={{ border: spaceInput === s ? "1.5px solid var(--primary)" : "1px solid var(--border)",
                         background: spaceInput === s ? "var(--surface-alt)" : "transparent",
                         color: spaceInput === s ? "var(--primary)" : "var(--text-secondary)" }}>
                {s}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <a href={qrSheetUrl(window.location.origin)} target="_blank" rel="noreferrer"
              className="btn btn-ghost text-sm" style={{ padding: "0.4rem 0.9rem" }} data-testid="qr-sheet-btn">
              <Printer size={13} className="inline mr-1" /> Print all-spot QR sheet (PDF)
            </a>
            <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
              One page, all 7 spots — print it anywhere. Every code is unique to your business.
            </span>
          </div>
          {qr && (
            <div className="mt-5 text-center" data-testid="qr-output">
              <img src={qr.qrDataUri} alt="Scan to play" width={176} height={176} className="mx-auto rounded-lg" style={{ border: "1px solid var(--border)" }} data-testid="qr-image" />
              <div className="flex items-center justify-center gap-2 mt-3 flex-wrap">
                <a href={qr.playUrl} target="_blank" rel="noreferrer" className="btn btn-ghost text-sm" style={{ padding: "0.4rem 0.9rem" }} data-testid="open-play-link">
                  <ExternalLink size={13} className="inline mr-1" /> Open play page
                </a>
                <a href={tableTentUrl(spaceInput.trim() || "Table Tent", window.location.origin)} target="_blank" rel="noreferrer" className="btn btn-primary text-sm" style={{ padding: "0.4rem 0.9rem" }} data-testid="download-tent-btn">
                  <Printer size={13} className="inline mr-1" /> Print Table Tent (PDF)
                </a>
              </div>
              <div className="mono text-xs mt-2 break-all" style={{ color: "var(--text-secondary)" }}>{qr.playUrl}</div>
            </div>
          )}
        </div>

        <div className="card p-6 md:p-8" data-testid="redeem-station">
          <div className="flex items-center gap-2"><ScanLine size={18} color="var(--danger)" /><Overline>Staff Redemption · fraud-proof</Overline></div>
          <h3 className="serif text-2xl mt-1">Validate a coupon at the counter</h3>
          <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
            Enter the customer's code. We confirm it's real, unused and unexpired — and instantly reject duplicates, fakes and expired coupons.
          </p>
          <div className="mt-4 space-y-2">
            <input value={redeemInput} onChange={(e) => setRedeemInput(e.target.value)} data-testid="redeem-code-input"
              placeholder="Coupon code, e.g. HV-XXXXXX" className="w-full p-2.5 rounded-lg text-sm mono uppercase"
              style={{ border: "1px solid var(--border)", background: "var(--surface)" }} />
            <input value={redeemNet} onChange={(e) => setRedeemNet(e.target.value)} data-testid="redeem-net-input" type="number"
              placeholder="Order total $ (optional)" className="w-full p-2.5 rounded-lg text-sm mono"
              style={{ border: "1px solid var(--border)", background: "var(--surface)" }} />
            <button className="btn btn-primary w-full" style={{ padding: "0.6rem" }} onClick={doRedeem} data-testid="redeem-btn">Validate &amp; Redeem</button>
          </div>
          {redeemResult && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} data-testid="redeem-result"
              className="mt-4 p-4 rounded-lg flex items-start gap-2"
              style={{ background: "var(--surface-alt)", border: `1.5px solid ${redeemResult.ok ? "var(--success)" : "var(--danger)"}` }}>
              {redeemResult.ok ? <CheckCircle2 size={20} color="var(--success)" className="mt-0.5" /> : <XCircle size={20} color="var(--danger)" className="mt-0.5" />}
              <div>
                <div className="font-bold text-sm">
                  {redeemResult.ok ? `Valid — ${redeemResult.reward} applied` : `Rejected (${redeemResult.status})`}
                </div>
                {redeemResult.ok && redeemResult.posCode && (
                  <div className="mono text-xs mt-1" data-testid="redeem-pos-code" style={{ color: "var(--primary)" }}>
                    Punch into POS: <b>{redeemResult.posCode}</b>
                  </div>
                )}
                {!redeemResult.ok && <div className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>{redeemResult.reason}</div>}
              </div>
            </motion.div>
          )}
        </div>
      </div>

      {/* Location analytics — per sticker spot */}
      <LocationSpots />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        {/* Scan to Spin */}
        <div className="card p-6 md:p-8" data-testid="scan-to-spin">
          <div className="flex items-center gap-2"><QrCode size={18} color="var(--primary)" /><Overline>{games.active?.name || "Games paused"}</Overline></div>
          <h3 className="serif text-2xl mt-1">Segment-aware rewards</h3>
          <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
            New & quality guests win the big reward to entice them in — couponers get something small to protect your margin.
          </p>
          <div className="grid place-items-center my-6">
            <motion.div animate={{ rotate: spinning ? 720 : 0 }} transition={{ duration: 0.7, ease: "easeOut" }}
              className="grid place-items-center rounded-full"
              style={{ width: 150, height: 150, background: "conic-gradient(#D35400 0 25%, #27AE60 25% 50%, #F39C12 50% 75%, #2980B9 75% 100%)" }}>
              <div className="grid place-items-center rounded-full" style={{ width: 108, height: 108, background: "var(--surface)" }}>
                <Gift size={40} color="var(--primary)" />
              </div>
            </motion.div>
          </div>
          <div className="flex flex-col gap-2 mb-4">
            {GUEST_OPTIONS.map((g) => (
              <button key={g.key} onClick={() => { setGuest(g); setResult(null); }} data-testid={`guest-${g.key}`}
                className="text-left px-3 py-2 rounded-lg"
                style={{ border: guest.key === g.key ? "2px solid var(--primary)" : "1px solid var(--border)",
                         background: guest.key === g.key ? "var(--surface-alt)" : "transparent" }}>
                <div className="text-sm font-bold">{g.label}</div>
                <div className="text-xs" style={{ color: "var(--text-secondary)" }}>{g.hint}</div>
              </button>
            ))}
          </div>
          <div className="flex justify-center">
            <button className="btn btn-primary" onClick={doSpin} disabled={spinning} data-testid="spin-btn">
              {spinning ? "Playing…" : `Play · ${guest.label}`}
            </button>
          </div>
          {result && (
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
              className="mt-6 p-5 rounded-lg text-center" style={{ background: "var(--surface-alt)" }} data-testid="spin-result">
              <Overline style={{ color: result.tier === "highValue" ? "var(--success)" : "var(--text-secondary)" }}>
                {result.tier === "highValue" ? "High-Value Reward" : "Standard Reward"}
              </Overline>
              <div className="serif text-3xl mt-1">{result.reward}</div>
              <div className="mono text-sm mt-2" style={{ color: "var(--primary)" }}>{result.couponCode}</div>
              <div className="flex items-center justify-center gap-1 text-xs mt-3" style={{ color: "var(--text-secondary)" }}>
                <ExternalLink size={12} /> Auto-applies at Toast / Heartland / DoorDash checkout
              </div>
            </motion.div>
          )}
        </div>

        {/* Drip */}
        <div className="card p-6 md:p-8" data-testid="drip-campaign">
          <div className="flex items-center gap-2"><Clock size={18} color="var(--info)" /><Overline>Slow-Trickle Drip</Overline></div>
          <h3 className="serif text-2xl mt-1">30-day watch-to-unlock campaign</h3>
          <div className="grid grid-cols-3 gap-3 mt-4">
            <div><Overline>Total Leads</Overline><div className="mono text-2xl">{drip.totalLeads}</div></div>
            <div><Overline>Released</Overline><div className="mono text-2xl" style={{ color: "var(--success)" }}>{drip.releasedSoFar}</div></div>
            <div><Overline>Per Day</Overline><div className="mono text-2xl">{drip.dailyRate}</div></div>
          </div>
          <div className="mt-5">
            <div className="flex justify-between text-xs mb-1" style={{ color: "var(--text-secondary)" }}>
              <span>Day 12 of {drip.days}</span><span>{drip.remaining} remaining</span>
            </div>
            <div className="h-3 rounded-full" style={{ background: "var(--surface-alt)" }}>
              <motion.div initial={{ width: 0 }} animate={{ width: `${(drip.releasedSoFar / drip.totalLeads) * 100}%` }}
                transition={{ duration: 0.8 }} className="h-3 rounded-full" style={{ background: "var(--info)" }} />
            </div>
          </div>
          <p className="text-sm mt-5" style={{ color: "var(--text-secondary)" }}>
            Leads release at a steady daily pace — each gets a watch-to-unlock video revealing a coupon at {drip.revealAtSeconds}s.
            Steady drip keeps the pipeline warm without burning the list.
          </p>
          <p className="text-xs mt-2" data-testid="drip-vault-note" style={{ color: drip.vaultCount ? "var(--success, #27AE60)" : "var(--text-secondary)" }}>
            {drip.vaultCount
              ? `Fueled by ${drip.vaultCount} vault video${drip.vaultCount === 1 ? "" : "s"}${drip.featured ? ` · featured: ${drip.featured.title}` : " · spread evenly across the flow"}`
              : "No vault videos yet — film your onboarding clips in the Content Director and this flow fills itself."}
          </p>
        </div>
      </div>

      {/* Weekly CSV import + segmentation */}
      <div className="card p-6 md:p-8 mt-8" data-testid="csv-import">
        <div className="flex items-center gap-2"><Upload size={18} color="var(--primary)" /><Overline>Weekly Customer Import · segmentation</Overline></div>
        <h3 className="serif text-2xl mt-1">Download your customer CSV weekly, drop it here</h3>
        <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
          Do it during your normal inventory/payroll routine. We auto-sort everyone into coupon-only, loyal, and new —
          and new customers trigger the welcome video below.
        </p>
        <textarea data-testid="customer-csv-input" value={csv} onChange={(e) => setCsv(e.target.value)} rows={4}
          placeholder="name,email,visits,coupon_ratio" className="w-full mt-3 p-3 rounded-lg mono text-sm"
          style={{ border: "1px solid var(--border)", background: "var(--surface)", resize: "vertical" }} />
        <div className="flex gap-2 mt-3">
          <button className="btn btn-ghost" onClick={loadSampleCustomers} data-testid="load-customers-btn">Load Sample Export</button>
          <button className="btn btn-primary" disabled={!csv.trim()} onClick={runImport} data-testid="import-customers-btn">Import & Segment</button>
        </div>
        {importRes && (
          <div className="mt-5" data-testid="import-result">
            <div className="flex flex-wrap gap-3">
              {Object.entries(importRes.segments).map(([k, v]) => (
                <div key={k} className="px-4 py-2 rounded-lg" style={{ background: "var(--surface-alt)" }}>
                  <span className="text-xs font-bold px-2 py-0.5 rounded mr-2" style={{ color: "#fff", background: custSegColor[k] }}>{custSegLabel[k]}</span>
                  <span className="mono text-lg">{v}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Welcome video automation */}
      {welcome && (
        <div className="card p-6 md:p-8 mt-8" data-testid="welcome-automation">
          <div className="flex items-center gap-2"><Video size={18} color="var(--success)" /><Overline>New Customer Welcome · automated owner video</Overline></div>
          <h3 className="serif text-2xl mt-1">A 7-second personal thank-you, within hours of enrollment</h3>
          <div className="mt-3 p-4 rounded-lg" style={{ background: "var(--surface-alt)" }}>
            <div className="text-xs" style={{ color: "var(--text-secondary)" }}>Owner video (single pre-recorded clip, delivered by email):</div>
            <a href={welcome.ownerVideoUrl} target="_blank" rel="noreferrer" className="mono text-xs" style={{ color: "var(--primary)" }}>{welcome.ownerVideoUrl}</a>
            <p className="text-sm mt-2 italic">"{welcome.script}"</p>
          </div>
          <div className="mt-4">
            <Overline>Welcome Queue ({welcome.queue.length})</Overline>
            {welcome.queue.length === 0 && <p className="text-sm mt-2" style={{ color: "var(--text-secondary)" }}>No new customers yet — import a CSV above to populate.</p>}
            <div className="mt-2 space-y-2">
              {welcome.queue.slice(0, 8).map((q, i) => (
                <div key={i} className="flex items-center justify-between p-3 rounded-lg" style={{ border: "1px solid var(--border)" }} data-testid={`welcome-item-${i}`}>
                  <div>
                    <div className="font-semibold text-sm">{q.name}</div>
                    <div className="text-xs mono" style={{ color: "var(--text-secondary)" }}>{q.email} · {q.status}</div>
                  </div>
                  <button className="btn btn-ghost" style={{ padding: "0.4rem 0.9rem" }} onClick={() => triggerWelcome(i)} data-testid={`send-welcome-${i}`}>
                    <Send size={13} className="inline mr-1" /> {q.status === "sent" ? "Resend" : "Send Video"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Reward Members — live directory */}
      {members && (
        <div className="card p-6 md:p-8 mt-8" data-testid="members-panel">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2"><Users size={18} color="var(--primary)" /><Overline>Reward Members — Live Directory</Overline></div>
            <a data-testid="export-members-btn" className="btn btn-ghost text-sm flex items-center gap-1.5"
              href={membersExportUrl()} download>
              <Download size={14} /> Export CSV
            </a>
          </div>
          <h3 className="serif text-2xl mt-1">Every scan and weekly POS import builds your list</h3>
          <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
            Wheel players sign up with email or phone. POS imports reveal who pays full price and who chases coupons —
            the wheel serves each one the right deal automatically.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
            <div><Overline>Total Members</Overline><div className="mono text-2xl" data-testid="members-total">{members.counts.total}</div></div>
            <div><Overline>Full-Price Spenders</Overline><div className="mono text-2xl" style={{ color: "var(--success)" }} data-testid="members-quality">{members.counts.quality}</div></div>
            <div><Overline>Couponers</Overline><div className="mono text-2xl" style={{ color: "#F39C12" }} data-testid="members-couponers">{members.counts.couponers}</div></div>
            <div><Overline>Wheel Signups</Overline><div className="mono text-2xl" style={{ color: "var(--primary)" }} data-testid="members-signups">{members.counts.wheelSignups}</div></div>
          </div>
          {members.members.length > 0 ? (
            <div className="overflow-x-auto mt-4">
              <table className="w-full text-sm" data-testid="members-table">
                <thead>
                  <tr className="text-left" style={{ color: "var(--text-secondary)" }}>
                    <th className="py-2 pr-4">Member</th><th className="py-2 pr-4">Contact</th>
                    <th className="py-2 pr-4">Segment</th><th className="py-2 pr-4">Source</th><th className="py-2">Visits</th>
                  </tr>
                </thead>
                <tbody>
                  {members.members.slice(0, 8).map((m) => (
                    <tr key={m.memberKey} className="border-t" style={{ borderColor: "var(--border)" }}>
                      <td className="py-2 pr-4 font-semibold">{m.name || "—"}</td>
                      <td className="py-2 pr-4 mono text-xs">{m.email || m.phone}</td>
                      <td className="py-2 pr-4">
                        <span className="text-xs font-bold px-2 py-0.5 rounded"
                          style={{ background: "var(--surface-alt)", color: custSegColor[m.segment] }}>
                          {custSegLabel[m.segment] || m.segment}
                        </span>
                      </td>
                      <td className="py-2 pr-4 text-xs" style={{ color: "var(--text-secondary)" }}>
                        {m.source === "spin_signup" ? "Wheel signup" : "POS import"}
                      </td>
                      <td className="py-2 mono">{m.visits}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm mt-4" style={{ color: "var(--text-secondary)" }} data-testid="members-empty">
              No members yet — import your weekly POS CSV above, or wait for the first wheel signup.
            </p>
          )}
        </div>
      )}

      {/* RFMD segments */}
      <div className="card p-6 md:p-8 mt-8">
        <div className="flex items-center gap-2"><Crown size={18} color="var(--success)" /><Overline>RFMD VIP Segmenting</Overline></div>
        <h3 className="serif text-2xl mt-1">Know exactly who your VIPs are</h3>
        <div className="flex gap-4 mt-2 mb-4 text-sm">
          {Object.entries(segments.counts || {}).map(([k, v]) => (
            <span key={k} className="flex items-center gap-1">
              <span style={{ width: 10, height: 10, borderRadius: 999, background: segColor[k] || "#5C5A56", display: "inline-block" }} />
              {segLabel[k] || k}: <b>{v}</b>
            </span>
          ))}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="rfmd-table">
            <thead>
              <tr className="overline" style={{ borderBottom: "1px solid var(--border)" }}>
                <th className="text-left py-2">Customer</th><th className="text-right py-2">Visits</th>
                <th className="text-right py-2">Avg Ticket</th><th className="text-right py-2">Score</th>
                <th className="text-left py-2 pl-4">Segment</th>
              </tr>
            </thead>
            <tbody>
              {(segments.rows || []).map((r) => (
                <tr key={r.customerId} style={{ borderBottom: "1px solid var(--border)", background: r.segment === "vip" ? "#f1f8f3" : "transparent" }} data-testid={`cust-${r.customerId}`}>
                  <td className="py-2 font-semibold">{r.name}</td>
                  <td className="py-2 text-right mono">{r.frequency}</td>
                  <td className="py-2 text-right mono">${(r.avgTicket || 0).toFixed(2)}</td>
                  <td className="py-2 text-right mono">{(r.score || 0).toFixed(2)}</td>
                  <td className="py-2 pl-4"><span className="text-xs font-bold px-2 py-0.5 rounded" style={{ color: "#fff", background: segColor[r.segment] || "#5C5A56" }}>{segLabel[r.segment] || r.segment}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Live Redemption Ledger */}
      <div className="card p-6 md:p-8 mt-8" data-testid="verification">
        <div className="flex items-center gap-2"><ScanLine size={18} color="var(--success)" /><Overline>Live Redemption Ledger · every code tracked</Overline></div>
        <h3 className="serif text-2xl mt-1">The proof it worked — issued → redeemed → revenue</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
          <div><Overline>Codes Issued</Overline><div className="mono text-2xl" data-testid="ledger-issued">{segments.verification?.codesIssued ?? 0}</div></div>
          <div><Overline>Codes Redeemed</Overline><div className="mono text-2xl" style={{ color: "var(--primary)" }} data-testid="ledger-redeemed">{segments.verification?.codesRedeemed ?? 0}</div></div>
          <div><Overline>Redemption Rate</Overline><div className="mono text-2xl">{(((segments.verification?.redemptionRate) || 0) * 100).toFixed(0)}%</div></div>
          <div><Overline>Revenue Proven</Overline><div className="mono text-2xl" style={{ color: "var(--success)" }}>${(segments.verification?.revenueFromRedemptions ?? 0).toLocaleString()}</div></div>
        </div>
        <p className="text-sm mt-4" style={{ color: "var(--text-secondary)" }}>{segments.verification?.note || "All codes verified at the register."}</p>
        {dashboard && dashboard.recent && dashboard.recent.length > 0 && (
          <div className="mt-5">
            <Overline>Recent activity</Overline>
            <div className="mt-2 space-y-1.5">
              {(dashboard.recent || []).slice(0, 6).map((r) => (
                <div key={r.code} className="flex items-center justify-between text-sm p-2.5 rounded-lg" style={{ background: "var(--surface-alt)" }} data-testid={`ledger-row-${r.code}`}>
                  <span className="mono text-xs">{r.code}</span>
                  <span className="text-xs">{r.reward}</span>
                  <span className="text-xs font-bold px-2 py-0.5 rounded" style={{ color: "#fff", background: r.status === "redeemed" ? "var(--success)" : (r.status === "expired" ? "var(--danger)" : "var(--text-secondary)") }}>
                    {r.status}{r.netSales ? ` · $${r.netSales}` : ""}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Codes & Redemption folded in */}
      <div className="mt-4"><Codes /></div>
    </div>
  );
}
