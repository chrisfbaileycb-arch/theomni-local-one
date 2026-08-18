import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  Video, Gamepad2, Send, MapPin, AlertTriangle, ShieldCheck,
  CheckCircle2, Play, Pause, Calendar, Layers, Sparkles
} from "lucide-react";
import { getCampaignTracks, toggleCampaignTrack } from "@/lib/api";
import { SectionTitle, Overline, usd } from "@/components/ui-bits";

const TRACK_ICONS = {
  video_reels: Video,
  arcade_sprints: Gamepad2,
  win_back_drip: Send,
  local_search_intent: MapPin
};

export default function MultiTrackStrategy() {
  const [data, setData] = useState(null);
  const [toggling, setToggling] = useState(null);

  const load = () => {
    getCampaignTracks().then(setData).catch(() => {});
  };

  useEffect(() => {
    load();
  }, []);

  const handleToggle = async (trackId) => {
    setToggling(trackId);
    try {
      const res = await toggleCampaignTrack(trackId);
      toast.success(res.message);
      load();
    } catch {
      toast.error("Failed to toggle campaign track.");
    } finally {
      setToggling(null);
    }
  };

  if (!data) return <div className="p-10" style={{ color: "var(--text-secondary)" }}>Loading multi-track strategy…</div>;

  const tracks = data.tracks || [];
  const cadence = data.cadence || {};

  return (
    <div className="p-6 md:p-12 max-w-[1200px]" data-testid="multi-track-strategy-section">
      <SectionTitle
        kicker="Growth Architecture · Multi-Track Strategy & Cadence"
        title="A balanced 4-track engine built for sustainable local dominance"
        subtitle="Gamified arcade mechanics are only one tactical pillar. OmniLocal #1 balances brand prestige video, concentrated 7-day arcade pulses, VIP win-back nurture, and high-intent local map routing to maximize revenue while protecting luxury margins."
      />

      {/* Anti-Fatigue Guardrail Banner */}
      <div
        className="p-5 rounded-2xl border-2 mt-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
        style={{
          background: "linear-gradient(135deg, #FFF9F5 0%, #FFF2EB 100%)",
          borderColor: "#F39C12"
        }}
        data-testid="anti-fatigue-guardrail-banner"
      >
        <div className="flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-amber-500 text-white font-bold shadow-sm">
            <AlertTriangle size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider bg-amber-100 text-amber-900">
                Anti-Fatigue Guardrail Active
              </span>
              <span className="text-xs text-amber-800 font-semibold">• Strict Brand Margin Floor</span>
            </div>
            <div className="font-bold text-sm text-slate-900 mt-1">
              {cadence.advisoryNotice || "Promotional Alert: High-frequency gamification degrades luxury/service brand trust. Best Practice: 1 week active per month, rotating game styles."}
            </div>
            <div className="text-xs text-slate-600 mt-0.5">
              Current Cadence: <b>7-Day Active Pulse</b> followed by <b>2–3 Weeks Rest & Nurture</b>. Continuous broad-spectrum discounting is blocked.
            </div>
          </div>
        </div>
      </div>

      {/* 4 Multi-Track Campaign Strategy Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
        {tracks.map((t) => {
          const Icon = TRACK_ICONS[t.key] || Video;
          const isActive = t.status === "active";
          return (
            <div
              key={t.id}
              className="card p-6 border-2 transition-all flex flex-col justify-between"
              style={{
                borderColor: isActive ? (t.key === "arcade_sprints" ? "var(--primary)" : "var(--border)") : "#E2E8F0",
                opacity: isActive ? 1 : 0.75
              }}
              data-testid={`campaign-track-${t.id}`}
            >
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm"
                      style={{
                        background: isActive ? "var(--surface-alt)" : "#F1F5F9",
                        color: "var(--primary)"
                      }}
                    >
                      <Icon size={20} />
                    </div>
                    <div>
                      <Overline>{t.subtitle}</Overline>
                      <h3 className="serif text-xl font-bold">{t.name}</h3>
                    </div>
                  </div>
                  <button
                    onClick={() => handleToggle(t.id)}
                    disabled={toggling === t.id}
                    data-testid={`toggle-track-${t.id}`}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                      isActive ? "bg-green-100 text-green-800 hover:bg-green-200" : "bg-slate-200 text-slate-700 hover:bg-slate-300"
                    }`}
                  >
                    {isActive ? <CheckCircle2 size={13} /> : <Pause size={13} />}
                    <span>{isActive ? "ACTIVE" : "PAUSED"}</span>
                  </button>
                </div>

                {/* Mechanic description */}
                <div className="mt-4 p-3 rounded-lg bg-slate-50 border text-xs text-slate-700">
                  <span className="font-bold text-slate-900">Execution Mechanism: </span>
                  {t.mechanic}
                </div>

                {/* Track KPIs */}
                <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-slate-100 text-xs">
                  <div>
                    <span className="text-slate-500 text-[11px] block">Weekly Budget Share</span>
                    <span className="mono font-bold text-base text-slate-900">{t.spendShare}% ({usd(t.weeklySpend)})</span>
                  </div>
                  <div>
                    <span className="text-slate-500 text-[11px] block">Track Attribution ROAS</span>
                    <span className="money font-bold text-base text-green-700">{t.kpis?.roas || "7.4x"}</span>
                  </div>
                </div>

                {/* Cadence Rule */}
                <div className="mt-3 text-[11px] text-slate-500 flex items-center gap-1.5">
                  <Calendar size={13} className="text-slate-400 shrink-0" />
                  <span>Cadence: {t.cadenceRule}</span>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] text-slate-600 truncate">
                <span className="font-bold text-slate-700">Active Asset: </span>
                {t.recentCreative}
              </div>
            </div>
          );
        })}
      </div>

      {/* 4-Week Rotation Cadence Timeline */}
      <div className="card p-6 md:p-8 mt-8" data-testid="cadence-rotation-timeline">
        <div className="flex items-center gap-2 mb-1">
          <Layers size={18} style={{ color: "var(--primary)" }} />
          <Overline>Pacing Engine · 4-Week Anti-Fatigue Schedule</Overline>
        </div>
        <h3 className="serif text-2xl font-bold">Strategic Rhythm & Rest Rotation</h3>
        <p className="text-sm text-slate-600 mt-1">
          Staggers promotional bursts with brand storytelling to maintain high-yield customer response and eliminate promo fatigue.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">
          {(cadence.restSchedule || []).map((step) => {
            const isSprint = step.mode === "sprint";
            const isActive = step.status === "active";
            return (
              <div
                key={step.week}
                className="p-4 rounded-xl border text-left flex flex-col justify-between"
                style={{
                  background: isActive ? "#FFFBF7" : "#FFFFFF",
                  borderColor: isActive ? "var(--primary)" : "var(--border)",
                  borderWidth: isActive ? 2 : 1
                }}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      WEEK {step.week}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        isSprint ? "bg-orange-100 text-orange-900" : "bg-emerald-100 text-emerald-900"
                      }`}
                    >
                      {isSprint ? "ARCADE PULSE" : "REST & NURTURE"}
                    </span>
                  </div>
                  <div className="font-bold text-sm mt-2 text-slate-900">{step.name}</div>
                  <div className="text-xs text-slate-600 mt-1">{step.advice}</div>
                </div>

                <div className="mt-4 pt-3 border-t text-[11px] font-semibold text-slate-700" style={{ borderColor: "var(--border)" }}>
                  Focus: {step.game}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
