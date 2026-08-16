import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Gift, Plus, Trash2, Save, ShieldAlert } from "lucide-react";
import { getPrizeBoard, setPrizeBoard } from "@/lib/api";
import { Overline } from "@/components/ui-bits";

export default function PrizeBoard() {
  const [board, setBoard] = useState(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { getPrizeBoard().then(setBoard).catch(() => {}); }, []);
  if (!board) return null;

  const setGood = (i, field, v) =>
    setBoard((b) => ({ ...b, goodPrizes: b.goodPrizes.map((p, j) => (j === i ? { ...p, [field]: v } : p)) }));
  const setDud = (field, v) => setBoard((b) => ({ ...b, dudPrize: { ...b.dudPrize, [field]: v } }));
  const addSlot = () => setBoard((b) => ({ ...b, goodPrizes: [...b.goodPrizes, { label: "", posCode: "" }] }));
  const removeSlot = (i) => setBoard((b) => ({ ...b, goodPrizes: b.goodPrizes.filter((_, j) => j !== i) }));

  const save = async () => {
    setSaving(true);
    try {
      const b = await setPrizeBoard(board);
      setBoard(b);
      toast.success("Prize board saved", { description: "The wheel pays out your prizes from the next spin." });
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not save the prize board");
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = { borderColor: "var(--border)", background: "var(--surface)" };

  return (
    <div className="card p-6 md:p-8 mt-4" data-testid="prize-board">
      <div className="flex items-center gap-2"><Gift size={18} color="var(--primary)" /><Overline>Prize Board · you decide what the wheel pays out</Overline></div>
      <h3 className="serif text-2xl mt-1">Every prize is good — the game funnels quality customers in</h3>
      <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
        The wheel spins randomly across your good prizes — everybody wins one, no winner announcements needed.
        Put your own POS discount code next to each prize so staff knows exactly what to punch in at the register.
        Identified repeat couponers quietly get the dud instead.
      </p>
      <div className="mt-4 space-y-2">
        {board.goodPrizes.map((p, i) => (
          <div key={i} className="flex items-center gap-2 flex-wrap" data-testid={`prize-slot-${i}`}>
            <span className="overline w-20 shrink-0" style={{ fontSize: "0.5rem", color: i === 0 ? "var(--primary)" : "var(--text-secondary)" }}>
              {i === 0 ? "Headline" : `Prize ${i + 1}`}
            </span>
            <input data-testid={`prize-label-${i}`} value={p.label} onChange={(e) => setGood(i, "label", e.target.value)}
              placeholder="e.g. 30% Off Your Order" className="flex-1 min-w-[180px] rounded-lg border px-3 py-2 text-sm" style={inputStyle} />
            <input data-testid={`prize-pos-${i}`} value={p.posCode || ""} onChange={(e) => setGood(i, "posCode", e.target.value)}
              placeholder="POS code (e.g. 261745)" className="w-40 rounded-lg border px-3 py-2 text-sm mono" style={inputStyle} />
            {board.goodPrizes.length > 2 && (
              <button data-testid={`prize-remove-${i}`} onClick={() => removeSlot(i)} className="btn btn-ghost text-xs" style={{ padding: "0.4rem" }}>
                <Trash2 size={13} />
              </button>
            )}
          </div>
        ))}
        {board.goodPrizes.length < 6 && (
          <button data-testid="prize-add-btn" onClick={addSlot} className="btn btn-ghost text-xs flex items-center gap-1.5">
            <Plus size={13} /> Add a prize (up to 6)
          </button>
        )}
      </div>
      <div className="mt-4 p-3 rounded-lg flex items-center gap-2 flex-wrap" style={{ background: "#fdf6ec", border: "1px solid #ecd9b8" }} data-testid="dud-prize-row">
        <ShieldAlert size={15} color="#B9770E" />
        <span className="text-xs font-bold w-40 shrink-0" style={{ color: "#B9770E" }}>Coupon-abuser dud</span>
        <input data-testid="dud-label" value={board.dudPrize.label} onChange={(e) => setDud("label", e.target.value)}
          placeholder="e.g. 10% Off, Candy Bar" className="flex-1 min-w-[160px] rounded-lg border px-3 py-2 text-sm" style={inputStyle} />
        <input data-testid="dud-pos" value={board.dudPrize.posCode || ""} onChange={(e) => setDud("posCode", e.target.value)}
          placeholder="POS code" className="w-36 rounded-lg border px-3 py-2 text-sm mono" style={inputStyle} />
        <span className="text-xs w-full" style={{ color: "var(--text-secondary)" }}>
          The only small prize on the wheel — reserved for identified repeat couponers, protecting your margin.
        </span>
      </div>
      <button data-testid="prize-save-btn" onClick={save} disabled={saving} className="btn btn-primary text-sm mt-4 flex items-center gap-1.5">
        <Save size={14} /> {saving ? "Saving…" : "Save prize board"}
      </button>
    </div>
  );
}
