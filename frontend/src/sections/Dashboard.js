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
  Tag,
  Volume2,
  VolumeX,
  Zap,
  CheckCircle2,
  Calendar,
  Search,
  Flame,
  Ticket,
  ChevronRight,
  RefreshCw,
  PartyPopper
} from "lucide-react";
import { SectionTitle, Overline, usd } from "@/components/ui-bits";

// Prize Slices definition for 8 segments
const PRIZE_SLICES = [
  {
    id: "grand_sub",
    label: "Free Signature Sub",
    shortLabel: "Free Sub",
    value: 14.0,
    tier: "Grand Prize",
    color: "#D35400",
    textColor: "#FFFFFF",
    probability: 0.1,
    codePrefix: "SUB-VIP",
    description: "Full-size signature toasted hero with house-made mozzarella"
  },
  {
    id: "off_25",
    label: "25% Off Entire Bill",
    shortLabel: "25% Off",
    value: 12.5,
    tier: "High Value",
    color: "#27AE60",
    textColor: "#FFFFFF",
    probability: 0.15,
    codePrefix: "SAVE-25",
    description: "Applies to dine-in or takeout order over $20"
  },
  {
    id: "five_off",
    label: "$5 Off Any $20+ Order",
    shortLabel: "$5 Off",
    value: 5.0,
    tier: "Daily Win",
    color: "#F39C12",
    textColor: "#1A1A1A",
    probability: 0.2,
    codePrefix: "CASH-5OFF",
    description: "Instant register credit with any entree"
  },
  {
    id: "free_cannoli",
    label: "Free House Cannoli",
    shortLabel: "Cannoli",
    value: 6.0,
    tier: "Sweet Treat",
    color: "#C0392B",
    textColor: "#FFFFFF",
    probability: 0.15,
    codePrefix: "SWEET-CAN",
    description: "Crispy shell filled fresh with sweet ricotta cream & pistachios"
  },
  {
    id: "free_drink",
    label: "Free Craft Soda or Tea",
    shortLabel: "Free Drink",
    value: 4.0,
    tier: "Refreshment",
    color: "#2980B9",
    textColor: "#FFFFFF",
    probability: 0.15,
    codePrefix: "DRINK-ONUS",
    description: "Choice of imported Italian soda or artisan iced beverage"
  },
  {
    id: "bogo_half",
    label: "Buy 1 Entree Get 1 50% Off",
    shortLabel: "BOGO 50%",
    value: 8.5,
    tier: "Pair Special",
    color: "#8E44AD",
    textColor: "#FFFFFF",
    probability: 0.1,
    codePrefix: "BOGO-50",
    description: "Bring a friend or family member for half-price lunch"
  },
  {
    id: "secret_app",
    label: "Free Chef Appetizer",
    shortLabel: "Free App",
    value: 9.0,
    tier: "Chef Special",
    color: "#16A085",
    textColor: "#FFFFFF",
    probability: 0.08,
    codePrefix: "CHEF-TREAT",
    description: "Today's hot garlic knot basket or arancini special"
  },
  {
    id: "ten_credit",
    label: "$10 Register Credit",
    shortLabel: "$10 Credit",
    value: 10.0,
    tier: "Jackpot",
    color: "#2C3E50",
    textColor: "#FFFFFF",
    probability: 0.07,
    codePrefix: "CASH-10VIP",
    description: "Flat $10 deducted at checkout on any order $30+"
  }
];

// Initial Placeholder Rewards History
const INITIAL_REWARDS_HISTORY = [
  {
    id: "rw_01",
    title: "Free Signature Sub",
    code: "SUB-VIP-7X9K",
    tier: "Grand Prize",
    value: 14.0,
    wonAt: "Today, 1:15 PM",
    expiresAt: "Expires in 6 days",
    status: "active", // active | redeemed | expired
    description: "Full-size signature toasted hero with house-made mozzarella",
    color: "#D35400"
  },
  {
    id: "rw_02",
    title: "$5 Off Any $20+ Order",
    code: "CASH-5OFF-3M8P",
    tier: "Daily Win",
    value: 5.0,
    wonAt: "Yesterday, 6:42 PM",
    expiresAt: "Expires in 5 days",
    status: "active",
    description: "Instant register credit with any entree",
    color: "#F39C12"
  },
  {
    id: "rw_03",
    title: "Free House Cannoli",
    code: "SWEET-CAN-9A2B",
    tier: "Sweet Treat",
    value: 6.0,
    wonAt: "Aug 12, 2026",
    expiresAt: "Redeemed at Springfield POS",
    status: "redeemed",
    description: "Crispy shell filled fresh with sweet ricotta cream",
    color: "#C0392B"
  },
  {
    id: "rw_04",
    title: "25% Off Entire Bill",
    code: "SAVE-25-1W4K",
    tier: "High Value",
    value: 12.5,
    wonAt: "Aug 8, 2026",
    expiresAt: "Redeemed at Springfield POS",
    status: "redeemed",
    description: "Applies to dine-in or takeout order over $20",
    color: "#27AE60"
  }
];

// Helper to synthesize subtle click & fanfare sounds using Web Audio
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
      const notes = [523.25, 659.25, 783.99, 1046.5]; // C E G C
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
  } catch (e) {
    // Audio context may be restricted before user gesture
  }
}

export default function Dashboard() {
  const [isSpinning, setIsSpinning] = useState(false);
  const [wheelRotation, setWheelRotation] = useState(0);
  const [wonPrize, setWonPrize] = useState(null);
  const [rewardsHistory, setRewardsHistory] = useState(INITIAL_REWARDS_HISTORY);
  const [historyFilter, setHistoryFilter] = useState("all"); // all | active | redeemed
  const [searchQuery, setSearchQuery] = useState("");
  const [copiedCode, setCopiedCode] = useState(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [spinsRemaining, setSpinsRemaining] = useState(3);
  const [totalSpinsToday, setTotalSpinsToday] = useState(1);
  const [showCelebration, setShowCelebration] = useState(false);
  const audioIntervalRef = useRef(null);

  const numSlices = PRIZE_SLICES.length;
  const sliceAngle = 360 / numSlices;

  // Calculate SVG slice paths
  const wheelRadius = 180;
  const centerCoord = 200;

  const slicePaths = useMemo(() => {
    return PRIZE_SLICES.map((slice, index) => {
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
  }, [numSlices, sliceAngle]);

  // Handle spin action
  const handleSpin = () => {
    if (isSpinning) return;

    setIsSpinning(true);
    setShowCelebration(false);
    setWonPrize(null);

    // Pick a prize (weighted or random)
    const randomIndex = Math.floor(Math.random() * numSlices);
    const targetPrize = PRIZE_SLICES[randomIndex];

    // Compute target rotation:
    // Slices are 0 to 7. To land on randomIndex under the top pointer (at 0 degrees / 12 o'clock),
    // we need slice center to align with top.
    // Base extra rotations: 5 to 8 full spins (1800 - 2880 deg)
    const extraRotations = 360 * 5;
    const sliceCenterAngle = randomIndex * sliceAngle + sliceAngle / 2;
    // Top pointer is at 0 deg, so the wheel rotation needed is:
    const targetAngle = 360 - sliceCenterAngle;
    
    // Add jitter within slice (-12 deg to +12 deg) for natural feel
    const jitter = (Math.random() - 0.5) * (sliceAngle * 0.6);
    
    // Keep cumulative rotation so it always spins forward smoothly
    const nextRotation = wheelRotation + extraRotations + (targetAngle - (wheelRotation % 360)) + jitter;
    setWheelRotation(nextRotation);

    // Ticking audio while spinning
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

    // Animation ends after 4.2 seconds
    setTimeout(() => {
      setIsSpinning(false);
      if (audioIntervalRef.current) clearInterval(audioIntervalRef.current);
      if (soundEnabled) playAudioTone("win");

      const randSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
      const newCode = `${targetPrize.codePrefix}-${randSuffix}`;

      const newRewardItem = {
        id: `rw_${Date.now()}`,
        title: targetPrize.label,
        code: newCode,
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

      // Prepend to Rewards History
      setRewardsHistory((prev) => [newRewardItem, ...prev]);
    }, 4200);
  };

  const copyToClipboard = (code) => {
    if (!code) return;
    navigator.clipboard?.writeText(code).catch(() => {});
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const handleRedeemReward = (id) => {
    setRewardsHistory((prev) =>
      prev.map((r) =>
        r.id === id
          ? { ...r, status: "redeemed", expiresAt: "Redeemed just now at POS" }
          : r
      )
    );
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

  const activeCount = rewardsHistory.filter((r) => r.status === "active").length;
  const redeemedCount = rewardsHistory.filter((r) => r.status === "redeemed").length;
  const totalValueWon = rewardsHistory.reduce((acc, r) => acc + (r.value || 0), 0);

  return (
    <div className="p-6 md:p-10 max-w-[1300px] mx-auto" data-testid="spin-dashboard">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b" style={{ borderColor: "var(--border)" }}>
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full animate-pulse" style={{ background: "var(--primary)" }} />
            <Overline style={{ color: "var(--primary)" }}>Interactive Customer Maximizer</Overline>
          </div>
          <h1 className="text-3xl md:text-5xl serif mt-1 font-normal tracking-tight">
            Spin to Win <span style={{ color: "var(--primary)" }}>Rewards Dashboard</span>
          </h1>
          <p className="text-sm mt-1 max-w-xl" style={{ color: "var(--text-secondary)" }}>
            High-converting gamified rewards station. Spin the animated prize wheel to unlock instant coupons, track live reward vouchers, and verify register redemptions.
          </p>
        </div>

        {/* Quick stat cards */}
        <div className="flex items-center gap-3">
          <div className="card p-3 px-4 text-center" style={{ background: "var(--surface-alt)" }}>
            <div className="overline" style={{ fontSize: "0.55rem" }}>Daily Spins</div>
            <div className="mono text-lg font-bold" style={{ color: "var(--primary)" }}>
              {spinsRemaining} Left
            </div>
          </div>
          <div className="card p-3 px-4 text-center" style={{ background: "var(--surface-alt)" }}>
            <div className="overline" style={{ fontSize: "0.55rem" }}>Active Perks</div>
            <div className="mono text-lg font-bold" style={{ color: "var(--success)" }}>
              {activeCount}
            </div>
          </div>
          <div className="card p-3 px-4 text-center" style={{ background: "var(--surface-alt)" }}>
            <div className="overline" style={{ fontSize: "0.55rem" }}>Total Won</div>
            <div className="mono text-lg font-bold">
              {usd(totalValueWon)}
            </div>
          </div>
        </div>
      </div>

      {/* Main Grid: Spin Wheel Station (Left) & Rewards History Placeholder (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mt-8 items-start">
        
        {/* Left Column: Interactive Spin to Win Wheel */}
        <div className="lg:col-span-6 flex flex-col items-center">
          <div className="card p-6 md:p-8 w-full flex flex-col items-center relative overflow-hidden" data-testid="wheel-container" style={{ background: "var(--surface)" }}>
            
            {/* Top Toolbar */}
            <div className="w-full flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Sparkles size={16} color="var(--primary)" />
                <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--text)" }}>
                  Live Lucky Wheel
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSoundEnabled(!soundEnabled)}
                  title={soundEnabled ? "Mute audio" : "Unmute audio"}
                  className="p-1.5 rounded-lg border text-xs flex items-center gap-1 transition-colors"
                  style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
                >
                  {soundEnabled ? <Volume2 size={14} color="var(--primary)" /> : <VolumeX size={14} />}
                  <span className="text-[11px]">{soundEnabled ? "Sound On" : "Muted"}</span>
                </button>

                <button
                  onClick={() => setSpinsRemaining((p) => p + 3)}
                  title="Add more test spins"
                  className="p-1.5 px-2.5 rounded-lg border text-xs flex items-center gap-1 transition-colors hover:bg-[var(--surface-alt)]"
                  style={{ borderColor: "var(--border)", color: "var(--text)" }}
                  data-testid="reset-spins-btn"
                >
                  <RefreshCw size={13} />
                  <span className="text-[11px]">Add Spins</span>
                </button>
              </div>
            </div>

            {/* Wheel Outer Housing & CSS Animation Area */}
            <div className="relative my-4 flex items-center justify-center select-none" style={{ width: 380, height: 380, maxWidth: "100%" }}>
              
              {/* Ticker / Needle at Top */}
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

              {/* Glowing Outer Rim with Decorative Bulbs */}
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
                {/* 12 Perimeter LED Bulbs */}
                {[...Array(12)].map((_, i) => {
                  const angle = (i * 360) / 12;
                  const rad = (angle * Math.PI) / 180;
                  const r = 182; // Distance from center
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

              {/* The Spinning SVG Canvas */}
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
                  <defs>
                    <filter id="innerShadow" x="-20%" y="-20%" width="140%" height="140%">
                      <feOffset dx="0" dy="2" />
                      <feGaussianBlur stdDeviation="3" result="offset-blur" />
                      <feComposite operator="out" in="SourceGraphic" in2="offset-blur" result="inverse" />
                      <feFlood floodColor="black" floodOpacity="0.4" result="color" />
                      <feComposite operator="in" in="color" in2="inverse" result="shadow" />
                      <feComposite operator="over" in="shadow" in2="SourceGraphic" />
                    </filter>
                  </defs>

                  {/* Slices */}
                  {slicePaths.map((slice) => (
                    <g key={slice.id} className="transition-opacity hover:opacity-95">
                      <path
                        d={slice.pathData}
                        fill={slice.color}
                        stroke="#1A1A1A"
                        strokeWidth="2.5"
                      />
                      {/* Text along angle */}
                      <g
                        transform={`rotate(${slice.midAngle + 90}, ${slice.textX}, ${slice.textY})`}
                      >
                        <text
                          x={slice.textX}
                          y={slice.textY}
                          fill={slice.textColor}
                          fontSize="11"
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

                  {/* Outer edge ring */}
                  <circle
                    cx="200"
                    cy="200"
                    r="180"
                    fill="none"
                    stroke="#F39C12"
                    strokeWidth="3"
                  />
                </svg>
              </div>

              {/* Center Metallic Hub & Click-to-Spin button */}
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
                <RotateCw
                  size={18}
                  className={isSpinning ? "animate-spin" : ""}
                />
                <span className="font-extrabold text-xs tracking-wider uppercase mt-0.5">
                  {isSpinning ? "Spinning" : "SPIN"}
                </span>
              </button>
            </div>

            {/* Spin CTA Trigger & Spin Counter */}
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
                <span>{isSpinning ? "Calculating Prize…" : "SPIN TO WIN REWARD"}</span>
              </button>

              <div className="flex items-center gap-4 text-xs" style={{ color: "var(--text-secondary)" }}>
                <span className="flex items-center gap-1.5">
                  <Ticket size={13} color="var(--primary)" />
                  <b>{spinsRemaining}</b> free plays today
                </span>
                <span>•</span>
                <span className="flex items-center gap-1.5">
                  <Flame size={13} color="#E67E22" />
                  Spin #{totalSpinsToday}
                </span>
              </div>
            </div>

            {/* Winner Revelation Card with CSS animation */}
            <AnimatePresence>
              {showCelebration && wonPrize && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9, y: 12 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.35 }}
                  className="mt-6 w-full p-5 rounded-xl border-2 anim-pop"
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
                          <span className="text-xs font-semibold text-green-700 flex items-center gap-1">
                            <CheckCircle2 size={12} /> Claimed to History
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

                  <p className="text-xs mt-2.5 text-gray-600">
                    {wonPrize.description}
                  </p>

                  {/* Promo code copy bar */}
                  <div className="mt-3 p-2.5 rounded-lg border flex items-center justify-between bg-white" style={{ borderColor: "var(--border)" }}>
                    <div>
                      <div className="text-[10px] uppercase font-bold tracking-wider text-gray-400">
                        Voucher / Coupon Code
                      </div>
                      <div className="mono text-sm font-bold text-gray-900 tracking-wider">
                        {wonPrize.code}
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

            {/* Prize Board Legend Drawer */}
            <div className="w-full mt-6 pt-5 border-t" style={{ borderColor: "var(--border)" }}>
              <div className="flex items-center justify-between mb-3">
                <Overline>Wheel Prize Slices &amp; Probabilities</Overline>
                <span className="text-xs text-gray-400">8 Prize Slices</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {PRIZE_SLICES.map((slice) => (
                  <div
                    key={slice.id}
                    className="p-2 rounded-lg border flex flex-col justify-between text-xs"
                    style={{ background: "var(--surface-alt)", borderColor: "var(--border)" }}
                  >
                    <div className="flex items-center gap-1.5">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ background: slice.color }}
                      />
                      <span className="font-semibold truncate">{slice.shortLabel}</span>
                    </div>
                    <div className="flex justify-between items-center mt-1 text-[11px] mono" style={{ color: "var(--text-secondary)" }}>
                      <span>{usd(slice.value)}</span>
                      <span>{Math.round(slice.probability * 100)}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>

        {/* Right Column: User Rewards History Placeholder */}
        <div className="lg:col-span-6 flex flex-col">
          <div className="card p-6 md:p-8 w-full" data-testid="rewards-history-section" style={{ background: "var(--surface)" }}>
            
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b" style={{ borderColor: "var(--border)" }}>
              <div>
                <div className="flex items-center gap-2">
                  <Gift size={16} color="var(--primary)" />
                  <Overline>Saved Winnings &amp; Vault</Overline>
                </div>
                <h3 className="serif text-2xl font-bold mt-1">
                  User Rewards History
                </h3>
              </div>

              {/* Filter Tabs */}
              <div className="flex items-center gap-1 p-1 rounded-lg border bg-[var(--surface-alt)]" style={{ borderColor: "var(--border)" }}>
                <button
                  onClick={() => setHistoryFilter("all")}
                  data-testid="filter-all-rewards"
                  className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                    historyFilter === "all" ? "bg-white shadow-sm text-[var(--primary)]" : "text-gray-500 hover:text-gray-800"
                  }`}
                >
                  All ({rewardsHistory.length})
                </button>
                <button
                  onClick={() => setHistoryFilter("active")}
                  data-testid="filter-active-rewards"
                  className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                    historyFilter === "active" ? "bg-white shadow-sm text-[var(--primary)]" : "text-gray-500 hover:text-gray-800"
                  }`}
                >
                  Active ({activeCount})
                </button>
                <button
                  onClick={() => setHistoryFilter("redeemed")}
                  data-testid="filter-redeemed-rewards"
                  className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                    historyFilter === "redeemed" ? "bg-white shadow-sm text-[var(--primary)]" : "text-gray-500 hover:text-gray-800"
                  }`}
                >
                  Redeemed ({redeemedCount})
                </button>
              </div>
            </div>

            {/* Search and summary bar */}
            <div className="flex items-center gap-3 my-4">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search won perks, codes, or tiers…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border bg-white"
                  style={{ borderColor: "var(--border)" }}
                />
              </div>

              <button
                onClick={() => setRewardsHistory(INITIAL_REWARDS_HISTORY)}
                title="Reset to default placeholder rewards"
                className="btn btn-ghost text-xs py-2 px-3 flex items-center gap-1 shrink-0"
              >
                <RotateCw size={12} />
                <span>Reset Demo</span>
              </button>
            </div>

            {/* Rewards Stream / List */}
            <div className="space-y-3 mt-2 max-h-[520px] overflow-y-auto pr-1">
              {filteredHistory.length === 0 ? (
                /* Empty State Placeholder */
                <div className="p-8 text-center rounded-xl border border-dashed my-4" style={{ borderColor: "var(--border)", background: "var(--surface-alt)" }} data-testid="rewards-empty-state">
                  <Trophy size={32} className="mx-auto text-gray-400 mb-2" />
                  <h4 className="font-bold text-sm text-gray-800">No rewards matching this view</h4>
                  <p className="text-xs text-gray-500 mt-1 max-w-xs mx-auto">
                    {historyFilter === "redeemed"
                      ? "You haven't marked any rewards as redeemed yet."
                      : "Spin the interactive wheel on the left to add your first prize!"}
                  </p>
                  <button
                    onClick={handleSpin}
                    disabled={isSpinning}
                    className="btn btn-primary text-xs mt-4 py-2 px-4 inline-flex items-center gap-1.5"
                  >
                    <Zap size={14} />
                    <span>Spin the Wheel Now</span>
                  </button>
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
                    data-testid={`reward-item-${item.id}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div
                          className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                          style={{
                            background: item.status === "redeemed" ? "#E8E6DF" : (item.color || "var(--primary)"),
                            color: item.status === "redeemed" ? "#5C5A56" : "#FFFFFF"
                          }}
                        >
                          <Gift size={18} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-sm text-gray-900">
                              {item.title}
                            </span>
                            {item.isNew && (
                              <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-orange-500 text-white uppercase animate-pulse">
                                Just Won
                              </span>
                            )}
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                                item.status === "redeemed"
                                  ? "bg-gray-200 text-gray-700"
                                  : "bg-green-100 text-green-800"
                              }`}
                            >
                              {item.status === "redeemed" ? "Redeemed" : "Active"}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {item.description}
                          </p>
                        </div>
                      </div>

                      <div className="mono font-bold text-sm text-right shrink-0" style={{ color: item.status === "redeemed" ? "#7F8C8D" : "var(--success)" }}>
                        {usd(item.value)}
                      </div>
                    </div>

                    {/* Voucher code and action row */}
                    <div className="mt-3 pt-3 border-t flex flex-wrap items-center justify-between gap-2 text-xs" style={{ borderColor: "var(--border)" }}>
                      <div className="flex items-center gap-2">
                        <div className="p-1 px-2 rounded bg-[var(--surface-alt)] font-mono font-bold text-gray-800 border" style={{ borderColor: "var(--border)" }}>
                          {item.code}
                        </div>
                        <button
                          onClick={() => copyToClipboard(item.code)}
                          title="Copy promo code"
                          className="p-1 rounded hover:bg-gray-100 text-gray-600 transition-colors"
                        >
                          {copiedCode === item.code ? (
                            <Check size={14} color="var(--success)" />
                          ) : (
                            <Copy size={14} />
                          )}
                        </button>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="text-[11px] text-gray-400 flex items-center gap-1">
                          <Clock size={12} />
                          {item.expiresAt}
                        </span>

                        {item.status === "active" ? (
                          <button
                            onClick={() => handleRedeemReward(item.id)}
                            className="btn btn-ghost text-xs px-2.5 py-1 text-primary border-primary/30 hover:bg-primary/5 font-semibold"
                            data-testid={`redeem-btn-${item.id}`}
                          >
                            Mark Redeemed
                          </button>
                        ) : (
                          <span className="text-[11px] font-semibold text-gray-400 flex items-center gap-1">
                            <Check size={12} /> Used
                          </span>
                        )}
                      </div>
                    </div>
                  </motion.div>
                ))
              )}
            </div>

            {/* Bottom info footer */}
            <div className="mt-5 p-3.5 rounded-lg border bg-[var(--surface-alt)] flex items-center justify-between text-xs" style={{ borderColor: "var(--border)" }}>
              <span className="text-gray-600">
                Codes are uniquely generated and verified with 1-click register matching.
              </span>
              <span className="font-semibold text-gray-800 shrink-0">
                100% Anti-Duplication
              </span>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}
