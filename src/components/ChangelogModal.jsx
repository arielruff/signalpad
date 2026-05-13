import React, { useEffect } from "react";
import { X, NotebookPen } from "lucide-react";
import changelog from "../changelog.json";

export default function ChangelogModal({ onClose }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-zinc-950 border border-zinc-700 rounded-lg shadow-2xl w-[400px] max-h-[500px] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 shrink-0">
          <div className="flex items-center gap-2">
            <NotebookPen size={12} className="text-cyan-400" />
            <span className="text-[11px] font-bold tracking-[0.16em] uppercase text-cyan-400">Patch Notes</span>
          </div>
          <button
            onClick={onClose}
            className="w-5 h-5 flex items-center justify-center rounded text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
          >
            <X size={11} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-4 space-y-5">
          {changelog.history.map((entry, i) => (
            <div key={entry.version}>
              <div className="flex items-baseline gap-2 mb-2">
                <span className="text-[13px] font-bold text-cyan-400 font-mono">v{entry.version}</span>
                <span className="text-[10px] text-zinc-600">{entry.date}</span>
                {i === 0 && (
                  <span className="ml-auto text-[8px] font-bold uppercase tracking-wider text-cyan-600 bg-cyan-500/10 border border-cyan-500/20 px-1.5 py-0.5 rounded">
                    Latest
                  </span>
                )}
              </div>
              <ul className="space-y-1.5">
                {entry.changes.length > 0 ? entry.changes.map((change, j) => (
                  <li key={j} className="flex items-start gap-2 text-[11px] text-zinc-400">
                    <span className="text-cyan-700 mt-px shrink-0">—</span>
                    <span>{change}</span>
                  </li>
                )) : (
                  <li className="text-[11px] text-zinc-700 italic">No changes recorded</li>
                )}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
