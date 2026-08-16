import { useEffect, useState } from "react";
import { toast } from "sonner";
import { GraduationCap, Gauge, PlayCircle, AlertTriangle, Link2, Settings2, Pencil, Trash2, Plus, X } from "lucide-react";
import { getStrategy, putStrategy, addIndustry, updateIndustry, deleteIndustry } from "@/lib/api";
import { Overline } from "@/components/ui-bits";

const DISCLAIMER =
  "WARNING / STRATEGIC NOTICE: Gamified promotions are designed to drive high-density engagement. " +
  "Running continuous broad-spectrum promotions can dilute your brand value, lower customer response " +
  "rates, and overwhelm staff and operations. We strongly recommend staggering campaigns across short, " +
  "limited timeframes to maintain high campaign yield and protect service quality.";

export const OperationalDisclaimer = () => (
  <div className="flex items-start gap-3 p-4 rounded-xl my-4" data-testid="operational-disclaimer"
    style={{ background: "#fdf6ec", border: "1.5px solid #e0a93f" }}>
    <AlertTriangle size={18} style={{ color: "#B9770E", flexShrink: 0, marginTop: 2 }} />
    <p className="text-xs leading-relaxed" style={{ color: "#7a5410" }}>
      <b>WARNING / STRATEGIC NOTICE:</b> {DISCLAIMER.replace("WARNING / STRATEGIC NOTICE: ", "")}
    </p>
  </div>
);

const ytId = (url) => {
  const m = (url || "").match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([A-Za-z0-9_-]{6,})/);
  return m ? m[1] : null;
};

const VideoPlaque = ({ video, onSave }) => {
  const [url, setUrl] = useState(video.youtubeUrl || "");
  const id = ytId(video.youtubeUrl);
  return (
    <div className="card overflow-hidden" data-testid={`strategy-video-${video.id}`}>
      {id ? (
        <div className="aspect-video">
          <iframe title={video.title} src={`https://www.youtube.com/embed/${id}`} width="100%" height="100%"
            frameBorder="0" allow="accelerometer; encrypted-media; picture-in-picture" allowFullScreen />
        </div>
      ) : (
        <div className="aspect-video flex flex-col items-center justify-center gap-2"
          style={{ background: "var(--surface-alt)" }} data-testid={`video-placeholder-${video.id}`}>
          <PlayCircle size={30} style={{ color: "var(--text-secondary)" }} />
          <span className="text-xs" style={{ color: "var(--text-secondary)" }}>Training video slot — paste a YouTube link</span>
        </div>
      )}
      <div className="p-3">
        <div className="text-sm font-semibold leading-tight">{video.title}</div>
        <div className="flex items-center gap-1.5 mt-2">
          <input data-testid={`video-url-${video.id}`} value={url} onChange={(e) => setUrl(e.target.value)}
            placeholder="https://youtube.com/watch?v=…" aria-label={`YouTube link for ${video.title}`}
            className="flex-1 min-w-0 rounded-lg border px-2 py-1.5 text-xs"
            style={{ borderColor: "var(--border)", background: "var(--surface)" }} />
          <button data-testid={`video-save-${video.id}`} onClick={() => onSave(video.id, url)}
            className="btn btn-ghost text-xs" style={{ padding: "0.35rem 0.6rem" }}><Link2 size={12} /></button>
        </div>
      </div>
    </div>
  );
};

const EMPTY_IND = { label: "", advisor: "", cadence: "", window: "", rotation: "" };
const errMsg = (e, fb) => {
  const d = e?.response?.data?.detail;
  return typeof d === "string" ? d : fb;
};

const IndustryManager = ({ s, setS }) => {
  const [form, setForm] = useState(EMPTY_IND);
  const [editId, setEditId] = useState(null);
  const upd = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const inputCls = "rounded-lg border px-2 py-1.5 text-xs w-full";
  const inputStyle = { borderColor: "var(--border)", background: "var(--surface)" };

  const submit = async () => {
    try {
      setS(editId ? await updateIndustry(editId, form) : await addIndustry(form));
      toast.success(editId ? "Industry updated" : "Industry added — it's live in the picker");
      setForm(EMPTY_IND);
      setEditId(null);
    } catch (e) {
      toast.error(errMsg(e, "Could not save industry"));
    }
  };
  const remove = async (iid) => {
    try {
      setS(await deleteIndustry(iid));
      toast.success("Industry removed");
    } catch (e) {
      toast.error(errMsg(e, "Could not delete industry"));
    }
  };
  const startEdit = (i) => {
    setEditId(i.id);
    setForm({ label: i.label, advisor: i.advisor, cadence: i.cadence, window: i.window, rotation: i.rotation });
  };

  return (
    <div className="card p-5 mt-4" style={{ background: "var(--surface-alt)" }} data-testid="industry-manager">
      <Overline>Industry Manager · add any vertical, the AI retunes itself</Overline>
      <div className="mt-3 space-y-1.5">
        {s.industries.map((i) => (
          <div key={i.id} className="flex items-center gap-2 text-xs rounded-lg border px-2.5 py-1.5"
            style={{ borderColor: "var(--border)", background: "var(--surface)" }} data-testid={`industry-row-${i.id}`}>
            <span className="font-semibold flex-1 truncate">{i.label}</span>
            {s.industry === i.id && <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: "var(--primary)", color: "#fff" }}>SELECTED</span>}
            <button data-testid={`industry-edit-${i.id}`} onClick={() => startEdit(i)} aria-label={`Edit ${i.label}`}
              className="btn btn-ghost" style={{ padding: "0.25rem 0.4rem" }}><Pencil size={12} /></button>
            <button data-testid={`industry-delete-${i.id}`} onClick={() => remove(i.id)} aria-label={`Delete ${i.label}`}
              className="btn btn-ghost" style={{ padding: "0.25rem 0.4rem", color: "#B03A2E" }}><Trash2 size={12} /></button>
          </div>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-2" data-testid="industry-form">
        <input data-testid="industry-form-label" className={inputCls} style={inputStyle} value={form.label}
          onChange={upd("label")} placeholder="Industry name — e.g. Real Estate Agent" aria-label="Industry name" />
        <input data-testid="industry-form-cadence" className={inputCls} style={inputStyle} value={form.cadence}
          onChange={upd("cadence")} placeholder="Cadence — e.g. Burst 2-3 days before open houses" aria-label="Cadence" />
        <input data-testid="industry-form-window" className={inputCls} style={inputStyle} value={form.window}
          onChange={upd("window")} placeholder="Best window — e.g. Thu-Fri teasers" aria-label="Best window" />
        <input data-testid="industry-form-rotation" className={inputCls} style={inputStyle} value={form.rotation}
          onChange={upd("rotation")} placeholder="Channel rotation — e.g. Social one week, yard-sign QR the next" aria-label="Channel rotation" />
        <textarea data-testid="industry-form-advisor" className={`${inputCls} md:col-span-2`} style={inputStyle} rows={2}
          value={form.advisor} onChange={upd("advisor")} aria-label="Pacing advice"
          placeholder="Pacing advice the AI should follow — when to burst, what to protect" />
      </div>
      <div className="flex items-center gap-2 mt-2">
        <button data-testid="industry-form-save" onClick={submit} className="btn btn-primary text-xs" style={{ padding: "0.4rem 0.8rem" }}>
          <Plus size={12} /> {editId ? "Save changes" : "Add industry"}
        </button>
        {editId && (
          <button data-testid="industry-form-cancel" onClick={() => { setEditId(null); setForm(EMPTY_IND); }}
            className="btn btn-ghost text-xs" style={{ padding: "0.4rem 0.8rem" }}><X size={12} /> Cancel</button>
        )}
      </div>
    </div>
  );
};

export default function StrategyPanel() {
  const [s, setS] = useState(null);
  const [manage, setManage] = useState(false);
  useEffect(() => { getStrategy().then(setS).catch(() => {}); }, []);
  if (!s) return null;

  const save = async (body, msg) => {
    try {
      setS(await putStrategy(body));
      toast.success(msg);
    } catch (e) {
      const d = e?.response?.data?.detail;
      toast.error(typeof d === "string" ? d : "Could not save");
    }
  };

  const saveVideo = (id, url) =>
    save({ videos: s.videos.map((v) => (v.id === id ? { ...v, youtubeUrl: url } : v)) }, "Video slot updated");

  return (
    <div className="card p-6 md:p-8 mt-8" data-testid="strategy-panel">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <GraduationCap size={18} color="var(--primary)" />
          <Overline>Strategy &amp; Best Practices · protect the brand, protect the staff</Overline>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-xs" style={{ color: "var(--text-secondary)" }}>
            Your industry
            <select data-testid="strategy-industry-select" value={s.industry}
              onChange={(e) => save({ industry: e.target.value }, "Pacing advisor retuned to your industry")}
              className="rounded-lg border px-2 py-1.5 text-xs"
              style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
              {s.industries.map((i) => <option key={i.id} value={i.id}>{i.label}</option>)}
            </select>
          </label>
          <button data-testid="industry-manager-toggle" onClick={() => setManage((m) => !m)}
            className="btn btn-ghost text-xs" style={{ padding: "0.35rem 0.6rem" }} aria-label="Manage industries">
            <Settings2 size={13} /> Manage
          </button>
        </div>
      </div>
      <h3 className="serif text-2xl mt-1">Run bursts, not marathons</h3>
      {manage && <IndustryManager s={s} setS={setS} />}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
        {/* Campaign Pacing Advisor */}
        <div className="card p-5" style={{ background: "var(--surface-alt)" }} data-testid="pacing-advisor">
          <div className="flex items-center gap-2"><Gauge size={15} style={{ color: "var(--primary)" }} />
            <Overline>Campaign Pacing Advisor · {s.pacing.label}</Overline></div>
          <p className="text-sm mt-2" data-testid="pacing-advisor-text">{s.pacing.advisor}</p>
          <div className="mt-3 space-y-1.5 text-xs" style={{ color: "var(--text-secondary)" }}>
            <div data-testid="pacing-cadence"><b style={{ color: "var(--text)" }}>Cadence:</b> {s.pacing.cadence}</div>
            <div data-testid="pacing-window"><b style={{ color: "var(--text)" }}>Best window:</b> {s.pacing.window}</div>
            <div data-testid="pacing-rotation"><b style={{ color: "var(--text)" }}>Channel rotation:</b> {s.pacing.rotation}</div>
          </div>
        </div>

        {/* Instructional video plaques */}
        {s.videos.map((v) => <VideoPlaque key={v.id} video={v} onSave={saveVideo} />)}
      </div>
      <p className="text-xs mt-3" style={{ color: "var(--text-secondary)" }}>
        The AI copywriter and the Coach follow this playbook automatically — every recommendation they
        make respects the Limited-Run Burst Model for your industry.
      </p>
    </div>
  );
}
