import { useState } from "react";
import { UtensilsCrossed, Check, Sparkles } from "lucide-react";
import { createCheckout } from "@/lib/api";

const FEATURES = [
  "Scan-to-Spin loyalty games (4 mechanics, pause anytime)",
  "AI Content Director — copy, coach & video critic",
  "POS-proven redemptions & Weekly Win Report",
  "Reward member directory + welcome automation",
  "Location analytics with printable QR spot sheets",
  "Works for any local business — 7 industry playbooks",
];

const PLANS = [
  { key: "omnilocal_monthly", name: "Monthly", price: "$97", per: "/month", note: "Cancel anytime" },
  { key: "omnilocal_yearly", name: "Yearly", price: "$970", per: "/year", note: "2 months free", best: true },
];

export default function Pricing() {
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState("");

  const buy = async (key) => {
    setBusy(key);
    setError("");
    try {
      const { checkout_url } = await createCheckout(key);
      window.location.assign(checkout_url);
    } catch {
      setError("Could not start checkout — please try again.");
      setBusy(null);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center px-6 py-14" style={{ background: "var(--bone)" }} data-testid="pricing-page">
      <div className="flex items-center gap-2 mb-8">
        <div className="w-10 h-10 rounded-lg grid place-items-center" style={{ background: "var(--primary)" }}>
          <UtensilsCrossed size={18} color="#fff" />
        </div>
        <div>
          <div className="serif text-2xl leading-none" style={{ fontWeight: 600 }}>OmniLocal #1</div>
          <div className="overline" style={{ fontSize: "0.55rem" }}>Revenue Engine</div>
        </div>
      </div>

      <h1 className="serif text-4xl sm:text-5xl text-center max-w-2xl" style={{ fontWeight: 500 }}>
        The one revenue engine your business will ever need
      </h1>
      <p className="text-sm mt-3 max-w-xl text-center" style={{ color: "var(--text-secondary)" }}>
        Loyalty games, AI content, and POS-proven reports — one system that turns scans into
        customers and proves every dollar.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-10 w-full max-w-3xl">
        {PLANS.map((p) => (
          <div key={p.key} className="card p-7 relative" data-testid={`plan-${p.key}`}
            style={p.best ? { border: "2px solid var(--primary)" } : {}}>
            {p.best && (
              <div className="absolute -top-3 left-6 px-2.5 py-0.5 rounded-full text-xs font-bold"
                style={{ background: "var(--primary)", color: "#fff" }}>
                <Sparkles size={10} className="inline mr-1" />BEST VALUE
              </div>
            )}
            <div className="overline">{p.name}</div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="serif text-5xl" style={{ fontWeight: 600 }}>{p.price}</span>
              <span className="text-sm" style={{ color: "var(--text-secondary)" }}>{p.per}</span>
            </div>
            <div className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>{p.note}</div>
            <button data-testid={`checkout-${p.key}-btn`} disabled={busy !== null}
              onClick={() => buy(p.key)} className="btn btn-primary w-full mt-5 py-3">
              {busy === p.key ? "Opening secure checkout…" : "Get started"}
            </button>
          </div>
        ))}
      </div>
      {error && <div className="text-xs mt-3" data-testid="pricing-error" style={{ color: "#C0392B" }}>{error}</div>}

      <div className="card p-6 mt-8 w-full max-w-3xl">
        <div className="overline mb-3">Everything included, every plan</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {FEATURES.map((f) => (
            <div key={f} className="flex items-start gap-2 text-sm">
              <Check size={14} style={{ color: "var(--accent-green, #27AE60)", flexShrink: 0, marginTop: 3 }} />
              <span>{f}</span>
            </div>
          ))}
        </div>
      </div>

      <p className="text-xs mt-8" style={{ color: "var(--text-secondary)" }}>
        Already a member? <a href="/" data-testid="pricing-signin-link" style={{ color: "var(--primary)", fontWeight: 600 }}>Sign in →</a>
      </p>
    </div>
  );
}
