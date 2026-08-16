import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Mail, Send } from "lucide-react";
import { getReportEmail, setReportEmail, sendReportNow } from "@/lib/api";
import { Overline } from "@/components/ui-bits";

const TZ_OPTIONS = [
  ["America/New_York", "Eastern"], ["America/Chicago", "Central"], ["America/Denver", "Mountain"],
  ["America/Phoenix", "Arizona"], ["America/Los_Angeles", "Pacific"], ["Pacific/Honolulu", "Hawaii"],
];

export const ReportEmailSettings = () => {
  const [cfg, setCfg] = useState(null);
  const [recipient, setRecipient] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    getReportEmail().then((c) => { setCfg(c); setRecipient(c.recipient || ""); }).catch(() => {});
  }, []);
  if (!cfg) return null;

  const save = async (body) => {
    try {
      const c = await setReportEmail(body);
      setCfg(c);
      toast.success("Monday auto-email updated");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not save settings");
    }
  };

  const sendNow = async () => {
    setSending(true);
    try {
      const r = await sendReportNow();
      const c = await getReportEmail();
      setCfg(c);
      toast.success(r.status === "sent" ? `Report emailed to ${r.to}` : `Report queued (stub mode) for ${r.to}`,
        { description: r.status === "stubbed" ? "Add your Resend key to deliver for real." : r.subject });
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not send report");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mt-5 pt-4 border-t" style={{ borderColor: "var(--border)" }} data-testid="report-email-settings">
      <div className="flex items-center gap-1.5">
        <Mail size={13} style={{ color: "var(--primary)" }} />
        <span className="overline" style={{ fontSize: "0.55rem" }}>Monday auto-email · 8am your time</span>
        <span className="text-xs font-bold px-2 py-0.5 rounded ml-1" data-testid="report-email-mode"
          style={{ color: "#fff", background: cfg.liveSending ? "var(--success)" : "var(--text-secondary)" }}>
          {cfg.liveSending ? "LIVE" : "STUB MODE"}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-3 mt-2.5">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={cfg.enabled} data-testid="report-email-toggle"
            onChange={(e) => save({ enabled: e.target.checked })} />
          Email me every Monday
        </label>
        <input data-testid="report-email-recipient" value={recipient} type="email"
          onChange={(e) => setRecipient(e.target.value)}
          onBlur={() => recipient !== cfg.recipient && save({ recipient })}
          placeholder="owner@yourbusiness.com" className="rounded-lg border px-3 py-1.5 text-sm min-w-[220px]"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }} />
        <select data-testid="report-email-tz" value={cfg.timezone} onChange={(e) => save({ timezone: e.target.value })}
          className="rounded-lg border px-2 py-1.5 text-xs"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
          {TZ_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <button data-testid="report-email-send-now" disabled={sending} onClick={sendNow}
          className="btn btn-ghost text-xs flex items-center gap-1.5">
          <Send size={12} /> {sending ? "Sending…" : "Send now"}
        </button>
      </div>
      <p className="text-xs mt-2" style={{ color: "var(--text-secondary)" }} data-testid="report-email-status">
        {cfg.lastSentAt
          ? `Last sent ${cfg.lastSentAt.slice(0, 16).replace("T", " ")} UTC (${cfg.lastResult}) · week of ${cfg.lastSentWeekOf}.`
          : "Never sent yet."}
        {!cfg.liveSending && " Delivery is in safe stub mode until your Resend API key is added — then it goes live automatically."}
      </p>
    </div>
  );
};
