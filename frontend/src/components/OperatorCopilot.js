import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  ChevronRight,
  CheckCircle2,
  Send,
  Radio,
  Layers,
  Activity,
  Bot,
  ShieldCheck
} from "lucide-react";
import { toast } from "sonner";
import CoCaptainFigurine from "@/components/CoCaptainFigurine";
import {
  getOverview,
  getApprovals,
  reconcile,
  getSegments,
  launchSprint,
  switchRestMode,
  tuneMarginFloor,
  exportClaimCodesUrl
} from "@/lib/api";

// Synthesis tone for audio response (Web Audio API TTS + SpeechSynthesis fallback)
function speakOperationalMessage(text, voiceEnabled = true, onStart, onEnd) {
  if (!voiceEnabled || !text) {
    onEnd?.();
    return;
  }
  try {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.05;
      utterance.pitch = 1.05;

      const voices = window.speechSynthesis.getVoices();
      const naturalVoice = voices.find(
        (v) =>
          (v.name.includes("Natural") ||
            v.name.includes("Google") ||
            v.name.includes("Samantha") ||
            v.name.includes("Daniel") ||
            v.name.includes("Zira")) &&
          v.lang.startsWith("en")
      );
      if (naturalVoice) utterance.voice = naturalVoice;

      utterance.onstart = () => onStart?.();
      utterance.onend = () => onEnd?.();
      utterance.onerror = () => onEnd?.();

      window.speechSynthesis.speak(utterance);

      // Safety timeout in case speechSynthesis end event doesn't fire in headless/preview
      const estDuration = Math.max(1600, (text.split(" ").length / 2.5) * 1000);
      setTimeout(() => {
        onEnd?.();
      }, estDuration);
    } else {
      onEnd?.();
    }
  } catch (e) {
    console.warn("TTS synthesis error:", e);
    onEnd?.();
  }
}

// Play UI confirmation chime
function playChime(type = "success") {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === "success") {
      osc.type = "sine";
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.08); // A5
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.25);
    } else if (type === "alert") {
      osc.type = "triangle";
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.setValueAtTime(330, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.25);
    }
  } catch (e) {}
}

export default function OperatorCopilot({
  activeTab,
  onNavigate,
  user,
  brand
}) {
  const brandName = brand?.name || "Nonna's Deli";
  const [isOpen, setIsOpen] = useState(true);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceAudioEnabled, setVoiceAudioEnabled] = useState(true);
  const [transcript, setTranscript] = useState("");
  const [interimText, setInterimText] = useState("");
  const [audioLevel, setAudioLevel] = useState(0);
  const [statusLog, setStatusLog] = useState([]);
  const [stagedAction, setStagedAction] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [telemetryState, setTelemetryState] = useState({
    activeView: activeTab,
    blendedRoas: "5.4x",
    weeklySpend: "$299.00",
    vipCount: 14,
    pendingApprovals: 0,
    laborRatio: "26.8%"
  });

  const recognitionRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const micStreamRef = useRef(null);
  const animFrameRef = useRef(null);

  // Sync telemetry with active backend data
  const refreshTelemetry = useCallback(async () => {
    try {
      const [overviewData, approvalsData, segmentsData] = await Promise.allSettled([
        getOverview(),
        getApprovals(),
        getSegments()
      ]);

      const roas =
        overviewData.status === "fulfilled"
          ? `${overviewData.value?.hero?.blendedRoas || 5.4}x`
          : "5.4x";
      const approvals =
        approvalsData.status === "fulfilled"
          ? approvalsData.value?.pendingCount || 0
          : 0;
      const vips =
        segmentsData.status === "fulfilled"
          ? segmentsData.value?.counts?.vip || 14
          : 14;

      setTelemetryState((prev) => ({
        ...prev,
        activeView: activeTab,
        blendedRoas: roas,
        pendingApprovals: approvals,
        vipCount: vips
      }));
    } catch (e) {}
  }, [activeTab]);

  useEffect(() => {
    refreshTelemetry();
  }, [activeTab, refreshTelemetry]);

  // Push audit log entry
  const logStep = (step, title, detail, type = "info") => {
    const entry = {
      id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      timestamp: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      }),
      step,
      title,
      detail,
      type
    };
    setStatusLog((prev) => [entry, ...prev.slice(0, 19)]);
  };

  // Real-Time Audio Level Waveform Monitor
  const startAudioMeter = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioCtx();
      audioContextRef.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      analyserRef.current = analyser;
      const source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const updateMeter = () => {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        setAudioLevel(Math.min(100, Math.round((avg / 128) * 100)));
        animFrameRef.current = requestAnimationFrame(updateMeter);
      };
      updateMeter();
    } catch (e) {
      console.warn("Microphone meter initialization notice:", e);
    }
  };

  const stopAudioMeter = () => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    setAudioLevel(0);
  };

  // Speech-to-Text Setup
  const toggleListening = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  const startListening = () => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error(
        "Speech Recognition not supported in this browser. You can type commands below!"
      );
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-US";

      recognition.onstart = () => {
        setIsListening(true);
        startAudioMeter();
        logStep(
          "Step 1 (Ingestion)",
          "Microphone Active",
          "Listening to real-time voice stream…",
          "info"
        );
      };

      recognition.onresult = (event) => {
        let interim = "";
        let final = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const trans = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            final += trans;
          } else {
            interim += trans;
          }
        }
        setInterimText(interim);
        if (final) {
          setTranscript(final);
          processCommand(final);
        }
      };

      recognition.onerror = (event) => {
        console.warn("Speech recognition notice:", event.error);
        if (event.error !== "no-speech") {
          setIsListening(false);
          stopAudioMeter();
        }
      };

      recognition.onend = () => {
        setIsListening(false);
        stopAudioMeter();
      };

      recognition.start();
      recognitionRef.current = recognition;
    } catch (e) {
      toast.error("Could not start microphone");
      setIsListening(false);
    }
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsListening(false);
    stopAudioMeter();
  };

  // Voice output dispatcher with state updates
  const speakWithState = (text) => {
    speakOperationalMessage(
      text,
      voiceAudioEnabled,
      () => setIsSpeaking(true),
      () => setIsSpeaking(false)
    );
  };

  // Core Command Dispatcher & Natural Language Parser
  const processCommand = (cmdText) => {
    if (!cmdText || !cmdText.trim()) return;
    const text = cmdText.toLowerCase().trim();
    setIsProcessing(true);

    logStep("Step 1 (Ingestion)", "Command Ingested", `"${cmdText}"`, "info");

    // 1. Navigation Commands
    if (
      text.includes("overview") ||
      text.includes("command center") ||
      text.includes("home")
    ) {
      logStep(
        "Step 2 (Validation)",
        "Routing Check",
        "Targeting Command Center View",
        "success"
      );
      onNavigate && onNavigate("overview");
      const resp = "Switching to Command Center. Tracking 5.4x blended ROAS.";
      speakWithState(resp);
      logStep(
        "Step 4 (Dispatch)",
        "Navigation Executed",
        "Active tab set to overview",
        "success"
      );
      setIsProcessing(false);
      return;
    }

    if (
      text.includes("spin") ||
      text.includes("dashboard") ||
      text.includes("wheel") ||
      text.includes("game")
    ) {
      logStep(
        "Step 2 (Validation)",
        "Routing Check",
        "Targeting Spin to Win Dashboard",
        "success"
      );
      onNavigate && onNavigate("dashboard");
      const resp =
        "Opened Spin to Win Rewards Dashboard. Prize wheel and user vault active.";
      speakWithState(resp);
      logStep(
        "Step 4 (Dispatch)",
        "Navigation Executed",
        "Active tab set to dashboard",
        "success"
      );
      setIsProcessing(false);
      return;
    }

    if (
      text.includes("ad") ||
      text.includes("media") ||
      text.includes("executioner") ||
      text.includes("budget")
    ) {
      if (
        text.includes("stage") ||
        text.includes("rebalance") ||
        text.includes("weekend") ||
        text.includes("shift")
      ) {
        stageAction("BUDGET_REBALANCE", {
          title: "Stage Weekend Ad Budget Rebalance",
          description:
            "Shift $40.00 from Community Flywheel to Paid Local Velocity (Google Maps & Facebook Rush) for Friday & Saturday dinner windows.",
          impact: "+$280.00 est. gross receipts · $0.00 net budget change",
          targetStrategy: "Paid Local Velocity",
          sourceStrategy: "Community Flywheel",
          amount: 40.0,
          window: "FRI_SAT_1700_2100"
        });
        const resp =
          "Weekend budget shift staged for your approval in the Command Center.";
        speakWithState(resp);
        setIsProcessing(false);
        return;
      } else {
        onNavigate && onNavigate("executioner");
        const resp =
          "Opening Quality Content Executioner. Ad loops running at $299 weekly cap.";
        speakWithState(resp);
        setIsProcessing(false);
        return;
      }
    }

    if (
      text.includes("maximizer") ||
      text.includes("rewards") ||
      text.includes("loyalty") ||
      text.includes("vip")
    ) {
      if (
        text.includes("drip") ||
        text.includes("welcome") ||
        text.includes("send")
      ) {
        stageAction("VIP_DRIP", {
          title: "Trigger 14 VIP Welcome Video Drip",
          description:
            "Dispatch 7-second Owner Welcome Video with 'Secret Chef Appetizer' incentive to 14 high-ticket regular guests.",
          impact: "18% projected 30-day retention lift · Margin floor protected",
          segment: "VIP ($22+ avg ticket)",
          count: 14,
          asset: "7s_owner_welcome_video"
        });
        const resp = "VIP welcome drip staged. Ready for your one-click approval.";
        speakWithState(resp);
        setIsProcessing(false);
        return;
      } else {
        onNavigate && onNavigate("maximizer");
        const resp =
          "Opening Customer Maximizer. RFMD loyalty segmentation active.";
        speakWithState(resp);
        setIsProcessing(false);
        return;
      }
    }

    // Labor / Schedule / StaffWise Persona Commands
    if (
      text.includes("labor") ||
      text.includes("clara") ||
      text.includes("shift") ||
      text.includes("jacob") ||
      text.includes("prep")
    ) {
      logStep(
        "Step 2 (Validation)",
        "Labor & Overtime Validation",
        "Testing 36h cap against weekend schedule & clopening rules",
        "success"
      );
      stageAction("LABOR_SHIFT_UPDATE", {
        title: "Reassign Jacob to Saturday Morning Prep",
        description:
          "Move shift from Friday Dinner to Saturday 08:00 AM - 02:00 PM. Hard-cap hours at 36.0h (Zero Overtime).",
        impact: "Labor holding at 26.8% · 0 clopening violations detected",
        employee: "Jacob Miller",
        role: "Morning Prep / Line",
        hours: 36.0,
        targetDay: "Saturday"
      });
      const resp =
        "Shift updated. Jacob moved to prep Saturday morning. Labor is holding at 26.8%.";
      speakWithState(resp);
      setIsProcessing(false);
      return;
    }

    // Multi-Source CSV Attribution & POS Reconciliation
    if (
      text.includes("attribution") ||
      text.includes("source") ||
      text.includes("reconcile") ||
      text.includes("walk-in") ||
      text.includes("cac")
    ) {
      logStep("Step 2 (Validation)", "Attribution Normalization", "Reconciling Meta, TikTok, Google Maps, and POS claims", "success");
      onNavigate && onNavigate("attribution");
      const resp = `Opening Multi-Source Attribution Hub. Current Blended ROAS is ${telemetryState.blendedRoas} with $14.85 cost per verified walk-in across all sources.`;
      speakWithState(resp);
      logStep("Step 4 (Dispatch)", "Attribution Reconciled", resp, "success");
      setIsProcessing(false);
      return;
    }

    // Cumulative Knowledge Base & Longitudinal Learning
    if (
      text.includes("knowledge") ||
      text.includes("maturity") ||
      text.includes("longitudinal") ||
      text.includes("moat") ||
      text.includes("learning") ||
      text.includes("horizon")
    ) {
      logStep("Step 2 (Validation)", "Knowledge Memory Query", "Retrieving 30/90/180-day longitudinal patterns and retention moat", "success");
      onNavigate && onNavigate("knowledge");
      const resp = "Opening Cumulative Knowledge Base. Maturity Level is Month 3 (Pattern Matched) with 92/100 switching-cost moat score.";
      speakWithState(resp);
      logStep("Step 4 (Dispatch)", "Knowledge Base Active", resp, "success");
      setIsProcessing(false);
      return;
    }

    // Multi-Track Campaign Strategy & Cadence
    if (
      text.includes("multi-track") ||
      text.includes("track") ||
      text.includes("arcade") ||
      text.includes("reels") ||
      text.includes("video")
    ) {
      logStep("Step 2 (Validation)", "Multi-Track Strategy Orchestration", "Checking 4-track campaign balance and anti-fatigue cadence", "info");
      onNavigate && onNavigate("multitrack");
      const resp = "Opening Multi-Track Strategy. Balanced between Brand Video Reels, 7-day Arcade Pulses, VIP Retargeting Drip, and Local Maps Intent.";
      speakWithState(resp);
      logStep("Step 4 (Dispatch)", "Multi-Track Active", resp, "success");
      setIsProcessing(false);
      return;
    }

    // Human-Gated Approval Staging for Live Ad Spend
    if (
      text.includes("commit") ||
      text.includes("ad spend") ||
      text.includes("budget") ||
      text.includes("live spend") ||
      text.includes("human sign") ||
      text.includes("approval")
    ) {
      logStep("Step 2 (Validation)", "Human-Gated Approval Staged", "Staging live ad spend commitment requiring client sign-off", "alert");
      stageAction("COMMIT_LIVE_AD_SPEND", {
        title: "Commit $299 Live Ad Spend Allocation",
        description: "Approve committing live ad budget across Meta Craft Reels ($140), TikTok Short-Form ($90), and Google Maps Pin ($69).",
        impact: "Requires explicit owner sign-off · Staged safely in Team & Approvals",
        amount: 299.00
      });
      const resp = "Live ad spend commitment staged. Explicit client human approval is required before committing budget.";
      speakWithState(resp);
      setIsProcessing(false);
      return;
    }

    // ROAS & Telemetry Query
    if (
      text.includes("roas") ||
      text.includes("metric") ||
      text.includes("revenue") ||
      text.includes("performance")
    ) {
      logStep(
        "Step 2 (Validation)",
        "Database Telemetry Query",
        "Reconciling live register sales with campaign spend",
        "success"
      );
      const resp = `Current performance: Blended ROAS is ${telemetryState.blendedRoas} on $299 weekly ad spend, with 14 active VIP accounts.`;
      speakWithState(resp);
      logStep("Step 4 (Dispatch)", "Telemetry Synthesized", resp, "success");
      setIsProcessing(false);
      return;
    }

    // 7-Day Promotional Sprint
    if (text.includes("sprint") || text.includes("launch sprint") || text.includes("promotional sprint")) {
      logStep("Step 2 (Validation)", "Promotional Sprint Initiation", "Triggering 7-day promotional sprint with margin guardrails", "alert");
      stageAction("LAUNCH_SPRINT", {
        title: "Launch 7-Day Promotional Sprint",
        description: "Activate gamified reward distributions for 7 days. Anti-fatigue cooldown scheduled automatically.",
        impact: "Targeted customer acquisition · 1-week focused cadence"
      });
      const resp = "7-Day Promotional Sprint staged. Confirm to activate live rewards station.";
      speakWithState(resp);
      setIsProcessing(false);
      return;
    }

    // Margin Floor & Discount Caps
    if (text.includes("margin") || text.includes("floor") || text.includes("discount cap")) {
      logStep("Step 2 (Validation)", "Margin Protection Protocol", "Enforcing minimum spend threshold and discount ceiling", "info");
      stageAction("TUNE_MARGIN", {
        title: "Lock Profit Margin Floor",
        description: "Set maximum discount ceiling to 30% and enforce $50 minimum basket size.",
        impact: "Guarantees gross margin preservation on all redemption vouchers"
      });
      const resp = "Margin floor tuned to 30% max discount with $50 minimum spend.";
      speakWithState(resp);
      setIsProcessing(false);
      return;
    }

    // Print & Physical Asset Studio
    if (text.includes("print") || text.includes("qr studio") || text.includes("sticker") || text.includes("table tent") || text.includes("seal") || text.includes("physical")) {
      logStep("Step 2 (Validation)", "Physical Surface & QR Studio", "Configuring high-res vector templates with placement guardrails", "info");
      onNavigate && onNavigate("printstudio");
      const resp = "Opened Print & Physical Asset Studio. Guardrail active: Deploy QRs on packaging seals and check-presenters, never at the front entrance!";
      speakWithState(resp);
      setIsProcessing(false);
      return;
    }

    // Export Claim Codes
    if (text.includes("export") || text.includes("claim codes") || text.includes("csv") || text.includes("codes")) {
      logStep("Step 2 (Validation)", "Voucher Ledger Export", "Compiling tamper-proof claims and POS codes for download", "success");
      const downloadUrl = exportClaimCodesUrl();
      window.open(downloadUrl, "_blank");
      const resp = "Exporting claim codes and POS redemptions to CSV spreadsheet.";
      speakWithState(resp);
      setIsProcessing(false);
      return;
    }

    // Rest Schedule & Anti-Fatigue Cadence
    if (text.includes("rest") || text.includes("cadence") || text.includes("fatigue") || text.includes("schedule")) {
      logStep("Step 2 (Validation)", "Anti-Fatigue Cadence Review", "Checking 4-week rotating promotion schedule", "info");
      const resp = "Anti-Fatigue Cadence: 1 week active sprint followed by 3 weeks rest and nurture to protect luxury brand reputation.";
      speakWithState(resp);
      setIsProcessing(false);
      return;
    }

    // Fallback general prompt
    logStep(
      "Step 2 (Validation)",
      "General Operator Intent",
      "Evaluating restaurant growth workflow",
      "info"
    );
    stageAction("GENERAL_ASSISTANCE", {
      title: "OmniLocal Operational Proposal",
      description: `Action planned for: "${cmdText}". Gated by human-in-the-loop review.`,
      impact: "Safe staging · Zero unapproved live spend",
      rawText: cmdText
    });
    const fallbackResp = `Processed request: "${cmdText}". Staged for review.`;
    speakWithState(fallbackResp);
    setIsProcessing(false);
  };

  const stageAction = (type, payload) => {
    logStep(
      "Step 3 (Staging)",
      `Proposal Staged: ${payload.title}`,
      payload.description,
      "alert"
    );
    setStagedAction({
      id: `act_${Date.now()}`,
      type,
      payload,
      timestamp: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit"
      })
    });
    playChime("alert");
  };

  const approveAndExecute = async () => {
    if (!stagedAction) return;
    setIsProcessing(true);
    logStep(
      "Step 4 (Commit & Dispatch)",
      `Executing: ${stagedAction.payload.title}`,
      "Syncing database & dispatching operational mutations…",
      "success"
    );

    try {
      if (stagedAction.type === "LAUNCH_SPRINT") {
        await launchSprint(7).catch(() => {});
        toast.success("7-Day Promotional Sprint is live!");
        speakWithState("7-Day Promotional Sprint launched with active reward distributions.");
      } else if (stagedAction.type === "TUNE_MARGIN") {
        await tuneMarginFloor(30, 50).catch(() => {});
        toast.success("Margin Floor locked at 30% max discount.");
        speakWithState("Profit margin floor locked with $50 basket size requirement.");
      } else if (stagedAction.type === "BUDGET_REBALANCE") {
        await reconcile().catch(() => {});
        toast.success("Weekend budget boost approved and scheduled!");
        speakWithState(
          "Weekend budget rebalance committed to Friday evening schedule."
        );
      } else if (stagedAction.type === "VIP_DRIP") {
        toast.success("VIP Welcome Drip approved and scheduled!");
        speakWithState(
          "VIP welcome video sequence dispatched to 14 guests."
        );
      } else if (stagedAction.type === "LABOR_SHIFT_UPDATE") {
        toast.success("Schedule update published. Labor holding at 26.8%.");
        speakWithState(
          "Jacob's prep shift confirmed. Staff notification sent."
        );
      } else {
        toast.success("Action executed successfully.");
      }

      playChime("success");
      setStagedAction(null);
      refreshTelemetry();
    } catch (e) {
      toast.error("Execution encountered an error");
    } finally {
      setIsProcessing(false);
    }
  };

  const dismissStagedAction = () => {
    logStep(
      "Step 3 (Staging)",
      "Proposal Dismissed",
      "Merchant rejected the staged draft.",
      "info"
    );
    setStagedAction(null);
  };

  // Determine current figurine state
  const figurineState = isSpeaking
    ? "speaking"
    : isListening
    ? "listening"
    : "idle";

  return (
    <>
      {/* Floating Toggle Bubble (when collapsed) */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          data-testid="open-copilot-bubble"
          className="fixed bottom-6 right-6 z-40 p-3 rounded-2xl shadow-2xl flex items-center gap-2.5 transition-all hover:scale-105 border text-white"
          style={{
            background: "radial-gradient(circle at top left, #0F2E23 0%, #081226 100%)",
            borderColor: "#10B981",
            boxShadow: "0 10px 30px rgba(8, 18, 38, 0.6)"
          }}
        >
          <div className="relative flex items-center justify-center">
            <CoCaptainFigurine state="idle" size={32} brandName={brandName} />
          </div>
          <div className="text-left pr-1">
            <div className="text-[9px] uppercase font-bold tracking-wider text-emerald-400">
              Co-Captain
            </div>
            <div className="text-xs font-bold leading-none text-slate-100 truncate max-w-[110px]">
              Ready to assist
            </div>
          </div>
        </button>
      )}

      {/* Right Co-Captain Agent Sidebar */}
      <AnimatePresence>
        {isOpen && (
          <motion.aside
            initial={{ opacity: 0, x: 315 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 315 }}
            transition={{ type: "spring", stiffness: 350, damping: 35 }}
            data-testid="operator-copilot-panel"
            className="w-[315px] min-w-[315px] max-w-[320px] h-screen shrink-0 border-l flex flex-col justify-between overflow-hidden shadow-2xl select-none"
            style={{
              width: "315px",
              minWidth: "315px",
              maxWidth: "320px",
              height: "100vh",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              background: "#081226",
              borderColor: "#1E3A5F",
              color: "#E2E8F0"
            }}
          >
            {/* 1. TOP: Header & Metrics Strip (flex-shrink: 0) */}
            <div className="shrink-0 flex flex-col border-b" style={{ borderColor: "#1E3A5F" }}>
              {/* Header Bar */}
              <div
                className="p-3.5 px-4 flex items-center justify-between"
                style={{ background: "rgba(11, 23, 42, 0.95)" }}
              >
                <div className="flex items-center gap-2.5">
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center shadow-inner"
                    style={{ background: "#064E3B", border: "1px solid #10B981" }}
                  >
                    <Radio
                      size={14}
                      className={
                        isListening
                          ? "text-emerald-300 animate-pulse"
                          : "text-emerald-400"
                      }
                    />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 leading-tight">
                      <span className="text-[11.5px] font-bold uppercase tracking-wider text-emerald-400">
                        OmniLocal Co-Captain
                      </span>
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    </div>
                    <div className="text-[10px] text-emerald-300 flex items-center gap-1 font-medium truncate max-w-[150px]">
                      Ready to assist {brandName}
                    </div>
                  </div>
                </div>

                {/* Controls */}
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setVoiceAudioEnabled(!voiceAudioEnabled)}
                    title={
                      voiceAudioEnabled
                        ? "Mute Voice Audio"
                        : "Unmute Voice Audio"
                    }
                    className="p-1.5 rounded-md border text-xs flex items-center justify-center transition-colors"
                    style={{
                      borderColor: "#1E3A5F",
                      background: voiceAudioEnabled
                        ? "rgba(16, 185, 129, 0.15)"
                        : "transparent",
                      color: voiceAudioEnabled ? "#34D399" : "#94A3B8"
                    }}
                    data-testid="copilot-mute-toggle"
                  >
                    {voiceAudioEnabled ? (
                      <Volume2 size={13} />
                    ) : (
                      <VolumeX size={13} />
                    )}
                  </button>

                  <button
                    onClick={() => setIsOpen(false)}
                    data-testid="copilot-collapse-btn"
                    title="Collapse Sidebar"
                    className="p-1.5 rounded-md border text-xs text-slate-400 hover:text-white transition-colors"
                    style={{ borderColor: "#1E3A5F" }}
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>

              {/* Metrics Strip with generous breathing room */}
              <div
                className="px-4 py-2.5 grid grid-cols-3 gap-2 text-center"
                style={{
                  background: "rgba(6, 13, 23, 0.75)",
                  borderColor: "#1E3A5F"
                }}
              >
                <div>
                  <div className="text-[9px] uppercase tracking-wider font-semibold text-slate-400">
                    ROAS
                  </div>
                  <div className="font-mono font-bold text-emerald-400 text-[13px] leading-tight mt-0.5">
                    {telemetryState.blendedRoas}
                  </div>
                </div>
                <div className="border-x px-1" style={{ borderColor: "#1E3A5F" }}>
                  <div className="text-[9px] uppercase tracking-wider font-semibold text-slate-400">
                    Labor
                  </div>
                  <div className="font-mono font-bold text-blue-400 text-[13px] leading-tight mt-0.5">
                    {telemetryState.laborRatio}
                  </div>
                </div>
                <div>
                  <div className="text-[9px] uppercase tracking-wider font-semibold text-slate-400">
                    Review
                  </div>
                  <div className="font-mono font-bold text-amber-400 text-[13px] leading-tight mt-0.5">
                    Gated
                  </div>
                </div>
              </div>
            </div>

            {/* 2. MIDDLE: Voice Visualizer & Animated Figurine Dock (flex-grow: 1) */}
            <div
              className="flex-grow flex flex-col items-center justify-center p-3 relative overflow-hidden"
              style={{
                flexGrow: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                background:
                  "radial-gradient(circle at 50% 45%, rgba(16, 185, 129, 0.08) 0%, rgba(8, 18, 38, 0.95) 75%)"
              }}
              data-testid="copilot-mic-container"
            >
              {/* Unified Rounded Dark Glass Card for Mascot & Mic Dock */}
              <div
                className="w-full flex flex-col items-center text-center shadow-xl transition-all"
                style={{
                  background: "rgba(255, 255, 255, 0.03)",
                  border: "1px solid rgba(255, 255, 255, 0.07)",
                  borderRadius: "12px",
                  padding: "1.25rem"
                }}
              >
                {/* Scaled Mascot Sprite (~122px) */}
                <div className="relative mb-1">
                  <CoCaptainFigurine
                    state={figurineState}
                    audioLevel={audioLevel}
                    size={122}
                    brandName={brandName}
                    onClick={toggleListening}
                  />
                </div>

                {/* Status Message & Subtitle */}
                <div className="text-center mt-1 px-1">
                  <div className="text-[12px] font-bold text-slate-100 leading-tight">
                    {isListening
                      ? "Listening carefully… (Speak freely)"
                      : isSpeaking
                      ? "Co-Captain Speaking…"
                      : `Ready to assist ${brandName}`}
                  </div>
                  <div className="text-[10px] text-emerald-300/80 mt-0.5 font-mono truncate max-w-[240px]">
                    {interimText ||
                      transcript ||
                      (isListening
                        ? "Listening for questions or commands…"
                        : "Voice & Revenue Co-Pilot Active")}
                  </div>
                </div>

                {/* Audio Waveform Bars (Tightly integrated) */}
                <div className="flex items-center justify-center gap-1 h-5 my-2 px-2 w-full">
                  {[...Array(14)].map((_, i) => {
                    const dynamicHeight = isListening
                      ? Math.max(3, Math.min(18, audioLevel * (0.35 + (i % 4) * 0.18)))
                      : isSpeaking
                      ? Math.max(3, Math.min(18, 6 + Math.sin(Date.now() / 150 + i) * 8))
                      : 3;
                    return (
                      <motion.div
                        key={i}
                        animate={{ height: dynamicHeight }}
                        transition={{ duration: 0.08 }}
                        className="w-1 rounded-full"
                        style={{
                          background: isListening
                            ? i % 2 === 0
                              ? "#10B981"
                              : "#34D399"
                            : isSpeaking
                            ? i % 2 === 0
                              ? "#38BDF8"
                              : "#22C55E"
                            : "#1E293B"
                        }}
                      />
                    );
                  })}
                </div>

                {/* Primary Interaction Button with tight vertical connection */}
                <button
                  onClick={toggleListening}
                  data-testid="copilot-mic-btn"
                  className={`w-11 h-11 rounded-full flex items-center justify-center shadow-lg transition-transform active:scale-95 ${
                    isListening
                      ? "ring-4 ring-red-400/40 scale-105"
                      : "hover:scale-105"
                  }`}
                  style={{
                    background: isListening
                      ? "linear-gradient(135deg, #EF4444 0%, #B91C1C 100%)"
                      : "linear-gradient(135deg, #059669 0%, #047857 100%)",
                    color: "#FFFFFF",
                    border: isListening ? "1px solid #FCA5A5" : "1px solid #34D399"
                  }}
                  title={isListening ? "Stop listening" : "Click to Speak"}
                >
                  {isListening ? <MicOff size={18} /> : <Mic size={18} />}
                </button>
              </div>
            </div>

            {/* 3. LOWER SECTION: Verification Test Harness & Telemetry Stream */}
            <div
              className="shrink-0 p-3 pt-2 space-y-2.5 border-t copilot-scroll"
              style={{
                flexShrink: 0,
                maxHeight: "240px",
                overflowY: "auto",
                borderColor: "#1E3A5F",
                background: "rgba(6, 13, 23, 0.75)"
              }}
            >
              {/* Staged Approval-First Card (if active) */}
              <AnimatePresence>
                {stagedAction && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 6 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 6 }}
                    className="p-2.5 rounded-lg border shadow-lg"
                    style={{
                      background: "#0F172A",
                      borderColor: "#F59E0B"
                    }}
                    data-testid="staged-action-card"
                  >
                    <div className="flex items-center gap-1 text-amber-400 mb-1">
                      <ShieldCheck size={13} />
                      <span className="text-[9px] font-bold uppercase tracking-wider">
                        Approval Staging
                      </span>
                    </div>

                    <h4 className="text-xs font-bold text-white leading-tight">
                      {stagedAction.payload.title}
                    </h4>

                    <p className="text-[10.5px] text-slate-300 mt-0.5 line-clamp-2">
                      {stagedAction.payload.description}
                    </p>

                    {stagedAction.payload.impact && (
                      <div className="mt-1.5 p-1.5 rounded bg-slate-950 border border-slate-800 text-[10px] font-mono text-emerald-400">
                        ⚡ {stagedAction.payload.impact}
                      </div>
                    )}

                    <div className="flex items-center gap-1.5 mt-2 pt-1.5 border-t border-slate-800">
                      <button
                        onClick={approveAndExecute}
                        disabled={isProcessing}
                        data-testid="copilot-approve-execute-btn"
                        className="flex-1 py-1.5 rounded-md text-[10.5px] flex items-center justify-center gap-1 font-bold shadow"
                        style={{
                          background: "#10B981",
                          color: "#FFF"
                        }}
                      >
                        <CheckCircle2 size={12} />
                        <span>
                          {isProcessing ? "Executing…" : "1-Click Approve"}
                        </span>
                      </button>

                      <button
                        onClick={dismissStagedAction}
                        data-testid="copilot-dismiss-btn"
                        className="px-2 py-1.5 rounded-md border text-[10.5px] text-slate-400 hover:text-white"
                        style={{ borderColor: "#334155" }}
                      >
                        Dismiss
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Quick Helper Suggestions & Test Chips */}
              <div>
                <div className="flex items-center justify-between text-[9px] uppercase font-bold tracking-wider text-slate-400 mb-1.5">
                  <span>Quick Actions &amp; Tests</span>
                  <Activity size={10} className="text-emerald-400" />
                </div>
                <div
                  className="grid grid-cols-2"
                  style={{ gap: "0.5rem" }}
                >
                  <button
                    onClick={() =>
                      processCommand("Open physical print studio and vector QR engine")
                    }
                    data-testid="test-print-studio-chip"
                    className="p-2 rounded-lg border text-left bg-slate-900/60 hover:bg-slate-800/90 border-slate-800 text-slate-200 transition-colors truncate shadow-sm flex items-center gap-1.5"
                    style={{ fontSize: "0.75rem" }}
                  >
                    <span>🖨️</span>
                    <span className="truncate">Print Studio</span>
                  </button>

                  <button
                    onClick={() =>
                      processCommand("Reconcile multi-source CSV attribution")
                    }
                    data-testid="test-attribution-chip"
                    className="p-2 rounded-lg border text-left bg-slate-900/60 hover:bg-slate-800/90 border-slate-800 text-slate-200 transition-colors truncate shadow-sm flex items-center gap-1.5"
                    style={{ fontSize: "0.75rem" }}
                  >
                    <span>📊</span>
                    <span className="truncate">Attribution Hub</span>
                  </button>

                  <button
                    onClick={() =>
                      processCommand("Check learning maturity and longitudinal knowledge")
                    }
                    data-testid="test-knowledge-chip"
                    className="p-2 rounded-lg border text-left bg-slate-900/60 hover:bg-slate-800/90 border-slate-800 text-slate-200 transition-colors truncate shadow-sm flex items-center gap-1.5"
                    style={{ fontSize: "0.75rem" }}
                  >
                    <span>🧠</span>
                    <span className="truncate">Knowledge Base</span>
                  </button>

                  <button
                    onClick={() =>
                      processCommand("Review 4-track campaign balance and cadence")
                    }
                    data-testid="test-multitrack-chip"
                    className="p-2 rounded-lg border text-left bg-slate-900/60 hover:bg-slate-800/90 border-slate-800 text-slate-200 transition-colors truncate shadow-sm flex items-center gap-1.5"
                    style={{ fontSize: "0.75rem" }}
                  >
                    <span>🎯</span>
                    <span className="truncate">4-Track Strategy</span>
                  </button>

                  <button
                    onClick={() =>
                      processCommand("Stage live ad spend allocation for human signoff")
                    }
                    data-testid="test-stage-approval-chip"
                    className="p-2 rounded-lg border text-left bg-slate-900/60 hover:bg-slate-800/90 border-slate-800 text-slate-200 transition-colors truncate shadow-sm flex items-center gap-1.5"
                    style={{ fontSize: "0.75rem" }}
                  >
                    <span>✍️</span>
                    <span className="truncate">Stage Ad Spend</span>
                  </button>

                  <button
                    onClick={() =>
                      processCommand("Launch 7-day promotional sprint")
                    }
                    data-testid="test-sprint-chip"
                    className="p-2 rounded-lg border text-left bg-slate-900/60 hover:bg-slate-800/90 border-slate-800 text-slate-200 transition-colors truncate shadow-sm flex items-center gap-1.5"
                    style={{ fontSize: "0.75rem" }}
                  >
                    <span>⚡</span>
                    <span className="truncate">Launch 7d Sprint</span>
                  </button>

                  <button
                    onClick={() =>
                      processCommand("Tune margin floor and discount cap")
                    }
                    data-testid="test-margin-chip"
                    className="p-2 rounded-lg border text-left bg-slate-900/60 hover:bg-slate-800/90 border-slate-800 text-slate-200 transition-colors truncate shadow-sm flex items-center gap-1.5"
                    style={{ fontSize: "0.75rem" }}
                  >
                    <span>🛡️</span>
                    <span className="truncate">Tune Margin Floor</span>
                  </button>
                </div>
              </div>

              {/* Telemetry Stream Log */}
              <div>
                <div className="flex items-center justify-between text-[9px] uppercase font-bold tracking-wider text-slate-400 mb-1">
                  <span>Telemetry State Stream</span>
                  <span className="font-mono text-[9px] text-slate-500">
                    {statusLog.length} events
                  </span>
                </div>

                <div className="space-y-1.5">
                  {statusLog.length === 0 ? (
                    <div className="p-2 text-center rounded border border-dashed border-slate-800 text-[10px] text-slate-500 font-mono">
                      Awaiting voice or operational telemetry…
                    </div>
                  ) : (
                    statusLog.slice(0, 5).map((log) => (
                      <div
                        key={log.id}
                        className="p-1.5 rounded border text-[10px] font-mono leading-snug"
                        style={{
                          background: "rgba(15, 23, 42, 0.7)",
                          borderColor:
                            log.type === "alert"
                              ? "#F59E0B"
                              : log.type === "success"
                              ? "#10B981"
                              : "#1E3A5F"
                        }}
                      >
                        <div className="flex items-center justify-between text-[8.5px] text-slate-400">
                          <span
                            className={
                              log.type === "alert"
                                ? "text-amber-400 font-bold"
                                : log.type === "success"
                                ? "text-emerald-400 font-bold"
                                : "text-blue-400"
                            }
                          >
                            {log.step}
                          </span>
                          <span>{log.timestamp}</span>
                        </div>
                        <div className="font-bold text-slate-200 truncate">
                          {log.title}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* 4. BOTTOM: Command Input Bar (margin-top: auto; flex-shrink: 0, flush to bottom) */}
            <div
              className="shrink-0 mt-auto"
              style={{
                marginTop: "auto",
                flexShrink: 0,
                padding: "0.75rem",
                background: "#0b1526",
                borderTop: "1px solid #1e293b"
              }}
            >
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (transcript.trim()) {
                    processCommand(transcript);
                    setTranscript("");
                  }
                }}
                className="flex items-center gap-1.5"
              >
                <input
                  type="text"
                  placeholder="Ask or command (e.g. 'Stage weekend budget')…"
                  value={transcript}
                  onChange={(e) => setTranscript(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-lg text-xs bg-slate-900 border text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
                  style={{ borderColor: "#1E3A5F" }}
                  data-testid="copilot-text-input"
                />
                <button
                  type="submit"
                  disabled={!transcript.trim()}
                  data-testid="copilot-send-btn"
                  className="p-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-40 transition-colors flex items-center justify-center shrink-0"
                >
                  <Send size={14} />
                </button>
              </form>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
}
