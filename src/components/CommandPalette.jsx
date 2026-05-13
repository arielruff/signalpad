import React, { useState, useEffect, useRef } from "react";
import { Plus, Pin, PinOff, Trash2, Search } from "lucide-react";

export default function CommandPalette({ notes, onClose, onNavigate, onNew, onDelete, onTogglePin }) {
  const [query, setQuery] = useState("");
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const [cursor, setCursor] = useState(0);

  useEffect(() => { inputRef.current?.focus(); }, []);

  // Static commands + note entries
  const staticCmds = [
    { id: "__new__", label: "New Note", icon: <Plus size={11} />, run: () => { onNew(); onClose(); } },
  ];

  const noteMatches = notes.filter((n) => {
    if (!query) return true;
    return (n.title || "Untitled").toLowerCase().includes(query.toLowerCase());
  });

  const items = query
    ? noteMatches.map((n) => ({
        id: n.id,
        label: (n.emoji ? n.emoji + " " : "") + (n.title || "Untitled"),
        sub: n.pinned ? "Pinned" : null,
        run: () => { onNavigate(n.id); onClose(); },
        note: n,
      }))
    : [
        ...staticCmds,
        ...noteMatches.map((n) => ({
          id: n.id,
          label: (n.emoji ? n.emoji + " " : "") + (n.title || "Untitled"),
          sub: n.pinned ? "Pinned" : null,
          run: () => { onNavigate(n.id); onClose(); },
          note: n,
        })),
      ];

  const total = items.length;

  useEffect(() => { setCursor(0); }, [query]);

  const handleKey = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(c + 1, total - 1)); }
    if (e.key === "ArrowUp")   { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
    if (e.key === "Enter")     { e.preventDefault(); items[cursor]?.run(); }
    if (e.key === "Escape")    { onClose(); }
  };

  // Scroll cursor into view
  useEffect(() => {
    const el = listRef.current?.children[cursor];
    el?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-24"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-[420px] rounded-xl border border-zinc-700/60 bg-zinc-950 shadow-2xl overflow-hidden">
        {/* Search input */}
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-zinc-800">
          <Search size={13} className="text-zinc-500 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Jump to note or run command…"
            className="flex-1 bg-transparent text-[12px] text-zinc-100 focus:outline-none placeholder:text-zinc-600"
          />
          <kbd className="text-[9px] text-zinc-600 border border-zinc-700 rounded px-1 py-0.5">ESC</kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="overflow-y-auto max-h-[320px] py-1">
          {items.length === 0 && (
            <p className="py-8 text-center text-[11px] text-zinc-600">No results for "{query}"</p>
          )}
          {items.map((item, i) => (
            <button
              key={item.id}
              onMouseEnter={() => setCursor(i)}
              onMouseDown={() => item.run()}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${
                i === cursor ? "bg-zinc-800/80 text-zinc-100" : "text-zinc-300 hover:bg-zinc-800/50"
              }`}
            >
              {item.icon && <span className="text-zinc-500 shrink-0">{item.icon}</span>}
              <span className="flex-1 text-[12px] truncate">{item.label}</span>
              {item.sub && (
                <span className="text-[9px] text-amber-500/70 border border-amber-500/25 rounded px-1 py-0.5 shrink-0">
                  {item.sub}
                </span>
              )}
              {item.note && (
                <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100">
                  <button
                    onMouseDown={(e) => { e.stopPropagation(); onTogglePin(item.note.id); onClose(); }}
                    className="p-1 rounded hover:bg-zinc-700/60 text-zinc-600 hover:text-amber-400"
                    title={item.note.pinned ? "Unpin" : "Pin"}
                  >
                    {item.note.pinned ? <PinOff size={10} /> : <Pin size={10} />}
                  </button>
                  <button
                    onMouseDown={(e) => { e.stopPropagation(); onDelete(item.note.id); onClose(); }}
                    className="p-1 rounded hover:bg-zinc-700/60 text-zinc-600 hover:text-red-400"
                    title="Delete"
                  >
                    <Trash2 size={10} />
                  </button>
                </div>
              )}
            </button>
          ))}
        </div>

        <div className="px-3 py-1.5 border-t border-zinc-800 flex items-center gap-3 text-[9px] text-zinc-700">
          <span><kbd className="border border-zinc-800 rounded px-1">↑↓</kbd> navigate</span>
          <span><kbd className="border border-zinc-800 rounded px-1">↵</kbd> open</span>
          <span><kbd className="border border-zinc-800 rounded px-1">Esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
