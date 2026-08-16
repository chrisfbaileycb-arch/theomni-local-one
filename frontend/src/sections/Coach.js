import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  GraduationCap, Download, Camera, MapPin, ClipboardCheck, Megaphone,
  CalendarPlus, Trash2, FolderOpen, Library,
} from "lucide-react";
import { coachTemplate, coachTemplatePdfUrl, getCoachTemplates, coachToCalendar, coachTemplateDelete } from "@/lib/api";
import { Overline } from "@/components/ui-bits";

const addToCalendar = async (id, setBusy) => {
  setBusy(true);
  try {
    const d = await coachToCalendar(id);
    window.dispatchEvent(new CustomEvent("omni-calendar-update", { detail: d }));
    toast.success(`${d.addedCount} posts dropped on the calendar`, {
      description: d.added.map((p) => `${p.date} · ${p.surface}`).join("  ·  "),
    });
  } catch (e) {
    toast.error(e?.response?.data?.detail || "Could not add to calendar");
  } finally {
    setBusy(false);
  }
};

export const TemplatePanel = ({ result }) => {
  const [calBusy, setCalBusy] = useState(false);
  if (!result) return null;
  const t = result.template;
  const Sec = ({ icon: Icon, title, children }) => (
    <div className="mt-4">
      <div className="flex items-center gap-1.5">
        <Icon size={13} style={{ color: "var(--primary)" }} />
        <span className="overline" style={{ fontSize: "0.55rem" }}>{title}</span>
      </div>
      <div className="mt-1.5 space-y-1">{children}</div>
    </div>
  );
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      className="mt-4 p-5 rounded-lg" style={{ background: "var(--surface-alt)" }} data-testid="coach-template-panel">
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <div className="serif text-xl" style={{ fontWeight: 600 }}>{t.title}</div>
          <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>{t.whyItWorks}</p>
        </div>
        <div className="flex gap-2">
          <button data-testid="coach-to-calendar-btn" disabled={calBusy}
            onClick={() => addToCalendar(result.id, setCalBusy)}
            className="btn btn-ghost text-xs flex items-center gap-1.5">
            <CalendarPlus size={13} /> {calBusy ? "Adding…" : "Add plan to calendar"}
          </button>
          <a data-testid="coach-template-pdf" className="btn btn-primary text-xs flex items-center gap-1.5"
            href={coachTemplatePdfUrl(result.id)} download>
            <Download size={13} /> Download PDF
          </a>
        </div>
      </div>
      <div className="grid md:grid-cols-2 gap-x-6">
        <div>
          <Sec icon={ClipboardCheck} title="Key Elements">
            {t.keyElements?.map((k, i) => <div key={i} className="text-sm">• {k}</div>)}
          </Sec>
          <Sec icon={Megaphone} title="Your Offer — fill in the blanks">
            {t.offerTemplate?.map((k, i) => <div key={i} className="text-sm mono" style={{ fontSize: "0.8rem" }}>{k}</div>)}
          </Sec>
        </div>
        <div>
          <Sec icon={Camera} title="Shot List — your phone, raw beats polished">
            {t.shotList?.map((s, i) => (
              <div key={i} className="text-sm">
                <b>{s.shot}</b> — {s.where}
                <div className="text-xs" style={{ color: "var(--text-secondary)" }}>Tip: {s.tip}</div>
              </div>
            ))}
          </Sec>
          <Sec icon={MapPin} title="Where It Goes">
            {t.whereItGoes?.map((k, i) => <div key={i} className="text-sm">• {k}</div>)}
          </Sec>
        </div>
      </div>
      {t.successCheck?.length > 0 && (
        <div className="mt-4 pt-3 border-t text-xs" style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>
          <b>You'll know it worked when:</b> {t.successCheck.join(" · ")}
        </div>
      )}
    </motion.div>
  );
};

const TemplateShelf = ({ onOpen, refreshKey }) => {
  const [shelf, setShelf] = useState([]);
  const load = () => getCoachTemplates().then((d) => setShelf(d.templates)).catch(() => {});
  useEffect(() => { load(); }, [refreshKey]);

  const remove = async (id) => {
    await coachTemplateDelete(id);
    toast("Template removed from the shelf");
    load();
  };

  if (shelf.length === 0) return null;
  return (
    <div className="mt-6 pt-4 border-t" style={{ borderColor: "var(--border)" }} data-testid="template-shelf">
      <div className="flex items-center gap-1.5">
        <Library size={13} style={{ color: "var(--primary)" }} />
        <span className="overline" style={{ fontSize: "0.55rem" }}>Template Shelf · re-run past plays</span>
      </div>
      <div className="mt-2 space-y-1.5">
        {shelf.map((s) => (
          <div key={s.id} className="flex items-center gap-2 flex-wrap py-1.5 border-b text-sm"
            data-testid={`shelf-item-${s.id}`} style={{ borderColor: "var(--border)" }}>
            <span className="font-semibold flex-1 min-w-[180px]">{s.template?.title || s.topic}</span>
            <span className="text-xs" style={{ color: "var(--text-secondary)" }}>{(s.createdAt || "").slice(0, 10)}</span>
            <button data-testid={`shelf-open-${s.id}`} onClick={() => onOpen(s)}
              className="btn btn-ghost text-xs flex items-center gap-1"><FolderOpen size={12} /> Open</button>
            <a className="btn btn-ghost text-xs flex items-center gap-1" href={coachTemplatePdfUrl(s.id)} download
              data-testid={`shelf-pdf-${s.id}`}><Download size={12} /> PDF</a>
            <button data-testid={`shelf-delete-${s.id}`} onClick={() => remove(s.id)}
              className="btn btn-ghost text-xs flex items-center gap-1"><Trash2 size={12} /></button>
          </div>
        ))}
      </div>
    </div>
  );
};

export const AskTheCoach = () => {
  const [topic, setTopic] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [shelfKey, setShelfKey] = useState(0);

  const ask = async (e) => {
    e.preventDefault();
    if (!topic.trim()) return;
    setBusy(true);
    try {
      const r = await coachTemplate(topic.trim());
      setResult(r);
      setShelfKey((k) => k + 1);
      toast.success("Your build template is ready", { description: "Download it, print it, build it yourself." });
    } catch (err) {
      toast.error(err?.response?.data?.detail || "The coach is unavailable. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card p-6 md:p-8 mt-8" data-testid="ask-the-coach">
      <div className="flex items-center gap-2"><GraduationCap size={18} color="var(--primary)" /><Overline>Ask the Coach · templates, not homework done for you</Overline></div>
      <h3 className="serif text-2xl mt-1">"How does this work?"</h3>
      <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
        Ask about any play — a sub special, a slow-Tuesday deal, four weeks of Mother's Day — and get the key
        elements, a fill-in-the-blank offer, a raw phone shot list, and where it goes. You build it. We hold you accountable.
      </p>
      <form onSubmit={ask} className="flex gap-2 mt-4 flex-wrap">
        <input data-testid="coach-topic-input" value={topic} onChange={(e) => setTopic(e.target.value)}
          placeholder="e.g. How do sub specials work?" className="flex-1 min-w-[240px] rounded-lg border px-3 py-2.5 text-sm"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }} />
        <button data-testid="coach-ask-btn" type="submit" disabled={busy || !topic.trim()} className="btn btn-primary text-sm">
          {busy ? "Coaching…" : "Get the template"}
        </button>
      </form>
      <TemplatePanel result={result} />
      <TemplateShelf refreshKey={shelfKey} onOpen={(s) => setResult({ id: s.id, template: s.template })} />
    </div>
  );
};
