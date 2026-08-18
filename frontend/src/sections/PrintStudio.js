import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  Printer, QrCode, Sparkles, Download, Layers, CheckCircle2,
  AlertTriangle, ShieldCheck, Copy, Check, Sliders, ExternalLink, RefreshCw
} from "lucide-react";
import { getPrintStudioTemplates, generatePrintAsset } from "@/lib/api";
import { SectionTitle, Overline } from "@/components/ui-bits";

export default function PrintStudio() {
  const [data, setData] = useState(null);
  const [selectedTemplate, setSelectedTemplate] = useState("packaging_seals");
  const [customHeadline, setCustomHeadline] = useState("");
  const [customSubhead, setCustomSubhead] = useState("");
  const [customCta, setCustomCta] = useState("");
  const [generated, setGenerated] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  const load = async () => {
    try {
      const res = await getPrintStudioTemplates();
      setData(res);
      const defaultTpl = (res.templates || []).find((t) => t.id === selectedTemplate) || res.templates?.[0];
      if (defaultTpl) {
        setCustomHeadline(defaultTpl.defaultHeadline);
        setCustomSubhead(defaultTpl.defaultSubhead);
        setCustomCta(defaultTpl.defaultCta);
        renderAsset(defaultTpl.id, defaultTpl.surface, defaultTpl.defaultHeadline, defaultTpl.defaultSubhead, defaultTpl.defaultCta);
      }
    } catch {
      toast.error("Failed to load print studio templates.");
    }
  };

  useEffect(() => {
    load();
  }, []);

  const renderAsset = async (tplId, surface, h, s, c) => {
    setGenerating(true);
    try {
      const res = await generatePrintAsset({
        templateId: tplId,
        surface,
        headline: h,
        subhead: s,
        cta: c
      });
      setGenerated(res);
    } catch {
      toast.error("Failed to generate print asset vector.");
    } finally {
      setGenerating(false);
    }
  };

  const handleSelectTemplate = (tpl) => {
    setSelectedTemplate(tpl.id);
    setCustomHeadline(tpl.defaultHeadline);
    setCustomSubhead(tpl.defaultSubhead);
    setCustomCta(tpl.defaultCta);
    renderAsset(tpl.id, tpl.surface, tpl.defaultHeadline, tpl.defaultSubhead, tpl.defaultCta);
  };

  const handleUpdate = () => {
    const tpl = (data?.templates || []).find((t) => t.id === selectedTemplate);
    if (!tpl) return;
    renderAsset(tpl.id, tpl.surface, customHeadline, customSubhead, customCta);
    toast.success("Print asset updated with custom copy.");
  };

  const handlePrint = () => {
    window.print();
  };

  const handleCopyLink = () => {
    if (generated?.playUrl) {
      navigator.clipboard.writeText(window.location.origin + generated.playUrl);
      setCopiedUrl(true);
      toast.success("Campaign tracking URL copied to clipboard.");
      setTimeout(() => setCopiedUrl(false), 2000);
    }
  };

  if (!data) {
    return <div className="p-10 text-slate-500">Loading Print & Physical Asset Studio…</div>;
  }

  const currentTpl = (data.templates || []).find((t) => t.id === selectedTemplate) || data.templates?.[0];
  const guardrail = data.placementGuardrail || {};

  return (
    <div className="p-6 md:p-12 max-w-[1200px]" data-testid="print-studio-section">
      <SectionTitle
        kicker="Physical Surface Engine · Print & QR Asset Studio"
        title="Generate high-resolution vector print assets with embedded tracking"
        subtitle="Turn carryout packaging, table-tents, check-presenters, and digital TVs into high-margin customer capture surfaces. Each asset features vector-rendered campaign QR codes tagged with surface attribution."
      />

      {/* Strategic Placement Guardrail Banner */}
      <div
        className="p-5 rounded-2xl border-2 mt-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
        style={{
          background: "linear-gradient(135deg, #FFF9F5 0%, #FFF2EB 100%)",
          borderColor: "#E67E22"
        }}
        data-testid="print-placement-guardrail-banner"
      >
        <div className="flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-orange-600 text-white font-bold shadow-sm">
            <AlertTriangle size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider bg-orange-100 text-orange-950">
                Placement Guardrail Enforced
              </span>
              <span className="text-xs text-orange-900 font-semibold">• Zero Margin Leakage</span>
            </div>
            <div className="font-bold text-sm text-slate-900 mt-1">
              {guardrail.rule}
            </div>
            <div className="text-xs text-slate-600 mt-0.5 max-w-3xl">
              {guardrail.recommendation}
            </div>
          </div>
        </div>
      </div>

      {/* 4 Surface Format Selectors */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-8">
        {(data.templates || []).map((tpl) => {
          const isSel = selectedTemplate === tpl.id;
          return (
            <button
              key={tpl.id}
              onClick={() => handleSelectTemplate(tpl)}
              data-testid={`tpl-select-${tpl.id}`}
              className="p-5 rounded-xl border text-left transition-all relative overflow-hidden flex flex-col justify-between"
              style={{
                background: isSel ? "var(--surface-alt)" : "var(--surface)",
                borderColor: isSel ? "var(--primary)" : "var(--border)",
                borderWidth: isSel ? 2 : 1
              }}
            >
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                  {tpl.badge}
                </span>
                <h3 className="serif text-lg font-bold mt-2 text-slate-900 leading-tight">
                  {tpl.name}
                </h3>
                <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                  {tpl.description}
                </p>
              </div>

              <div className="mt-4 pt-3 border-t text-[11px] font-semibold text-slate-600 truncate" style={{ borderColor: "var(--border)" }}>
                {tpl.dimensions}
              </div>
              {isSel && (
                <div className="absolute top-2 right-2 w-2 h-2 rounded-full" style={{ background: "var(--primary)" }} />
              )}
            </button>
          );
        })}
      </div>

      {/* Live Vector Editor & Printable Canvas Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mt-8">
        {/* Editor Controls */}
        <div className="lg:col-span-5 card p-6 md:p-8" data-testid="print-editor-controls">
          <Overline style={{ color: "var(--primary)" }}>Asset Customizer</Overline>
          <h3 className="serif text-2xl font-bold mt-1">{currentTpl?.name}</h3>
          <div className="text-xs text-slate-500 mt-0.5">
            Dimensions: <b>{currentTpl?.dimensions}</b> · Surface: <code>{currentTpl?.surface}</code>
          </div>

          <div className="mt-6 space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                Headline Copy
              </label>
              <input
                type="text"
                value={customHeadline}
                onChange={(e) => setCustomHeadline(e.target.value)}
                className="w-full p-2.5 rounded-lg border text-sm bg-white"
                style={{ borderColor: "var(--border)" }}
                data-testid="print-headline-input"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                Subhead / Callout
              </label>
              <textarea
                value={customSubhead}
                onChange={(e) => setCustomSubhead(e.target.value)}
                rows={3}
                className="w-full p-2.5 rounded-lg border text-xs bg-white resize-none"
                style={{ borderColor: "var(--border)" }}
                data-testid="print-subhead-input"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                Call To Action (Under QR)
              </label>
              <input
                type="text"
                value={customCta}
                onChange={(e) => setCustomCta(e.target.value)}
                className="w-full p-2.5 rounded-lg border text-sm bg-white"
                style={{ borderColor: "var(--border)" }}
                data-testid="print-cta-input"
              />
            </div>

            <div className="p-3.5 rounded-lg bg-slate-50 border text-xs text-slate-600">
              <span className="font-bold text-slate-900">Recommended Placement: </span>
              {currentTpl?.recommendedPlacement}
            </div>

            <div className="pt-2 flex items-center gap-3">
              <button
                onClick={handleUpdate}
                disabled={generating}
                className="btn btn-primary text-xs flex items-center gap-1.5 px-4 py-2.5 flex-1"
                data-testid="render-print-btn"
              >
                <Sparkles size={14} />
                <span>{generating ? "Updating Vector..." : "Update Print Asset"}</span>
              </button>
              <button
                onClick={handleCopyLink}
                className="btn btn-ghost text-xs flex items-center gap-1 px-3 py-2.5 border"
                data-testid="copy-qr-link-btn"
              >
                {copiedUrl ? <Check size={14} className="text-green-700" /> : <Copy size={14} />}
                <span>{copiedUrl ? "Copied" : "Copy URL"}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Live Vector / Printable Canvas Preview */}
        <div className="lg:col-span-7 flex flex-col items-center justify-center card p-6 md:p-10 relative bg-slate-100/70 border-dashed border-2 border-slate-300 overflow-hidden" data-testid="live-print-preview">
          <div className="w-full flex items-center justify-between mb-4">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Vector Print Stage · 300 DPI Rendering
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={handlePrint}
                className="btn btn-primary text-xs flex items-center gap-1.5 px-3 py-1.5"
                data-testid="print-action-btn"
              >
                <Printer size={13} />
                <span>Print / Save PDF</span>
              </button>
            </div>
          </div>

          {/* Dynamic Printable Surface Mockup */}
          {selectedTemplate === "packaging_seals" && (
            <div
              className="w-72 h-72 rounded-full border-4 border-dashed border-orange-600/60 p-6 flex flex-col items-center justify-center text-center shadow-lg transition-transform hover:scale-[1.01]"
              style={{
                background: "#FFFFFF",
                boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)"
              }}
            >
              <div className="text-[10px] font-bold uppercase tracking-widest text-orange-700">
                {generated?.brandName || "VIP REWARD"}
              </div>
              <div className="serif text-base font-bold text-slate-900 mt-1 leading-tight max-w-[200px]">
                {customHeadline}
              </div>
              {generated?.qrDataUri ? (
                <img
                  src={generated.qrDataUri}
                  alt="Campaign QR"
                  className="w-28 h-28 my-2 rounded border p-1 bg-white"
                />
              ) : (
                <div className="w-28 h-28 my-2 bg-slate-100 animate-pulse rounded" />
              )}
              <div className="text-[11px] font-bold text-orange-900 uppercase tracking-wide">
                {customCta}
              </div>
            </div>
          )}

          {selectedTemplate === "table_tent" && (
            <div
              className="w-72 h-96 rounded-xl border-2 border-slate-300 p-6 flex flex-col items-center justify-between text-center shadow-xl bg-white"
              style={{
                background: "linear-gradient(180deg, #FFFFFF 0%, #FAF8F5 100%)"
              }}
            >
              <div className="w-full">
                <div className="text-[10px] font-bold uppercase tracking-widest text-orange-700">
                  {generated?.brandName || "TABLE EXPERIENCE"}
                </div>
                <div className="serif text-lg font-bold text-slate-900 mt-1 leading-snug">
                  {customHeadline}
                </div>
                <div className="text-xs text-slate-600 mt-1 line-clamp-2">
                  {customSubhead}
                </div>
              </div>

              {generated?.qrDataUri ? (
                <img
                  src={generated.qrDataUri}
                  alt="Campaign QR"
                  className="w-36 h-36 my-2 rounded-lg border-2 p-1.5 bg-white shadow-sm"
                />
              ) : (
                <div className="w-36 h-36 my-2 bg-slate-100 animate-pulse rounded-lg" />
              )}

              <div className="w-full">
                <div className="text-xs font-bold text-orange-800 uppercase tracking-wider">
                  {customCta}
                </div>
                <div className="text-[10px] text-slate-400 mt-1">
                  1-Click Instant Reward · No App Needed
                </div>
              </div>
            </div>
          )}

          {selectedTemplate === "digital_screen_16_9" && (
            <div
              className="w-full max-w-md aspect-video rounded-xl border-4 border-slate-800 p-6 flex items-center justify-between text-left shadow-2xl"
              style={{
                background: "radial-gradient(circle at top right, #2C3E50 0%, #1A1A1A 100%)",
                color: "#FFFFFF"
              }}
            >
              <div className="max-w-[55%]">
                <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-orange-600 text-white uppercase tracking-wider">
                  ON-SCREEN ARCADE
                </span>
                <div className="serif text-xl font-bold text-white mt-2 leading-tight">
                  {customHeadline}
                </div>
                <div className="text-xs text-slate-300 mt-1 leading-snug">
                  {customSubhead}
                </div>
                <div className="text-[11px] font-bold text-orange-400 mt-3">
                  {customCta} →
                </div>
              </div>

              <div className="bg-white p-2 rounded-xl text-center shadow-lg shrink-0">
                {generated?.qrDataUri ? (
                  <img
                    src={generated.qrDataUri}
                    alt="Digital Screen QR"
                    className="w-28 h-28 rounded"
                  />
                ) : (
                  <div className="w-28 h-28 bg-slate-200 animate-pulse rounded" />
                )}
                <div className="text-[9px] font-bold text-slate-900 uppercase tracking-tight mt-1">
                  Scan Screen
                </div>
              </div>
            </div>
          )}

          {selectedTemplate === "bundle_badges" && (
            <div
              className="w-64 h-80 rounded-2xl border-2 border-slate-300 p-5 flex flex-col items-center justify-between text-center shadow-lg bg-white relative"
            >
              <div className="w-3 h-3 rounded-full bg-slate-300 absolute top-3 left-1/2 -translate-x-1/2" />
              <div className="w-full mt-3">
                <div className="text-[9px] font-bold uppercase tracking-widest text-emerald-800 bg-emerald-100 py-0.5 px-2 rounded-full inline-block">
                  PRODUCT BUNDLE PERK
                </div>
                <div className="serif text-base font-bold text-slate-900 mt-2">
                  {customHeadline}
                </div>
                <div className="text-xs text-slate-600 mt-1 line-clamp-2">
                  {customSubhead}
                </div>
              </div>

              {generated?.qrDataUri ? (
                <img
                  src={generated.qrDataUri}
                  alt="Bundle QR"
                  className="w-28 h-28 my-1 rounded border p-1 bg-white"
                />
              ) : (
                <div className="w-28 h-28 my-1 bg-slate-100 animate-pulse rounded" />
              )}

              <div className="text-[11px] font-bold text-slate-800 uppercase tracking-wide">
                {customCta}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
