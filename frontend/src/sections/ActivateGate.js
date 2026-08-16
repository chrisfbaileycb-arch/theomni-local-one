import { useState } from "react";
import { toast } from "sonner";
import { KeyRound, LogOut, ShieldX } from "lucide-react";
import { authActivate } from "@/lib/api";
import { useAuth } from "@/lib/AuthContext";

export default function ActivateGate() {
  const { user, revoked, apply, logout } = useAuth();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const d = await authActivate(code);
      apply(d);
      toast.success("Welcome to the team!");
    } catch (err) {
      setError(err?.response?.data?.detail || "Invalid access code.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "var(--bone)" }}>
      <div className="card w-full max-w-md p-8 md:p-10" data-testid="activate-gate">
        {revoked ? (
          <>
            <ShieldX size={32} style={{ color: "#C0392B" }} className="mb-4" />
            <h1 className="serif text-2xl mb-2" style={{ fontWeight: 500 }}>Access revoked</h1>
            <p className="text-sm mb-6" data-testid="revoked-message" style={{ color: "var(--text-secondary)" }}>
              The account owner has revoked your access. Contact them if you think this is a mistake.
            </p>
          </>
        ) : (
          <>
            <KeyRound size={32} style={{ color: "var(--primary)" }} className="mb-4" />
            <h1 className="serif text-2xl mb-2" style={{ fontWeight: 500 }}>Enter your access code</h1>
            <p className="text-sm mb-6" style={{ color: "var(--text-secondary)" }}>
              Hi {user?.name?.split(" ")[0] || user?.email} — the account owner gave you a TR access code.
              Enter it to join the team. If the code was changed, ask the owner for the new one.
            </p>
            <form onSubmit={submit}>
              <input
                data-testid="access-code-input"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="TR-XXXX-XXXX"
                autoFocus
                className="mono w-full rounded-lg border px-4 py-3 text-center text-lg tracking-widest mb-3"
                style={{ borderColor: error ? "#C0392B" : "var(--border)", background: "var(--surface)" }}
              />
              {error && (
                <div className="text-xs mb-3" data-testid="access-code-error" style={{ color: "#C0392B" }}>{error}</div>
              )}
              <button data-testid="access-code-submit" type="submit" disabled={busy || code.trim().length < 6}
                className="btn btn-primary w-full py-3">
                {busy ? "Checking…" : "Unlock my seat"}
              </button>
            </form>
          </>
        )}
        <button data-testid="activate-logout-btn" onClick={logout}
          className="btn btn-ghost w-full mt-3 flex items-center justify-center gap-2">
          <LogOut size={14} /> Sign out
        </button>
      </div>
    </div>
  );
}
