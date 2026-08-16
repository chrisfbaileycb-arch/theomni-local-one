import { useEffect, useRef, useState } from "react";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { paymentStatus } from "@/lib/api";

export default function PaymentResult({ kind }) {
  const [state, setState] = useState(kind === "cancel" ? "cancelled" : "checking");
  const tries = useRef(0);

  useEffect(() => {
    if (kind !== "success") return;
    const sessionId = new URLSearchParams(window.location.search).get("session_id");
    if (!sessionId) { setState("error"); return; }
    const poll = async () => {
      tries.current += 1;
      try {
        const d = await paymentStatus(sessionId);
        if (d.payment_status === "paid") { setState("paid"); return; }
        if (["failed", "expired"].includes(d.payment_status)) { setState("error"); return; }
      } catch { /* keep polling */ }
      if (tries.current >= 10) { setState("timeout"); return; }
      setTimeout(poll, 2000);
    };
    poll();
  }, [kind]);

  const body = {
    checking: { icon: <Loader2 size={40} className="animate-spin" style={{ color: "var(--primary)" }} />,
      title: "Confirming your payment…", text: "One moment — we're checking with Stripe.", tid: "payment-checking" },
    paid: { icon: <CheckCircle2 size={44} style={{ color: "var(--accent-green, #27AE60)" }} />,
      title: "Welcome to OmniLocal #1!", text: "Payment confirmed. Watch your inbox — we'll reach out to get your engine set up.", tid: "payment-success" },
    cancelled: { icon: <XCircle size={44} style={{ color: "var(--text-secondary)" }} />,
      title: "Checkout cancelled", text: "No charge was made. Come back whenever you're ready.", tid: "payment-cancel" },
    timeout: { icon: <Loader2 size={40} style={{ color: "var(--primary)" }} />,
      title: "Still processing", text: "Your payment is taking a little longer. If you were charged, you're in — we'll email you shortly.", tid: "payment-timeout" },
    error: { icon: <XCircle size={44} style={{ color: "#C0392B" }} />,
      title: "Payment didn't complete", text: "No worries — you can try again from the pricing page.", tid: "payment-error" },
  }[state];

  return (
    <div className="min-h-screen flex items-center justify-center px-6" style={{ background: "var(--bone)" }}>
      <div className="card p-10 max-w-md w-full text-center" data-testid={body.tid}>
        <div className="grid place-items-center">{body.icon}</div>
        <h1 className="serif text-3xl mt-4">{body.title}</h1>
        <p className="text-sm mt-2" style={{ color: "var(--text-secondary)" }}>{body.text}</p>
        <a href="/pricing" className="btn btn-ghost mt-6 inline-block text-sm" data-testid="back-to-pricing-link"
          style={{ border: "1px solid var(--border)", padding: "0.6rem 1.2rem" }}>
          Back to pricing
        </a>
      </div>
    </div>
  );
}
