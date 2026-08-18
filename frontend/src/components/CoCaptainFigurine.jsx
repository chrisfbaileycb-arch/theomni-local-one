import React, { useEffect, useState } from "react";

/**
 * OmniLocal Co-Captain Mascot Figurine
 * A lovable, friendly digital companion with soft rounded features, 
 * Pixar-style expressive eyes, gentle blinking, and dynamic speaking/listening states.
 *
 * States:
 * - "idle": Gentle floating hover with soft blinks and a welcoming warm smile.
 * - "listening": Leans forward with perked-up posture, wide curious eyes, and glowing pulse aura.
 * - "speaking": Happy bobbing cadence with expressive lip-sync and audio ripples.
 */
export default function CoCaptainFigurine({
  state = "idle", // "idle" | "listening" | "speaking"
  audioLevel = 0, // 0 - 100
  size = 96,
  brandName = "Nonna's Deli",
  onClick,
}) {
  const [blink, setBlink] = useState(false);
  const [mouthPhase, setMouthPhase] = useState(0);

  // Gentle natural eye blinking
  useEffect(() => {
    const blinkInterval = setInterval(() => {
      setBlink(true);
      setTimeout(() => setBlink(false), 160);
    }, 3200 + Math.random() * 2000);
    return () => clearInterval(blinkInterval);
  }, []);

  // Expressive mouth movement when talking
  useEffect(() => {
    if (state !== "speaking") return;
    const mouthInterval = setInterval(() => {
      setMouthPhase((prev) => (prev + 1) % 4);
    }, 120);
    return () => clearInterval(mouthInterval);
  }, [state]);

  const isListening = state === "listening";
  const isSpeaking = state === "speaking";
  const isIdle = state === "idle";

  // Dynamic animation class
  const animClass = isSpeaking
    ? "figurine-speaking"
    : isListening
    ? "figurine-listening"
    : "figurine-idle";

  // Dynamic friendly mouth path
  let mouthElement = (
    <path
      d="M 43 59 Q 50 66 57 59"
      fill="none"
      stroke="#064E3B"
      strokeWidth="2.2"
      strokeLinecap="round"
    />
  );

  if (isListening) {
    // Curious, engaged gentle open smile
    mouthElement = (
      <path
        d="M 44 59 Q 50 65 56 59"
        fill="#064E3B"
        stroke="#064E3B"
        strokeWidth="2"
        strokeLinecap="round"
      />
    );
  } else if (isSpeaking) {
    const mouthVariants = [
      // Wide happy talking
      <g key="m0">
        <path d="M 42 58 Q 50 71 58 58 Z" fill="#064E3B" />
        <path d="M 45 66 Q 50 70 55 66" fill="#F43F5E" />
      </g>,
      // Medium open
      <g key="m1">
        <path d="M 43 59 Q 50 67 57 59 Z" fill="#064E3B" />
        <ellipse cx="50" cy="64" rx="2.5" ry="1.5" fill="#FB7185" />
      </g>,
      // Gentle open
      <g key="m2">
        <path d="M 44 59 Q 50 64 56 59" fill="none" stroke="#064E3B" strokeWidth="2.4" strokeLinecap="round" />
      </g>,
      // Extra enthusiastic talking
      <g key="m3">
        <path d="M 41 58 Q 50 72 59 58 Z" fill="#064E3B" />
        <path d="M 44 67 Q 50 71 56 67" fill="#F43F5E" />
      </g>,
    ];
    mouthElement = mouthVariants[mouthPhase];
  }

  return (
    <div
      onClick={onClick}
      className="relative flex items-center justify-center cursor-pointer select-none group"
      style={{ width: size, height: size }}
      title={`OmniLocal Co-Captain · Ready to assist ${brandName}`}
      data-testid="co-captain-figurine"
    >
      {/* Soft Ambient Aura Glow */}
      <div
        className="absolute inset-0 rounded-full transition-all duration-500 pointer-events-none"
        style={{
          background: isListening
            ? "radial-gradient(circle, rgba(52, 211, 153, 0.45) 0%, rgba(16, 185, 129, 0.2) 50%, transparent 75%)"
            : isSpeaking
            ? "radial-gradient(circle, rgba(56, 189, 248, 0.5) 0%, rgba(52, 211, 153, 0.25) 55%, transparent 75%)"
            : "radial-gradient(circle, rgba(52, 211, 153, 0.25) 0%, rgba(16, 185, 129, 0.08) 50%, transparent 70%)",
          transform: isListening || isSpeaking ? "scale(1.25)" : "scale(1)",
        }}
      />

      {/* Acoustic Pulse Rings */}
      {(isListening || isSpeaking) && (
        <>
          <div
            className="absolute rounded-full border border-emerald-400/50 pointer-events-none aura-wave"
            style={{ inset: "-8px" }}
          />
          <div
            className="absolute rounded-full border border-cyan-400/35 pointer-events-none aura-wave"
            style={{ inset: "-18px", animationDelay: "0.6s" }}
          />
        </>
      )}

      {/* Docking Pedestal Shadow */}
      <div
        className="absolute bottom-0 w-16 h-3 rounded-full blur-[2px] transition-all duration-300 pointer-events-none"
        style={{
          background: isListening
            ? "radial-gradient(ellipse, #34D399 0%, transparent 70%)"
            : isSpeaking
            ? "radial-gradient(ellipse, #38BDF8 0%, transparent 70%)"
            : "radial-gradient(ellipse, #10B981 0%, transparent 70%)",
          opacity: isIdle ? 0.45 : 0.85,
          transform: isListening || isSpeaking ? "scale(1.15)" : "scale(1)",
        }}
      />

      {/* Animated Friendly Mascot Graphic */}
      <div className={`relative w-full h-full ${animClass}`}>
        <svg
          viewBox="0 0 100 100"
          className="w-full h-full drop-shadow-md overflow-visible"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            {/* Friendly Mint & Emerald Skin Gradient */}
            <linearGradient id="mascotSkin" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#6EE7B7" />
              <stop offset="45%" stopColor="#34D399" />
              <stop offset="100%" stopColor="#10B981" />
            </linearGradient>

            {/* Soft Cyan Highlight */}
            <linearGradient id="mascotHighlight" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#A7F3D0" />
              <stop offset="100%" stopColor="#34D399" />
            </linearGradient>

            {/* Rounded Headset / Ear Cups */}
            <linearGradient id="headsetGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#38BDF8" />
              <stop offset="100%" stopColor="#0284C7" />
            </linearGradient>

            {/* Warm Gold Captain's Badge */}
            <linearGradient id="warmGoldBadge" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#FDE68A" />
              <stop offset="45%" stopColor="#F59E0B" />
              <stop offset="100%" stopColor="#D97706" />
            </linearGradient>

            {/* Pixar-Style Deep Glossy Eye Gradient */}
            <radialGradient id="pixarEye" cx="35%" cy="35%" r="65%">
              <stop offset="0%" stopColor="#064E3B" />
              <stop offset="65%" stopColor="#022C22" />
              <stop offset="100%" stopColor="#011612" />
            </radialGradient>

            {/* Glow Light Bulb */}
            <radialGradient id="haloGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#FFFFFF" />
              <stop offset="50%" stopColor="#6EE7B7" />
              <stop offset="100%" stopColor="#34D399" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* Soft Rounded Headset Band */}
          <path
            d="M 23 48 C 23 26 77 26 77 48"
            fill="none"
            stroke="#0284C7"
            strokeWidth="3.2"
            strokeLinecap="round"
          />

          {/* Rounded Ear Cups / Audio Sensors */}
          {/* Left Ear Sensor */}
          <g className={isListening ? "animate-pulse" : ""}>
            <rect
              x="16"
              y="40"
              width="9"
              height="18"
              rx="4.5"
              fill="url(#headsetGrad)"
              stroke="#0369A1"
              strokeWidth="1"
            />
            <circle cx="20.5" cy="49" r="2.2" fill="#E0F2FE" />
          </g>

          {/* Right Ear Sensor */}
          <g className={isListening ? "animate-pulse" : ""}>
            <rect
              x="75"
              y="40"
              width="9"
              height="18"
              rx="4.5"
              fill="url(#headsetGrad)"
              stroke="#0369A1"
              strokeWidth="1"
            />
            <circle cx="79.5" cy="49" r="2.2" fill="#E0F2FE" />
          </g>

          {/* Friendly Rounded Torso & Mascot Vest */}
          <ellipse
            cx="50"
            cy="80"
            rx="21"
            ry="14"
            fill="#064E3B"
            stroke="#047857"
            strokeWidth="1"
          />
          {/* White / Cyan Collar Trim */}
          <path
            d="M 38 72 Q 50 82 62 72 Q 50 70 38 72 Z"
            fill="#ECFDF5"
            stroke="#10B981"
            strokeWidth="0.8"
          />

          {/* Warm Golden Star Badge */}
          <circle
            cx="50"
            cy="79"
            r="5"
            fill="url(#warmGoldBadge)"
            stroke="#B45309"
            strokeWidth="0.8"
          />
          {/* Star Icon */}
          <path
            d="M 50 76 L 51.2 78.3 L 53.5 78.3 L 51.7 79.6 L 52.3 81.8 L 50 80.5 L 47.7 81.8 L 48.3 79.6 L 46.5 78.3 L 48.8 78.3 Z"
            fill="#FFFBEB"
          />

          {/* Adorable Rounded Head */}
          <ellipse
            cx="50"
            cy="47"
            rx="25"
            ry="23"
            fill="url(#mascotSkin)"
            stroke="#059669"
            strokeWidth="1.2"
          />

          {/* Soft Friendly Antenna / Light Node */}
          <path
            d="M 50 25 Q 50 17 50 14"
            stroke="#0284C7"
            strokeWidth="2.5"
            strokeLinecap="round"
            fill="none"
          />
          <circle cx="50" cy="13" r="4.2" fill="#38BDF8" className="antenna-spark" />
          <circle
            cx="50"
            cy="13"
            r={isListening || isSpeaking ? 8 : 5.5}
            fill="url(#haloGlow)"
            className="animate-ping"
            style={{ animationDuration: isListening ? "1s" : "2.2s" }}
          />

          {/* Cute Soft Peachy/Rosy Blush Cheeks */}
          <ellipse cx="32" cy="54" rx="5" ry="2.8" fill="#F472B6" opacity="0.55" />
          <ellipse cx="68" cy="54" rx="5" ry="2.8" fill="#F472B6" opacity="0.55" />

          {/* Expressive Pixar-Style Eyes */}
          {blink && !isSpeaking ? (
            /* Gentle Curved Happy Blinking Line */
            <g stroke="#064E3B" strokeWidth="2.4" strokeLinecap="round" fill="none">
              <path d="M 33 46 Q 39 52 45 46" />
              <path d="M 55 46 Q 61 52 67 46" />
            </g>
          ) : (
            /* Big, Warm, Friendly Eyes */
            <g>
              {/* Left Eye */}
              <ellipse
                cx="39"
                cy="44"
                rx={isListening ? 6.8 : 6.2}
                ry={isListening ? 7.6 : 6.8}
                fill="url(#pixarEye)"
              />
              {/* Big Gloss Catchlight */}
              <circle cx="36.8" cy="41.5" r="2.6" fill="#FFFFFF" />
              {/* Soft Secondary Reflection */}
              <circle cx="41.5" cy="46.5" r="1.3" fill="#A7F3D0" />

              {/* Right Eye */}
              <ellipse
                cx="61"
                cy="44"
                rx={isListening ? 6.8 : 6.2}
                ry={isListening ? 7.6 : 6.8}
                fill="url(#pixarEye)"
              />
              {/* Big Gloss Catchlight */}
              <circle cx="58.8" cy="41.5" r="2.6" fill="#FFFFFF" />
              {/* Soft Secondary Reflection */}
              <circle cx="63.5" cy="46.5" r="1.3" fill="#A7F3D0" />
            </g>
          )}

          {/* Friendly Soft Eyebrows */}
          <path
            d={isListening ? "M 33 36 Q 39 33 45 36" : "M 34 37 Q 39 35 44 38"}
            stroke="#065F46"
            strokeWidth="1.8"
            strokeLinecap="round"
            fill="none"
          />
          <path
            d={isListening ? "M 55 36 Q 61 33 67 36" : "M 56 38 Q 61 35 66 37"}
            stroke="#065F46"
            strokeWidth="1.8"
            strokeLinecap="round"
            fill="none"
          />

          {/* Cute Miniature Soft Nose */}
          <ellipse cx="50" cy="50.5" rx="1.6" ry="1.1" fill="#047857" opacity="0.8" />

          {/* Friendly Animated Mouth */}
          {mouthElement}

          {/* Cute Rounded Helper Hands */}
          <circle cx="33" cy="74" r="3.6" fill="url(#mascotSkin)" stroke="#059669" strokeWidth="0.8" />
          <circle cx="67" cy="74" r="3.6" fill="url(#mascotSkin)" stroke="#059669" strokeWidth="0.8" />
        </svg>
      </div>

      {/* Online Status Pill Badge */}
      <div
        className="absolute -bottom-1 px-2 py-0.5 rounded-full text-[9px] font-bold font-mono tracking-wider flex items-center gap-1 shadow-sm border select-none"
        style={{
          background: isListening
            ? "#EF4444"
            : isSpeaking
            ? "#0284C7"
            : "#065F46",
          borderColor: isListening
            ? "#F87171"
            : isSpeaking
            ? "#38BDF8"
            : "#34D399",
          color: "#FFFFFF",
        }}
      >
        <span
          className="w-1.5 h-1.5 rounded-full animate-ping"
          style={{
            background: isListening ? "#FECACA" : isSpeaking ? "#BAE6FD" : "#A7F3D0",
          }}
        />
        <span>{isListening ? "LISTENING" : isSpeaking ? "SPEAKING" : "ONLINE"}</span>
      </div>
    </div>
  );
}
