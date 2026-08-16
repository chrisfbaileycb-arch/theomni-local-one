import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Trophy, Music, ShoppingBasket, Users, PartyPopper, ArrowRight, MapPin, TrendingUp, CalendarPlus } from "lucide-react";
import { getLocalEvents, addCalendarPost } from "@/lib/api";
import { Overline } from "@/components/ui-bits";

const CAT_ICON = { sports: Trophy, festival: Music, market: ShoppingBasket, community: PartyPopper, concert: Music };

function EventRow({ ev, i, onAdd, added }) {
  const Icon = CAT_ICON[ev.category] || Users;
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}
      className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1.2fr] gap-3 lg:gap-4 items-stretch" data-testid={`event-row-${ev.id}`}>
      {/* Event card */}
      <div className="p-4 rounded-xl flex gap-3" style={{ background: "var(--surface-alt)" }}>
        <div className="w-11 h-11 shrink-0 rounded-lg grid place-items-center" style={{ background: "var(--surface)" }}>
          <Icon size={20} color="var(--primary)" />
        </div>
        <div>
          <div className="mono text-xs" style={{ color: "var(--text-secondary)" }}>
            {ev.daysAway === 0 ? "Today" : `in ${ev.daysAway} days`} · {ev.date}
          </div>
          <div className="font-bold text-sm leading-tight mt-0.5">{ev.title}</div>
          <div className="text-xs mt-1 flex items-center gap-1" style={{ color: "var(--text-secondary)" }}>
            <MapPin size={11} /> {ev.venue} · {ev.distanceMiles} mi · {ev.expectedAttendance.toLocaleString()} expected
          </div>
        </div>
      </div>

      {/* Connector */}
      <div className="hidden lg:grid place-items-center" style={{ color: "var(--primary)" }}>
        <ArrowRight size={22} />
      </div>

      {/* Action card */}
      <div className="p-4 rounded-xl" style={{ background: "var(--surface)", border: "1.5px solid var(--primary)" }}>
        <div className="flex items-center justify-between">
          <Overline style={{ color: "var(--primary)" }}>Recommended Action</Overline>
          <span className="mono text-xs font-bold px-2 py-0.5 rounded" style={{ background: "var(--primary)", color: "#fff" }}>
            +{ev.budgetShift}% budget
          </span>
        </div>
        <div className="font-bold text-sm mt-1 flex items-center gap-1">
          <TrendingUp size={14} color="var(--success)" /> Shift toward {ev.channelLabel}
        </div>
        <p className="text-xs mt-1.5" style={{ color: "var(--text-secondary)" }}>{ev.rationale}</p>
        <p className="text-xs mt-2 italic" style={{ color: "var(--text)" }}>💡 {ev.contentIdea}</p>
        <button className="btn btn-ghost text-xs mt-3" style={{ padding: "0.35rem 0.8rem" }}
          disabled={added} onClick={() => onAdd(ev)} data-testid={`add-event-${ev.id}`}>
          <CalendarPlus size={12} className="inline mr-1" /> {added ? "Added to calendar" : "Add to Content Calendar"}
        </button>
      </div>
    </motion.div>
  );
}

export default function LocalMarketIntel({ onCalendarChange }) {
  const [data, setData] = useState(null);
  const [added, setAdded] = useState({});

  useEffect(() => { getLocalEvents().then(setData).catch(() => {}); }, []);

  const addToCalendar = async (ev) => {
    const d = new Date(ev.date);
    d.setDate(d.getDate() - 1);
    const promoDate = d.toISOString().slice(0, 10);
    const res = await addCalendarPost({ date: promoDate, title: `Promote: ${ev.title}`, surface: ev.channelLabel, time: "09:00", idea: ev.contentIdea });
    setAdded((a) => ({ ...a, [ev.id]: true }));
    onCalendarChange && onCalendarChange(res);
    toast.success("Added to Content Calendar", { description: `${ev.title} promo scheduled for ${promoDate}` });
  };

  if (!data) return null;

  return (
    <div className="card p-6 md:p-8 mt-8" data-testid="local-market-intel">
      <div className="flex items-center gap-2"><MapPin size={18} color="var(--primary)" /><Overline>Local Market Intelligence · what's happening near you</Overline></div>
      <h3 className="serif text-2xl mt-1">Turn local events into marketing moves</h3>
      <div className="mt-3 p-4 rounded-xl flex items-start gap-3" style={{ background: "var(--surface-alt)" }} data-testid="market-insight">
        <TrendingUp size={18} color="var(--success)" className="mt-0.5" />
        <div>
          <div className="font-bold text-sm">{data.insight.headline}</div>
          <div className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
            Detected from nearby events — the Ad Engine can prioritize <b>{data.insight.recommendedChannel}</b> this window.
          </div>
        </div>
      </div>
      <div className="mt-5 space-y-3">
        {data.events.map((ev, i) => (
          <EventRow key={ev.id} ev={ev} i={i} added={!!added[ev.id]} onAdd={addToCalendar} />
        ))}
      </div>
    </div>
  );
}
