import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BrainCircuit, Save, Pencil, Sparkles, CheckCircle2, Sliders, Tag, ShieldCheck, RefreshCw } from "lucide-react";
import { getBrandProfile, updateBrandProfile, getPresets, applyPreset, getPrizeBoard, setPrizeBoard } from "@/lib/api";
import { Overline } from "@/components/ui-bits";

export default function BrandBrain({ onProfileChanged }) {
  const [profile, setProfile] = useState(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({});
  const [busy, setBusy] = useState(false);
  const [presetsData, setPresetsData] = useState(null);
  const [selectedPresetId, setSelectedPresetId] = useState("");
  const [activeCategoryKey, setActiveCategoryKey] = useState("appointment_service");
  const [prizeBoard, setPrizeBoardState] = useState(null);

  const loadData = async () => {
    try {
      const [p, pr, pb] = await Promise.all([
        getBrandProfile().catch(() => null),
        getPresets().catch(() => null),
        getPrizeBoard().catch(() => null)
      ]);
      if (p) {
        setProfile(p);
        setDraft(p);
        setSelectedPresetId(p.id || "tattoo");
        if (p.category) {
          if (p.category.includes("Appointment") || p.category.includes("Service")) {
            setActiveCategoryKey("appointment_service");
          } else if (p.category.includes("Food") || p.category.includes("Beverage")) {
            setActiveCategoryKey("food_beverage");
          } else {
            setActiveCategoryKey("specialty_retail");
          }
        }
      }
      if (pr) setPresetsData(pr);
      if (pb) setPrizeBoardState(pb);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleApplyPreset = async (presetId) => {
    setBusy(true);
    try {
      const res = await applyPreset(presetId);
      if (res && res.brand_profile) {
        setProfile(res.brand_profile);
        setDraft(res.brand_profile);
        setSelectedPresetId(res.brand_profile.id);
        if (res.prize_board) setPrizeBoardState(res.prize_board);
        toast.success(`Switched to ${res.brand_profile.name} (${res.brand_profile.category})`, {
          description: "Brand Voice, Master POS Codes, and Prize Board updated."
        });
        onProfileChanged && onProfileChanged(res.brand_profile);
      }
    } catch (e) {
      toast.error("Failed to apply preset");
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    setBusy(true);
    try {
      const p = await updateBrandProfile(draft);
      setProfile(p);
      setEditing(false);
      toast.success("Brand Profile Updated", {
        description: "AI generation voice and POS codes synced across the engine."
      });
      onProfileChanged && onProfileChanged(p);
    } catch (e) {
      toast.error("Failed to save brand profile");
    } finally {
      setBusy(false);
    }
  };

  if (!profile) {
    return (
      <div className="card p-6 md:p-8 mt-8 text-center text-slate-500 font-mono text-sm">
        Loading Brand Profile &amp; Industry Brain…
      </div>
    );
  }

  const activeCategory = presetsData?.categories?.find(c => c.key === activeCategoryKey) || presetsData?.categories?.[0];

  return (
    <div className="card p-6 md:p-8 mt-8 space-y-6" data-testid="brand-brain">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4 border-b pb-5" style={{ borderColor: "var(--border)" }}>
        <div>
          <div className="flex items-center gap-2">
            <BrainCircuit size={18} color="var(--primary)" />
            <Overline>Universal Industry Architecture · Brand Brain</Overline>
          </div>
          <h2 className="serif text-2xl md:text-3xl mt-1 text-gray-900">
            {profile.name} <span className="text-slate-400 font-light text-xl">({profile.category || "Service / Retail"})</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1 font-mono">
            {profile.city} · Master POS Promo: <span className="font-bold text-emerald-600">{profile.masterPosCode || "SRV50-PROMO"}</span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          {!editing ? (
            <button
              className="btn btn-ghost text-sm flex items-center gap-1.5"
              style={{ padding: "0.5rem 1rem" }}
              onClick={() => { setDraft(profile); setEditing(true); }}
              data-testid="brand-edit-btn"
            >
              <Pencil size={13} />
              <span>Customize Profile</span>
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                className="btn btn-ghost text-xs text-slate-500"
                onClick={() => setEditing(false)}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary text-sm flex items-center gap-1.5"
                style={{ padding: "0.5rem 1.1rem" }}
                onClick={save}
                disabled={busy}
                data-testid="brand-save-btn"
              >
                <Save size={14} />
                <span>{busy ? "Saving…" : "Save Changes"}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Preset Category Switcher */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
            Industry Profile Presets (1-Click Switch)
          </span>
          <span className="text-[11px] text-slate-400 font-mono">10 Industry Blueprints</span>
        </div>

        {/* Category Tabs */}
        <div className="flex gap-2 border-b pb-2 mb-3 overflow-x-auto" style={{ borderColor: "var(--border)" }}>
          {presetsData?.categories?.map((cat) => (
            <button
              key={cat.key}
              onClick={() => setActiveCategoryKey(cat.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0 ${
                activeCategoryKey === cat.key
                  ? "bg-slate-900 text-white shadow-sm font-semibold"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Preset Cards for Active Category */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {activeCategory?.presets?.map((preset) => {
            const isSelected = profile.id === preset.id;
            return (
              <div
                key={preset.id}
                onClick={() => handleApplyPreset(preset.id)}
                className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                  isSelected
                    ? "bg-emerald-50/50 border-emerald-500 ring-2 ring-emerald-500/20 shadow-sm"
                    : "bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900 truncate">
                    {preset.name}
                  </span>
                  {isSelected && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 flex items-center gap-0.5">
                      <CheckCircle2 size={10} /> Active
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-slate-500 mt-1 line-clamp-1">
                  {preset.category}
                </div>
                <div className="text-[10px] text-emerald-700 font-mono mt-1.5 bg-slate-50 p-1 rounded border border-slate-100 truncate">
                  POS: {preset.masterPosCode}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Editable Brand Details */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
        <div>
          <div className="overline mb-1" style={{ fontSize: "0.6rem" }}>Business Name</div>
          {editing ? (
            <input
              type="text"
              value={draft.name || ""}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              className="w-full p-2.5 rounded-lg text-sm border bg-white"
            />
          ) : (
            <div className="text-sm font-semibold text-slate-900">{profile.name}</div>
          )}
        </div>

        <div>
          <div className="overline mb-1" style={{ fontSize: "0.6rem" }}>Master POS Register Promo Code</div>
          {editing ? (
            <input
              type="text"
              value={draft.masterPosCode || ""}
              onChange={(e) => setDraft({ ...draft, masterPosCode: e.target.value.toUpperCase() })}
              placeholder="e.g. TAT50-PROMO"
              className="w-full p-2.5 rounded-lg text-sm border bg-white font-mono uppercase"
            />
          ) : (
            <div className="text-sm font-mono font-bold text-emerald-600">{profile.masterPosCode || "SRV50-PROMO"}</div>
          )}
        </div>

        <div className="md:col-span-2">
          <div className="overline mb-1" style={{ fontSize: "0.6rem" }}>Signature Services / Highlights</div>
          {editing ? (
            <input
              type="text"
              value={draft.signatureItem || draft.menuHighlights || ""}
              onChange={(e) => setDraft({ ...draft, signatureItem: e.target.value, menuHighlights: e.target.value })}
              className="w-full p-2.5 rounded-lg text-sm border bg-white"
            />
          ) : (
            <div className="text-sm text-slate-800">{profile.signatureItem || profile.menuHighlights}</div>
          )}
        </div>

        <div className="md:col-span-2">
          <div className="overline mb-1" style={{ fontSize: "0.6rem" }}>Brand Voice &amp; Tone (AI Content Generator Core)</div>
          {editing ? (
            <textarea
              rows={3}
              value={draft.voice || ""}
              onChange={(e) => setDraft({ ...draft, voice: e.target.value })}
              className="w-full p-2.5 rounded-lg text-sm border bg-white"
            />
          ) : (
            <div className="text-sm text-slate-700 leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-100">
              "{profile.voice}"
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
