import React, { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  Gift,
  Trophy,
  Copy,
  Check,
  RotateCw,
  Clock,
  Volume2,
  VolumeX,
  Zap,
  CheckCircle2,
  Search,
  Flame,
  Ticket,
  AlertTriangle,
  Calendar,
  Sliders,
  Download,
  ShieldCheck,
  Tag,
  Store,
  RefreshCw,
  PartyPopper,
  X
} from "lucide-react";
import { toast } from "sonner";
import { SectionTitle, Overline, usd } from "@/components/ui-bits";
import {
  getPrizeBoard,
  getBrandProfile,
  getCadence,
  launchSprint,
  switchRestMode,
  tuneMarginFloor,
  voucherLookup,
  redeemStaffVoucher,
  exportClaimCodesUrl,
  generateBatch
} from "@/lib/api";

// Fallback wheel color palettes
const SLICE_COLORS = [
  { color: "#D35400", textColor: "#FFFFFF" },
  { color: "#27AE60", textColor: "#FFFFFF" },
  { color: "#F39C12", textColor: "#1A1A1A" },
  { color: "#C0392B", textColor: "#FFFFFF" },
  { color: "#2980B9", textColor: "#FFFFFF" },
  { color: "#8E44AD", textColor: "#FFFFFF" },
  { color: "#16A085", textColor: "#FFFFFF" },
  { color: "#2C3E50", textColor: "#FFFFFF" }
];

// Helper to synthesize audio tones
function playAudioTone(type = "tick") {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === "tick") {
      osc.type = "triangle";
      osc.frequency.setValueAtTime(420 + Math.random() * 80, ctx.currentTime);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.04);
    } else if (type === "win") {
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((freq, idx) => {
        const noteOsc = ctx.createOscillator();
        const noteGain = ctx.createGain();
        noteOsc.connect(noteGain);
        noteGain.connect(ctx.destination);
        noteOsc.type = "sine";
        noteOsc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.09);
        noteGain.gain.setValueAtTime(0.12, ctx.currentTime + idx * 0.09);
        noteGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.09 + 0.35);
        noteOsc.start(ctx.currentTime + idx * 0.09);
        noteOsc.stop(ctx.currentTime + idx * 0.09 + 0.35);
      });
    }
  } catch (e) {}
}

export default function Dashboard() {
  const [brand, setBrand] = useState({ name: "Obsidian & Ink Tattoo", city: "Downtown Arts District", id: "tattoo", masterPosCode: "TAT50-PROMO" });
  const [prizeBoard, setPrizeBoardState] = useState(null);
  const [cadence, setCadenceState] = useState(null);
  const [vouchers, setVouchers] = useState([]);
  const [voucherSearch, setVoucherSearch] = useState("");
  const [activeTabSubView, setActiveTabSubView] = useState("wheel"); // wheel | staff_lookup | rest_schedule
  
  // Wheel State
  const [isSpinning, setIsSpinning] = useState(false);
  const [wheelRotation, setWheelRotation] = useState(0);
  const [wonPrize, setWonPrize] = useState(null);
  const [rewardsHistory, setRewardsHistory] = useState([]);
  const [historyFilter, setHistoryFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [copiedCode, setCopiedCode] = useState(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [spinsRemaining, setSpinsRemaining] = useState(3);
  const [totalSpinsToday, setTotalSpinsToday] = useState(1);
  const [showCelebration, setShowCelebration] = useState(false);
  const [showMarginModal, setShowMarginModal] = useState(false);
  const [marginMaxDiscount, setMarginMaxDiscount] = useState(30);
  const [marginMinSpend, setMarginMinSpend] = useState(50);
  const [staffRedeemModal, setStaffRedeemModal] = useState(null);
  const [staffSalesInput, setStaffSalesInput] = useState("85.00");
  
  const audioIntervalRef = useRef(null);

  // Load backend state
  const loadBackendData = async () => {
    try {
      const [b, pb, cad, vData] = await Promise.all([
        getBrandProfile().catch(() => null),
        getPrizeBoard().catch(() => null),
        getCadence().catch(() => null),
        voucherLookup("").catch(() => null)
      ]);
      if (b) setBrand(b);
      if (pb) setPrizeBoardState(pb);
      if (cad) setCadenceState(cad);
      if (vData && vData.vouchers) {
        setVouchers(vData.vouchers);
        // Initialize rewards history from vouchers
        const historyItems = vData.vouchers.map(v => ({
          id: v.id || `rw_${v.code}`,
          title: v.reward,
          code: v.code,
          masterPosCode: v.masterPosCode || v.posCode,
          tier: v.tier || "High Value",
          value: v.netSales || 45.0,
          wonAt: v.issuedAt ? new Date(v.issuedAt).toLocaleDateString() : "Active",
          expiresAt: v.expiresAt ? `Expires ${new Date(v.expiresAt).toLocaleDateString()}` : "Expires in 7 days",
          status: v.status || "active",
          description: `Master POS promo: ${v.masterPosCode || v.posCode || brand.masterPosCode || 'SRV50'}`,
          color: "#D35400"
        }));
        setRewardsHistory(historyItems);
      }
    } catch (e) {
      console.error("Failed to load dashboard data:", e);
    }
  };

  useEffect(() => {
    loadBackendData();
  }, []);

  // Construct 8 dynamic prize slices based on backend prize_board
  const dynamicSlices = useMemo(() => {
    const good = prizeBoard?.goodPrizes || [];
    const dud = prizeBoard?.dudPrize || { label: "10% Off Next Booking", posCode: "SAVE10" };
    const pfx = (brand.id || "SRV").substring(0, 3).toUpperCase();
    const masterCode = brand.masterPosCode || `${pfx}50-PROMO`;

    const raw = [
      {
        id: "slice_1",
        label: good[0]?.label || "50% Off 3-Hr Session",
        shortLabel: (good[0]?.label || "50% Off").split(" ").slice(0, 3).join(" "),
        value: 125.0,
        tier: "Grand Prize",
        probability: 0.1,
        codePrefix: `OL-${pfx}`,
        masterPosCode: good[0]?.posCode || masterCode,
        description: `Grand Prize · Register POS match: ${good[0]?.posCode || masterCode}`
      },
      {
        id: "slice_2",
        label: good[1]?.label || "$25 Off $100 Service",
        shortLabel: (good[1]?.label || "$25 Off $100").split(" ").slice(0, 3).join(" "),
        value: 25.0,
        tier: "High Value",
        probability: 0.15,
        codePrefix: `OL-${pfx}`,
        masterPosCode: good[1]?.posCode || `${pfx}25-OFF`,
        description: `High Value Perk · Register POS match: ${good[1]?.posCode || `${pfx}25-OFF`}`
      },
      {
        id: "slice_3",
        label: good[2]?.label || "Free Add-On Service",
        shortLabel: (good[2]?.label || "Free Add-On").split(" ").slice(0, 3).join(" "),
        value: 35.0,
        tier: "Daily Win",
        probability: 0.2,
        codePrefix: `OL-${pfx}`,
        masterPosCode: good[2]?.posCode || `${pfx}-ADDON`,
        description: `Complimentary Service Upgrade · POS match: ${good[2]?.posCode || `${pfx}-ADDON`}`
      },
      {
        id: "slice_4",
        label: good[3]?.label || "$15 In-Store Credit",
        shortLabel: (good[3]?.label || "$15 Credit").split(" ").slice(0, 3).join(" "),
        value: 15.0,
        tier: "Loyalty Boost",
        probability: 0.15,
        codePrefix: `OL-${pfx}`,
        masterPosCode: good[3]?.posCode || `${pfx}15-VIP`,
        description: `Instant Register Credit · POS match: ${good[3]?.posCode || `${pfx}15-VIP`}`
      },
      {
        id: "slice_5",
        label: good[4]?.label || "Complimentary Aftercare Kit",
        shortLabel: (good[4]?.label || "Aftercare Kit").split(" ").slice(0, 3).join(" "),
        value: 20.0,
        tier: "Care Pack",
        probability: 0.15,
        codePrefix: `OL-${pfx}`,
        masterPosCode: good[4]?.posCode || `${pfx}-CARE`,
        description: `Premium Care Product · POS match: ${good[4]?.posCode || `${pfx}-CARE`}`
      },
      {
        id: "slice_6",
        label: good[0]?.label ? `20% Off ${brand.signatureItem || 'Service'}` : "20% Off Service",
        shortLabel: "20% Off",
        value: 40.0,
        tier: "Service Discount",
        probability: 0.1,
        codePrefix: `OL-${pfx}`,
        masterPosCode: `${pfx}20-SAVE`,
        description: `Valid on any booking · POS match: ${pfx}20-SAVE`
      },
      {
        id: "slice_7",
        label: "VIP Priority Booking Slot",
        shortLabel: "VIP Priority",
        value: 15.0,
        tier: "Priority Perk",
        probability: 0.08,
        codePrefix: `OL-${pfx}`,
        masterPosCode: `${pfx}-PRIORITY`,
        description: `Guaranteed next-available window · POS match: ${pfx}-PRIORITY`
      },
      {
        id: "slice_8",
        label: dud.label || "10% Off Next Booking",
        shortLabel: (dud.label || "10% Off").split(" ").slice(0, 3).join(" "),
        value: 10.0,
        tier: "Everyday Win",
        probability: 0.07,
        codePrefix: `OL-${pfx}`,
        masterPosCode: dud.posCode || `${pfx}10-SAVE`,
        description: `Margin-Protected Courtesy Perk · POS match: ${dud.posCode || `${pfx}10-SAVE`}`
      }
    ];

    return raw.map((item, idx) => ({
      ...item,
      color: SLICE_COLORS[idx % SLICE_COLORS.length].color,
      textColor: SLICE_COLORS[idx % SLICE_COLORS.length].textColor
    }));
  }, [prizeBoard, brand]);

  const numSlices = dynamicSlices.length;
  const sliceAngle = 360 / numSlices;
  const wheelRadius = 180;
  const centerCoord = 200;

  const slicePaths = useMemo(() => {
    return dynamicSlices.map((slice, index) => {
      const startAngle = index * sliceAngle - 90;
      const endAngle = (index + 1) * sliceAngle - 90;
      const startRad = (startAngle * Math.PI) / 180;
      const endRad = (endAngle * Math.PI) / 180;

      const x1 = centerCoord + wheelRadius * Math.cos(startRad);
      const y1 = centerCoord + wheelRadius * Math.sin(startRad);
      const x2 = centerCoord + wheelRadius * Math.cos(endRad);
      const y2 = centerCoord + wheelRadius * Math.sin(endRad);

      const midAngle = startAngle + sliceAngle / 2;
      const midRad = (midAngle * Math.PI) / 180;
      const textX = centerCoord + (wheelRadius * 0.62) * Math.cos(midRad);
      const textY = centerCoord + (wheelRadius * 0.62) * Math.sin(midRad);

      const pathData = `M ${centerCoord} ${centerCoord} L ${x1} ${y1} A ${wheelRadius} ${wheelRadius} 0 0 1 ${x2} ${y2} Z`;

      return {
        ...slice,
        pathData,
        midAngle,
        textX,
        textY,
        index
      };
    });
  }, [dynamicSlices, numSlices, sliceAngle]);

  // Handle spin action
  const handleSpin = () => {
    if (isSpinning) return;

    setIsSpinning(true);
    setShowCelebration(false);
    setWonPrize(null);

    const randomIndex = Math.floor(Math.random() * numSlices);
    const targetPrize = dynamicSlices[randomIndex];

    const extraRotations = 360 * 5;
    const sliceCenterAngle = randomIndex * sliceAngle + sliceAngle / 2;
    const targetAngle = 360 - sliceCenterAngle;
    const jitter = (Math.random() - 0.5) * (sliceAngle * 0.6);
    const nextRotation = wheelRotation + extraRotations + (targetAngle - (wheelRotation % 360)) + jitter;
    setWheelRotation(nextRotation);

    if (soundEnabled) {
      let tickCount = 0;
      const maxTicks = 28;
      audioIntervalRef.current = setInterval(() => {
        tickCount++;
        playAudioTone("tick");
        if (tickCount >= maxTicks) {
          clearInterval(audioIntervalRef.current);
        }
      }, 130);
    }

    setTimeout(() => {
      setIsSpinning(false);
      if (audioIntervalRef.current) clearInterval(audioIntervalRef.current);
      if (soundEnabled) playAudioTone("win");

      const randAlnum = Math.random().toString(36).substring(2, 6).toUpperCase();
      const pfx = (brand.id || "SRV").substring(0, 3).toUpperCase();
      const serializedClaimCode = `OL-${pfx}-${randAlnum}`;

      const newRewardItem = {
        id: `rw_${Date.now()}`,
        title: targetPrize.label,
        code: serializedClaimCode,
        masterPosCode: targetPrize.masterPosCode,
        tier: targetPrize.tier,
        value: targetPrize.value,
        wonAt: "Just now",
        expiresAt: "Expires in 7 days",
        status: "active",
        description: targetPrize.description,
        color: targetPrize.color,
        isNew: true
      };

      setWonPrize(newRewardItem);
      setShowCelebration(true);
      setSpinsRemaining((prev) => Math.max(0, prev - 1));
      setTotalSpinsToday((prev) => prev + 1);

      setRewardsHistory((prev) => [newRewardItem, ...prev]);
      setVouchers((prev) => [{
        id: newRewardItem.id,
        code: newRewardItem.code,
        masterPosCode: newRewardItem.masterPosCode,
        reward: newRewardItem.title,
        tier: newRewardItem.tier,
        status: "issued",
        issuedAt: new Date().toISOString()
      }, ...prev]);
    }, 4200);
  };

  const copyToClipboard = (code) => {
    if (!code) return;
    navigator.clipboard?.writeText(code).catch(() => {});
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const handleLaunchSprint = async () => {
    try {
      const res = await launchSprint(7);
      if (res && res.cadence) {
        setCadenceState(res.cadence);
        toast.success("7-Day Promotional Sprint Launched", {
          description: "Active sprint running. Anti-fatigue cooldown scheduled."
        });
      }
    } catch (e) {
      toast.error("Failed to launch sprint");
    }
  };

  const handleSwitchRest = async () => {
    try {
      const res = await switchRestMode();
      if (res && res.cadence) {
        setCadenceState(res.cadence);
        toast.success("Switched to Rest & Nurture Mode", {
          description: "Protecting luxury service margins and preventing client burnout."
        });
      }
    } catch (e) {
      toast.error("Failed to switch rest mode");
    }
  };

  const handleSaveMarginFloor = async () => {
    try {
      const res = await tuneMarginFloor(marginMaxDiscount, marginMinSpend);
      toast.success("Margin Floor Locked", {
        description: `Max discount: ${marginMaxDiscount}%, Min spend: $${marginMinSpend}`
      });
      setShowMarginModal(false);
    } catch (e) {
      toast.error("Failed to tune margin floor");
    }
  };

  const handlePerformStaffRedemption = async () => {
    if (!staffRedeemModal) return;
    try {
      const res = await redeemStaffVoucher(staffRedeemModal.code, staffSalesInput);
      if (res && res.status === "ok") {
        toast.success(`Voucher ${staffRedeemModal.code} Verified`, {
          description: `Attributed net sales: $${Number(staffSalesInput).toFixed(2)}`
        });
        setVouchers((prev) =>
          prev.map((v) =>
            v.code === staffRedeemModal.code
              ? { ...v, status: "redeemed", redeemedAt: new Date().toISOString(), netSales: Number(staffSalesInput) }
              : v
          )
        );
        setRewardsHistory((prev) =>
          prev.map((r) =>
            r.code === staffRedeemModal.code
              ? { ...r, status: "redeemed", expiresAt: "Redeemed at register" }
              : r
          )
        );
        setStaffRedeemModal(null);
      }
    } catch (e) {
      toast.error("Redemption failed or code already used");
    }
  };

  const filteredHistory = useMemo(() => {
    return rewardsHistory.filter((item) => {
      const matchesFilter =
        historyFilter === "all" ? true : item.status === historyFilter;
      const matchesSearch =
        item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.tier.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesFilter && matchesSearch;
    });
  }, [rewardsHistory, historyFilter, searchQuery]);

  const filteredStaffVouchers = useMemo(() => {
    if (!voucherSearch.trim()) return vouchers;
    const q = voucherSearch.toLowerCase();
    return vouchers.filter(v =>
      (v.code && v.code.toLowerCase().includes(q)) ||
      (v.masterPosCode && v.masterPosCode.toLowerCase().includes(q)) ||
      (v.reward && v.reward.toLowerCase().includes(q))
    );
  }, [vouchers, voucherSearch]);

  const activeCount = rewardsHistory.filter((r) => r.status === "active" || r.status === "issued").length;
  const redeemedCount = rewardsHistory.filter((r) => r.status === "redeemed").length;
  const totalValueWon = rewardsHistory.reduce((acc, r) => acc + (r.value || 0), 0);

  const isRestMode = cadence?.mode === "rest_nurture";

  return (
    <div className="p-6 md:p-10 max-w-[1300px] mx-auto space-y-6" data-testid="spin-dashboard">
      
      {/* 1. ANTI-FATIGUE CAMPAIGN CADENCE & AGENT WARNING BANNER */}
      <div
        className="p-4 md:p-5 rounded-2xl border shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
        style={{
          background: isRestMode ? "#F8FAFC" : "linear-gradient(135deg, #FFFDF8 0%, #FEF9EF 100%)",
          borderColor: isRestMode ? "#CBD5E1" : "#F59E0B"
        }}
        data-testid="anti-fatigue-banner"
      >
        <div className="flex items-start gap-3.5">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5 shadow-sm ${
              isRestMode ? "bg-slate-700 text-white" : "bg-amber-500 text-white"
            }`}
          >
            {isRestMode ? <ShieldCheck size={20} /> : <AlertTriangle size={20} />}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                  isRestMode
                    ? "bg-slate-200 text-slate-800"
                    : "bg-amber-100 text-amber-900 border border-amber-300"
                }`}
              >
                {isRestMode ? "Rest & Nurture Mode (Full-Price Focus)" : "Active 7-Day Sprint Mode"}
              </span>
              <span className="text-xs font-semibold text-slate-700 font-mono">
                {isRestMode ? "• Margin Protection Active" : "• 5 Days 14 Hrs Remaining"}
              </span>
            </div>
            <p className="text-xs text-slate-700 mt-1 font-medium max-w-2xl leading-relaxed">
              {cadence?.advisoryNotice ||
                "Promotional Alert: High-frequency gamification degrades luxury/service brand trust. Best Practice: 1 week active per month, rotating game styles (Spin Wheel -> Scratch -> Mystery Box)."}
            </p>
          </div>
        </div>

        {/* Cadence Quick Actions */}
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          {!isRestMode ? (
            <button
              onClick={handleSwitchRest}
              className="btn btn-ghost text-xs px-3 py-2 border bg-white hover:bg-slate-100 text-slate-700 shadow-sm"
              title="Switch to Rest & Nurture Mode"
            >
              <ShieldCheck size={13} className="text-blue-600" />
              <span>Switch to Rest Mode</span>
            </button>
          ) : (
            <button
              onClick={handleLaunchSprint}
              className="btn btn-primary text-xs px-3 py-2 flex items-center gap-1.5 shadow-sm"
            >
              <Zap size={13} />
              <span>Launch 7-Day Sprint</span>
            </button>
          )}

          <button
            onClick={() => setShowMarginModal(true)}
            className="btn btn-ghost text-xs px-3 py-2 border bg-white hover:bg-slate-100 text-slate-700 shadow-sm"
            title="Tune Margin Floor & Discount Caps"
          >
            <Sliders size={13} className="text-amber-600" />
            <span>Tune Margin Floor</span>
          </button>

          <a
            href={exportClaimCodesUrl()}
            download
            className="btn btn-ghost text-xs px-3 py-2 border bg-white hover:bg-slate-100 text-slate-700 shadow-sm flex items-center gap-1.5"
          >
            <Download size={13} />
            <span>Export Claim Codes</span>
          </a>
        </div>
      </div>

      {/* 2. TOP HEADER & METRIC COUNTERS */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b" style={{ borderColor: "var(--border)" }}>
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full animate-pulse" style={{ background: "var(--primary)" }} />
            <Overline style={{ color: "var(--primary)" }}>Universal Revenue &amp; Promotion Engine</Overline>
          </div>
          <h1 className="text-3xl md:text-4xl serif mt-1 font-normal tracking-tight">
            {brand.name} <span style={{ color: "var(--primary)" }}>· Rewards &amp; POS Station</span>
          </h1>
          <p className="text-xs md:text-sm mt-1 max-w-xl" style={{ color: "var(--text-secondary)" }}>
            Industry-agnostic customer maximizer. Dual-mode code generator for instant in-store POS alignment and serialized tamper-proof claim tracking.
          </p>
        </div>

        {/* Quick stat cards */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="card p-2.5 px-3.5 text-center bg-white shadow-sm border">
            <div className="overline" style={{ fontSize: "0.55rem" }}>Master POS</div>
            <div className="mono text-sm font-bold text-emerald-700">
              {brand.masterPosCode || "TAT50-PROMO"}
            </div>
          </div>
          <div className="card p-2.5 px-3.5 text-center bg-white shadow-sm border">
            <div className="overline" style={{ fontSize: "0.55rem" }}>Active Codes</div>
            <div className="mono text-sm font-bold" style={{ color: "var(--success)" }}>
              {activeCount}
            </div>
          </div>
          <div className="card p-2.5 px-3.5 text-center bg-white shadow-sm border">
            <div className="overline" style={{ fontSize: "0.55rem" }}>Verified Sales</div>
            <div className="mono text-sm font-bold text-slate-900">
              {usd(totalValueWon)}
            </div>
          </div>
        </div>
      </div>

      {/* Sub-view Navigation Tabs */}
      <div className="flex items-center gap-2 border-b pb-2">
        <button
          onClick={() => setActiveTabSubView("wheel")}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
            activeTabSubView === "wheel"
              ? "bg-slate-900 text-white shadow-sm"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          <Sparkles size={13} />
          <span>Interactive Lucky Wheel</span>
        </button>

        <button
          onClick={() => setActiveTabSubView("staff_lookup")}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
            activeTabSubView === "staff_lookup"
              ? "bg-slate-900 text-white shadow-sm"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          <Store size={13} />
          <span>Staff 1-Click POS Redemption Ledger ({vouchers.length})</span>
        </button>

        <button
          onClick={() => setActiveTabSubView("rest_schedule")}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
            activeTabSubView === "rest_schedule"
              ? "bg-slate-900 text-white shadow-sm"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          <Calendar size={13} />
          <span>4-Week Rest Cadence Schedule</span>
        </button>
      </div>

      {/* VIEW 1: INTERACTIVE WHEEL & REWARDS HISTORY */}
      {activeTabSubView === "wheel" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left: Wheel */}
          <div className="lg:col-span-6 flex flex-col items-center">
            <div className="card p-6 md:p-8 w-full flex flex-col items-center relative overflow-hidden" data-testid="wheel-container" style={{ background: "var(--surface)" }}>
              
              <div className="w-full flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Sparkles size={16} color="var(--primary)" />
                  <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--text)" }}>
                    Dynamic Prize Wheel ({brand.category || 'Service / Retail'})
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setSoundEnabled(!soundEnabled)}
                    className="p-1.5 rounded-lg border text-xs flex items-center gap-1 transition-colors"
                    style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
                  >
                    {soundEnabled ? <Volume2 size={14} color="var(--primary)" /> : <VolumeX size={14} />}
                    <span className="text-[11px]">{soundEnabled ? "Sound On" : "Muted"}</span>
                  </button>

                  <button
                    onClick={() => setSpinsRemaining((p) => p + 3)}
                    className="p-1.5 px-2.5 rounded-lg border text-xs flex items-center gap-1 transition-colors hover:bg-[var(--surface-alt)]"
                    style={{ borderColor: "var(--border)", color: "var(--text)" }}
                  >
                    <RefreshCw size={13} />
                    <span className="text-[11px]">Add Plays</span>
                  </button>
                </div>
              </div>

              {/* Master POS Reference Chip */}
              <div className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 px-3 text-xs flex items-center justify-between my-2 text-slate-600 font-mono">
                <span>Master POS Register Promo:</span>
                <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  {brand.masterPosCode || "TAT50-PROMO"}
                </span>
              </div>

              {/* Wheel Outer Housing */}
              <div className="relative my-4 flex items-center justify-center select-none" style={{ width: 380, height: 380, maxWidth: "100%" }}>
                {/* Pointer */}
                <div
                  className={`absolute -top-3 z-30 flex flex-col items-center pointer-events-none transition-transform ${
                    isSpinning ? "anim-ticker" : ""
                  }`}
                  style={{ left: "50%", transform: "translateX(-50%)" }}
                  data-testid="wheel-pointer"
                >
                  <div
                    className="w-7 h-9 shadow-lg"
                    style={{
                      clipPath: "polygon(50% 100%, 0% 0%, 100% 0%)",
                      background: "linear-gradient(180deg, #E74C3C 0%, #C0392B 100%)",
                      borderTop: "2px solid #F39C12"
                    }}
                  />
                  <div className="w-3 h-3 rounded-full bg-white border-2 border-red-700 -mt-8 shadow-sm" />
                </div>

                {/* Rim */}
                <div
                  className="absolute inset-0 rounded-full border-[10px] shadow-2xl flex items-center justify-center"
                  style={{
                    borderColor: "#1A1A1A",
                    background: "#1A1A1A",
                    boxShadow: isSpinning
                      ? "0 0 35px rgba(211,84,0,0.5), 0 10px 30px rgba(0,0,0,0.3)"
                      : "0 10px 30px rgba(0,0,0,0.15)"
                  }}
                >
                  {[...Array(12)].map((_, i) => {
                    const angle = (i * 360) / 12;
                    const rad = (angle * Math.PI) / 180;
                    const r = 182;
                    const left = 190 + r * Math.cos(rad) - 5;
                    const top = 190 + r * Math.sin(rad) - 5;
                    return (
                      <div
                        key={i}
                        className="absolute w-2.5 h-2.5 rounded-full anim-bulb shadow-sm"
                        style={{
                          left: `${left}px`,
                          top: `${top}px`,
                          background: i % 2 === 0 ? "#F1C40F" : "#FFFFFF",
                          animationDelay: `${(i * 0.12).toFixed(2)}s`
                        }}
                      />
                    );
                  })}
                </div>

                {/* SVG */}
                <div
                  className="w-full h-full flex items-center justify-center"
                  style={{
                    transform: `rotate(${wheelRotation}deg)`,
                    transition: isSpinning
                      ? "transform 4.2s cubic-bezier(0.12, 0.98, 0.22, 1)"
                      : "none"
                  }}
                  data-testid="spinning-wheel-svg"
                >
                  <svg
                    viewBox="0 0 400 400"
                    className="w-[340px] h-[340px] rounded-full drop-shadow-md"
                  >
                    {slicePaths.map((slice) => (
                      <g key={slice.id}>
                        <path
                          d={slice.pathData}
                          fill={slice.color}
                          stroke="#1A1A1A"
                          strokeWidth="2.5"
                        />
                        <g transform={`rotate(${slice.midAngle + 90}, ${slice.textX}, ${slice.textY})`}>
                          <text
                            x={slice.textX}
                            y={slice.textY}
                            fill={slice.textColor}
                            fontSize="10"
                            fontWeight="700"
                            fontFamily="Manrope, sans-serif"
                            textAnchor="middle"
                            dominantBaseline="middle"
                          >
                            {slice.shortLabel}
                          </text>
                        </g>
                      </g>
                    ))}
                    <circle cx="200" cy="200" r="180" fill="none" stroke="#F39C12" strokeWidth="3" />
                  </svg>
                </div>

                {/* Center Button */}
                <button
                  onClick={handleSpin}
                  disabled={isSpinning}
                  data-testid="center-spin-btn"
                  className={`absolute z-20 w-20 h-20 rounded-full flex flex-col items-center justify-center cursor-pointer transition-transform active:scale-95 shadow-xl border-4 ${
                    isSpinning ? "opacity-90 cursor-not-allowed" : "hover:scale-105"
                  }`}
                  style={{
                    background: "radial-gradient(circle, #D35400 0%, #A84300 70%, #6E2D02 100%)",
                    borderColor: "#F39C12",
                    color: "#FFFFFF"
                  }}
                >
                  <RotateCw size={18} className={isSpinning ? "animate-spin" : ""} />
                  <span className="font-extrabold text-xs tracking-wider uppercase mt-0.5">
                    {isSpinning ? "Spinning" : "SPIN"}
                  </span>
                </button>
              </div>

              {/* Spin Trigger */}
              <div className="w-full flex flex-col items-center mt-3 gap-3">
                <button
                  onClick={handleSpin}
                  disabled={isSpinning}
                  data-testid="spin-cta-button"
                  className={`btn btn-primary w-full max-w-sm flex items-center justify-center gap-2 py-3.5 text-base shadow-lg transition-all ${
                    isSpinning ? "opacity-60 cursor-not-allowed" : "hover:shadow-orange-500/20"
                  }`}
                >
                  <Zap size={18} />
                  <span>{isSpinning ? "Selecting Prize…" : "SPIN TO WIN REWARD"}</span>
                </button>

                <div className="flex items-center gap-4 text-xs" style={{ color: "var(--text-secondary)" }}>
                  <span className="flex items-center gap-1.5">
                    <Ticket size={13} color="var(--primary)" />
                    <b>{spinsRemaining}</b> plays remaining
                  </span>
                  <span>•</span>
                  <span className="flex items-center gap-1.5">
                    <Flame size={13} color="#E67E22" />
                    Play #{totalSpinsToday}
                  </span>
                </div>
              </div>

              {/* Winner Announcement */}
              <AnimatePresence>
                {showCelebration && wonPrize && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9, y: 12 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="mt-6 w-full p-5 rounded-xl border-2 anim-pop shadow-md"
                    style={{
                      background: "linear-gradient(135deg, #FFFDF8 0%, #F9F5EC 100%)",
                      borderColor: wonPrize.color || "var(--primary)"
                    }}
                    data-testid="winner-card"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <div
                          className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 shadow-sm"
                          style={{ background: wonPrize.color, color: "#FFFFFF" }}
                        >
                          <PartyPopper size={20} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span
                              className="text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider text-white"
                              style={{ background: wonPrize.color }}
                            >
                              {wonPrize.tier}
                            </span>
                            <span className="text-xs font-semibold text-emerald-700 flex items-center gap-1">
                              <CheckCircle2 size={12} /> Serialized Claim Issued
                            </span>
                          </div>
                          <h4 className="serif text-xl font-bold mt-0.5 text-gray-900 leading-tight">
                            {wonPrize.title}
                          </h4>
                        </div>
                      </div>

                      <div className="mono font-bold text-lg text-right" style={{ color: wonPrize.color }}>
                        {usd(wonPrize.value)}
                      </div>
                    </div>

                    <div className="mt-3 p-2.5 rounded-lg border flex items-center justify-between bg-white" style={{ borderColor: "var(--border)" }}>
                      <div>
                        <div className="text-[10px] uppercase font-bold tracking-wider text-gray-400">
                          Serialized Claim Code (Tamper-Proof)
                        </div>
                        <div className="mono text-sm font-bold text-gray-900 tracking-wider">
                          {wonPrize.code}
                        </div>
                        <div className="text-[10px] text-emerald-700 font-mono">
                          Master POS Match: {wonPrize.masterPosCode}
                        </div>
                      </div>

                      <button
                        onClick={() => copyToClipboard(wonPrize.code)}
                        data-testid="copy-won-code"
                        className="btn btn-ghost text-xs px-3 py-1.5 flex items-center gap-1.5"
                      >
                        {copiedCode === wonPrize.code ? (
                          <>
                            <Check size={13} color="var(--success)" />
                            <span style={{ color: "var(--success)" }}>Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy size={13} />
                            <span>Copy Code</span>
                          </>
                        )}
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Prize legend */}
              <div className="w-full mt-6 pt-5 border-t" style={{ borderColor: "var(--border)" }}>
                <div className="flex items-center justify-between mb-3">
                  <Overline>Dynamic Rewards Pool &amp; Register POS Codes</Overline>
                  <span className="text-xs text-gray-400 font-mono">8 Custom Slices</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {dynamicSlices.map((slice) => (
                    <div
                      key={slice.id}
                      className="p-2 rounded-lg border flex flex-col justify-between text-xs"
                      style={{ background: "var(--surface-alt)", borderColor: "var(--border)" }}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: slice.color }} />
                        <span className="font-semibold truncate">{slice.shortLabel}</span>
                      </div>
                      <div className="text-[10px] font-mono text-emerald-700 mt-1 truncate">
                        {slice.masterPosCode}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </div>

          {/* Right: History */}
          <div className="lg:col-span-6 flex flex-col">
            <div className="card p-6 md:p-8 w-full" data-testid="rewards-history-section" style={{ background: "var(--surface)" }}>
              
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b" style={{ borderColor: "var(--border)" }}>
                <div>
                  <div className="flex items-center gap-2">
                    <Gift size={16} color="var(--primary)" />
                    <Overline>Ledger of Issued Claims</Overline>
                  </div>
                  <h3 className="serif text-2xl font-bold mt-1">
                    Customer Reward History
                  </h3>
                </div>

                <div className="flex items-center gap-1 p-1 rounded-lg border bg-[var(--surface-alt)]" style={{ borderColor: "var(--border)" }}>
                  <button
                    onClick={() => setHistoryFilter("all")}
                    className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                      historyFilter === "all" ? "bg-white shadow-sm text-[var(--primary)]" : "text-gray-500 hover:text-gray-800"
                    }`}
                  >
                    All ({rewardsHistory.length})
                  </button>
                  <button
                    onClick={() => setHistoryFilter("active")}
                    className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                      historyFilter === "active" ? "bg-white shadow-sm text-[var(--primary)]" : "text-gray-500 hover:text-gray-800"
                    }`}
                  >
                    Active ({activeCount})
                  </button>
                  <button
                    onClick={() => setHistoryFilter("redeemed")}
                    className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                      historyFilter === "redeemed" ? "bg-white shadow-sm text-[var(--primary)]" : "text-gray-500 hover:text-gray-800"
                    }`}
                  >
                    Redeemed ({redeemedCount})
                  </button>
                </div>
              </div>

              {/* Search */}
              <div className="flex items-center gap-3 my-4">
                <div className="relative flex-1">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search won rewards, claim codes, or master POS..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border bg-white"
                    style={{ borderColor: "var(--border)" }}
                  />
                </div>
              </div>

              {/* List */}
              <div className="space-y-3 mt-2 max-h-[520px] overflow-y-auto pr-1">
                {filteredHistory.length === 0 ? (
                  <div className="p-8 text-center rounded-xl border border-dashed my-4" style={{ borderColor: "var(--border)", background: "var(--surface-alt)" }}>
                    <Trophy size={32} className="mx-auto text-gray-400 mb-2" />
                    <h4 className="font-bold text-sm text-gray-800">No matching claims found</h4>
                    <p className="text-xs text-gray-500 mt-1">Spin the wheel or issue voucher codes from the ledger.</p>
                  </div>
                ) : (
                  filteredHistory.map((item) => (
                    <motion.div
                      key={item.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`p-4 rounded-xl border transition-all ${
                        item.isNew ? "ring-2 ring-orange-400/50 bg-orange-50/20" : "bg-white"
                      } hover:border-gray-300`}
                      style={{ borderColor: "var(--border)" }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <div
                            className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5 text-white font-bold"
                            style={{ background: item.status === "redeemed" ? "#64748B" : (item.color || "var(--primary)") }}
                          >
                            <Gift size={18} />
                          </div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-sm text-gray-900">{item.title}</span>
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                                item.status === "redeemed" ? "bg-gray-200 text-gray-700" : "bg-green-100 text-green-800"
                              }`}>
                                {item.status === "redeemed" ? "Redeemed" : "Active"}
                              </span>
                            </div>
                            <div className="text-[11px] text-emerald-700 font-mono mt-0.5">
                              Master POS: {item.masterPosCode || brand.masterPosCode}
                            </div>
                          </div>
                        </div>

                        <div className="mono font-bold text-sm text-right shrink-0" style={{ color: item.status === "redeemed" ? "#7F8C8D" : "var(--success)" }}>
                          {usd(item.value)}
                        </div>
                      </div>

                      <div className="mt-3 pt-3 border-t flex flex-wrap items-center justify-between gap-2 text-xs" style={{ borderColor: "var(--border)" }}>
                        <div className="flex items-center gap-2">
                          <div className="p-1 px-2 rounded bg-[var(--surface-alt)] font-mono font-bold text-gray-800 border" style={{ borderColor: "var(--border)" }}>
                            {item.code}
                          </div>
                          <button
                            onClick={() => copyToClipboard(item.code)}
                            className="p-1 rounded hover:bg-gray-100 text-gray-600 transition-colors"
                          >
                            {copiedCode === item.code ? <Check size={14} color="var(--success)" /> : <Copy size={14} />}
                          </button>
                        </div>

                        <div>
                          {item.status === "active" || item.status === "issued" ? (
                            <button
                              onClick={() => {
                                setStaffRedeemModal(item);
                                setStaffSalesInput(String(item.value || "85.00"));
                              }}
                              className="btn btn-ghost text-xs px-2.5 py-1 text-emerald-700 border border-emerald-300 hover:bg-emerald-50 font-semibold"
                            >
                              1-Click Redeem
                            </button>
                          ) : (
                            <span className="text-[11px] font-semibold text-gray-500 flex items-center gap-1">
                              <Check size={12} /> Verified at Register
                            </span>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  ))
                )}
              </div>

            </div>
          </div>
        </div>
      )}

      {/* VIEW 2: STAFF 1-CLICK POS REDEMPTION LOOKUP SCREEN */}
      {activeTabSubView === "staff_lookup" && (
        <div className="card p-6 md:p-8 bg-white border space-y-6" data-testid="staff-lookup-view">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-4">
            <div>
              <div className="flex items-center gap-2">
                <Store size={18} color="var(--primary)" />
                <Overline>Staff Counter / Front Desk Station</Overline>
              </div>
              <h2 className="serif text-2xl md:text-3xl font-bold mt-1 text-slate-900">
                1-Click Voucher Redemption &amp; Ticket Matching
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Scan or type client serialized code (e.g. <span className="font-mono font-bold text-slate-800">OL-TAT-784X</span>) to verify authenticity, attach net sales, and lock voucher against reuse.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <a
                href={exportClaimCodesUrl()}
                download
                className="btn btn-ghost text-xs px-3 py-2 border bg-white text-slate-700 flex items-center gap-1.5 shadow-sm"
              >
                <Download size={13} />
                <span>Export Ledger CSV</span>
              </a>
            </div>
          </div>

          {/* Quick Search */}
          <div className="relative max-w-xl">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by Claim Code (OL-TAT-...), Master POS, or Guest Email..."
              value={voucherSearch}
              onChange={(e) => setVoucherSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-3 text-sm rounded-xl border bg-slate-50 focus:bg-white font-mono"
            />
          </div>

          {/* Voucher Table */}
          <div className="overflow-x-auto border rounded-xl">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-100 text-slate-700 font-semibold border-b">
                <tr>
                  <th className="p-3">Claim Code</th>
                  <th className="p-3">Master POS Code</th>
                  <th className="p-3">Reward Title</th>
                  <th className="p-3">Guest / Space</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Net Sales</th>
                  <th className="p-3 text-right">Staff Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredStaffVouchers.map((v) => (
                  <tr key={v.id || v.code} className="hover:bg-slate-50 transition-colors">
                    <td className="p-3 font-mono font-bold text-slate-900">
                      {v.code}
                    </td>
                    <td className="p-3 font-mono font-semibold text-emerald-700">
                      {v.masterPosCode || v.posCode || brand.masterPosCode}
                    </td>
                    <td className="p-3 font-medium text-slate-800">
                      {v.reward}
                    </td>
                    <td className="p-3 text-slate-500 font-mono">
                      {v.memberEmail || v.spaceId || "In-Store QR"}
                    </td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        v.status === 'redeemed' ? 'bg-slate-200 text-slate-700' : 'bg-emerald-100 text-emerald-800'
                      }`}>
                        {v.status === 'redeemed' ? 'Redeemed' : 'Valid'}
                      </span>
                    </td>
                    <td className="p-3 font-mono font-semibold text-slate-900">
                      {v.netSales ? usd(v.netSales) : "—"}
                    </td>
                    <td className="p-3 text-right">
                      {v.status !== 'redeemed' ? (
                        <button
                          onClick={() => {
                            setStaffRedeemModal(v);
                            setStaffSalesInput("85.00");
                          }}
                          className="btn btn-primary text-xs px-3 py-1.5 shadow-sm font-semibold"
                        >
                          Mark Redeemed
                        </button>
                      ) : (
                        <span className="text-[11px] text-slate-400 font-mono flex items-center justify-end gap-1">
                          <CheckCircle2 size={12} className="text-slate-400" />
                          Locked
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VIEW 3: 4-WEEK REST CADENCE SCHEDULE */}
      {activeTabSubView === "rest_schedule" && (
        <div className="card p-6 md:p-8 bg-white border space-y-6" data-testid="rest-schedule-view">
          <div className="border-b pb-4">
            <div className="flex items-center gap-2">
              <Calendar size={18} color="var(--primary)" />
              <Overline>Anti-Fatigue Guardrail System</Overline>
            </div>
            <h2 className="serif text-2xl md:text-3xl font-bold mt-1 text-slate-900">
              4-Week Monthly Promotional Rotation
            </h2>
            <p className="text-xs text-slate-500 mt-1 max-w-2xl">
              Prevents customer promotion blindness and margin erosion by alternating concentrated 7-day bursts with 3 weeks of full-price brand nurturing.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {(cadence?.restSchedule || [
              { week: 1, name: "Week 1: Active 7-Day Sprint", status: "active", mode: "sprint", game: "Lucky Spin Wheel", advice: "Drive concentrated bursts of high-intent bookings." },
              { week: 2, name: "Week 2: Rest & Nurture Mode", status: "upcoming", mode: "rest_nurture", game: "None (Full-Price Focus)", advice: "Nurture leads with craft stories and protect margins." },
              { week: 3, name: "Week 3: Rest & Nurture Mode", status: "upcoming", mode: "rest_nurture", game: "None (Full-Price Focus)", advice: "Client satisfaction follow-ups and organic reviews." },
              { week: 4, name: "Week 4: Rotation Prep", status: "upcoming", mode: "rest_nurture", game: "Scratch & Win (Next)", advice: "Warm up audience for next month's fresh game mechanic." }
            ]).map((item) => (
              <div
                key={item.week}
                className={`p-4 rounded-xl border flex flex-col justify-between ${
                  item.status === 'active'
                    ? 'bg-amber-50/60 border-amber-400 ring-2 ring-amber-400/20'
                    : 'bg-slate-50/70 border-slate-200'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                      Week {item.week}
                    </span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                      item.status === 'active' ? 'bg-amber-500 text-white' : 'bg-slate-200 text-slate-600'
                    }`}>
                      {item.status}
                    </span>
                  </div>
                  <h4 className="text-sm font-bold text-slate-900 mt-2">
                    {item.name}
                  </h4>
                  <div className="text-xs text-emerald-800 font-mono mt-1 bg-white p-1.5 rounded border">
                    Mechanic: {item.game}
                  </div>
                </div>

                <p className="text-xs text-slate-600 mt-3 pt-3 border-t border-slate-200 leading-relaxed">
                  {item.advice}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MARGIN FLOOR MODAL */}
      <AnimatePresence>
        {showMarginModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border space-y-4"
            >
              <div className="flex items-center justify-between border-b pb-3">
                <div className="flex items-center gap-2">
                  <Sliders size={18} className="text-amber-600" />
                  <h3 className="font-bold text-base text-slate-900">Tune Margin Floor &amp; Discount Caps</h3>
                </div>
                <button onClick={() => setShowMarginModal(false)} className="text-slate-400 hover:text-slate-600">
                  <X size={18} />
                </button>
              </div>

              <p className="text-xs text-slate-600">
                Guard luxury and high-service profit margins by restricting max promotion percentages and enforcing minimum spend thresholds at the register.
              </p>

              <div>
                <div className="flex justify-between text-xs font-semibold text-slate-700 mb-1">
                  <span>Maximum Allowed Discount</span>
                  <span className="font-mono font-bold text-emerald-700">{marginMaxDiscount}%</span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="50"
                  step="5"
                  value={marginMaxDiscount}
                  onChange={(e) => setMarginMaxDiscount(Number(e.target.value))}
                  className="w-full accent-amber-500 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs font-semibold text-slate-700 mb-1">
                  <span>Minimum Spend Requirement</span>
                  <span className="font-mono font-bold text-emerald-700">${marginMinSpend}.00</span>
                </div>
                <input
                  type="range"
                  min="20"
                  max="200"
                  step="10"
                  value={marginMinSpend}
                  onChange={(e) => setMarginMinSpend(Number(e.target.value))}
                  className="w-full accent-amber-500 cursor-pointer"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t">
                <button
                  onClick={() => setShowMarginModal(false)}
                  className="btn btn-ghost text-xs px-3 py-2 text-slate-500"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveMarginFloor}
                  className="btn btn-primary text-xs px-4 py-2"
                >
                  Lock Margin Floor
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* STAFF 1-CLICK REDEMPTION MODAL */}
      <AnimatePresence>
        {staffRedeemModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border space-y-4"
            >
              <div className="flex items-center justify-between border-b pb-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={18} className="text-emerald-600" />
                  <h3 className="font-bold text-base text-slate-900">Verify &amp; Redeem Voucher</h3>
                </div>
                <button onClick={() => setStaffRedeemModal(null)} className="text-slate-400 hover:text-slate-600">
                  <X size={18} />
                </button>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border space-y-1.5 font-mono text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">Claim Code:</span>
                  <span className="font-bold text-slate-900">{staffRedeemModal.code}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Reward:</span>
                  <span className="font-bold text-emerald-800">{staffRedeemModal.reward || staffRedeemModal.title}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Master POS Promo:</span>
                  <span className="font-bold text-slate-900">{staffRedeemModal.masterPosCode || brand.masterPosCode}</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Actual Register Net Sales ($)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={staffSalesInput}
                  onChange={(e) => setStaffSalesInput(e.target.value)}
                  className="w-full p-2.5 rounded-lg border bg-white font-mono text-sm font-bold text-slate-900"
                />
                <span className="text-[11px] text-slate-500 mt-1 block">
                  Attributed directly to this customer claim for weekly ROAS reports.
                </span>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t">
                <button
                  onClick={() => setStaffRedeemModal(null)}
                  className="btn btn-ghost text-xs px-3 py-2 text-slate-500"
                >
                  Cancel
                </button>
                <button
                  onClick={handlePerformStaffRedemption}
                  className="btn btn-primary text-xs px-4 py-2 flex items-center gap-1.5"
                >
                  <Check size={14} />
                  <span>Lock &amp; Reconcile Sale</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
