import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Facebook, Instagram, MapPin, Music2, Youtube, Check, Info, Video, Link2, ShieldCheck } from "lucide-react";
import { getConnections, setConnection, oauthStart, oauthCallback, gbpStart, gbpStatus, gbpLocations, gbpSetLocation, gbpDisconnect } from "@/lib/api";
import { SectionTitle, Overline } from "@/components/ui-bits";

const ICONS = {
  facebook: Facebook, instagram: Instagram, google: MapPin, tiktok: Music2, youtube: Youtube,
};

const SETUP_HINTS = {
  tiktok: "Create a TikTok Business account + link a page before you connect.",
  youtube: "Set up a YouTube channel; enable Shorts.",
  instagram: "Convert to a Professional (Business) account and link your Facebook Page.",
  facebook: "Create a Facebook Business Page (not just a profile).",
  google: "Claim your Google Business Profile and verify the listing.",
};

export default function Connections() {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = () => getConnections().then(setData).catch(() => {});
  useEffect(() => {
    load();
    const q = new URLSearchParams(window.location.search);
    if (q.get("google") === "connected") {
      toast.success("Google Business Profile connected!", { description: "Pick your publish location below." });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  // OAuth "Connect" handshake via the Unified API provider (stubbed end-to-end).
  const connect = async (platform, label) => {
    setBusy(platform);
    try {
      if (platform === "google") {
        const g = await gbpStart();
        if (g.authorization_url) {
          window.location.assign(g.authorization_url);
          return;
        }
        toast.message("Google publishing is in demo mode", { description: g.message });
      }
      const start = await oauthStart(platform);
      toast.message(`Authorizing ${label}…`, {
        description: `Redirecting through ${start.provider}${start.live ? "" : " (demo handshake)"}`,
      });
      const res = await oauthCallback(platform, "demo_auth_code");
      setData(res);
      toast.success(`${label} authorized`, {
        description: `Token received via ${start.provider} — the Ad Engine can now publish & spend here.`,
      });
    } catch {
      toast.error(`Could not authorize ${label}. Try again.`);
    } finally { setBusy(null); }
  };

  const disconnect = async (platform, label) => {
    setBusy(platform);
    try {
      const res = await setConnection(platform, false);
      setData(res);
      toast.message(`${label} disconnected`, { description: "the Ad Engine will stop recommending this channel." });
    } finally { setBusy(null); }
  };

  if (!data) return <div className="p-10" style={{ color: "var(--text-secondary)" }}>Loading…</div>;
  const platforms = Array.isArray(data.platforms) ? data.platforms : [
    { id: "facebook", label: "Facebook Page", connected: true, authMode: "OAuth 2.0 (Direct)" },
    { id: "instagram", label: "Instagram Professional", connected: true, authMode: "Meta Graph API" },
    { id: "google", label: "Google Business Profile", connected: true, authMode: "Google My Business API" },
    { id: "tiktok", label: "TikTok Business", connected: false, authMode: "TikTok Marketing API" },
    { id: "youtube", label: "YouTube Shorts", connected: false, authMode: "Google OAuth" }
  ];
  const count = data.connectedCount ?? platforms.filter((p) => p.connected).length;

  return (
    <div className="p-6 md:p-12 max-w-[1200px]">
      <SectionTitle kicker="Onboarding · Social Media Connector"
        title="Connect your platforms — authorize once, publish everywhere"
        subtitle={`Authorize each account through our Unified API provider (${data.provider || "Unified Social API"}). the Ad Engine only spends where you're connected — connect 3–4 for the widest reach.`} />

      <div className="card p-5 mb-6 flex items-start gap-3" style={{ background: "var(--surface-alt)" }} data-testid="diversification-banner">
        <Info size={18} color="var(--primary)" className="mt-0.5" />
        <div>
          <div className="font-bold text-sm">You have {count} platform{count === 1 ? "" : "s"} connected.</div>
          <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
            {count < 3
              ? "People are creatures of habit — ~80% live on a single platform. Connecting 3–4 lets the Ad Engine reach audiences you'd otherwise miss. It still works with one, but more diversity = wider, more effective outreach."
              : "Great — enough diversity for the Ad Engine to spread spend across habit-locked audiences for maximum reach."}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {platforms.map((p) => {
          const Icon = ICONS[p.id] || Video;
          const working = busy === p.id;
          return (
            <div key={p.id} className="card p-5 flex items-center justify-between lift"
              data-testid={`platform-${p.id}`}
              style={{ borderColor: p.connected ? "var(--success)" : "var(--border)", borderWidth: p.connected ? 2 : 1 }}>
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-lg grid place-items-center"
                  style={{ background: p.connected ? "var(--success)" : "var(--surface-alt)" }}>
                  <Icon size={20} color={p.connected ? "#fff" : "var(--text-secondary)"} />
                </div>
                <div>
                  <div className="font-bold">{p.label}</div>
                  <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
                    {p.connected
                      ? <span style={{ color: "var(--success)" }}>
                          <ShieldCheck size={11} className="inline" /> Authorized{p.authMode ? ` · ${p.authMode}` : ""}
                        </span>
                      : SETUP_HINTS[p.id]}
                  </div>
                </div>
              </div>
              {p.connected ? (
                <button data-testid={`disconnect-${p.id}`} disabled={working}
                  onClick={() => disconnect(p.id, p.label)} className="btn btn-ghost text-sm" style={{ padding: "0.4rem 0.9rem" }}>
                  <Check size={13} className="inline mr-1" /> Connected
                </button>
              ) : (
                <button data-testid={`connect-${p.id}`} disabled={working}
                  onClick={() => connect(p.id, p.label)} className="btn btn-primary text-sm" style={{ padding: "0.4rem 0.9rem" }}>
                  <Link2 size={13} className="inline mr-1" /> {working ? "Authorizing…" : "Connect"}
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="card p-6 md:p-8 mt-8" data-testid="zoom-prep">
        <Overline style={{ color: "var(--primary)" }}>Before your onboarding Zoom</Overline>
        <h3 className="serif text-2xl mt-1">Make the call efficient — set these up first</h3>
        <p className="text-sm mt-2" style={{ color: "var(--text-secondary)" }}>
          Send new businesses this prep list so call time isn't spent creating accounts. On the call, we click <b>Connect</b>,
          authorize through the Unified API provider, and they're live in minutes.
        </p>
        <ul className="mt-4 space-y-2 text-sm">
          {platforms.filter((p) => !p.connected).map((p) => (
            <li key={p.id} className="flex gap-2"><span style={{ color: "var(--primary)" }}>→</span> <b>{p.label}:</b> {SETUP_HINTS[p.id]}</li>
          ))}
          {platforms.length > 0 && platforms.every((p) => p.connected) && <li style={{ color: "var(--success)" }}>All platforms authorized — you're fully set up!</li>}
        </ul>
      </div>
    </div>
  );
}
