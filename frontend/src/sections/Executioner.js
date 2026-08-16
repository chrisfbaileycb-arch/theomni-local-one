import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts";
import { Trophy, Play, RotateCcw, MapPin, Plug, Upload, Database, FileSpreadsheet, GraduationCap } from "lucide-react";
import { coachTemplate } from "@/lib/api";
import { TemplatePanel } from "@/sections/Coach";
import { getReports, reconcile, resetLoop, getRecommendedPlan, getSampleTransactionsCsv, importTransactions, clearTransactions } from "@/lib/api";
import { SectionTitle, Overline, usd } from "@/components/ui-bits";
import { OperationalDisclaimer } from "@/sections/StrategyPanel";
import Connections from "@/sections/Connections";

function StrategyCard({ strat = {}, alloc = {}, metrics = {}, labels = {}, isWinner = false }) {
  const stratId = strat?.id || "A";
  const displayName = strat?.displayName || `Strategy ${stratId}`;
  const perChannel = alloc?.perChannel || {};
  return (
    <div className="card p-6 lift" data-testid={`strategy-${stratId}`}
      style={{ borderColor: isWinner ? "var(--success)" : "var(--border)", borderWidth: isWinner ? 2 : 1 }}>
      <div className="flex items-center justify-between">
        <div>
          <Overline>Strategy {stratId}</Overline>
          <h3 className="serif text-2xl">{displayName}</h3>
        </div>
        {isWinner && (
          <span className="flex items-center gap-1 text-xs font-bold px-3 py-1 rounded-full"
            style={{ background: "var(--success)", color: "#fff" }} data-testid={`winner-${stratId}`}>
            <Trophy size={13} /> ROAS WINNER
          </span>
        )}
      </div>
      <div className="flex items-baseline gap-2 mt-4">
        <span className="mono" style={{ fontSize: "2.2rem", fontWeight: 700, color: "var(--primary)" }}>{usd(alloc?.dollars ?? 0)}</span>
        <span className="text-sm" style={{ color: "var(--text-secondary)" }}>/ {((alloc?.share ?? 0.5) * 100).toFixed(0)}% of budget</span>
      </div>
      <div className="mt-4 space-y-2">
        {Object.entries(perChannel).map(([ch, amt]) => (
          <div key={ch} className="flex justify-between text-sm">
            <span style={{ color: "var(--text-secondary)" }}>{labels?.[ch] || ch}</span>
            <span className="mono">{usd(amt)}</span>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 mt-5 pt-5 border-t" style={{ borderColor: "var(--border)" }}>
        <div><Overline>Revenue</Overline><div className="money text-xl">{usd(metrics?.revenue ?? 0)}</div></div>
        <div><Overline>ROAS</Overline><div className="mono text-xl" style={{ color: "var(--success)" }}>{metrics?.roas ?? 0}×</div></div>
        <div><Overline>New Customers</Overline><div className="mono text-xl">{metrics?.newCustomers ?? 0}</div></div>
        <div><Overline>CAC</Overline><div className="mono text-xl">{metrics?.cac == null ? "—" : usd(metrics.cac)}</div></div>
      </div>
    </div>
  );
}

export default function Executioner() {
  const [data, setData] = useState(null);
  const [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState(false);
  const [txCsv, setTxCsv] = useState("");
  const [importing, setImporting] = useState(false);
  const [importRes, setImportRes] = useState(null);
  const [coachRes, setCoachRes] = useState(null);
  const [coachBusy, setCoachBusy] = useState(null);

  const askCoach = async (s) => {
    setCoachBusy(s.displayName);
    try {
      const channels = Object.keys(s.perChannel || {}).join(", ") || "connected platforms";
      const r = await coachTemplate(`${s.displayName} campaign for a local business, running on ${channels}`);
      setCoachRes(r);
      toast.success("Build template ready", { description: "Scroll down — download it and build it yourself." });
    } catch (e) {
      toast.error(e?.response?.data?.detail || "The coach is unavailable. Try again.");
    } finally {
      setCoachBusy(null);
    }
  };

  const load = () => {
    getReports().then(setData).catch(() => {});
    getRecommendedPlan().then(setPlan).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  const loadSampleTx = async () => {
    const res = await getSampleTransactionsCsv();
    setTxCsv(res.csv);
    toast.message("Sample loaded", { description: res.format });
  };

  const doImport = async () => {
    if (!txCsv.trim()) { toast.error("Paste a CSV or load the sample first"); return; }
    setImporting(true);
    try {
      const res = await importTransactions(txCsv, "square");
      setImportRes(res);
      await load();
      toast.success(`Imported ${res.imported} real orders`, {
        description: `${res.weeks.length} week(s) now learning on live revenue (${res.skipped} skipped)`,
      });
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Import failed — check the CSV format");
    } finally { setImporting(false); }
  };

  const doClearTx = async () => {
    await clearTransactions();
    setImportRes(null);
    await load();
    toast("Real orders cleared — back to the demo baseline");
  };

  const runWeek = async () => {
    setBusy(true);
    try {
      const res = await reconcile();
      await load();
      toast.success(`Week reconciled → budget shifted toward Strategy ${res.reallocatedTo}`, {
        description: `${usd(res.report.totalRevenue)} revenue · ${res.report.blendedRoas}× ROAS`,
      });
    } finally { setBusy(false); }
  };

  const reset = async () => { await resetLoop(); await load(); toast("Loop reset to week 1 (50/50)"); };

  if (!data) return <div className="p-10" style={{ color: "var(--text-secondary)" }}>Loading…</div>;

  const reports = data.reports;
  const latest = reports[reports.length - 1];
  const winner = latest.decision.winner;
  const chart = reports.map((r) => ({
    weekOf: r.weekOf,
    "Strategy A %": Math.round(r.allocation.strategyA.share * 100),
    "Strategy B %": Math.round(r.allocation.strategyB.share * 100),
    roas: r.blendedRoas,
  }));
  const zips = Object.entries(latest.zipBreakdown).sort((a, b) => b[1].revenue - a[1].revenue).slice(0, 5);

  return (
    <div className="p-6 md:p-12 max-w-[1200px]">
      <SectionTitle kicker="Ad Engine · Quality Content Executioner"
        title="The autonomous media buyer that gets smarter every week"
        subtitle="Set a weekly budget. It splits spend across two strategies, attributes every order via promo codes, then shifts money 70/30 toward whichever produced more real revenue. Clicks are a promise. Orders are proof." />

      <OperationalDisclaimer />

      <div className="flex flex-wrap items-center gap-3 mb-6">
        <button className="btn btn-primary" onClick={runWeek} disabled={busy} data-testid="run-week-btn">
          <Play size={15} className="inline mr-1" /> {busy ? "Reconciling…" : "Run Next Week (watch it learn)"}
        </button>
        <button className="btn btn-ghost" onClick={reset} data-testid="reset-loop-btn">
          <RotateCcw size={15} className="inline mr-1" /> Reset to Week 1
        </button>
        <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
          {reports.length} weeks learned · now favoring <b>Strategy {winner}</b>
        </span>
        <span className="text-xs font-bold px-2.5 py-1 rounded-full" data-testid="data-source-badge"
          style={{ background: latest.dataSource === "real" ? "var(--success)" : "var(--surface-alt)",
                   color: latest.dataSource === "real" ? "#fff" : "var(--text-secondary)" }}>
          {latest.dataSource === "real" ? "● LIVE ORDER DATA" : "DEMO DATA"}
        </span>
      </div>

      {/* Phase 2 — import real POS orders */}
      <div className="card p-6 md:p-8 mb-8" data-testid="import-transactions">
        <div className="flex items-center gap-2"><Database size={18} color="var(--primary)" /><Overline>Real Revenue · import your POS orders</Overline></div>
        <h3 className="serif text-2xl mt-1">Feed it real Square or Toast orders</h3>
        <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
          Export your orders as CSV and drop them here. The learning loop recomputes ROAS, CAC and the budget split from your <b>actual revenue</b> — weeks with real data are badged LIVE.
        </p>
        <textarea value={txCsv} onChange={(e) => setTxCsv(e.target.value)} rows={4} data-testid="tx-csv-input"
          placeholder="Date,Net Sales,Customer ID,Postal Code,Clicks,Discount&#10;07/12/2026,24.50,CUST101,01103,9,STRATA-1234"
          className="w-full mt-3 p-3 rounded-lg text-xs mono" style={{ border: "1px solid var(--border)", background: "var(--surface)", resize: "vertical" }} />
        <div className="flex flex-wrap gap-2 mt-3">
          <button className="btn btn-ghost text-sm" style={{ padding: "0.45rem 0.9rem" }} onClick={loadSampleTx} data-testid="load-sample-tx-btn">
            <FileSpreadsheet size={13} className="inline mr-1" /> Load sample (Square export)
          </button>
          <button className="btn btn-primary text-sm" style={{ padding: "0.45rem 1rem" }} onClick={doImport} disabled={importing} data-testid="import-tx-btn">
            <Upload size={13} className="inline mr-1" /> {importing ? "Importing…" : "Import orders"}
          </button>
          {importRes && (
            <button className="btn btn-ghost text-sm" style={{ padding: "0.45rem 0.9rem" }} onClick={doClearTx} data-testid="clear-tx-btn">Clear real orders</button>
          )}
        </div>
        {importRes && (
          <div className="mt-4 p-3 rounded-lg text-sm" style={{ background: "var(--surface-alt)", color: "var(--text-secondary)" }} data-testid="import-result">
            Imported <b style={{ color: "var(--success)" }}>{importRes.imported} orders</b> ({usd(importRes.revenueImported)}) across {importRes.weeks.length} week(s). Mapped columns: {Object.entries(importRes.mapping).map(([k, v]) => `${k}→${v}`).join(", ")}.
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <StrategyCard strat={data.strategies.A} alloc={latest.allocation.strategyA}
          metrics={latest.metrics.strategyA} labels={data.channelLabels} isWinner={winner === "A"} />
        <StrategyCard strat={data.strategies.B} alloc={latest.allocation.strategyB}
          metrics={latest.metrics.strategyB} labels={data.channelLabels} isWinner={winner === "B"} />
      </div>

      {plan && (
        <div className="card p-6 md:p-8 mt-8" data-testid="recommended-plan">
          <div className="flex items-center gap-2"><Plug size={18} color="var(--primary)" /><Overline>This Week's Recommended Plan · gated by your connected platforms</Overline></div>
          <h3 className="serif text-2xl mt-1">It only spends where you're actually present</h3>
          {plan.warning && <div className="mt-3 p-3 rounded-lg text-sm" style={{ background: "#fdece9", color: "#C0392B" }}>{plan.warning}</div>}
          {plan.diversificationTip && (
            <div className="mt-3 p-3 rounded-lg text-sm" style={{ background: "var(--surface-alt)", color: "var(--text-secondary)" }} data-testid="diversification-tip">💡 {plan.diversificationTip}</div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            {[plan.strategyA || { displayName: "Strategy A", dollars: 0, perChannel: {}, excludedChannels: [] },
              plan.strategyB || { displayName: "Strategy B", dollars: 0, perChannel: {}, excludedChannels: [] }].map((s, i) => (
              <div key={i} className="p-4 rounded-lg" style={{ border: "1px solid var(--border)" }} data-testid={`plan-strategy-${i === 0 ? "A" : "B"}`}>
                <div className="flex justify-between items-baseline">
                  <span className="font-bold">{s?.displayName || `Strategy ${i === 0 ? 'A' : 'B'}`}</span>
                  <span className="mono" style={{ color: "var(--primary)", fontWeight: 700 }}>{usd(s?.dollars ?? 0)}</span>
                </div>
                <div className="mt-3 space-y-1.5">
                  {Object.entries(s?.perChannel || {}).map(([ch, amt]) => (
                    <div key={ch} className="flex justify-between text-sm">
                      <span style={{ color: "var(--text-secondary)" }}>{data?.channelLabels?.[ch] || ch}</span>
                      <span className="mono">{usd(amt)}</span>
                    </div>
                  ))}
                  {Object.keys(s?.perChannel || {}).length === 0 && <div className="text-sm" style={{ color: "var(--text-secondary)" }}>No connected channels.</div>}
                  {(s?.excludedChannels || []).map((c) => (
                    <div key={c.channel} className="flex justify-between text-sm" style={{ opacity: 0.5 }} data-testid={`excluded-${c.platform}`}>
                      <span style={{ textDecoration: "line-through" }}>{c.label}</span>
                      <span className="text-xs">not connected</span>
                    </div>
                  ))}
                </div>
                <button data-testid={`coach-how-btn-${i === 0 ? "A" : "B"}`} onClick={() => askCoach(s)}
                  disabled={!!coachBusy} className="btn btn-ghost text-xs mt-3 flex items-center gap-1.5">
                  <GraduationCap size={13} style={{ color: "var(--primary)" }} />
                  {coachBusy === s?.displayName ? "Coaching…" : "How does this work?"}
                </button>
              </div>
            ))}
          </div>
          <p className="text-xs mt-3" style={{ color: "var(--text-secondary)" }}>
            Toggle platforms below — struck-through channels are ones OmniLocal #1 won't recommend until you connect them.
          </p>
          <TemplatePanel result={coachRes} />
        </div>
      )}

      <div className="card p-6 md:p-8 mt-8">
        <Overline style={{ color: "var(--primary)" }}>The Learning Loop</Overline>
        <h3 className="serif text-2xl mt-1">50/50 → 70/30 → 80/20 — money follows the winner</h3>
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={chart} margin={{ top: 12, right: 12, left: -8, bottom: 0 }}>
            <defs>
              <linearGradient id="ga" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#D35400" stopOpacity={0.35} /><stop offset="100%" stopColor="#D35400" stopOpacity={0.03} /></linearGradient>
              <linearGradient id="gb" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2980B9" stopOpacity={0.3} /><stop offset="100%" stopColor="#2980B9" stopOpacity={0.03} /></linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#E8E6DF" vertical={false} />
            <XAxis dataKey="weekOf" tick={{ fontSize: 11, fill: "#5C5A56" }} tickLine={false} axisLine={{ stroke: "#E8E6DF" }} />
            <YAxis tick={{ fontSize: 11, fill: "#5C5A56" }} tickLine={false} axisLine={false} unit="%" />
            <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #E8E6DF", fontFamily: "JetBrains Mono" }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Area type="monotone" dataKey="Strategy A %" stroke="#D35400" strokeWidth={2} fill="url(#ga)" />
            <Area type="monotone" dataKey="Strategy B %" stroke="#2980B9" strokeWidth={2} fill="url(#gb)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="card p-6 md:p-8 mt-8">
        <div className="flex items-center gap-2"><MapPin size={18} color="var(--primary)" /><Overline>Where the money came from</Overline></div>
        <h3 className="serif text-2xl mt-1">Revenue by ZIP · this week</h3>
        <div className="mt-4 space-y-2">
          {zips.map(([zip, s]) => {
            const max = Math.max(...zips.map((z) => z[1].revenue));
            return (
              <div key={zip} className="flex items-center gap-3" data-testid={`zip-${zip}`}>
                <span className="mono text-sm" style={{ minWidth: 60 }}>{zip}</span>
                <div className="flex-1 h-6 rounded" style={{ background: "var(--surface-alt)" }}>
                  <motion.div initial={{ width: 0 }} animate={{ width: `${(s.revenue / max) * 100}%` }} className="h-6 rounded" style={{ background: "var(--success)" }} />
                </div>
                <span className="money text-sm" style={{ minWidth: 90, textAlign: "right" }}>{usd(s.revenue)}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Platform connections gate this engine */}
      <div className="mt-4"><Connections /></div>
    </div>
  );
}
