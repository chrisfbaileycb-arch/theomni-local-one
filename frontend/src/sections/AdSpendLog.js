import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Megaphone, Plus, Trash2 } from "lucide-react";
import { getAdSpend, addAdSpend, deleteAdSpend } from "@/lib/api";
import { Overline } from "@/components/ui-bits";

const PLATFORMS = ["facebook", "instagram", "google", "tiktok", "youtube", "other"];

export const AdSpendLog = ({ onChanged }) => {
  const [entries, setEntries] = useState([]);
  const [platform, setPlatform] = useState("facebook");
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => getAdSpend().then((d) => setEntries(d?.entries || d?.logs || [])).catch(() => {});
  useEffect(() => { load(); }, []);

  const add = async () => {
    setBusy(true);
    try {
      await addAdSpend({ platform, label, amount: parseFloat(amount) || 0 });
      setLabel(""); setAmount("");
      toast.success("Spend logged", { description: "It shows next to results in the Win Report." });
      load(); onChanged && onChanged();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not log spend");
    } finally { setBusy(false); }
  };

  const remove = async (id) => {
    try { await deleteAdSpend(id); load(); onChanged && onChanged(); } catch { toast.error("Could not remove entry"); }
  };

  const inputStyle = { borderColor: "var(--border)", background: "var(--surface)" };

  return (
    <div className="mt-5 pt-4 border-t" style={{ borderColor: "var(--border)" }} data-testid="ad-spend-log">
      <div className="flex items-center gap-1.5">
        <Megaphone size={13} style={{ color: "var(--primary)" }} />
        <span className="overline" style={{ fontSize: "0.55rem" }}>Ad spend log · spend shows next to results</span>
      </div>
      <div className="flex flex-wrap items-center gap-2 mt-2.5">
        <select data-testid="ad-spend-platform" value={platform} onChange={(e) => setPlatform(e.target.value)}
          className="rounded-lg border px-2 py-1.5 text-xs capitalize" style={inputStyle}>
          {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <input data-testid="ad-spend-label" value={label} onChange={(e) => setLabel(e.target.value)}
          placeholder="What did you boost? (e.g. menu photo, TikTok video)"
          className="flex-1 min-w-[220px] rounded-lg border px-3 py-1.5 text-sm" style={inputStyle} />
        <input data-testid="ad-spend-amount" value={amount} onChange={(e) => setAmount(e.target.value)}
          placeholder="$" type="number" min="1" className="w-24 rounded-lg border px-3 py-1.5 text-sm mono" style={inputStyle} />
        <button data-testid="ad-spend-add-btn" onClick={add} disabled={busy || !label.trim() || !amount}
          className="btn btn-primary text-xs flex items-center gap-1" style={{ padding: "0.45rem 0.9rem" }}>
          <Plus size={12} /> Log spend
        </button>
      </div>
      <p className="text-xs mt-1.5" style={{ color: "var(--text-secondary)" }}>
        Recommended minimum $50/week boosted — organic-only posts stroke the ego, paid reach drives the door.
      </p>
      {(entries || []).length > 0 && (
        <div className="mt-2 space-y-1">
          {(entries || []).slice(0, 6).map((x) => (
            <div key={x.id} className="flex items-center gap-2 text-xs" data-testid={`ad-spend-entry-${x.id}`}>
              <span className="mono" style={{ color: "var(--text-secondary)" }}>{x.date}</span>
              <span className="capitalize font-semibold">{x.platform}</span>
              <span className="flex-1 min-w-0 truncate" style={{ color: "var(--text-secondary)" }}>{x.label}</span>
              <span className="mono font-bold">${Number(x.amount).toLocaleString()}</span>
              <button data-testid={`ad-spend-delete-${x.id}`} onClick={() => remove(x.id)}
                className="btn btn-ghost" style={{ padding: "0.2rem" }}><Trash2 size={11} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
