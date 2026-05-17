import React, { useEffect, useState } from "react";

export default function SplashScreen({ onDone }) {
  const [phase, setPhase] = useState("visible"); // "visible" → "fading" → "gone"

  useEffect(() => {
    const show  = setTimeout(() => setPhase("fading"), 900);
    const clear = setTimeout(() => { setPhase("gone"); onDone?.(); }, 1350);
    return () => { clearTimeout(show); clearTimeout(clear); };
  }, []);

  if (phase === "gone") return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "#ff1a3a",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        opacity: phase === "fading" ? 0 : 1,
        transition: phase === "fading" ? "opacity 420ms ease-out" : "none",
        pointerEvents: phase === "fading" ? "none" : "all",
      }}
    >
      <img
        src="/logo.png"
        alt="SignalPad"
        style={{ width: 210, height: 210, borderRadius: 42, userSelect: "none", pointerEvents: "none" }}
        draggable={false}
      />
    </div>
  );
}
