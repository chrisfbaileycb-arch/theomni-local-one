import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Database, Download, Upload, RotateCcw, HardDrive } from "lucide-react";
import { getHealth, backupUrl, restoreBackup, resetMemoryCore } from "@/lib/api";
import { Overline } from "@/components/ui-bits";

// Owner-facing view of the memory core: what is stored, when it was last saved,
// plus backup / restore / reset.
export const DataCoreCard = ({ onChanged }) => {
  const [health, setHealth] = useState(null);
  const [busy, setBusy] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const fileRef = useRef(null);

  const load = () => getHealth().then(setHealth).catch(() => {});
  useEffect(() => { load(); }, []);

  const restore = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      const snapshot = JSON.parse(await file.text());
      const r = await restoreBackup(snapshot);
      toast.success(`Backup restored - ${r.collections} collections loaded`, { description: "Reloading so every panel shows the restored data." });
      await load();
      onChanged && onChanged();
      setTimeout(() => window.location.reload(), 900);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "That file is not an OmniLocal backup");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const reset = async () => {
    setConfirmReset(false);
    setBusy(true);
    try {
      await resetMemoryCore();
      toast.success("Memory core reset to the demo seed", { description: "Reloading so every panel shows the seed data." });
      await load();
      onChanged && onChanged();
      setTimeout(() => window.location.reload(), 900);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not reset");
    } finally { setBusy(false); }
  };

  const st = health?.storage;
  return (
    <div className="card p-6" data-testid="data-core-card">
      <div className="flex items-center gap-2 mb-3">
        <Database size={16} style={{ color: "var(--primary)" }} />
        <Overline>Memory Core · Data &amp; Backups</Overline>
      </div>
      <p className="text-xs mb-3" style={{ color: "var(--text-secondary)" }}>
        Everything the engine learns is saved to disk on every change and survives restarts and deploys.
        Download a backup before big changes; restore it here if you ever need to roll back.
      </p>
      {st && (
        <div className="text-xs mb-4 space-y-1 mono" data-testid="data-core-status" style={{ color: "var(--text-secondary)" }}>
          <div><HardDrive size={11} className="inline mr-1" />{st.driver} · {st.collections} collections · {st.writes} saves this session</div>
          <div>Last saved: {st.lastFlushAt ? st.lastFlushAt.slice(0, 19).replace("T", " ") + " UTC" : "nothing changed yet"}</div>
          <div>{health.counts.members} members · {health.counts.redemptions} claim codes · {health.counts.vault} vault clips</div>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <a data-testid="data-core-backup-btn" className="btn btn-primary text-sm flex items-center gap-1.5" href={backupUrl()} download>
          <Download size={13} /> Download backup
        </a>
        <label data-testid="data-core-restore-btn" className="btn btn-ghost text-sm flex items-center gap-1.5 cursor-pointer">
          <Upload size={13} /> {busy ? "Working…" : "Restore backup"}
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" disabled={busy}
            onChange={(e) => restore(e.target.files?.[0])} />
        </label>
        {confirmReset ? (
          <>
            <button data-testid="data-core-confirm-reset-btn" onClick={reset} disabled={busy} className="btn btn-primary text-sm">
              Yes, wipe live data
            </button>
            <button data-testid="data-core-cancel-reset-btn" onClick={() => setConfirmReset(false)} className="btn btn-ghost text-sm">Cancel</button>
          </>
        ) : (
          <button data-testid="data-core-reset-btn" onClick={() => setConfirmReset(true)} disabled={busy}
            className="btn btn-ghost text-sm flex items-center gap-1.5">
            <RotateCcw size={13} /> Reset to demo seed
          </button>
        )}
      </div>
    </div>
  );
};
