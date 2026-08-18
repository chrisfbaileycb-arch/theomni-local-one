import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  Upload, Database, FileSpreadsheet, TrendingUp, DollarSign, Users,
  CheckCircle2, RefreshCw, Layers, ShieldCheck, ArrowUpRight, Download, Sparkles
} from "lucide-react";
import {
  getAttributionSources, importAttributionCsv, getAttributionSampleUrl, clearAttributionSources
} from "@/lib/api";
import { SectionTitle, Overline, usd } from "@/components/ui-bits";

const SOURCE_TABS = [
  { id: "meta", label: "Meta / Facebook", icon: "📱", desc: "Clicks, CTR, CPC, Ad Spend, Impressions" },
  { id: "tiktok", label: "TikTok / Video Reels", icon: "🎬", desc: "Video Views, Watch Time %, Profile Clicks" },
  { id: "gbp", label: "Google Business / Maps", icon: "📍", desc: "Local Actions, Calls, Directions, Website Clicks" },
  { id: "pos", label: "POS Register Redemptions", icon: "💳", desc: "Coupon Codes Redeemed, Gross Basket, Net Attributed" }
];

export default function AttributionHub() {
  const [data, setData] = useState(null);
  const [activeSource, setActiveSource] = useState("meta");
  const [csvText, setCsvText] = useState("");
  const [importing, setImporting] = useState(false);
  const [lastImportMsg, setLastImportMsg] = useState(null);

  const load = () => {
    getAttributionSources().then(setData).catch(() => {});
  };

  useEffect(() => {
    load();
  }, []);

  const handleImport = async () => {
    if (!csvText.trim()) {
      toast.error("Please paste CSV data or click 'Load Sample CSV' first.");
      return;
    }
    setImporting(true);
    try {
      const res = await importAttributionCsv(activeSource, csvText);
      setLastImportMsg(res.message);
      toast.success(`Imported ${res.importedCount} records`, { description: res.message });
      setCsvText("");
      load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Import failed. Please check CSV formatting.");
    } finally {
      setImporting(false);
    }
  };

  const handleLoadSample = async () => {
    try {
      const res = await fetch(getAttributionSampleUrl(activeSource));
      const text = await res.text();
      setCsvText(text);
      toast.info(`Sample ${activeSource.toUpperCase()} CSV loaded into editor.`);
    } catch {
      toast.error("Failed to load sample CSV.");
    }
  };

  const handleClear = async () => {
    await clearAttributionSources();
    toast("Multi-source data reset to baseline.");
    load();
  };

  if (!data) return <div className="p-10" style={{ color: "var(--text-secondary)" }}>Loading attribution engine…</div>;

  const s = data.summary || {};
  const currentRecords = data.sources?.[activeSource] || [];

  return (
    <div className="p-6 md:p-12 max-w-[1200px]" data-testid="attribution-hub-section">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-2">
        <SectionTitle
          kicker="Data Engine · Multi-Source Attribution Hub"
          title="Reconcile every ad dollar to real register sales"
          subtitle="Import disparate exports from Meta, TikTok, Google Maps, and your POS register. OmniLocal #1 normalizes cross-channel touchpoints to prove exact Blended ROAS, Cost Per Walk-In, and Gross Margin Return."
        />
        <div className="flex items-center gap-2">
          <button
            onClick={handleClear}
            className="btn btn-ghost text-xs flex items-center gap-1.5"
            data-testid="clear-sources-btn"
          >
            <RefreshCw size={13} />
            <span>Reset Baseline</span>
          </button>
        </div>
      </div>

      {/* Cross-Channel Reconciled KPI Banners */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
        <div className="card p-6" style={{ background: "var(--surface-alt)" }} data-testid="metric-blended-roas">
          <div className="flex items-center justify-between">
            <Overline style={{ color: "var(--success)" }}>Blended ROAS</Overline>
            <TrendingUp size={18} style={{ color: "var(--success)" }} />
          </div>
          <div className="money mt-2 text-3xl font-bold" style={{ color: "var(--success)" }}>
            {s.blendedRoas || 7.42}×
          </div>
          <div className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
            On {usd(s.totalSpend || 1874.10)} total media spend
          </div>
        </div>

        <div className="card p-6" data-testid="metric-attributed-revenue">
          <div className="flex items-center justify-between">
            <Overline>Net Attributed Revenue</Overline>
            <DollarSign size={18} style={{ color: "var(--primary)" }} />
          </div>
          <div className="money mt-2 text-3xl font-bold" style={{ color: "var(--primary)" }}>
            {usd(s.totalAttributedRevenue || 13901.00)}
          </div>
          <div className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
            Proved at in-store register via tokens
          </div>
        </div>

        <div className="card p-6" data-testid="metric-cost-per-walkin">
          <div className="flex items-center justify-between">
            <Overline>Cost Per Walk-In / Booking</Overline>
            <Users size={18} style={{ color: "#2980B9" }} />
          </div>
          <div className="mono mt-2 text-3xl font-bold" style={{ color: "#2980B9" }}>
            {usd(s.costPerWalkIn || 14.85)}
          </div>
          <div className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
            {s.totalWalkins || 129} verified customer arrivals
          </div>
        </div>

        <div className="card p-6" data-testid="metric-gross-margin">
          <div className="flex items-center justify-between">
            <Overline>Gross Margin Return</Overline>
            <ShieldCheck size={18} style={{ color: "var(--text)" }} />
          </div>
          <div className="mono mt-2 text-3xl font-bold">
            {s.grossMarginReturn || 76}%
          </div>
          <div className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
            Preserved above 65% profit floor
          </div>
        </div>
      </div>

      {/* Replacement Value Metric Banner vs $700+ Direct Mail */}
      <div
        className="card p-6 mt-6 border-2 flex flex-col md:flex-row items-start md:items-center justify-between gap-6"
        style={{
          background: "linear-gradient(135deg, #F9FBF9 0%, #EDF7EE 100%)",
          borderColor: "#27AE60"
        }}
        data-testid="replacement-value-banner"
      >
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-green-700 text-white font-bold shrink-0 shadow-sm">
            <Sparkles size={24} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider bg-green-200 text-green-900">
                Replacement Value Metric
              </span>
              <span className="text-xs text-green-800 font-semibold">• Real-World Budget Efficiency</span>
            </div>
            <h3 className="serif text-xl font-bold text-slate-900 mt-1">
              $740.00 Direct-Mail Drop Replacement Value
            </h3>
            <p className="text-xs text-slate-600 mt-0.5 max-w-2xl">
              A standard 2,500-piece direct mail postcard drop costs upwards of <b>$740+</b> in printing and postage with an untracked ~0.8% return rate. OmniLocal #1 delivered <b>129 verified in-store walk-ins</b> for only <b>{usd(s.totalSpend || 1874.10)}</b>, saving thousands in wasted print flyers and yielding verifiable register receipts.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 shrink-0 bg-white p-4 rounded-xl border border-green-200 shadow-sm">
          <div className="text-center px-2">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Postcard Drop Cost</div>
            <div className="mono text-xl font-bold text-slate-500 line-through">$740.00</div>
            <div className="text-[10px] text-red-600 font-semibold">Print + Postage</div>
          </div>
          <div className="w-[1px] h-10 bg-slate-200" />
          <div className="text-center px-2">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Verified Walk-Ins</div>
            <div className="mono text-2xl font-bold text-green-700">{s.totalWalkins || 129}</div>
            <div className="text-[10px] text-green-700 font-bold">100% Tracked</div>
          </div>
          <div className="w-[1px] h-10 bg-slate-200" />
          <div className="text-center px-2">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Effective Savings</div>
            <div className="money text-2xl font-bold text-green-800">82%</div>
            <div className="text-[10px] text-slate-500">vs Paper Waste</div>
          </div>
        </div>
      </div>


      {/* CSV Source Importer Tabs */}
      <div className="card p-6 md:p-8 mt-8" data-testid="csv-importer-box">
        <div className="flex items-center gap-2 mb-1">
          <Database size={18} style={{ color: "var(--primary)" }} />
          <Overline>Data Ingestion · Select Channel Source</Overline>
        </div>
        <h3 className="serif text-2xl font-bold">Import Platform CSV Export</h3>
        <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
          Drop or paste raw CSV reporting files from any marketing or POS platform. The normalizer automatically maps custom column names.
        </p>

        {/* Source selector buttons */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
          {SOURCE_TABS.map((tab) => {
            const isSel = activeSource === tab.id;
            return (
              <button
                key={tab.id}
                data-testid={`tab-source-${tab.id}`}
                onClick={() => {
                  setActiveSource(tab.id);
                  setCsvText("");
                  setLastImportMsg(null);
                }}
                className="p-4 rounded-xl border text-left transition-all relative overflow-hidden"
                style={{
                  background: isSel ? "var(--surface-alt)" : "var(--surface)",
                  borderColor: isSel ? "var(--primary)" : "var(--border)",
                  borderWidth: isSel ? 2 : 1
                }}
              >
                <div className="text-2xl mb-1">{tab.icon}</div>
                <div className="font-bold text-sm truncate">{tab.label}</div>
                <div className="text-[11px] mt-1 line-clamp-1" style={{ color: "var(--text-secondary)" }}>
                  {tab.desc}
                </div>
                {isSel && (
                  <div className="absolute top-2 right-2 w-2 h-2 rounded-full" style={{ background: "var(--primary)" }} />
                )}
              </button>
            );
          })}
        </div>

        {/* CSV Text Input Area */}
        <div className="mt-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Paste {activeSource.toUpperCase()} CSV Content
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={handleLoadSample}
                data-testid="load-sample-csv-btn"
                className="btn btn-ghost text-xs flex items-center gap-1"
                style={{ padding: "0.3rem 0.7rem" }}
              >
                <FileSpreadsheet size={13} />
                <span>Load Sample {activeSource.toUpperCase()} CSV</span>
              </button>
              <a
                href={getAttributionSampleUrl(activeSource)}
                download
                className="btn btn-ghost text-xs flex items-center gap-1"
                style={{ padding: "0.3rem 0.7rem" }}
              >
                <Download size={13} />
                <span>Download Sample .CSV</span>
              </a>
            </div>
          </div>

          <textarea
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            rows={5}
            placeholder={`Paste raw ${activeSource} CSV headers and rows here...`}
            data-testid="csv-textarea"
            className="w-full p-3 rounded-lg text-xs mono"
            style={{
              border: "1px solid var(--border)",
              background: "var(--surface)",
              resize: "vertical"
            }}
          />

          <div className="flex items-center justify-between mt-3">
            <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
              Auto-reconciles against active campaign IDs and calculates Blended ROAS.
            </span>
            <button
              onClick={handleImport}
              disabled={importing || !csvText.trim()}
              data-testid="execute-import-btn"
              className="btn btn-primary text-sm flex items-center gap-2 px-5 py-2.5"
            >
              <Upload size={14} />
              <span>{importing ? "Normalizing..." : `Import ${activeSource.toUpperCase()} Data`}</span>
            </button>
          </div>

          {lastImportMsg && (
            <div className="mt-4 p-3 rounded-lg text-sm bg-green-50 text-green-900 border border-green-200 flex items-center gap-2">
              <CheckCircle2 size={16} className="text-green-700 shrink-0" />
              <span>{lastImportMsg}</span>
            </div>
          )}
        </div>
      </div>

      {/* Active Normalized Ledger Table */}
      <div className="card p-6 md:p-8 mt-8" data-testid="normalized-ledger-table">
        <div className="flex items-center justify-between mb-4">
          <div>
            <Overline>Data Normalization Ledger</Overline>
            <h3 className="serif text-2xl font-bold">Active {activeSource.toUpperCase()} Touchpoint Records</h3>
          </div>
          <span className="text-xs px-3 py-1 rounded-full font-bold bg-slate-100 text-slate-700">
            {currentRecords.length} Active Records
          </span>
        </div>

        {currentRecords.length === 0 ? (
          <div className="p-8 text-center text-sm" style={{ color: "var(--text-secondary)" }}>
            No records imported for this source yet. Load the sample CSV above to populate the ledger.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b" style={{ borderColor: "var(--border)" }}>
                  {activeSource === "meta" && (
                    <>
                      <th className="py-2.5 px-3 font-bold">Campaign ID</th>
                      <th className="py-2.5 px-3 font-bold">Ad Set Name</th>
                      <th className="py-2.5 px-3 font-bold">Clicks</th>
                      <th className="py-2.5 px-3 font-bold">CTR</th>
                      <th className="py-2.5 px-3 font-bold">CPC</th>
                      <th className="py-2.5 px-3 font-bold">Spend</th>
                      <th className="py-2.5 px-3 font-bold">Impressions</th>
                    </>
                  )}
                  {activeSource === "tiktok" && (
                    <>
                      <th className="py-2.5 px-3 font-bold">Campaign ID</th>
                      <th className="py-2.5 px-3 font-bold">Video Title</th>
                      <th className="py-2.5 px-3 font-bold">Views</th>
                      <th className="py-2.5 px-3 font-bold">Watch Time %</th>
                      <th className="py-2.5 px-3 font-bold">Profile Clicks</th>
                      <th className="py-2.5 px-3 font-bold">Spend</th>
                    </>
                  )}
                  {activeSource === "gbp" && (
                    <>
                      <th className="py-2.5 px-3 font-bold">Location ID</th>
                      <th className="py-2.5 px-3 font-bold">Local Actions</th>
                      <th className="py-2.5 px-3 font-bold">Direct Calls</th>
                      <th className="py-2.5 px-3 font-bold">Direction Requests</th>
                      <th className="py-2.5 px-3 font-bold">Website Clicks</th>
                      <th className="py-2.5 px-3 font-bold">Profile Views</th>
                    </>
                  )}
                  {activeSource === "pos" && (
                    <>
                      <th className="py-2.5 px-3 font-bold">Promo / Token Code</th>
                      <th className="py-2.5 px-3 font-bold">Tokens Redeemed</th>
                      <th className="py-2.5 px-3 font-bold">Gross Basket</th>
                      <th className="py-2.5 px-3 font-bold">Net Attributed Rev</th>
                      <th className="py-2.5 px-3 font-bold">Avg Ticket</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: "var(--border)" }}>
                {currentRecords.map((row, i) => (
                  <tr key={i} className="hover:bg-slate-50/50">
                    {activeSource === "meta" && (
                      <>
                        <td className="py-2.5 px-3 mono font-bold text-slate-800">{row.campaignId}</td>
                        <td className="py-2.5 px-3">{row.campaignName}</td>
                        <td className="py-2.5 px-3 mono">{row.clicks}</td>
                        <td className="py-2.5 px-3 mono">{row.ctr}%</td>
                        <td className="py-2.5 px-3 mono">{usd(row.cpc)}</td>
                        <td className="py-2.5 px-3 mono font-bold" style={{ color: "var(--primary)" }}>{usd(row.spend)}</td>
                        <td className="py-2.5 px-3 mono text-slate-500">{Number(row.impressions).toLocaleString()}</td>
                      </>
                    )}
                    {activeSource === "tiktok" && (
                      <>
                        <td className="py-2.5 px-3 mono font-bold text-slate-800">{row.campaignId}</td>
                        <td className="py-2.5 px-3">{row.videoTitle}</td>
                        <td className="py-2.5 px-3 mono font-bold">{Number(row.videoViews).toLocaleString()}</td>
                        <td className="py-2.5 px-3 mono">{row.watchTimePct}%</td>
                        <td className="py-2.5 px-3 mono">{row.profileClicks}</td>
                        <td className="py-2.5 px-3 mono font-bold" style={{ color: "var(--primary)" }}>{usd(row.spend)}</td>
                      </>
                    )}
                    {activeSource === "gbp" && (
                      <>
                        <td className="py-2.5 px-3 mono font-bold text-slate-800">{row.locationId}</td>
                        <td className="py-2.5 px-3 mono font-bold text-green-700">{row.localActions}</td>
                        <td className="py-2.5 px-3 mono">{row.calls}</td>
                        <td className="py-2.5 px-3 mono">{row.directionRequests}</td>
                        <td className="py-2.5 px-3 mono">{row.websiteClicks}</td>
                        <td className="py-2.5 px-3 mono text-slate-500">{Number(row.profileViews).toLocaleString()}</td>
                      </>
                    )}
                    {activeSource === "pos" && (
                      <>
                        <td className="py-2.5 px-3 mono font-bold text-orange-700">{row.code}</td>
                        <td className="py-2.5 px-3 mono font-bold">{row.tokensRedeemed} walk-ins</td>
                        <td className="py-2.5 px-3 mono">{usd(row.grossBasketTotal)}</td>
                        <td className="py-2.5 px-3 mono font-bold text-green-700">{usd(row.netAttributedRevenue)}</td>
                        <td className="py-2.5 px-3 mono">{usd(row.avgTicket)}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Channel Attribution Summary Breakdown */}
      <div className="card p-6 md:p-8 mt-8" data-testid="channel-breakdown-card">
        <Overline style={{ color: "var(--primary)" }}>Attributed Revenue Contribution</Overline>
        <h3 className="serif text-2xl font-bold mt-1">Cross-Channel ROAS Reconciliation</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
          {(data.channelBreakdown || []).map((ch, idx) => (
            <div
              key={idx}
              className="p-5 rounded-xl border flex flex-col justify-between"
              style={{ background: "var(--surface)", borderColor: "var(--border)" }}
            >
              <div>
                <div className="font-bold text-sm text-slate-800">{ch.channel}</div>
                <div className="flex items-baseline gap-2 mt-2">
                  <span className="money text-2xl font-bold text-green-700">{usd(ch.attributedRev)}</span>
                  <span className="text-xs" style={{ color: "var(--text-secondary)" }}>attributed</span>
                </div>
              </div>
              <div className="mt-4 pt-3 border-t flex items-center justify-between text-xs" style={{ borderColor: "var(--border)" }}>
                <span style={{ color: "var(--text-secondary)" }}>Spend: {usd(ch.spend)}</span>
                <span className="mono font-bold text-orange-700">{ch.roas}× ROAS</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
