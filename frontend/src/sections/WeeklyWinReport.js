import { useEffect, useState } from "react";
import { Trophy, MapPin, Download, ArrowUpRight, ArrowDownRight, Minus, CalendarCheck, CheckCircle2, AlertTriangle, Radio } from "lucide-react";
import { getWeeklyReport, weeklyReportPdfUrl } from "@/lib/api";
import { Overline } from "@/components/ui-bits";
import { ReportEmailSettings } from "@/sections/ReportEmailSettings";
import { AdSpendLog } from "@/sections/AdSpendLog";

const money = (n) => `$${Number(n || 0).toLocaleString()}`;

const Delta = ({ value, isMoney }) => {
  const Icon = value > 0 ? ArrowUpRight : value < 0 ? ArrowDownRight : Minus;
  const color = value > 0 ? "var(--success)" : value < 0 ? "var(--danger)" : "var(--text-secondary)";
  return (
    <span className="text-xs mono inline-flex items-center gap-0.5 mt-1" style={{ color }}>
      <Icon size={12} /> {value > 0 ? "+" : ""}{isMoney ? money(value) : value} wk/wk
    </span>
  );
};

export default function WeeklyWinReport() {
  const [r, setR] = useState(null);
  const load = () => getWeeklyReport().then(setR).catch(() => {});
  useEffect(() => { load(); }, []);
  if (!r) return null;

  const posImport = r.posImport || { importedThisWeek: true, importsInWeek: 1 };
  const current = r.current || { redeemed: 0, revenue: 0, scans: 0, spins: 0, newMembers: 0 };
  const deltas = r.deltas || { redeemed: 0, revenue: 0, scans: 0, spins: 0, newMembers: 0 };
  const adSpend = r.adSpend || { total: 299, prevTotal: 299 };
  const prizeBreakdown = r.prizeBreakdown || [];
  const channels = r.channels || [];
  const soFar = r.soFar || { spins: 0, newMembers: 0, redeemed: 0, revenue: 0 };

  const secondary = [
    { label: "QR Scans", key: "scans" },
    { label: "Spins Played", key: "spins" },
    { label: "New Members", key: "newMembers" },
  ];

  return (
    <div className="card p-6 md:p-8 mt-8" data-testid="weekly-win-report">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <CalendarCheck size={18} color="var(--primary)" />
          <Overline>Weekly Win Report · Mon–Sun, hard stop Sunday</Overline>
        </div>
        <a data-testid="win-report-pdf-btn" className="btn btn-primary text-sm flex items-center gap-1.5"
          href={weeklyReportPdfUrl()} download>
          <Download size={14} /> Download one-pager
        </a>
      </div>
      <h3 className="serif text-2xl mt-1">Week of {r.weekOf} → {r.weekEnd}</h3>

      {/* POS reconciliation status */}
      <div className="flex items-center gap-1.5 mt-2 text-sm" data-testid="win-pos-import"
        style={{ color: posImport.importedThisWeek ? "var(--success)" : "var(--danger)" }}>
        {posImport.importedThisWeek ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
        <span className="font-semibold">
          {posImport.importedThisWeek
            ? `POS CSV imported during the week (${posImport.importsInWeek}×) — numbers reconciled.`
            : "POS CSV was NOT imported during the week — numbers not reconciled with your register."}
        </span>
      </div>

      {/* Register results first */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-4">
        <div data-testid="win-stat-redeemed">
          <Overline>Deals Redeemed</Overline>
          <div className="mono text-4xl mt-1">{current.redeemed}</div>
          <Delta value={deltas.redeemed} />
        </div>
        <div data-testid="win-stat-revenue">
          <Overline>Revenue Proven</Overline>
          <div className="mono text-4xl mt-1" style={{ color: "var(--success)" }}>{money(current.revenue)}</div>
          <Delta value={deltas.revenue} isMoney />
        </div>
        <div data-testid="win-stat-adspend">
          <Overline>Ad Spend</Overline>
          <div className="mono text-4xl mt-1" style={{ color: "var(--text-secondary)" }}>{money(adSpend.total)}</div>
          <span className="text-xs mono mt-1 inline-block" style={{ color: "var(--text-secondary)" }}>
            vs {money(adSpend.prevTotal)} prior wk
          </span>
        </div>
      </div>
      <div className="flex flex-wrap gap-x-8 gap-y-2 mt-4">
        {secondary.map((s) => (
          <div key={s.key} data-testid={`win-stat-${s.key}`} className="flex items-baseline gap-2">
            <span className="text-xs" style={{ color: "var(--text-secondary)" }}>{s.label}</span>
            <span className="mono text-lg">{current[s.key]}</span>
            <Delta value={deltas[s.key]} />
          </div>
        ))}
      </div>

      {/* Prize payouts — reconcile vs POS */}
      {prizeBreakdown.length > 0 && (
        <div className="mt-5 pt-4 border-t" style={{ borderColor: "var(--border)" }} data-testid="win-prize-breakdown">
          <Overline>Prize payouts · compare to your POS</Overline>
          <div className="mt-2 space-y-1">
            {prizeBreakdown.map((p) => (
              <div key={p.reward} className="flex items-center gap-3 text-sm" data-testid={`win-prize-${p.reward.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>
                <span className="flex-1 min-w-0 truncate">{p.reward}</span>
                <span className="mono font-bold">{p.redeemed} redeemed</span>
                <span className="mono w-24 text-right" style={{ color: "var(--success)" }}>{money(p.revenue)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Channel activity — the whole OmniLocal picture */}
      <div className="mt-5 pt-4 border-t" style={{ borderColor: "var(--border)" }} data-testid="win-channels">
        <Overline>Channel activity · what drove the business</Overline>
        <div className="mt-2 space-y-1.5">
          {channels.map((ch) => (
            <div key={ch.channel} className="flex items-start gap-2 text-sm" data-testid={`win-channel-${ch.channel}`}>
              <Radio size={13} className="mt-1 shrink-0" style={{ color: ch.live ? "var(--success)" : "var(--text-secondary)" }} />
              <div className="min-w-0">
                <b>{ch.label}</b>: {ch.lines.join(" · ")}
                {!ch.live && ch.note && (
                  <span className="text-xs ml-1" style={{ color: "var(--text-secondary)" }}>({ch.note})</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-x-8 gap-y-2 mt-5 pt-4 border-t text-sm" style={{ borderColor: "var(--border)" }}>
        <span className="flex items-center gap-1.5" data-testid="win-top-spot">
          <MapPin size={14} color="var(--primary)" />
          {r.topSpot ? <>Top spot: <b>{r.topSpot.spaceId}</b> ({r.topSpot.plays} plays)</> : "No spot-tagged plays last week"}
        </span>
        <span className="flex items-center gap-1.5" data-testid="win-top-game">
          <Trophy size={14} color="var(--success)" />
          {r.topGame ? <>Top game: <b>{r.topGame.name}</b> ({r.topGame.plays} plays)</> : "No plays recorded last week"}
        </span>
      </div>
      <p className="text-xs mt-3" style={{ color: "var(--text-secondary)" }} data-testid="win-so-far">
        This week so far: {soFar.spins} spins · {soFar.newMembers} new members · {soFar.redeemed} redeemed
        · {money(soFar.revenue)} proven. Campaigns can start any day — the week closes hard on Sunday.
      </p>
      <AdSpendLog onChanged={load} />
      <ReportEmailSettings />
    </div>
  );
}
