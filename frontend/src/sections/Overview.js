import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";
import { TrendingUp, Users, Wallet, Repeat, Check, X } from "lucide-react";
import { getOverview, getImportStatus } from "@/lib/api";
import { SectionTitle, Overline, usd } from "@/components/ui-bits";
import WeeklyWinReport from "@/sections/WeeklyWinReport";

function Metric({ label, value, sub, icon: Icon, accent }) {
  return (
    <div className="card lift p-6" data-testid={`metric-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <div className="flex items-center justify-between">
        <Overline>{label}</Overline>
        {Icon && <Icon size={18} style={{ color: accent || "var(--text-secondary)" }} />}
      </div>
      <div className="mono mt-3" style={{ fontSize: "2rem", fontWeight: 700, color: accent || "var(--text)", letterSpacing: "-0.03em" }}>
        {value}
      </div>
      {sub && <div className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>{sub}</div>}
    </div>
  );
}

export default function Overview({ onNavigate }) {
  const [data, setData] = useState(null);
  const [importStatus, setImportStatus] = useState(null);
  useEffect(() => { getOverview().then(setData).catch(() => {}); }, []);
  useEffect(() => { getImportStatus().then(setImportStatus).catch(() => {}); }, []);
  if (!data) return <div className="p-10" style={{ color: "var(--text-secondary)" }}>Loading revenue…</div>;

  const brand = data?.brand || { name: "Local Business", city: "Your City" };
  const hero = {
    totalAttributedRevenue: data?.hero?.totalAttributedRevenue ?? 0,
    totalSpend: data?.hero?.totalSpend ?? 0,
    blendedRoas: data?.hero?.blendedRoas ?? 0,
    newCustomers: data?.hero?.newCustomers ?? 0,
    weeksLearning: data?.hero?.weeksLearning ?? (data?.weekly?.length || 2),
  };
  const weekly = data?.weekly || [];
  const latestWinner = data?.latestWinner || "A";
  const valpak = {
    valpakCost: data?.valpak?.valpakCost ?? 1500,
    valpakHomes: data?.valpak?.valpakHomes ?? 10000,
    ourCost: data?.valpak?.ourCost ?? 299,
    ourReachNote: data?.valpak?.ourReachNote || "Targets high-converting local mobile users with proven attribution",
  };

  return (
    <div className="p-6 md:p-12 max-w-[1200px]">
      {importStatus?.nudge && (
        <div className="flex items-center gap-3 flex-wrap mb-6 p-4 rounded-xl" data-testid="import-nudge-banner"
          style={{ background: "#fdf3f0", border: "1.5px solid #e8b4a4" }}>
          <span className="text-sm font-bold" style={{ color: "var(--danger)" }}>
            This week's POS CSV isn't imported yet.
          </span>
          <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Import it before Sunday close so Monday's Win Report reconciles with your register.
          </span>
          <button data-testid="import-nudge-go-btn" onClick={() => onNavigate && onNavigate("maximizer")}
            className="btn btn-primary text-xs" style={{ padding: "0.4rem 0.9rem" }}>
            Import it now
          </button>
        </div>
      )}
      <Overline style={{ color: "var(--primary)" }}>{brand.name} · {brand.city}</Overline>
      <h1 className="text-4xl md:text-6xl mt-2" style={{ fontWeight: 300 }}>
        This is your one and only <span style={{ color: "var(--primary)" }}>revenue engine</span> that you will ever need.
      </h1>
      <p className="mt-3 max-w-2xl" style={{ color: "var(--text-secondary)" }}>
        Everyone else helps you look busy. This makes you money — targeting the customers who convert,
        proving the revenue at the register, and getting smarter every single week.
      </p>

      {/* Learning Maturity & Moat Spotlight Banner */}
      <div
        className="card p-5 mt-6 border-2 flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
        style={{
          background: "linear-gradient(135deg, #FDFCF8 0%, #F6EFE6 100%)",
          borderColor: "var(--primary)"
        }}
        data-testid="learning-maturity-banner"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-orange-700 text-white font-bold shrink-0 shadow-sm">
            🧠
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider bg-orange-100 text-orange-900">
                Self-Learning Local OS
              </span>
              <span className="text-xs text-green-700 font-bold">• Maturity: Month 3 (Pattern Matched)</span>
            </div>
            <div className="font-bold text-sm text-slate-900 mt-0.5">
              Accumulated Intelligence: 2,480 Data Points · 92/100 Retention Moat
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => onNavigate && onNavigate("attribution")}
            className="btn btn-ghost text-xs px-3 py-2 border border-slate-300"
            data-testid="go-attribution-btn"
          >
            Attribution Hub CSVs →
          </button>
          <button
            onClick={() => onNavigate && onNavigate("knowledge")}
            className="btn btn-primary text-xs px-4 py-2"
            data-testid="go-knowledge-btn"
          >
            Knowledge Base →
          </button>
        </div>
      </div>

      {/* Hero money counter */}
      <motion.div
        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
        className="card mt-8 p-8 md:p-10"
        style={{ background: "var(--surface-alt)" }}
        data-testid="hero-revenue"
      >
        <Overline style={{ color: "var(--success)" }}>Total Attributed Revenue · last {hero.weeksLearning} weeks</Overline>
        <div className="money mt-2" style={{ fontSize: "clamp(3rem, 8vw, 5.5rem)", fontWeight: 700, lineHeight: 1 }}>
          {usd(hero.totalAttributedRevenue)}
        </div>
        <div className="text-sm mt-2" style={{ color: "var(--text-secondary)" }}>
          On {usd(hero.totalSpend)} of ad spend · blended {hero.blendedRoas}× ROAS · {hero.newCustomers} new customers walked in.
        </div>
      </motion.div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
        <Metric label="Blended ROAS" value={`${hero.blendedRoas}×`} sub="Revenue per $1 spent" icon={TrendingUp} accent="var(--success)" />
        <Metric label="New Customers" value={hero.newCustomers} sub="Attributed to campaigns" icon={Users} />
        <Metric label="Weekly Budget" value={usd(299)} sub="Learning + reallocating" icon={Wallet} accent="var(--primary)" />
        <Metric label="Weeks Learning" value={hero.weeksLearning} sub={`Now favoring Strategy ${latestWinner}`} icon={Repeat} />
      </div>

      {/* Interactive Spin to Win Dashboard Feature Spotlight */}
      <div className="card p-6 md:p-8 mt-8 flex flex-col md:flex-row items-center justify-between gap-6" style={{ background: "linear-gradient(135deg, #FDFCF8 0%, #F5EFE6 100%)", borderColor: "#E8DACB" }} data-testid="spin-dashboard-banner">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-md shrink-0" style={{ background: "radial-gradient(circle, #D35400 0%, #A84300 100%)", color: "#FFF" }}>
            <span className="text-2xl animate-spin" style={{ animationDuration: "8s" }}>🎡</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider bg-orange-100 text-orange-800">
                Gamified Customer Maximizer
              </span>
              <span className="text-xs text-green-700 font-semibold">• Active Daily Play</span>
            </div>
            <h3 className="serif text-2xl font-bold mt-1 text-gray-900">
              Spin to Win Rewards Dashboard
            </h3>
            <p className="text-xs text-gray-600 mt-0.5 max-w-xl">
              Engage customers with an interactive CSS-animated prize wheel, instant coupon distribution, and real-time user reward histories.
            </p>
          </div>
        </div>

        <button
          onClick={() => onNavigate && onNavigate("dashboard")}
          data-testid="launch-spin-dashboard-btn"
          className="btn btn-primary text-sm px-6 py-3 shrink-0 flex items-center gap-2 shadow-lg"
        >
          <span>Launch Spin Station</span>
          <span>→</span>
        </button>
      </div>

      {/* Weekly Win Report — Monday one-pager */}
      <WeeklyWinReport />

      {/* Learning chart */}
      <div className="card p-6 md:p-8 mt-8">
        <SectionTitle kicker="The Flywheel, Visible" title="Revenue up, spend flat, ROAS climbing"
          subtitle="Week 1 started as a 50/50 coin-flip. Every week it learns where your money converts and shifts budget toward the winner. Fluff is flat. You go up and to the right." />
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={weekly} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E8E6DF" vertical={false} />
            <XAxis dataKey="weekOf" tick={{ fontSize: 11, fill: "#5C5A56" }} tickLine={false} axisLine={{ stroke: "#E8E6DF" }} />
            <YAxis yAxisId="l" tick={{ fontSize: 11, fill: "#5C5A56" }} tickLine={false} axisLine={false} />
            <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 11, fill: "#27AE60" }} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #E8E6DF", fontFamily: "JetBrains Mono" }} />
            <Line yAxisId="l" type="monotone" dataKey="revenue" name="Revenue $" stroke="#27AE60" strokeWidth={3} dot={{ r: 3 }} />
            <Line yAxisId="r" type="monotone" dataKey="roas" name="ROAS ×" stroke="#D35400" strokeWidth={2} strokeDasharray="5 4" dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Valpak comparison */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-8">
        <div className="card p-8" style={{ background: "#faf3f1", borderColor: "#e7cfc9" }} data-testid="valpak-card">
          <Overline style={{ color: "var(--danger)" }}>The Old Way · Valpak</Overline>
          <div className="mono mt-2" style={{ fontSize: "2.5rem", fontWeight: 700, color: "var(--danger)" }}>{usd(valpak.valpakCost)}</div>
          <div className="text-sm" style={{ color: "var(--text-secondary)" }}>to blanket {valpak.valpakHomes.toLocaleString()} mailboxes</div>
          <ul className="mt-4 space-y-2 text-sm">
            <li className="flex gap-2 items-center"><X size={16} color="#C0392B" /> Zero targeting</li>
            <li className="flex gap-2 items-center"><X size={16} color="#C0392B" /> Zero proof of revenue</li>
            <li className="flex gap-2 items-center"><X size={16} color="#C0392B" /> One-shot, learns nothing</li>
          </ul>
        </div>
        <div className="card p-8" style={{ background: "#f1f8f3", borderColor: "#c9e7d5" }} data-testid="ourway-card">
          <Overline style={{ color: "var(--success)" }}>This · OmniLocal #1</Overline>
          <div className="mono mt-2" style={{ fontSize: "2.5rem", fontWeight: 700, color: "var(--success)" }}>{usd(valpak.ourCost)}</div>
          <div className="text-sm" style={{ color: "var(--text-secondary)" }}>{valpak.ourReachNote}</div>
          <ul className="mt-4 space-y-2 text-sm">
            <li className="flex gap-2 items-center"><Check size={16} color="#27AE60" /> Targets converting ZIPs &amp; demographics</li>
            <li className="flex gap-2 items-center"><Check size={16} color="#27AE60" /> Tracks every ad to real orders</li>
            <li className="flex gap-2 items-center"><Check size={16} color="#27AE60" /> Learns &amp; improves every week</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
