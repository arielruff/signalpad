import React, { useState, useRef, useEffect } from "react";
import { Volume2, VolumeX } from "lucide-react";

const PRESETS = [
  { id: "rain",    label: "Rain",        color: "text-blue-400" },
  { id: "brown",   label: "Brown Noise", color: "text-amber-400" },
  { id: "white",   label: "White Noise", color: "text-zinc-300" },
  { id: "hum",     label: "Focus Hum",   color: "text-violet-400" },
  { id: "space",   label: "Deep Space",  color: "text-cyan-400" },
];

function createNoise(ctx, type) {
  const bufferSize = ctx.sampleRate * 2;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);

  if (type === "white" || type === "rain" || type === "space") {
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
  } else if (type === "brown") {
    let last = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      data[i] = (last + 0.02 * white) / 1.02;
      last = data[i];
      data[i] *= 3.5;
    }
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  return source;
}

function buildGraph(ctx, preset, gainNode) {
  const nodes = [];

  if (preset === "white" || preset === "brown") {
    const src = createNoise(ctx, preset);
    src.connect(gainNode);
    src.start();
    nodes.push(src);
  } else if (preset === "rain") {
    const src = createNoise(ctx, "white");
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 400;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 8000;
    src.connect(hp);
    hp.connect(lp);
    lp.connect(gainNode);
    src.start();
    nodes.push(src, hp, lp);
  } else if (preset === "hum") {
    // Layered oscillators for a deep focus hum
    [55, 110, 165].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = 0.08 / (i + 1);
      osc.connect(g);
      g.connect(gainNode);
      osc.start();
      nodes.push(osc, g);
    });
  } else if (preset === "space") {
    const src = createNoise(ctx, "white");
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 200;
    src.connect(lp);
    lp.connect(gainNode);
    src.start();
    nodes.push(src, lp);
  }

  return nodes;
}

export default function AmbientSound() {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(null);
  const [volume, setVolume] = useState(0.4);
  const ctxRef = useRef(null);
  const gainRef = useRef(null);
  const nodesRef = useRef([]);

  const stop = () => {
    nodesRef.current.forEach((n) => { try { n.stop?.(); n.disconnect?.(); } catch {} });
    nodesRef.current = [];
    if (gainRef.current) { try { gainRef.current.disconnect(); } catch {} gainRef.current = null; }
    setActive(null);
  };

  const play = (preset) => {
    if (active === preset) { stop(); return; }
    stop();

    if (!ctxRef.current || ctxRef.current.state === "closed") {
      ctxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (ctxRef.current.state === "suspended") ctxRef.current.resume();

    const ctx = ctxRef.current;
    gainRef.current = ctx.createGain();
    gainRef.current.gain.value = volume;
    gainRef.current.connect(ctx.destination);

    nodesRef.current = buildGraph(ctx, preset, gainRef.current);
    setActive(preset);
  };

  useEffect(() => {
    if (gainRef.current) gainRef.current.gain.value = volume;
  }, [volume]);

  useEffect(() => () => stop(), []);

  return (
    <div className="relative inline-flex items-center">
      <button
        onClick={() => setOpen((o) => !o)}
        title="Ambient sound"
        className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${
          active ? "text-[var(--accent)] bg-[var(--accent-bg)]" : "text-zinc-600 hover:text-zinc-300 hover:bg-zinc-700"
        }`}
      >
        {active ? <Volume2 size={14} /> : <VolumeX size={14} />}
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-1 z-50 w-[180px] bg-zinc-950 border border-zinc-700/60 rounded-lg shadow-2xl p-2">
          <p className="text-[8px] font-bold uppercase tracking-[0.16em] text-zinc-600 px-1 mb-1.5">
            Ambient Sound
          </p>
          <div className="space-y-0.5">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                onClick={() => play(p.id)}
                className={`w-full text-left px-2 py-1.5 rounded text-[11px] transition-colors flex items-center gap-2 ${
                  active === p.id
                    ? "bg-zinc-800 " + p.color
                    : "text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200"
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${active === p.id ? "bg-current animate-pulse" : "bg-zinc-700"}`} />
                {p.label}
              </button>
            ))}
          </div>
          <div className="mt-2 px-1">
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
              className="w-full h-1 accent-[var(--accent)]"
            />
          </div>
        </div>
      )}
    </div>
  );
}
