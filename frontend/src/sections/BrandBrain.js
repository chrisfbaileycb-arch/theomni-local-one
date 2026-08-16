import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BrainCircuit, Save, Pencil } from "lucide-react";
import { getBrandProfile, updateBrandProfile } from "@/lib/api";
import { Overline } from "@/components/ui-bits";

const FIELDS = [
  { key: "voice", label: "Brand Voice", rows: 3, hint: "How you sound — the AI writes in this tone every time." },
  { key: "menuHighlights", label: "Menu Highlights", rows: 2 },
  { key: "backstory", label: "Backstory", rows: 2 },
];

export default function BrandBrain() {
  const [profile, setProfile] = useState(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => { getBrandProfile().then((p) => { setProfile(p); setDraft(p); }).catch(() => {}); }, []);

  const save = async () => {
    setBusy(true);
    try {
      const p = await updateBrandProfile(draft);
      setProfile(p); setEditing(false);
      toast.success("Brand Brain updated", { description: "Future AI posts will use this voice." });
    } finally { setBusy(false); }
  };

  if (!profile) return null;

  return (
    <div className="card p-6 md:p-8 mt-8" data-testid="brand-brain">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2"><BrainCircuit size={18} color="var(--primary)" /><Overline>Brand Brain · grounds every AI post</Overline></div>
          <h3 className="serif text-2xl mt-1">{profile.name} — {profile.city}</h3>
        </div>
        {!editing ? (
          <button className="btn btn-ghost text-sm" style={{ padding: "0.45rem 0.9rem" }} onClick={() => { setDraft(profile); setEditing(true); }} data-testid="brand-edit-btn">
            <Pencil size={13} className="inline mr-1" /> Edit
          </button>
        ) : (
          <button className="btn btn-primary text-sm" style={{ padding: "0.45rem 1rem" }} onClick={save} disabled={busy} data-testid="brand-save-btn">
            <Save size={14} className="inline mr-1" /> {busy ? "Saving…" : "Save Brand Brain"}
          </button>
        )}
      </div>
      <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
        This is the AI's source of truth. It's fed into Claude Sonnet 4.6 on every generation so your posts always sound like you — not a robot.
      </p>

      <div className="mt-4 grid grid-cols-1 gap-4">
        {FIELDS.map((f) => (
          <div key={f.key}>
            <div className="overline mb-1" style={{ fontSize: "0.55rem" }}>{f.label}</div>
            {editing ? (
              <textarea data-testid={`brand-${f.key}-input`} rows={f.rows} value={draft[f.key] || ""}
                onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                className="w-full p-3 rounded-lg text-sm" style={{ border: "1px solid var(--border)", background: "var(--surface)", resize: "vertical" }} />
            ) : (
              <p className="text-sm" style={{ color: "var(--text)" }} data-testid={`brand-${f.key}`}>{profile[f.key]}</p>
            )}
            {f.hint && editing && <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>{f.hint}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
