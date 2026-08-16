import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Clapperboard, Star, Trash2, Upload, CheckCircle2, Circle, Plus, Film } from "lucide-react";
import { getVault, vaultSave, vaultDelete, vaultFeature, vaultVideoUrl, criticUploadInit, criticUploadChunk } from "@/lib/api";
import { Overline } from "@/components/ui-bits";

const CAT_LABEL = { tour: "Tour", menu: "Menu", kitchen: "Kitchen", intro: "Your Story", greeting: "Greeting", rewards: "Rewards", campaign: "Campaign" };

export const VideoVault = () => {
  const [vault, setVault] = useState(null);
  const [uploading, setUploading] = useState(null); // promptId | "custom"
  const [pct, setPct] = useState(0);
  const [customTitle, setCustomTitle] = useState("");
  const customFileRef = useRef(null);

  const load = () => getVault().then(setVault).catch(() => {});
  useEffect(() => { load(); }, []);

  const upload = async (file, promptId, title) => {
    if (!file) return;
    setUploading(promptId || "custom"); setPct(0);
    try {
      const { uploadId } = await criticUploadInit(file.name);
      const CHUNK = 1024 * 1024;
      const total = Math.max(1, Math.ceil(file.size / CHUNK));
      for (let i = 0; i < total; i++) {
        await criticUploadChunk(uploadId, i, file.slice(i * CHUNK, (i + 1) * CHUNK));
        setPct(Math.round(((i + 1) / total) * 95));
      }
      await vaultSave(uploadId, file.name, promptId || null, title || null);
      toast.success("Saved to your vault", { description: "Raw and real — exactly right." });
      setCustomTitle("");
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Upload failed. Try a shorter MP4/MOV.");
    } finally {
      setUploading(null); setPct(0);
    }
  };

  const remove = async (id) => {
    await vaultDelete(id);
    toast("Removed from vault");
    await load();
  };

  const feature = async (id) => {
    const r = await vaultFeature(id);
    toast.success(r.featured ? "Featured" : "Unfeatured", { description: r.note });
    await load();
  };

  if (!vault) return null;

  const VideoCell = ({ v, promptId }) => (
    <div className="mt-3">
      <video src={vaultVideoUrl(v.id)} controls className="w-full rounded-lg" style={{ maxHeight: 180, background: "#000" }} />
      <div className="flex items-center gap-2 mt-2">
        <button data-testid={`vault-feature-${promptId || v.id}`} onClick={() => feature(v.id)}
          className="btn btn-ghost text-xs flex items-center gap-1" title="Feature in the 30-day flow">
          <Star size={12} fill={v.featured ? "var(--primary)" : "none"} style={{ color: "var(--primary)" }} />
          {v.featured ? "Featured" : "Feature"}
        </button>
        <button data-testid={`vault-delete-${promptId || v.id}`} onClick={() => remove(v.id)}
          className="btn btn-ghost text-xs flex items-center gap-1">
          <Trash2 size={12} /> Remove
        </button>
      </div>
    </div>
  );

  return (
    <div className="card p-6 md:p-8 mt-4" data-testid="video-vault">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2"><Clapperboard size={18} color="var(--primary)" /><Overline>Onboarding Video Vault · film once, use forever</Overline></div>
        <span className="text-xs font-bold" data-testid="vault-progress" style={{ color: "var(--text-secondary)" }}>
          {vault.capturedCount}/{vault.totalPrompts} captured · {vault.totalVideos} in vault
        </span>
      </div>
      <h3 className="serif text-2xl mt-1">Point your phone and press record</h3>
      <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
        Raw beats polished — too polished gets scrolled past like AI. These clips feed your welcome emails,
        the 30-day flow, birthdays and holidays, so there's always content even when there isn't.
        {vault.featured && <> Currently featured: <b>{vault.featured.title}</b>.</>}
      </p>

      <div className="grid md:grid-cols-2 gap-4 mt-5">
        {vault.prompts.map((p) => (
          <motion.div key={p.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            className="p-4 rounded-lg border" data-testid={`vault-prompt-${p.id}`}
            style={{ borderColor: p.video ? "var(--success, #27AE60)" : "var(--border)",
                     background: p.video ? "var(--surface-alt)" : "transparent" }}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-1.5 text-sm font-bold">
                  {p.video ? <CheckCircle2 size={14} style={{ color: "var(--success, #27AE60)" }} /> : <Circle size={14} style={{ color: "var(--border)" }} />}
                  {p.title}
                </div>
                <div className="overline mt-1" style={{ fontSize: "0.5rem" }}>{CAT_LABEL[p.category] || p.category}</div>
              </div>
            </div>
            <p className="text-xs mt-2" style={{ color: "var(--text-secondary)" }}>{p.direction}</p>
            {p.video ? (
              <VideoCell v={p.video} promptId={p.id} />
            ) : (
              <label className="btn btn-ghost text-xs mt-3 inline-flex items-center gap-1.5 cursor-pointer" data-testid={`vault-upload-${p.id}`}>
                {uploading === p.id ? `Uploading ${pct}%…` : (<><Upload size={12} /> Upload from phone</>)}
                <input type="file" accept="video/*" className="hidden" disabled={!!uploading}
                  onChange={(e) => upload(e.target.files?.[0], p.id, p.title)} />
              </label>
            )}
          </motion.div>
        ))}

        {/* Custom / campaign videos */}
        <div className="p-4 rounded-lg border border-dashed" data-testid="vault-custom-card" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center gap-1.5 text-sm font-bold"><Plus size={14} style={{ color: "var(--primary)" }} /> Campaign video</div>
          <p className="text-xs mt-2" style={{ color: "var(--text-secondary)" }}>
            A new dish, four weeks of Mother's Day specials — upload it, hit the star, and it leads the 30-day flow.
          </p>
          <input data-testid="vault-custom-title" value={customTitle} onChange={(e) => setCustomTitle(e.target.value)}
            placeholder="Title, e.g. Mother's Day Special" className="w-full mt-3 rounded-lg border px-3 py-2 text-xs"
            style={{ borderColor: "var(--border)", background: "var(--surface)" }} />
          <label className="btn btn-primary text-xs mt-2 inline-flex items-center gap-1.5 cursor-pointer" data-testid="vault-custom-upload">
            {uploading === "custom" ? `Uploading ${pct}%…` : (<><Upload size={12} /> Upload video</>)}
            <input ref={customFileRef} type="file" accept="video/*" className="hidden" disabled={!!uploading || !customTitle.trim()}
              onChange={(e) => upload(e.target.files?.[0], null, customTitle)} />
          </label>
        </div>
      </div>

      {vault.custom.length > 0 && (
        <div className="mt-5">
          <Overline>Campaign Library</Overline>
          <div className="grid md:grid-cols-3 gap-4 mt-2">
            {vault.custom.map((v) => (
              <div key={v.id} className="p-3 rounded-lg border" data-testid={`vault-custom-${v.id}`} style={{ borderColor: "var(--border)" }}>
                <div className="flex items-center gap-1.5 text-sm font-bold"><Film size={13} style={{ color: "var(--primary)" }} /> {v.title}</div>
                <VideoCell v={v} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default VideoVault;
