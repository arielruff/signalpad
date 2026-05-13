import React, { useRef, useEffect, useState } from "react";

export default function ContextMenu({ x, y, items, onClose }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ left: x, top: y });

  useEffect(() => {
    if (!ref.current) return;
    const { offsetWidth: w, offsetHeight: h } = ref.current;
    setPos({
      left: Math.min(x, window.innerWidth  - w - 6),
      top:  Math.min(y, window.innerHeight - h - 6),
    });
  }, [x, y]);

  useEffect(() => {
    const handleDown = (e) => { if (!ref.current?.contains(e.target)) onClose(); };
    const handleKey  = (e) => { if (e.key === "Escape") onClose(); };
    const t = setTimeout(() => {
      document.addEventListener("mousedown", handleDown);
      document.addEventListener("keydown",   handleKey);
    }, 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", handleDown);
      document.removeEventListener("keydown",   handleKey);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      style={{ left: pos.left, top: pos.top }}
      className="fixed z-[200] min-w-[172px] bg-zinc-900 border border-zinc-700/60 rounded-lg shadow-2xl py-1 select-none"
    >
      {items.map((item, i) =>
        item.separator ? (
          <div key={i} className="border-t border-zinc-800/80 my-1" />
        ) : (
          <button
            key={i}
            onClick={() => { item.action(); onClose(); }}
            disabled={item.disabled}
            className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-[11px] text-left transition-colors
              disabled:opacity-30 disabled:cursor-not-allowed
              ${item.danger
                ? "text-red-400 hover:bg-red-950 hover:text-red-300"
                : "text-zinc-300 hover:bg-zinc-700 hover:text-white"}`}
          >
            {item.icon && (
              <span className={`shrink-0 ${item.danger ? "text-red-400" : "text-zinc-500"}`}>
                {item.icon}
              </span>
            )}
            <span className="flex-1">{item.label}</span>
            {item.shortcut && (
              <span className="text-[9px] text-zinc-600 font-mono">{item.shortcut}</span>
            )}
          </button>
        )
      )}
    </div>
  );
}
