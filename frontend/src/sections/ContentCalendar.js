import { useEffect, useState, forwardRef, useImperativeHandle } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { CalendarDays, Plus, X, RotateCcw } from "lucide-react";
import { getCalendar, addCalendarWeek, addCalendarPost, removeCalendarPost, resetCalendar } from "@/lib/api";
import { Overline } from "@/components/ui-bits";

// Map a surface/channel label to a channel color strip.
function surfaceColor(s) {
  const t = (s || "").toLowerCase();
  if (t.includes("instagram")) return "#E1306C";
  if (t.includes("facebook")) return "#2980B9";
  if (t.includes("google") || t.includes("gbp") || t.includes("maps")) return "#F39C12";
  if (t.includes("tiktok")) return "#12B5B0";
  if (t.includes("youtube")) return "#C0392B";
  return "var(--primary)";
}

const sourceLabel = { prompt: "Prompt", event: "Local Event", manual: "Manual" };

const ContentCalendar = forwardRef(function ContentCalendar(_props, ref) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ date: "", title: "", surface: "Instagram Reels" });

  const apply = (d) => setData(d);
  const load = () => getCalendar().then(apply).catch(() => {});
  useEffect(() => { load(); }, []);
  useImperativeHandle(ref, () => ({ refresh: apply }), []);

  const planNextWeek = async () => {
    setBusy(true);
    try {
      const d = await addCalendarWeek();
      apply(d);
      toast.success("Next week planned", { description: `Now planning ${d.weeksPlanned} weeks ahead — go enjoy your trip.` });
    } finally { setBusy(false); }
  };

  const reset = async () => { apply(await resetCalendar()); toast.message("Calendar reset to the current two weeks"); };

  const removePost = async (id) => { apply(await removeCalendarPost(id)); };

  const addPost = async () => {
    if (!form.date || !form.title.trim()) { toast.error("Pick a date and enter a title"); return; }
    const d = await addCalendarPost({ ...form, time: "12:00" });
    apply(d);
    setForm({ date: "", title: "", surface: form.surface });
    toast.success("Post added to calendar");
  };

  if (!data) return null;

  return (
    <div className="card p-6 md:p-8 mt-8" data-testid="content-calendar">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2"><CalendarDays size={18} color="var(--primary)" /><Overline>Content Calendar · plan the whole month</Overline></div>
          <h3 className="serif text-2xl mt-1">Your posting plan, {data.weeksPlanned} weeks out</h3>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-ghost text-sm" style={{ padding: "0.45rem 0.9rem" }} onClick={reset} data-testid="calendar-reset-btn">
            <RotateCcw size={13} className="inline mr-1" /> Reset
          </button>
          <button className="btn btn-primary text-sm" style={{ padding: "0.45rem 1rem" }} onClick={planNextWeek} disabled={busy} data-testid="calendar-next-week-btn">
            <Plus size={14} className="inline mr-1" /> {busy ? "Planning…" : "Plan Next Week"}
          </button>
        </div>
      </div>
      <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
        Auto-filled from your shooting prompts and nearby events. Going out of town? Add weeks ahead so posts keep going out while you're away.
      </p>

      {/* Quick add */}
      <div className="mt-4 flex flex-wrap items-end gap-2 p-3 rounded-xl" style={{ background: "var(--surface-alt)" }}>
        <div>
          <div className="overline mb-1" style={{ fontSize: "0.5rem" }}>Date</div>
          <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })}
            className="p-2 rounded-md text-sm mono" style={{ border: "1px solid var(--border)", background: "var(--surface)" }} data-testid="calendar-add-date" />
        </div>
        <div className="flex-1 min-w-[160px]">
          <div className="overline mb-1" style={{ fontSize: "0.5rem" }}>Title</div>
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Weekend special reel"
            className="w-full p-2 rounded-md text-sm" style={{ border: "1px solid var(--border)", background: "var(--surface)" }} data-testid="calendar-add-title" />
        </div>
        <div>
          <div className="overline mb-1" style={{ fontSize: "0.5rem" }}>Surface</div>
          <select value={form.surface} onChange={(e) => setForm({ ...form, surface: e.target.value })}
            className="p-2 rounded-md text-sm" style={{ border: "1px solid var(--border)", background: "var(--surface)" }} data-testid="calendar-add-surface">
            {data.surfaces.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <button className="btn btn-primary text-sm" style={{ padding: "0.5rem 1rem" }} onClick={addPost} data-testid="calendar-add-btn">Add</button>
      </div>

      {/* Weeks */}
      <div className="mt-5 space-y-5">
        {data.weeks.map((wk, wi) => (
          <div key={wk.weekOf} data-testid={`calendar-week-${wi}`}>
            <div className="mono text-xs mb-2" style={{ color: "var(--text-secondary)" }}>Week of {wk.label}</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
              {wk.days.map((day) => (
                <div key={day.date} className="rounded-lg p-2 min-h-[92px]" style={{ background: "var(--surface-alt)" }} data-testid={`calendar-day-${day.date}`}>
                  <div className="flex items-baseline justify-between mb-1.5">
                    <span className="text-xs font-bold">{day.weekday}</span>
                    <span className="mono text-xs" style={{ color: "var(--text-secondary)" }}>{day.dayNum}</span>
                  </div>
                  <div className="space-y-1.5">
                    {day.posts.map((p) => (
                      <motion.div key={p.id} initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
                        className="group rounded-md p-2 relative" data-testid={`calendar-post-${p.id}`}
                        style={{ background: "var(--surface)", borderLeft: `3px solid ${surfaceColor(p.surface)}`, boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
                        <button onClick={() => removePost(p.id)} data-testid={`remove-post-${p.id}`}
                          className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity"
                          style={{ color: "var(--text-secondary)" }} aria-label="remove post"><X size={12} /></button>
                        <div className="mono text-[0.6rem]" style={{ color: "var(--text-secondary)" }}>{p.time}</div>
                        <div className="text-xs font-semibold leading-tight pr-3">{p.title}</div>
                        <div className="flex items-center gap-1 mt-1">
                          <span className="text-[0.55rem] font-bold" style={{ color: surfaceColor(p.surface) }}>{p.surface}</span>
                        </div>
                        {p.source !== "prompt" && (
                          <span className="text-[0.5rem] overline mt-0.5 inline-block" style={{ color: "var(--text-secondary)" }}>{sourceLabel[p.source]}</span>
                        )}
                      </motion.div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});

export default ContentCalendar;
