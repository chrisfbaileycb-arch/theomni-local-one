import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Gift, Copy, Check, PartyPopper, UtensilsCrossed, Sparkles, CalendarClock, PauseCircle } from "lucide-react";
import { getGames, spin, postScan } from "@/lib/api";

function useSpace() {
  const params = new URLSearchParams(window.location.search);
  return params.get("space") || "Table Tent";
}

let scanSent = false;

function MysteryWheel({ spinning }) {
  return (
    <div className="grid place-items-center my-6">
      <motion.div animate={{ rotate: spinning ? 1440 : 0 }}
        transition={{ duration: 1.8, ease: "easeOut" }} className="grid place-items-center rounded-full"
        style={{ width: 180, height: 180, background: "conic-gradient(#D35400 0 25%, #1A1A1A 25% 50%, #F39C12 50% 75%, #27AE60 75% 100%)" }}>
        <div className="grid place-items-center rounded-full" style={{ width: 132, height: 132, background: "var(--surface)" }}>
          <div className="text-center">
            <Gift size={44} color="var(--primary)" />
            <div className="mono text-lg font-bold" style={{ color: "var(--primary)" }}>?</div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

export default function SpinPlay() {
  const space = useSpace();
  const [game, setGame] = useState(null);
  const [freqDays, setFreqDays] = useState(7);
  const [phase, setPhase] = useState("signup"); // signup | spinning | won | limited
  const [result, setResult] = useState(null);
  const [limited, setLimited] = useState(null);
  const [copied, setCopied] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState("");
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    getGames().then((g) => { setGame(g.active); setPaused(!g.active); setFreqDays(g.playFrequencyDays || 7); }).catch(() => {});
    if (!scanSent) {
      scanSent = true;
      postScan(space).catch(() => {});
    }
  }, []);

  const play = async (e) => {
    e.preventDefault();
    setError("");
    if (!agree) { setError("Please agree to join the rewards club to play."); return; }
    if (!email.trim() && !phone.trim()) { setError("Enter your email or mobile number to play."); return; }
    setPhase("spinning"); setResult(null);
    try {
      const res = await spin({ agree, email: email.trim(), phone: phone.trim(), name: name.trim(), spaceId: space });
      setTimeout(() => { setResult(res); setPhase("won"); }, 1800);
    } catch (err) {
      const detail = err?.response?.data?.detail;
      if (err?.response?.status === 429 && detail) {
        setTimeout(() => { setLimited(detail); setPhase("limited"); }, 800);
      } else {
        setTimeout(() => {
          setError(typeof detail === "string" ? detail : "Something went wrong reaching the game. Please try again.");
          setPhase("signup");
        }, 500);
      }
    }
  };

  const copy = () => {
    if (!result) return;
    navigator.clipboard?.writeText(result.code).catch(() => {});
    setCopied(true); setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-10"
      style={{ background: "var(--bone)" }} data-testid="spin-play">
      <div className="flex items-center gap-2 mb-6">
        <div className="w-9 h-9 rounded-lg grid place-items-center" style={{ background: "var(--primary)" }}>
          <UtensilsCrossed size={18} color="#fff" />
        </div>
        <div>
          <div className="serif text-xl leading-none" style={{ fontWeight: 600 }}>OmniLocal #1</div>
          <div className="overline" style={{ fontSize: "0.55rem" }}>{game ? game.name : "Scan-to-Play"}</div>
        </div>
      </div>

      <div className="card p-8 w-full max-w-sm text-center">
        {paused && (
          <div data-testid="spin-paused" className="py-6">
            <PauseCircle size={36} style={{ color: "var(--text-secondary)", margin: "0 auto" }} />
            <h1 className="serif text-2xl mt-3">The game is taking a quick break</h1>
            <p className="text-sm mt-2" style={{ color: "var(--text-secondary)" }}>
              No prizes are live right now — scan again soon, the next round is always worth the trip.
            </p>
          </div>
        )}
        {!paused && phase === "signup" && (
          <>
            <div className="flex items-center justify-center gap-1.5 overline" style={{ color: "var(--primary)" }}>
              <Sparkles size={12} /> Everybody wins something
            </div>
            <h1 className="serif text-3xl mt-1">Mystery Spin</h1>
            <p className="text-sm mt-2" style={{ color: "var(--text-secondary)" }}>
              Join our rewards club and spin — your prize is a mystery until the wheel stops.
            </p>
            <MysteryWheel spinning={false} />
            <form onSubmit={play} className="text-left space-y-2.5">
              <input data-testid="spin-name-input" value={name} onChange={(e) => setName(e.target.value)}
                aria-label="Your name (optional)" placeholder="Your name (optional)" className="w-full rounded-lg border px-3 py-2.5 text-sm"
                style={{ borderColor: "var(--border)", background: "var(--surface)" }} />
              <input data-testid="spin-email-input" value={email} onChange={(e) => setEmail(e.target.value)}
                type="email" aria-label="Email address" placeholder="Email" className="w-full rounded-lg border px-3 py-2.5 text-sm"
                style={{ borderColor: "var(--border)", background: "var(--surface)" }} />
              <div className="flex items-center gap-2">
                <div className="flex-1 border-t" style={{ borderColor: "var(--border)" }} />
                <span className="text-xs" style={{ color: "var(--text-secondary)" }}>or</span>
                <div className="flex-1 border-t" style={{ borderColor: "var(--border)" }} />
              </div>
              <input data-testid="spin-phone-input" value={phone} onChange={(e) => setPhone(e.target.value)}
                type="tel" aria-label="Mobile number" placeholder="Mobile number" className="w-full rounded-lg border px-3 py-2.5 text-sm"
                style={{ borderColor: "var(--border)", background: "var(--surface)" }} />
              <label className="flex items-start gap-2 text-xs pt-1" style={{ color: "var(--text-secondary)" }}>
                <input data-testid="spin-agree-checkbox" type="checkbox" checked={agree}
                  onChange={(e) => setAgree(e.target.checked)} className="mt-0.5" />
                <span>I agree to join the rewards club and receive offers &amp; updates. One play per {freqDays === 14 ? "two weeks" : "week"}.</span>
              </label>
              {error && <div className="text-xs" data-testid="spin-error" style={{ color: "#C0392B" }}>{error}</div>}
              <button type="submit" className="btn btn-primary w-full" style={{ padding: "0.9rem" }}
                data-testid="play-spin-btn">
                Join &amp; Spin
              </button>
              <p className="text-xs" data-testid="spin-privacy-note" style={{ color: "var(--text-secondary)" }}>
                We only use your contact to send this business's offers. Unsubscribe anytime with one click.
              </p>
            </form>
          </>
        )}

        {phase === "spinning" && (
          <>
            <h1 className="serif text-3xl">Good luck…</h1>
            <p className="text-sm mt-2" style={{ color: "var(--text-secondary)" }}>The wheel is deciding your mystery prize.</p>
            <MysteryWheel spinning />
          </>
        )}

        {phase === "won" && result && (
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} data-testid="spin-won">
            <PartyPopper size={40} color="var(--success)" className="mx-auto" />
            <div className="overline mt-3" style={{ color: result.tier === "highValue" ? "var(--success)" : "var(--text-secondary)" }}>
              {result.tier === "highValue" ? "You won big!" : "You won"}
            </div>
            <div className="serif text-4xl mt-1">{result.reward}</div>
            <div className="mt-5 p-4 rounded-xl" style={{ background: "var(--surface-alt)" }}>
              <div className="overline">Show this code at the counter</div>
              <div className="mono text-2xl mt-1 tracking-wider" style={{ color: "var(--primary)" }} data-testid="won-code">{result.code}</div>
              <button className="btn btn-ghost text-sm mt-2" style={{ padding: "0.35rem 0.9rem" }} onClick={copy} data-testid="copy-code-btn">
                {copied ? <><Check size={13} className="inline mr-1" /> Copied</> : <><Copy size={13} className="inline mr-1" /> Copy code</>}
              </button>
            </div>
            <p className="text-xs mt-3" style={{ color: "var(--text-secondary)" }}>
              Valid until {result.expiresAt ? result.expiresAt.slice(0, 10) : "soon"}. One-time use.
              You're in the rewards club — watch your inbox for member-only deals.
            </p>
          </motion.div>
        )}

        {phase === "limited" && limited && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} data-testid="spin-limited">
            <CalendarClock size={36} color="var(--primary)" className="mx-auto" />
            <h1 className="serif text-2xl mt-3">You've already played</h1>
            <p className="text-sm mt-2" style={{ color: "var(--text-secondary)" }}>{limited.reason}</p>
            {limited.existingCode && (
              <div className="mt-5 p-4 rounded-xl" style={{ background: "var(--surface-alt)" }}>
                <div className="overline">Your active prize · {limited.reward}</div>
                <div className="mono text-2xl mt-1 tracking-wider" style={{ color: "var(--primary)" }} data-testid="existing-code">{limited.existingCode}</div>
                <p className="text-xs mt-2" style={{ color: "var(--text-secondary)" }}>
                  Valid until {limited.expiresAt ? limited.expiresAt.slice(0, 10) : "soon"}.
                </p>
              </div>
            )}
          </motion.div>
        )}
      </div>

      <p className="text-xs mt-6" style={{ color: "var(--text-secondary)" }}>Powered by OmniLocal #1 · {space}</p>
    </div>
  );
}
