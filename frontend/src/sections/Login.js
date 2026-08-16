import { useState } from "react";
import { UtensilsCrossed, ShieldCheck, Users, CheckCircle2, KeyRound } from "lucide-react";
import { API, authLogin } from "@/lib/api";
import { useAuth } from "@/lib/AuthContext";

function formatApiErrorDetail(detail) {
  if (detail == null) return "Something went wrong. Please try again.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail))
    return detail.map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e))).filter(Boolean).join(" ");
  if (detail && typeof detail.msg === "string") return detail.msg;
  return String(detail);
}

export default function Login() {
  const { apply } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const signIn = () => {
    window.location.href = `${API}/auth/google/start`;
  };

  const passwordSignIn = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const d = await authLogin(email, password);
      apply(d);
    } catch (err) {
      setError(formatApiErrorDetail(err?.response?.data?.detail) || err.message);
    } finally {
      setBusy(false);
    }
  };

  const inputStyle = { borderColor: "var(--border)", background: "var(--surface)" };

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "var(--bone)" }}>
      <div className="card w-full max-w-md p-8 md:p-10" data-testid="login-page">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-11 h-11 rounded-lg flex items-center justify-center" style={{ background: "var(--primary)" }}>
            <UtensilsCrossed size={20} color="#fff" />
          </div>
          <div>
            <div className="serif text-2xl leading-none" style={{ fontWeight: 600 }}>OmniLocal #1</div>
            <div className="overline" style={{ fontSize: "0.6rem" }}>Revenue Engine</div>
          </div>
        </div>

        <h1 className="serif text-3xl mb-2" style={{ fontWeight: 500 }}>Sign in to your engine</h1>
        <p className="text-sm mb-6" style={{ color: "var(--text-secondary)" }}>
          One owner approves everything. Up to three team members create content, plans and programs.
        </p>

        <form onSubmit={passwordSignIn} className="space-y-3" data-testid="password-login-form">
          <input data-testid="login-email-input" type="email" value={email} required
            onChange={(e) => setEmail(e.target.value)} aria-label="Email address" placeholder="Email"
            className="w-full rounded-lg border px-3 py-2.5 text-sm" style={inputStyle} />
          <input data-testid="login-password-input" type="password" value={password} required
            onChange={(e) => setPassword(e.target.value)} aria-label="Master password" placeholder="Master password"
            className="w-full rounded-lg border px-3 py-2.5 text-sm" style={inputStyle} />
          {error && <div className="text-xs" data-testid="login-error" style={{ color: "#C0392B" }}>{error}</div>}
          <button type="submit" data-testid="password-login-btn" disabled={busy}
            className="btn btn-primary w-full flex items-center justify-center gap-2 py-3">
            <KeyRound size={15} /> {busy ? "Signing in…" : "Sign in with master password"}
          </button>
        </form>

        <div className="flex items-center gap-2 my-5">
          <div className="flex-1 border-t" style={{ borderColor: "var(--border)" }} />
          <span className="text-xs" style={{ color: "var(--text-secondary)" }}>or</span>
          <div className="flex-1 border-t" style={{ borderColor: "var(--border)" }} />
        </div>

        <button data-testid="google-login-btn" onClick={signIn}
          className="btn btn-ghost w-full flex items-center justify-center gap-3 py-3 text-base"
          style={{ border: "1px solid var(--border)" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
          </svg>
          Continue with Google
        </button>

        <div className="mt-8 pt-6 border-t space-y-3" style={{ borderColor: "var(--border)" }}>
          {[
            { icon: KeyRound, text: "Owner can sign in with the master password — no Google required" },
            { icon: ShieldCheck, text: "Team members need the owner's access code to get in" },
            { icon: CheckCircle2, text: "Publishing and emails execute only after owner approval" },
            { icon: Users, text: "1 owner + up to 3 team seats" },
          ].map(({ icon: Icon, text }) => (
            <div key={text} className="flex items-center gap-3 text-xs" style={{ color: "var(--text-secondary)" }}>
              <Icon size={14} style={{ color: "var(--accent-green, #27AE60)", flexShrink: 0 }} />
              {text}
            </div>
          ))}
        </div>

        <p className="text-xs mt-5 text-center">
          <a href="/pricing" data-testid="login-pricing-link" style={{ color: "var(--primary)", fontWeight: 600 }}>
            New here? See plans &amp; pricing →
          </a>
        </p>
      </div>
    </div>
  );
}
