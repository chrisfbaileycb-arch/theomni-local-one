import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  KeyRound, RefreshCw, Copy, Check, UserX, UserCheck, Crown,
  CheckCircle2, XCircle, Clock, Inbox, ShieldCheck,
} from "lucide-react";
import {
  getTeam, rotateAccessCode, revokeMember, restoreMember,
  getApprovals, approveRequest, rejectRequest,
} from "@/lib/api";
import { SectionTitle, Overline } from "@/components/ui-bits";
import { useAuth } from "@/lib/AuthContext";
import { MasterPasswordCard } from "@/sections/MasterPassword";

const TYPE_LABELS = { publish_all: "Publish-All Blast", send_welcome: "Welcome Email" };
const CHIP = {
  pending: { bg: "#FEF5E7", fg: "#B9770E", label: "Pending" },
  approved: { bg: "#EAFAF1", fg: "#1E8449", label: "Approved" },
  rejected: { bg: "#FDEDEC", fg: "#C0392B", label: "Rejected" },
  active: { bg: "#EAFAF1", fg: "#1E8449", label: "Active" },
  revoked: { bg: "#FDEDEC", fg: "#C0392B", label: "Revoked" },
  lockedOut: { bg: "#FEF5E7", fg: "#B9770E", label: "Locked out" },
};

function Chip({ kind, testId }) {
  const c = CHIP[kind] || CHIP.pending;
  return (
    <span data-testid={testId} className="text-xs font-bold px-2 py-1 rounded"
      style={{ background: c.bg, color: c.fg }}>{c.label}</span>
  );
}

export default function Team() {
  const { user } = useAuth();
  const isOwner = user?.role === "owner";
  const [team, setTeam] = useState(null);
  const [approvals, setApprovals] = useState(null);
  const [copied, setCopied] = useState(false);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    try {
      const jobs = [getApprovals().then(setApprovals)];
      if (isOwner) jobs.push(getTeam().then(setTeam));
      await Promise.all(jobs);
    } catch {}
  }, [isOwner]);

  useEffect(() => { load(); }, [load]);

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(team.accessCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast(team.accessCode, { description: "Copy blocked by browser — here's the code." });
    }
  };

  const rotate = async () => {
    setConfirmRotate(false);
    const r = await rotateAccessCode();
    toast.success("Access code rotated", { description: r.note });
    await load();
  };

  const doRevoke = async (id) => {
    setBusyId(id);
    try { await revokeMember(id); toast.success("Member revoked — their sessions were killed instantly"); await load(); }
    finally { setBusyId(null); }
  };

  const doRestore = async (id) => {
    setBusyId(id);
    try { await restoreMember(id); toast.success("Member restored — they must re-enter the current code"); await load(); }
    finally { setBusyId(null); }
  };

  const decide = async (id, ok) => {
    setBusyId(id);
    try {
      if (ok) {
        const r = await approveRequest(id);
        const pub = r.result?.publishedCount;
        toast.success("Approved & executed", {
          description: pub !== undefined ? `Published to ${pub} surfaces` : "Action executed live.",
        });
      } else {
        await rejectRequest(id);
        toast("Request rejected");
      }
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not process");
    } finally { setBusyId(null); }
  };

  const pending = (approvals?.approvals || []).filter((a) => a.status === "pending");
  const history = (approvals?.approvals || []).filter((a) => a.status !== "pending");

  return (
    <div className="p-6 md:p-12 max-w-[1200px]" data-testid="team-page">
      <SectionTitle kicker="Governance · Team & Approvals"
        title={isOwner ? "You hold the final say." : "Your submissions & team access"}
        subtitle={isOwner
          ? "Give teammates a TR access code, watch what they build, and nothing publishes until you approve it. Rotate the code any time to instantly lock out trial users."
          : "Anything you publish goes to the account owner first. Track the status of every submission here."} />

      {isOwner && team && (
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          {/* Access code */}
          <div className="card p-6" data-testid="access-code-card">
            <div className="flex items-center gap-2 mb-3">
              <KeyRound size={16} style={{ color: "var(--primary)" }} />
              <Overline>Team Access Code</Overline>
            </div>
            <div className="mono text-2xl font-bold tracking-widest mb-1" data-testid="access-code-value">
              {team.accessCode}
            </div>
            <p className="text-xs mb-4" style={{ color: "var(--text-secondary)" }}>
              Share this with a teammate to unlock a seat. Rotating it instantly locks out everyone
              until they enter the new code — perfect for ending a trial.
            </p>
            <div className="flex gap-2">
              <button data-testid="copy-code-btn" onClick={copyCode} className="btn btn-ghost flex items-center gap-2 text-sm">
                {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copied" : "Copy"}
              </button>
              {confirmRotate ? (
                <>
                  <button data-testid="confirm-rotate-btn" onClick={rotate} className="btn btn-primary text-sm">
                    Yes, lock everyone out
                  </button>
                  <button data-testid="cancel-rotate-btn" onClick={() => setConfirmRotate(false)} className="btn btn-ghost text-sm">
                    Cancel
                  </button>
                </>
              ) : (
                <button data-testid="rotate-code-btn" onClick={() => setConfirmRotate(true)}
                  className="btn btn-ghost flex items-center gap-2 text-sm">
                  <RefreshCw size={14} /> Rotate code
                </button>
              )}
            </div>
          </div>

          {/* Members */}
          <div className="card p-6" data-testid="members-card">
            <div className="flex items-center justify-between mb-3">
              <Overline>Team Seats</Overline>
              <span className="text-xs font-bold" data-testid="seats-used" style={{ color: "var(--text-secondary)" }}>
                {team.seatsUsed}/{team.maxMembers} seats used
              </span>
            </div>
            <div className="space-y-3">
              {team.members.map((m) => (
                <div key={m.user_id} className="flex items-center gap-3" data-testid={`member-row-${m.email}`}>
                  {m.picture
                    ? <img src={m.picture} alt="" className="w-8 h-8 rounded-full" referrerPolicy="no-referrer" />
                    : <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                        style={{ background: "var(--surface-alt)" }}>{(m.name || m.email)[0]?.toUpperCase()}</div>}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate flex items-center gap-1.5">
                      {m.name || m.email}
                      {m.role === "owner" && <Crown size={12} style={{ color: "var(--primary)" }} />}
                    </div>
                    <div className="text-xs truncate" style={{ color: "var(--text-secondary)" }}>{m.email}</div>
                  </div>
                  {m.role === "owner"
                    ? <span className="text-xs font-bold" style={{ color: "var(--primary)" }}>Owner</span>
                    : <>
                        <Chip kind={m.status === "revoked" ? "revoked" : m.lockedOut ? "lockedOut" : m.status === "active" ? "active" : "pending"} />
                        {m.status === "revoked" ? (
                          <button data-testid={`restore-${m.email}`} disabled={busyId === m.user_id}
                            onClick={() => doRestore(m.user_id)} className="btn btn-ghost text-xs flex items-center gap-1">
                            <UserCheck size={12} /> Restore
                          </button>
                        ) : (
                          <button data-testid={`revoke-${m.email}`} disabled={busyId === m.user_id}
                            onClick={() => doRevoke(m.user_id)} className="btn btn-ghost text-xs flex items-center gap-1">
                            <UserX size={12} /> Revoke
                          </button>
                        )}
                      </>}
                </div>
              ))}
              {team.members.length === 1 && (
                <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                  No team members yet. Send them the access code above — they sign in with Google, enter the code, and get a seat.
                </p>
              )}
            </div>
          </div>

          {/* Master password */}
          <MasterPasswordCard />
        </div>
      )}

      {!isOwner && (
        <div className="card p-6 mb-8 flex items-start gap-3" data-testid="member-info-card">
          <ShieldCheck size={18} style={{ color: "var(--primary)", flexShrink: 0, marginTop: 2 }} />
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            You can build content, plans, games and programs freely. When you hit publish or send,
            it lands here as a request — the account owner approves it before anything goes live.
          </p>
        </div>
      )}

      {/* Approvals */}
      <div className="card p-6" data-testid="approvals-card">
        <div className="flex items-center gap-2 mb-4">
          <Inbox size={16} style={{ color: "var(--primary)" }} />
          <Overline>{isOwner ? "Awaiting Your Approval" : "My Submissions"}</Overline>
          {pending.length > 0 && (
            <span className="text-xs font-bold px-2 py-0.5 rounded-full" data-testid="pending-count"
              style={{ background: "var(--primary)", color: "#fff" }}>{pending.length}</span>
          )}
        </div>

        {pending.length === 0 && (
          <p className="text-sm mb-2" data-testid="no-pending" style={{ color: "var(--text-secondary)" }}>
            {isOwner ? "Nothing waiting on you. Your team's publish requests will appear here." : "No pending submissions."}
          </p>
        )}

        <div className="space-y-3">
          {pending.map((a) => (
            <div key={a.id} className="p-4 rounded-lg border flex flex-wrap items-center gap-3"
              data-testid={`approval-${a.id}`} style={{ borderColor: "var(--border)", background: "var(--surface-alt)" }}>
              <Clock size={16} style={{ color: "#B9770E", flexShrink: 0 }} />
              <div className="flex-1 min-w-[200px]">
                <div className="text-sm font-bold">{TYPE_LABELS[a.type] || a.type}</div>
                <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
                  {a.summary} · by {a.requestedByName} · {new Date(a.createdAt).toLocaleString()}
                </div>
              </div>
              {isOwner ? (
                <div className="flex gap-2">
                  <button data-testid={`approve-${a.id}`} disabled={busyId === a.id} onClick={() => decide(a.id, true)}
                    className="btn btn-primary text-sm flex items-center gap-1.5">
                    <CheckCircle2 size={14} /> Approve & run
                  </button>
                  <button data-testid={`reject-${a.id}`} disabled={busyId === a.id} onClick={() => decide(a.id, false)}
                    className="btn btn-ghost text-sm flex items-center gap-1.5">
                    <XCircle size={14} /> Reject
                  </button>
                </div>
              ) : <Chip kind="pending" />}
            </div>
          ))}
        </div>

        {history.length > 0 && (
          <>
            <div className="mt-6 mb-3"><Overline>History</Overline></div>
            <div className="space-y-2">
              {history.slice(0, 10).map((a) => (
                <div key={a.id} className="flex flex-wrap items-center gap-3 text-sm py-2 border-b"
                  data-testid={`history-${a.id}`} style={{ borderColor: "var(--border)" }}>
                  <Chip kind={a.status} />
                  <span className="font-semibold">{TYPE_LABELS[a.type] || a.type}</span>
                  <span className="text-xs flex-1" style={{ color: "var(--text-secondary)" }}>
                    {a.summary} · by {a.requestedByName}
                    {a.decidedBy ? ` · decided by ${a.decidedBy}` : ""}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
