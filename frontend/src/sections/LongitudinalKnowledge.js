import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  Brain, Award, TrendingUp, ShieldCheck, Zap, Clock, ArrowRight,
  Sparkles, CheckCircle2, Lock, Calendar, Layers, BarChart3
} from "lucide-react";
import { getKnowledgeProfile, advanceLearningMaturity } from "@/lib/api";
import { SectionTitle, Overline, usd } from "@/components/ui-bits";

export default function LongitudinalKnowledge() {
  const [data, setData] = useState(null);
  const [selectedHorizon, setSelectedHorizon] = useState("d90"); // "d30" | "d90" | "d180"
  const [advancing, setAdvancing] = useState(false);

  const load = () => {
    getKnowledgeProfile().then(setData).catch(() => {});
  };

  useEffect(() => {
    load();
  }, []);

  const handleAdvance = async () => {
    setAdvancing(true);
    try {
      const res = await advanceLearningMaturity();
      toast.success(res.message);
      load();
    } catch {
      toast.error("Failed to advance maturity level.");
    } finally {
      setAdvancing(false);
    }
  };

  if (!data) return <div className="p-10" style={{ color: "var(--text-secondary)" }}>Loading accumulated intelligence…</div>;

  const mat = data.maturity || {};
  const horizons = data.timeHorizons || {};
  const currentHorizon = horizons[selectedHorizon] || horizons.d90 || {};
  const mastery = data.businessMastery || {};
  const insights = data.autonomousInsights || [];

  return (
    <div className="p-6 md:p-12 max-w-[1200px]" data-testid="knowledge-base-section">
      <SectionTitle
        kicker="Cumulative Knowledge Base · Longitudinal Learning Engine"
        title="The self-learning engine that compounds your marketing advantage"
        subtitle="OmniLocal #1 stores and references historical campaign performance across rolling 30, 90, and 180+ day horizons. The longer your business operates on the platform, the more precise and profitable your autonomous recommendations become."
      />

      {/* Learning Maturity Level & High-Switching-Cost Moat Card */}
      <div
        className="card p-6 md:p-8 mt-6 border-2 relative overflow-hidden"
        style={{
          background: "linear-gradient(135deg, #FDFCF8 0%, #F5F0E6 100%)",
          borderColor: "var(--primary)"
        }}
        data-testid="learning-maturity-card"
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider bg-orange-100 text-orange-900 flex items-center gap-1.5">
                <Brain size={14} className="text-orange-700" />
                <span>Learning Maturity Level: {mat.level}</span>
              </span>
              <span className="text-xs font-bold text-green-700 bg-green-100 px-2.5 py-0.5 rounded-full">
                {mat.confidenceScore}% Pattern Confidence
              </span>
            </div>
            <h2 className="serif text-3xl font-bold mt-2 text-slate-900">
              {mat.level}
            </h2>
            <p className="text-sm text-slate-600 mt-1 max-w-2xl">
              {data.clientProfileModel?.summary}
            </p>
          </div>

          <div className="flex items-center gap-4 shrink-0 bg-white/80 p-4 rounded-xl border border-orange-200/60 shadow-sm">
            <div className="text-center px-2">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Switching-Cost Moat</div>
              <div className="mono text-2xl font-bold text-slate-900">{mat.switchingMoatScore}/100</div>
              <div className="text-[11px] text-green-700 font-semibold">High Retention</div>
            </div>
            <div className="w-[1px] h-10 bg-slate-200" />
            <div className="text-center px-2">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Data Points Learned</div>
              <div className="mono text-2xl font-bold text-orange-800">{mat.totalDataPointsLearned}</div>
              <div className="text-[11px] text-slate-500">Cross-channel</div>
            </div>
            {mat.stage < 3 && (
              <button
                onClick={handleAdvance}
                disabled={advancing}
                className="btn btn-primary text-xs flex items-center gap-1 px-3 py-2 shrink-0 ml-2"
                data-testid="advance-maturity-btn"
              >
                <Zap size={13} />
                <span>{advancing ? "Advancing..." : "Simulate Maturity"}</span>
              </button>
            )}
          </div>
        </div>

        {/* 3-Stage Maturity Timeline Bar */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-6 pt-6 border-t border-orange-200/50">
          {(mat.stages || []).map((st) => {
            const isDone = st.status === "completed";
            const isActive = st.status === "active";
            return (
              <div
                key={st.stage}
                className="p-3.5 rounded-lg border text-left transition-all"
                style={{
                  background: isActive ? "#FFFFFF" : isDone ? "#F9F8F4" : "#F4F3ED",
                  borderColor: isActive ? "var(--primary)" : isDone ? "var(--success)" : "var(--border)",
                  borderWidth: isActive ? 2 : 1
                }}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-slate-800">{st.label}</span>
                  {isDone ? (
                    <CheckCircle2 size={15} className="text-green-700" />
                  ) : isActive ? (
                    <span className="w-2.5 h-2.5 rounded-full animate-pulse bg-orange-600" />
                  ) : (
                    <Lock size={14} className="text-slate-400" />
                  )}
                </div>
                <div className="text-[11px] text-slate-600 mt-1 line-clamp-2">{st.desc}</div>
                <div className="text-[10px] font-bold mt-2 text-slate-500">Confidence: {st.confidence}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Rolling Time Horizons (30d / 90d / 180d) */}
      <div className="card p-6 md:p-8 mt-8" data-testid="time-horizons-card">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          <div>
            <Overline>Retentive Memory Architecture</Overline>
            <h3 className="serif text-2xl font-bold">Longitudinal Performance Horizons</h3>
          </div>
          <div className="flex items-center gap-1.5 p-1 rounded-lg border bg-slate-50">
            <button
              onClick={() => setSelectedHorizon("d30")}
              className={`px-3 py-1.5 rounded text-xs font-bold transition-colors ${selectedHorizon === "d30" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}
              data-testid="horizon-30d-btn"
            >
              30 Days
            </button>
            <button
              onClick={() => setSelectedHorizon("d90")}
              className={`px-3 py-1.5 rounded text-xs font-bold transition-colors ${selectedHorizon === "d90" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}
              data-testid="horizon-90d-btn"
            >
              90 Days
            </button>
            <button
              onClick={() => setSelectedHorizon("d180")}
              className={`px-3 py-1.5 rounded text-xs font-bold transition-colors ${selectedHorizon === "d180" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}
              data-testid="horizon-180d-btn"
            >
              180+ Days
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl border bg-slate-50/50" style={{ borderColor: "var(--border)" }}>
            <div className="text-xs text-slate-500 font-bold uppercase tracking-wider">Blended ROAS Trajectory</div>
            <div className="money text-2xl font-bold text-green-700 mt-1">{currentHorizon.blendedRoas}×</div>
            <div className="text-xs text-slate-600 mt-1">Compounding upward</div>
          </div>
          <div className="p-4 rounded-xl border bg-slate-50/50" style={{ borderColor: "var(--border)" }}>
            <div className="text-xs text-slate-500 font-bold uppercase tracking-wider">Cost Per Walk-In</div>
            <div className="mono text-2xl font-bold text-slate-800 mt-1">{usd(currentHorizon.costPerWalkin)}</div>
            <div className="text-xs text-slate-600 mt-1">Decreased as ads mature</div>
          </div>
          <div className="p-4 rounded-xl border bg-slate-50/50" style={{ borderColor: "var(--border)" }}>
            <div className="text-xs text-slate-500 font-bold uppercase tracking-wider">Gross Margin Floor</div>
            <div className="mono text-2xl font-bold text-orange-800 mt-1">{currentHorizon.grossMarginPct}%</div>
            <div className="text-xs text-slate-600 mt-1">Strictly protected</div>
          </div>
          <div className="p-4 rounded-xl border bg-slate-50/50" style={{ borderColor: "var(--border)" }}>
            <div className="text-xs text-slate-500 font-bold uppercase tracking-wider">Top Converting Delivery Day</div>
            <div className="font-bold text-sm text-slate-900 mt-1 truncate">{currentHorizon.topDay}</div>
            <div className="text-xs text-slate-600 mt-1">Highest foot traffic density</div>
          </div>
        </div>
      </div>

      {/* Business-Specific Mastery Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
        {/* Winning Creative Hooks */}
        <div className="card p-6" data-testid="winning-creative-hooks">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles size={16} className="text-orange-700" />
            <Overline>Mastery Factor 1 · Creative Hooks</Overline>
          </div>
          <h3 className="serif text-xl font-bold">Top Performing Hook Formats</h3>
          <p className="text-xs text-slate-600 mt-0.5">
            Ranked by proven revenue attribution at the register, not vanity views.
          </p>

          <div className="mt-4 space-y-3">
            {(mastery.winningHooks || []).map((h, i) => (
              <div key={i} className="p-3.5 rounded-lg border bg-white flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-xs text-slate-900 truncate">{h.hook}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">{h.format} · Baseline: {h.baselineRoas}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="money text-sm font-bold text-green-700">{h.roas} ROAS</div>
                  <div className="text-[10px] font-bold text-orange-700">{h.lift} lift</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Game Style Conversion Rankings */}
        <div className="card p-6" data-testid="game-style-rankings">
          <div className="flex items-center gap-2 mb-1">
            <Award size={16} className="text-orange-700" />
            <Overline>Mastery Factor 2 · Gamification Archetypes</Overline>
          </div>
          <h3 className="serif text-xl font-bold">Client Game Style Benchmarks</h3>
          <p className="text-xs text-slate-600 mt-0.5">
            Tested redemption velocity and profit margin preservation by mechanics.
          </p>

          <div className="mt-4 space-y-3">
            {(mastery.gameRankings || []).map((g, i) => (
              <div key={i} className="p-3.5 rounded-lg border bg-white flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-xs text-slate-900">{g.style}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">{g.recommendation}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="mono text-xs font-bold text-slate-800">{g.redemptionRate} Redemptions</div>
                  <div className="text-[10px] font-bold text-green-700">{g.conversionLift}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Margin Floor Sweet Spot & Peak Windows */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        <div className="card p-6" data-testid="margin-thresholds-box">
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck size={16} className="text-green-700" />
            <Overline>Mastery Factor 3 · Margin Safeguard Floor</Overline>
          </div>
          <h3 className="serif text-xl font-bold">Optimal Margin Thresholds</h3>
          <div className="mt-4 p-4 rounded-lg bg-orange-50 border border-orange-200/70">
            <div className="text-xs font-bold text-orange-950">Discovered Sweet Spot:</div>
            <div className="text-xs text-orange-900 mt-1">
              {mastery.marginThresholds?.optimalSweetSpot}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 mt-3 text-center">
            <div className="p-2.5 rounded border bg-slate-50">
              <div className="text-[10px] text-slate-500 uppercase font-bold">Discount Cap</div>
              <div className="mono font-bold text-sm mt-0.5">{mastery.marginThresholds?.maxDiscountCeiling}%</div>
            </div>
            <div className="p-2.5 rounded border bg-slate-50">
              <div className="text-[10px] text-slate-500 uppercase font-bold">Min Spend Req</div>
              <div className="mono font-bold text-sm mt-0.5">${mastery.marginThresholds?.minimumSpendReq}</div>
            </div>
            <div className="p-2.5 rounded border bg-slate-50">
              <div className="text-[10px] text-slate-500 uppercase font-bold">Target Margin</div>
              <div className="mono font-bold text-sm text-green-700 mt-0.5">{mastery.marginThresholds?.targetGrossMarginFloor}%</div>
            </div>
          </div>
        </div>

        <div className="card p-6" data-testid="peak-conversion-windows">
          <div className="flex items-center gap-2 mb-1">
            <Clock size={16} className="text-blue-700" />
            <Overline>Mastery Factor 4 · High-Converting Delivery Days</Overline>
          </div>
          <h3 className="serif text-xl font-bold">Peak Conversion Windows</h3>
          <div className="mt-4 space-y-2.5">
            {(mastery.peakConversionWindows || []).map((w, i) => (
              <div key={i} className="p-3 rounded-lg border bg-white flex items-center justify-between text-xs">
                <span className="font-bold text-slate-900">{w.window}</span>
                <span className="text-green-700 font-semibold">{w.lift}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Autonomous Longitudinal Insights Log */}
      <div className="card p-6 md:p-8 mt-8" data-testid="autonomous-insights-log">
        <Overline style={{ color: "var(--primary)" }}>Autonomous Synthesis Feed</Overline>
        <h3 className="serif text-2xl font-bold mt-1">Cross-Channel Learnings Timeline</h3>
        <div className="mt-4 space-y-3">
          {insights.map((ins) => (
            <div
              key={ins.id}
              className="p-4 rounded-xl border flex items-start gap-3 text-xs"
              style={{ background: "var(--surface)", borderColor: "var(--border)" }}
            >
              <span className="w-2 h-2 rounded-full mt-1.5 bg-orange-600 shrink-0" />
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold uppercase tracking-wider text-slate-500 text-[10px]">
                    {ins.type.toUpperCase()} INSIGHT
                  </span>
                  <span className="text-slate-400 text-[10px]">{ins.date}</span>
                </div>
                <div className="text-slate-800 leading-relaxed">{ins.text}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
