import { useEffect, useState } from "react";
import { toast } from "sonner";
import { KeyRound, RefreshCw, FileSpreadsheet, Check, X, CalendarClock } from "lucide-react";
import { getCurrentBatch, generateBatch, getSampleCsv, reconcileCsv } from "@/lib/api";
import { SectionTitle, Overline, usd } from "@/components/ui-bits";

const TIER_COLOR = { grand: "#27AE60", high: "#D35400", mid: "#2980B9", low: "#5C5A56" };
const LENGTHS = [4, 8, 10, 11];

export default function Codes() {
  const [batch, setBatch] = useState(null);
  const [csv, setCsv] = useState("");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = () => getCurrentBatch().then(setBatch).catch(() => {});
  useEffect(() => { load(); }, []);

  const regen = async (length) => {
    setBusy(true); setResult(null);
    try {
      const b = await generateBatch(length);
      setBatch(b); setCsv("");
      toast.success(`New ${length}-char weekly batch generated`, { description: `${b.totalCodes} codes · expires ${b.expiresAt}` });
    } finally { setBusy(false); }
  };

  const loadSample = async () => {
    const { csv } = await getSampleCsv();
    setCsv(csv);
    toast("Sample POS export loaded — hit Reconcile");
  };

  const runReconcile = async () => {
    setBusy(true);
    try {
      const r = await reconcileCsv(csv);
      setResult(r);
      toast.success(`Reconciled: ${r.redeemed}/${r.issued} redeemed`, { description: `${usd(r.revenue)} proven revenue` });
    } finally { setBusy(false); }
  };

  if (!batch) return <div className="p-10" style={{ color: "var(--text-secondary)" }}>Loading…</div>;

  return (
    <div className="p-6 md:p-12 max-w-[1200px]">
      <SectionTitle kicker="OmniLocal #1 · Codes & Redemption"
        title="Weekly codes any POS can use — provable, fraud-resistant"
        subtitle="You generate the codes; the owner bulk-loads weeks of them into their POS once. Fresh set each week means a saved code dies in days — the only way to abuse it is to eat here 4× in a week. Reconcile from a plain CSV export — no POS API required." />

      {/* Batch config */}
      <div className="card p-6 md:p-8" data-testid="code-batch">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2"><KeyRound size={18} color="var(--primary)" /><Overline>This Week's Code Batch</Overline></div>
          <div className="flex items-center gap-2 text-sm" style={{ color: "var(--text-secondary)" }}>
            <CalendarClock size={15} /> Week of <b className="mono">{batch.weekOf}</b> · expires <b className="mono">{batch.expiresAt}</b>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 mt-4">
          <span className="text-sm" style={{ color: "var(--text-secondary)" }}>Code length (match your POS):</span>
          {LENGTHS.map((l) => (
            <button key={l} data-testid={`length-${l}`} disabled={busy} onClick={() => regen(l)}
              className="btn" style={{
                background: batch.length === l ? "var(--primary)" : "var(--surface-alt)",
                color: batch.length === l ? "#fff" : "var(--ink)", padding: "0.4rem 1rem" }}>
              {l} char
            </button>
          ))}
          <button className="btn btn-ghost" disabled={busy} onClick={() => regen(batch.length)} data-testid="regen-btn">
            <RefreshCw size={14} className="inline mr-1" /> New Set
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
          {batch.tiers.map((t) => (
            <div key={t.tier} className="p-4 rounded-lg" style={{ border: "1px solid var(--border)" }} data-testid={`tier-${t.tier}`}>
              <div className="flex items-center justify-between">
                <span className="font-bold" style={{ color: TIER_COLOR[t.tier] }}>{t.reward}</span>
                <span className="mono text-xs px-2 py-0.5 rounded" style={{ background: "var(--surface-alt)" }}>
                  {(t.probability * 100).toFixed(0)}% odds
                </span>
              </div>
              <div className="flex flex-wrap gap-2 mt-3">
                {t.codes.map((c) => (
                  <span key={c} className="mono text-sm px-2 py-1 rounded"
                    style={{ background: "var(--surface-alt)", letterSpacing: "0.06em" }}>{c}</span>
                ))}
              </div>
              <div className="text-xs mt-2" style={{ color: "var(--text-secondary)" }}>
                {t.codes.length} interchangeable variants — so no single string spreads across the neighborhood.
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* CSV reconciliation */}
      <div className="card p-6 md:p-8 mt-8" data-testid="csv-reconcile">
        <div className="flex items-center gap-2"><FileSpreadsheet size={18} color="var(--success)" /><Overline>CSV Reconciliation · the proof</Overline></div>
        <h3 className="serif text-2xl mt-1">Upload the POS export — we match, verify, and attribute</h3>
        <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
          Paste a <span className="mono">promo_code,net_sales</span> export. Redeemed codes are matched to this week's batch;
          anything not issued (or expired) is flagged invalid. The result feeds the Ad Engine's learning loop.
        </p>

        <textarea data-testid="csv-input" value={csv} onChange={(e) => setCsv(e.target.value)} rows={5}
          placeholder="promo_code,net_sales&#10;7XQ4,24.50&#10;..." className="w-full mt-3 p-3 rounded-lg mono text-sm"
          style={{ border: "1px solid var(--border)", background: "var(--surface)", resize: "vertical" }} />

        <div className="flex gap-2 mt-3">
          <button className="btn btn-ghost" onClick={loadSample} data-testid="load-sample-btn">Load Sample Export</button>
          <button className="btn btn-primary" disabled={busy || !csv.trim()} onClick={runReconcile} data-testid="reconcile-csv-btn">
            {busy ? "Reconciling…" : "Reconcile"}
          </button>
        </div>

        {result && (
          <div className="mt-6" data-testid="reconcile-result">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div><Overline>Issued</Overline><div className="mono text-2xl">{result.issued}</div></div>
              <div><Overline>Redeemed</Overline><div className="mono text-2xl" style={{ color: "var(--primary)" }}>{result.redeemed}</div></div>
              <div><Overline>Redemption Rate</Overline><div className="mono text-2xl">{(result.redemptionRate * 100).toFixed(0)}%</div></div>
              <div><Overline>Revenue Proven</Overline><div className="mono text-2xl" style={{ color: "var(--success)" }}>{usd(result.revenue)}</div></div>
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="overline" style={{ borderBottom: "1px solid var(--border)" }}>
                  <th className="text-left py-2">Code</th><th className="text-left py-2">Reward</th>
                  <th className="text-right py-2">Net Sales</th><th className="text-right py-2">Status</th>
                </tr></thead>
                <tbody>
                  {result.rows.map((r, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td className="py-2 mono">{r.code}</td>
                      <td className="py-2">{r.reward}</td>
                      <td className="py-2 text-right mono">{usd(r.net_sales)}</td>
                      <td className="py-2 text-right">
                        {r.valid
                          ? <span style={{ color: "var(--success)" }}><Check size={14} className="inline" /> valid</span>
                          : <span style={{ color: "#C0392B" }}><X size={14} className="inline" /> invalid</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {result.invalid > 0 && (
              <p className="text-xs mt-2" style={{ color: "#C0392B" }}>
                {result.invalid} code(s) not issued this week or expired — correctly rejected. This is the fraud guard working.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
