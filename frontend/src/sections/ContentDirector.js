import { useEffect, useState, useRef } from "react";
import VideoVault from "@/sections/VideoVault";
import { AskTheCoach } from "@/sections/Coach";
import { getCoachTemplates } from "@/lib/api";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Clapperboard, Sparkles, Video, Share2, Rocket, CheckCircle2, MinusCircle, Loader2, Upload, FileVideo } from "lucide-react";
import { getPrompts, postCopy, postCritic, publishAll, criticUploadInit, criticUploadChunk, criticAnalyze, criticVideoUrl } from "@/lib/api";
import { SectionTitle, Overline, GradeBadge } from "@/components/ui-bits";
import LocalMarketIntel from "@/sections/LocalMarketIntel";
import ContentCalendar from "@/sections/ContentCalendar";
import BrandBrain from "@/sections/BrandBrain";
import StrategyPanel, { OperationalDisclaimer } from "@/sections/StrategyPanel";

const VAULT_IMAGES = {
  "Signature Prep": "https://images.unsplash.com/photo-1765735049473-7cb6466e5b3f?crop=entropy&cs=srgb&fm=jpg&w=600&q=70",
  "Operational Hustle": "https://images.unsplash.com/photo-1772550867139-f1d8bbc555a5?crop=entropy&cs=srgb&fm=jpg&w=600&q=70",
  "Community": "https://images.unsplash.com/photo-1771813156445-1d70dc259856?crop=entropy&cs=srgb&fm=jpg&w=600&q=70",
  "Hero Product": "https://images.unsplash.com/photo-1669109230787-71bdd4699af4?crop=entropy&cs=srgb&fm=jpg&w=600&q=70",
  "Evergreen / Holidays": "https://images.unsplash.com/photo-1776941659512-2c883d0719c5?crop=entropy&cs=srgb&fm=jpg&w=600&q=70",
};

function Draft({ platform, label, text }) {
  return (
    <div className="card p-4" data-testid={`draft-${platform}`}>
      <Overline style={{ color: "var(--primary)" }}>{label || platform}</Overline>
      <p className="text-sm mt-2 whitespace-pre-wrap" style={{ color: "var(--text)" }}>{text}</p>
    </div>
  );
}

function CategoryScore({ label, score }) {
  return (
    <div className="py-4 border-b" style={{ borderColor: "var(--border)" }}>
      <div className="flex items-center gap-3">
        <span className="serif text-xl" style={{ minWidth: 90 }}>{label}</span>
        <GradeBadge grade={score.grade} />
      </div>
      <p className="text-sm mt-2" style={{ color: "var(--text)" }}><b>Critique:</b> {score.critique}</p>
      <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}><b>Fix:</b> {score.recommendation}</p>
    </div>
  );
}

export default function ContentDirector() {
  const [data, setData] = useState(null);
  const [transcript, setTranscript] = useState(
    "Um, so today we're, we're making the the Sunday Gravy Sub, you know, and the secret is the sauce simmers for like six hours, I mean, it's my grandmother's recipe from Naples."
  );
  const [drafts, setDrafts] = useState(null);
  const [report, setReport] = useState(null);
  const [busy, setBusy] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishRes, setPublishRes] = useState(null);
  const [uploadPct, setUploadPct] = useState(0);
  const [uploadState, setUploadState] = useState("idle"); // idle | uploading | analyzing
  const [planCheck, setPlanCheck] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [templateId, setTemplateId] = useState("");
  const [uploadedVideo, setUploadedVideo] = useState(null);
  const [transcriptResult, setTranscriptResult] = useState(null);
  const calendarRef = useRef(null);
  const fileRef = useRef(null);

  useEffect(() => {
    const h = (e) => calendarRef.current && calendarRef.current.refresh(e.detail);
    window.addEventListener("omni-calendar-update", h);
    return () => window.removeEventListener("omni-calendar-update", h);
  }, []);

  useEffect(() => { getPrompts().then(setData).catch(() => {}); }, []);

  const generate = async () => {
    setBusy(true);
    try {
      const res = await postCopy(transcript);
      setDrafts(res.drafts);
      toast.success("Cleaned your words into 3 platform-ready posts");
    } finally { setBusy(false); }
  };

  const grade = async (index, label) => {
    const res = await postCritic(index);
    setReport(res.report);
    setUploadedVideo(null); setTranscriptResult(null);
    toast(`Graded: ${label}`, { description: `Overall: ${res.report.overall}` });
  };

  const onUploadClip = async (file) => {
    if (!file) return;
    setUploadState("uploading"); setUploadPct(0);
    setReport(null); setUploadedVideo(null); setTranscriptResult(null);
    try {
      const { uploadId } = await criticUploadInit(file.name);
      const CHUNK = 1024 * 1024;
      const total = Math.max(1, Math.ceil(file.size / CHUNK));
      for (let i = 0; i < total; i++) {
        await criticUploadChunk(uploadId, i, file.slice(i * CHUNK, (i + 1) * CHUNK));
        setUploadPct(Math.round(((i + 1) / total) * 100));
      }
      setUploadState("analyzing");
      toast.message("Analyzing your clip", { description: "Transcribing audio (Whisper) + inspecting framing (vision AI)…" });
      const res = await criticAnalyze(uploadId, file.name, templateId || null);
      setReport(res.report);
      setPlanCheck(res.planCheck || null);
      setTranscriptResult(res.transcript);
      if (res.videoUrl) setUploadedVideo(criticVideoUrl(res.videoUrl));
      toast.success(`Graded your clip — Overall: ${res.report.overall}`);
    } catch (e) {
      const msg = e?.response?.data?.detail || "Couldn't analyze that clip. Try a short MP4/MOV with sound.";
      toast.error(msg);
    } finally {
      setUploadState("idle"); setUploadPct(0);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const blastAll = async () => {
    setPublishing(true); setPublishRes(null);
    try {
      const caption = drafts ? drafts.instagram : "New from our kitchen";
      const res = await publishAll("hero-clip", caption);
      if (res.status === "pending_approval") {
        toast.info("Sent to owner for approval", { description: res.note });
        return;
      }
      setPublishRes(res);
      if (res.publishedCount === 0) {
        toast.error("No authorized pathways", { description: "Connect platforms in the Ad Engine → Connector first." });
      } else {
        toast.success(`Published to ${res.publishedCount} of ${res.totalPathways} surfaces`, {
          description: `${res.results.filter((r) => r.status === "skipped").length} skipped (not connected)${res.live ? "" : " · demo blast"}`,
        });
      }
    } finally { setPublishing(false); }
  };

  if (!data) return <div className="p-10" style={{ color: "var(--text-secondary)" }}>Loading…</div>;

  return (
    <div className="p-6 md:p-12 max-w-[1200px]">
      <SectionTitle kicker="Module 01 · Content Director"
        title="Film your business once. Turn it into weeks of content."
        subtitle="The cook slinging a sub during the dinner rush beats any polished ad. We capture that authenticity, then multiply it — and tell you the honest truth about what to fix." />

      {/* Today's prompt */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          className="card p-6 lg:col-span-1" style={{ background: "var(--surface-alt)" }} data-testid="prompt-today">
          <Overline style={{ color: "var(--primary)" }}>Today's Shooting Prompt</Overline>
          <h3 className="serif text-2xl mt-2">{data.today?.title || data.daily?.title || "Signature Dish Spotlight"}</h3>
          <p className="text-sm mt-2" style={{ color: "var(--text)" }}>{data.today?.prompt || data.daily?.prompt || "Film a 15-second clip showing the signature preparation behind the counter."}</p>
          <p className="text-xs mt-3 italic" style={{ color: "var(--text-secondary)" }}>{data.today?.guidance || data.daily?.guidance || "Keep the lens close, front-lit, and capture the natural sound."}</p>
        </motion.div>

        {/* Asset vault */}
        <div className="lg:col-span-2">
          <Overline>Brand Asset Vault · filmed once, reused forever</Overline>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-3">
            {(data.assetVault || []).map((a, i) => (
              <motion.div key={a.id} initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.05 }} className="card lift overflow-hidden" data-testid={`vault-${a.id}`}>
                <div className="h-24 bg-cover bg-center" style={{ backgroundImage: `url(${VAULT_IMAGES[a.category] || VAULT_IMAGES["Community"]})` }} />
                <div className="p-3">
                  <div className="text-sm font-semibold leading-tight">{a.title}</div>
                  <div className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>{a.category} · {a.clips} clips</div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      {/* Strategy & Best Practices — governance, pacing, training plaques */}
      <StrategyPanel />

      {/* Local Market Intelligence — informs content + ad direction */}
      <LocalMarketIntel onCalendarChange={(d) => calendarRef.current && calendarRef.current.refresh(d)} />

      {/* Content Calendar — plan weeks ahead */}
      <OperationalDisclaimer />
      <ContentCalendar ref={calendarRef} />

      {/* Distribution pathways */}
      {data.distribution && (
        <div className="card p-6 md:p-8 mt-8" data-testid="distribution-pathways">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <div className="flex items-center gap-2"><Share2 size={18} color="var(--primary)" /><Overline>Distribution Pathways · one film, five surfaces</Overline></div>
              <h3 className="serif text-2xl mt-1">Publish everywhere in one click</h3>
            </div>
            <button className="btn btn-primary" onClick={blastAll} disabled={publishing} data-testid="publish-all-btn">
              {publishing ? <Loader2 size={15} className="inline mr-1 animate-spin" /> : <Rocket size={15} className="inline mr-1" />}
              {publishing ? "Blasting…" : "Publish All"}
            </button>
          </div>
          <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
            Publish-All runs one cycle across every authorized pathway. Connect accounts in the Ad Engine → Connector; unconnected surfaces are skipped automatically.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-4">
            {(data.distribution || []).map((d) => {
              const res = publishRes && publishRes.results?.find((r) => r.platform === d.platform);
              const done = res && res.status === "published";
              const skipped = res && res.status === "skipped";
              return (
                <div key={d.platform} className="p-4 rounded-lg" data-testid={`pathway-${d.platform}`}
                  style={{ border: `1px solid ${done ? "var(--success)" : "var(--border)"}`, opacity: skipped ? 0.55 : 1 }}>
                  <div className="flex items-center justify-between">
                    <div className="font-bold text-sm">{d.label}</div>
                    {done && <CheckCircle2 size={16} color="var(--success)" data-testid={`publish-status-${d.platform}`} />}
                    {skipped && <MinusCircle size={16} color="var(--text-secondary)" data-testid={`publish-status-${d.platform}`} />}
                    {publishing && !res && <Loader2 size={16} className="animate-spin" color="var(--primary)" />}
                  </div>
                  <div className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
                    {done ? "Published ✓" : skipped ? "Skipped · not connected" : `${d.surface} · ${d.contentType}`}
                  </div>
                </div>
              );
            })}
          </div>
          {publishRes && (
            <div className="mt-4 p-3 rounded-lg text-sm" style={{ background: "var(--surface-alt)", color: "var(--text-secondary)" }} data-testid="publish-summary">
              Blast complete — <b style={{ color: "var(--success)" }}>{publishRes.publishedCount} published</b>, {publishRes.totalPathways - publishRes.publishedCount} skipped.
              {!publishRes.live && " (Stubbed — live posting activates once the Unified API key is added.)"}
            </div>
          )}
        </div>
      )}

      {/* Brand Brain — the AI's source of truth */}
      <BrandBrain />

      {/* Speech to copy */}
      <div className="card p-6 md:p-8 mt-8">
        <div className="flex items-center gap-2"><Sparkles size={18} color="var(--primary)" /><Overline>Speech → Copy · powered by Claude Sonnet 4.6</Overline></div>
        <h3 className="serif text-2xl mt-1">Talk. Real AI writes the posts — in your voice.</h3>
        <textarea data-testid="transcript-input" value={transcript} onChange={(e) => setTranscript(e.target.value)}
          rows={4} className="w-full mt-3 p-3 rounded-lg text-sm" style={{ border: "1px solid var(--border)", background: "var(--bg)" }} />
        <button className="btn btn-primary mt-3" onClick={generate} disabled={busy} data-testid="generate-copy-btn">
          {busy ? "Writing…" : "Generate 3 Posts"}
        </button>
        {drafts && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-5">
            <Draft platform="gbp" label="Google Business" text={drafts.gbp} />
            <Draft platform="facebook" label="Facebook" text={drafts.facebook} />
            <Draft platform="instagram" label="Instagram" text={drafts.instagram} />
          </div>
        )}
      </div>

      {/* Brutal Honesty Critic */}
      <div className="card p-6 md:p-8 mt-8">
        <div className="flex items-center gap-2"><Video size={18} color="var(--danger)" /><Overline>The Brutal Honesty Video Critic · real AI analysis</Overline></div>
        <h3 className="serif text-2xl mt-1">Upload a clip. Real AI tells you if it sucks — and how to fix it.</h3>
        <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
          We transcribe your audio (Whisper), inspect your framing & lighting (vision AI), and measure your real sound levels — then grade the hook, audio and framing.
        </p>

        {/* Optional accountability check against a coach template */}
        <div className="mt-3 flex items-center gap-2 flex-wrap" data-testid="plan-check-row">
          <span className="text-xs" style={{ color: "var(--text-secondary)" }}>Check it against a build plan (optional):</span>
          <select data-testid="plan-check-select" value={templateId}
            onFocus={() => getCoachTemplates().then((d) => setTemplates(d?.templates || [])).catch(() => {})}
            onChange={(e) => setTemplateId(e.target.value)}
            className="rounded-lg border px-2 py-1.5 text-xs"
            style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
            <option value="">No plan — just grade it</option>
            {(templates || []).map((t) => <option key={t.id} value={t.id}>{t.template?.title || t.topic}</option>)}
          </select>
        </div>

        {/* Upload dropzone */}
        <div className="mt-4 p-5 rounded-xl border-2 border-dashed text-center" style={{ borderColor: "var(--border)", background: "var(--surface-alt)" }} data-testid="critic-upload-zone">
          <input ref={fileRef} type="file" accept="video/*" className="hidden" data-testid="critic-file-input"
            onChange={(e) => onUploadClip(e.target.files?.[0])} disabled={uploadState !== "idle"} />
          {uploadState === "idle" && (
            <>
              <FileVideo size={28} color="var(--primary)" className="mx-auto" />
              <p className="text-sm mt-2 font-semibold">Drop a short clip or choose a file (MP4/MOV, up to 80MB)</p>
              <button className="btn btn-primary text-sm mt-3" style={{ padding: "0.5rem 1.2rem" }}
                onClick={() => fileRef.current?.click()} data-testid="critic-upload-btn">
                <Upload size={14} className="inline mr-1" /> Upload your clip
              </button>
            </>
          )}
          {uploadState === "uploading" && (
            <div data-testid="critic-uploading">
              <Loader2 size={24} className="mx-auto animate-spin" color="var(--primary)" />
              <p className="text-sm mt-2">Uploading… {uploadPct}%</p>
              <div className="h-2 rounded-full mt-2 mx-auto max-w-sm" style={{ background: "var(--border)" }}>
                <div className="h-2 rounded-full" style={{ width: `${uploadPct}%`, background: "var(--primary)", transition: "width 0.2s" }} />
              </div>
            </div>
          )}
          {uploadState === "analyzing" && (
            <div data-testid="critic-analyzing">
              <Loader2 size={24} className="mx-auto animate-spin" color="var(--primary)" />
              <p className="text-sm mt-2 font-semibold">Analyzing — transcribing audio + inspecting framing…</p>
              <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>Real AI takes a few seconds. Worth the wait.</p>
            </div>
          )}
        </div>

        {/* Sample clips */}
        <p className="text-xs mt-4 mb-2" style={{ color: "var(--text-secondary)" }}>…or grade one of our sample scenarios:</p>
        <div className="flex flex-wrap gap-2">
          {(data.sampleVideos || []).map((v) => (
            <button key={v.index} className="btn btn-ghost text-sm" onClick={() => grade(v.index, v.label)}
              data-testid={`grade-video-${v.index}`}>
              <Clapperboard size={14} className="inline mr-1" /> {v.label}
            </button>
          ))}
        </div>

        {uploadedVideo && (
          <div className="mt-5 grid grid-cols-1 md:grid-cols-[220px_1fr] gap-4" data-testid="uploaded-analysis">
            <video src={uploadedVideo} controls className="rounded-lg w-full" style={{ maxHeight: 320, background: "#000" }} data-testid="uploaded-video" />
            <div className="p-4 rounded-lg" style={{ background: "var(--surface-alt)" }}>
              <Overline>Transcript (Whisper)</Overline>
              <p className="text-sm mt-1 italic" style={{ color: "var(--text)" }} data-testid="critic-transcript">
                {transcriptResult ? `“${transcriptResult}”` : "No speech detected in this clip."}
              </p>
            </div>
          </div>
        )}

        {report && planCheck && (
          <div className="mt-4 p-4 rounded-lg" data-testid="plan-check-result"
            style={{ background: planCheck.verdict === "ON-PLAN" ? "#EAFAF1" : planCheck.verdict === "CLOSE" ? "#FEF5E7" : "#FDEDEC" }}>
            <div className="flex items-center gap-2">
              <span className="overline">Plan Check</span>
              <span className="text-xs font-bold px-2 py-0.5 rounded" data-testid="plan-check-verdict"
                style={{ background: "var(--surface)", color: planCheck.verdict === "ON-PLAN" ? "#1E8449" : planCheck.verdict === "CLOSE" ? "#B9770E" : "#C0392B" }}>
                {planCheck.verdict}
              </span>
            </div>
            {planCheck.matched?.length > 0 && (
              <div className="text-xs mt-2" style={{ color: "#1E8449" }}>✓ {planCheck.matched.join(" · ")}</div>
            )}
            {planCheck.fix?.length > 0 && (
              <div className="mt-2 space-y-1">
                {planCheck.fix.map((f, i) => <div key={i} className="text-sm">→ {f}</div>)}
              </div>
            )}
          </div>
        )}

        {report && (
          <motion.div key={report.filename} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className="mt-5 p-5 rounded-lg" style={{ background: "var(--surface-alt)" }} data-testid="critic-report">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="mono text-sm">{report.filename}</span>
              <div className="flex items-center gap-2"><span className="overline">Overall</span><GradeBadge grade={report.overall} size="lg" /></div>
            </div>
            {report.measured && (
              <div className="mono text-xs mt-1" style={{ color: "var(--text-secondary)" }} data-testid="critic-measured">
                {report.measured.durationSec}s · {report.measured.wordsPerMinute} wpm · {report.measured.framesAnalyzed} frames analyzed{report.measured.hasAudio ? "" : " · no audio"}
              </div>
            )}
            <div className="mt-2">
              <CategoryScore label="Hook" score={report.hook} />
              <CategoryScore label="Audio" score={report.audio} />
              <CategoryScore label="Framing" score={report.framing} />
            </div>
          </motion.div>
        )}
      </div>

      <AskTheCoach />

      <VideoVault />
    </div>
  );
}
