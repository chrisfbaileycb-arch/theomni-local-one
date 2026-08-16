import { useState } from "react";
import { toast } from "sonner";
import { Lock } from "lucide-react";
import { changeMasterPassword } from "@/lib/api";
import { Overline } from "@/components/ui-bits";

export const MasterPasswordCard = () => {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (next !== confirm) { toast.error("New passwords don't match."); return; }
    setBusy(true);
    try {
      await changeMasterPassword({ currentPassword: current, newPassword: next });
      toast.success("Master password updated", { description: "Use it on the sign-in page — no Google needed." });
      setCurrent(""); setNext(""); setConfirm("");
    } catch (e) {
      const detail = e?.response?.data?.detail;
      toast.error(typeof detail === "string" ? detail : "Could not update the password");
    } finally { setBusy(false); }
  };

  const inputStyle = { borderColor: "var(--border)", background: "var(--surface)" };

  return (
    <div className="card p-6" data-testid="master-password-card">
      <div className="flex items-center gap-2 mb-3">
        <Lock size={16} style={{ color: "var(--primary)" }} />
        <Overline>Master Password</Overline>
      </div>
      <p className="text-xs mb-4" style={{ color: "var(--text-secondary)" }}>
        Sign in with your email + this password on any device — no Google account required.
        Only the owner has one.
      </p>
      <div className="space-y-2">
        <input data-testid="mp-current" type="password" value={current} onChange={(e) => setCurrent(e.target.value)}
          aria-label="Current master password" placeholder="Current master password"
          className="w-full rounded-lg border px-3 py-2 text-sm" style={inputStyle} />
        <input data-testid="mp-new" type="password" value={next} onChange={(e) => setNext(e.target.value)}
          aria-label="New master password" placeholder="New master password (min 8 chars)"
          className="w-full rounded-lg border px-3 py-2 text-sm" style={inputStyle} />
        <input data-testid="mp-confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
          aria-label="Confirm new master password" placeholder="Confirm new master password"
          className="w-full rounded-lg border px-3 py-2 text-sm" style={inputStyle} />
      </div>
      <button data-testid="mp-save-btn" onClick={save} disabled={busy || !current || next.length < 8}
        className="btn btn-primary text-sm mt-3">
        {busy ? "Updating…" : "Update master password"}
      </button>
    </div>
  );
};
