import React, { useState, useRef, useEffect } from "react";
import { Lock, X, Eye, EyeOff } from "lucide-react";

// Simple hash — deters casual access only, not cryptographic.
// Password-type locks are stored with a "p:" prefix so the unlock UI knows
// which input to show; bare values are PIN locks (also all pre-0.1.5 locks).
function hashPasscode(code) {
  let h = 0;
  for (let i = 0; i < code.length; i++) h = ((h << 5) - h + code.charCodeAt(i)) | 0;
  return h.toString(36);
}

export function checkPasscode(stored, input) {
  if (!stored) return false;
  return stored.replace(/^p:/, "") === hashPasscode(input);
}

export function storePasscode(input, type = "pin") {
  return (type === "password" ? "p:" : "") + hashPasscode(input);
}

// ─── PIN pad ──────────────────────────────────────────────────────────────────

function PinPad({ value, onChange, onSubmit, minLen = 4, maxLen = 6 }) {
  // layout: 1-9, then [blank, 0, backspace]
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"];

  return (
    <div className="space-y-3">
      {/* Dots */}
      <div className="flex justify-center gap-3 py-2">
        {Array.from({ length: maxLen }).map((_, i) => (
          <div
            key={i}
            className={`w-3 h-3 rounded-full border-2 transition-all duration-150 ${
              i < value.length
                ? "bg-[var(--accent)] border-[var(--accent)]"
                : "border-zinc-600 bg-transparent"
            }`}
          />
        ))}
      </div>
      {/* Grid */}
      <div className="grid grid-cols-3 gap-2">
        {keys.map((k, i) => {
          if (k === "") return <div key={i} />;
          return (
            <button
              key={i}
              onClick={() => {
                if (k === "⌫") { onChange(value.slice(0, -1)); return; }
                if (value.length >= maxLen) return;
                const next = value + k;
                onChange(next);
                if (next.length === maxLen) setTimeout(() => onSubmit(next), 150);
              }}
              className="h-10 rounded-lg text-[15px] font-bold text-zinc-200 bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 border border-zinc-700 transition-colors"
            >
              {k === "⌫" ? "←" : k}
            </button>
          );
        })}
      </div>
      {/* Confirm — PINs shorter than maxLen need an explicit submit */}
      <button
        onClick={() => onSubmit(value)}
        disabled={value.length < minLen}
        className="w-full h-9 rounded-lg text-[12px] font-bold border transition-colors border-[var(--accent)] bg-[var(--accent-bg)] text-[var(--accent)] hover:opacity-80 disabled:opacity-30 disabled:cursor-not-allowed"
      >
        OK
      </button>
    </div>
  );
}

// ─── Text password input ──────────────────────────────────────────────────────

function PasswordInput({ value, onChange, onSubmit, placeholder = "Enter password…" }) {
  const [show, setShow] = useState(false);
  const inputRef = useRef(null);
  useEffect(() => { inputRef.current?.focus(); }, []);
  return (
    <div className="flex items-center gap-2">
      <input
        ref={inputRef}
        type={show ? "text" : "password"}
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") onSubmit(value); }}
        placeholder={placeholder}
        className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-[13px] text-zinc-200 focus:outline-none focus:border-zinc-500 placeholder:text-zinc-600"
      />
      <button onClick={() => setShow(s => !s)} className="text-zinc-600 hover:text-zinc-300 transition-colors p-1.5">
        {show ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
      <button
        onClick={() => onSubmit(value)}
        disabled={!value}
        className="px-3 py-2 rounded-lg bg-[var(--accent-bg)] border border-[var(--accent)] text-[var(--accent)] text-[11px] font-bold transition-colors hover:opacity-80 disabled:opacity-30"
      >
        OK
      </button>
    </div>
  );
}

// ─── Main modal ───────────────────────────────────────────────────────────────

export default function PasscodeModal({
  mode,          // "unlock" | "set"
  type,          // "pin" | "password" — initial type; unlock auto-detects from the stored hash
  storedHash,    // for unlock
  title,
  onSuccess,
  onCancel,
}) {
  const [step, setStep] = useState("enter");
  const [pin, setPin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [firstEntry, setFirstEntry] = useState("");
  const isUnlock = mode === "unlock";
  const [localType, setLocalType] = useState(() =>
    isUnlock && storedHash?.startsWith("p:") ? "password" : (type || "pin")
  );

  const handleUnlockSubmit = (value) => {
    if (!value) return;
    if (checkPasscode(storedHash, value)) {
      onSuccess(value);
    } else {
      setError("Wrong passcode");
      setPin(""); setPassword("");
      setTimeout(() => setError(""), 1800);
    }
  };

  const handleSetPin = (v) => {
    if (v.length < 4) { setError("Need at least 4 digits"); return; }
    setError("");
    if (step === "enter") {
      setFirstEntry(v);
      setStep("confirm");
      setPin("");
    } else {
      if (v === firstEntry) {
        onSuccess(storePasscode(v, "pin"));
      } else {
        setError("PINs don't match — try again");
        setStep("enter");
        setPin("");
        setFirstEntry("");
        setTimeout(() => setError(""), 1800);
      }
    }
  };

  const handleSetPassword = (v) => {
    if (!v || v.length < 6) { setError("Min 6 characters"); return; }
    setError("");
    if (step === "enter") {
      setFirstEntry(v);
      setStep("confirm");
      setPassword("");
    } else {
      if (v === firstEntry) {
        onSuccess(storePasscode(v, "password"));
      } else {
        setError("Passwords don't match — try again");
        setStep("enter");
        setPassword("");
        setFirstEntry("");
        setTimeout(() => setError(""), 1800);
      }
    }
  };

  return (
    <div className="passcode-overlay">
      <div className="w-[300px] bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <Lock size={14} className="text-zinc-400" />
            <span className="text-[13px] font-bold text-zinc-200">{title || (isUnlock ? "Unlock" : "Set Passcode")}</span>
          </div>
          {onCancel && (
            <button onClick={onCancel} className="text-zinc-600 hover:text-zinc-300 transition-colors">
              <X size={14} />
            </button>
          )}
        </div>

        <div className="px-5 py-5 space-y-4">
          {/* Type selector (only when setting) */}
          {!isUnlock && step === "enter" && !firstEntry && (
            <div className="flex gap-2">
              {["pin", "password"].map(t => (
                <button key={t} onClick={() => { setLocalType(t); setPin(""); setPassword(""); setError(""); }}
                  className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold border transition-colors ${localType === t ? "border-[var(--accent)] bg-[var(--accent-bg)] text-[var(--accent)]" : "border-zinc-700 text-zinc-500 hover:text-zinc-300"}`}>
                  {t === "pin" ? "PIN" : "Password"}
                </button>
              ))}
            </div>
          )}

          {/* Step label */}
          <p className="text-[11px] text-zinc-500 text-center">
            {isUnlock && "Enter your passcode to continue"}
            {!isUnlock && step === "enter" && (localType === "pin" ? "Enter a PIN (4–6 digits)" : "Enter a password (6+ chars)")}
            {!isUnlock && step === "confirm" && "Confirm your passcode"}
          </p>

          {/* Input */}
          {localType === "pin" ? (
            <PinPad
              value={pin}
              onChange={setPin}
              minLen={4}
              maxLen={6}
              onSubmit={isUnlock ? handleUnlockSubmit : handleSetPin}
            />
          ) : (
            <PasswordInput
              value={password}
              onChange={setPassword}
              onSubmit={isUnlock ? handleUnlockSubmit : handleSetPassword}
              placeholder={step === "confirm" ? "Confirm password…" : "Enter password…"}
            />
          )}

          {/* Escape hatch for locks saved before the type prefix existed */}
          {isUnlock && (
            <button
              onClick={() => { setLocalType(t => (t === "pin" ? "password" : "pin")); setPin(""); setPassword(""); setError(""); }}
              className="w-full text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors"
            >
              {localType === "pin" ? "Use a password instead" : "Use a PIN instead"}
            </button>
          )}

          {/* Error */}
          {error && (
            <p className="text-[11px] text-red-400 text-center animate-pulse">{error}</p>
          )}
        </div>
      </div>
    </div>
  );
}
