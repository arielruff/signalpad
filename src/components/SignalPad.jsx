import React, { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  X, Plus, Pin, PinOff, Trash2, ChevronLeft, Edit3,
  Bold, Italic, Underline, Strikethrough, List, ListOrdered, Minus,
  Heading2, BookOpen, NotebookPen, Type, ChevronDown, Settings, Download, FolderOpen,
  FileText, Upload, Camera, Flame, Maximize2, Minimize2, Copy, GripVertical,
  Hash, AlignCenter, History, Smile, HelpCircle, Star, MoreHorizontal, Scissors,
  CheckSquare, Lock, Sun, Moon, Palette, Cloud, CloudOff,
} from "lucide-react";
import { SceneCanvas, SCENES } from "./PixelArtScene";
import PasscodeModal, { checkPasscode, storePasscode } from "./PasscodeModal";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LogicalSize } from "@tauri-apps/api/dpi";
import { invoke } from "@tauri-apps/api/core";
import { save as saveDialog, open as openDialog } from "@tauri-apps/plugin-dialog";
import { marked } from "marked";
import TurndownService from "turndown";
import { register as registerShortcut } from "@tauri-apps/plugin-global-shortcut";
import { useSignalPadStore } from "../stores/useSignalPadStore";
import ContextMenu from "./ContextMenu";
import CommandPalette from "./CommandPalette";
import ActivityHeatmap from "./ActivityHeatmap";
import AmbientSound from "./AmbientSound";

marked.setOptions({ gfm: true, breaks: true });

const td = new TurndownService({ headingStyle: "atx", bulletListMarker: "-" });

// ─── Google Fonts ─────────────────────────────────────────────────────────────

export const TOOLBAR_ICON_CONFIG = [
  { id: "emoji",      label: "Emoji picker"       },
  { id: "color",      label: "Color tint"         },
  { id: "typewriter", label: "Typewriter mode"    },
  { id: "mdpreview",  label: "Markdown preview"   },
  { id: "pin",        label: "Pin"                },
  { id: "burn",       label: "Burn after reading" },
  { id: "copymd",     label: "Copy as Markdown"   },
  { id: "snapshot",   label: "Snapshot"           },
  { id: "history",    label: "Snapshot history"   },
  { id: "zen",        label: "Zen mode"           },
];

const GOOGLE_FONTS = [
  "Abril Fatface", "Anton", "Barlow", "Bebas Neue", "Caveat", "Cinzel",
  "Cormorant", "Crimson Text", "Dancing Script", "DM Sans", "EB Garamond",
  "Exo 2", "Fira Code", "Figtree", "IBM Plex Mono", "Inconsolata", "Inter",
  "JetBrains Mono", "Jost", "Kalam", "Karla", "Lato", "Libre Baskerville",
  "Lobster", "Lora", "Manrope", "Merriweather", "Montserrat", "Mulish",
  "Nunito", "Open Sans", "Outfit", "Pacifico", "Permanent Marker",
  "Playfair Display", "Plus Jakarta Sans", "Poppins", "Raleway", "Roboto",
  "Roboto Mono", "Rubik", "Satisfy", "Sora", "Source Code Pro", "Space Mono",
  "Spectral", "Ubuntu", "Work Sans",
];

let googleFontsInjected = false;
function ensureGoogleFonts() {
  if (googleFontsInjected) return;
  googleFontsInjected = true;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  const families = GOOGLE_FONTS.map((f) => `family=${f.replace(/ /g, "+")}`).join("&");
  link.href = `https://fonts.googleapis.com/css2?${families}&display=swap`;
  document.head.appendChild(link);
}
ensureGoogleFonts();

const SYSTEM_FONTS = [
  { name: "Default", family: "" }, { name: "Arial", family: "Arial" },
  { name: "Courier New", family: "Courier New" }, { name: "Georgia", family: "Georgia" },
  { name: "Impact", family: "Impact" }, { name: "Tahoma", family: "Tahoma" },
  { name: "Times New Roman", family: "Times New Roman" }, { name: "Trebuchet MS", family: "Trebuchet MS" },
  { name: "Verdana", family: "Verdana" },
];

const COLOR_PRESETS = [
  "#22d3ee", "#a78bfa", "#f472b6", "#fb923c", "#4ade80",
  "#facc15", "#f87171", "#38bdf8", "#e879f9", "#34d399",
];

const EMOJI_LIST = [
  "📝","💡","🔥","⭐","📚","🎯","💪","🎨","🌙","☀️",
  "🏆","🔮","💬","🎵","🌿","⚡","🛠️","🎲","🌊","🔑",
  "💎","🦋","🐉","🌈","📌","💼","🏠","🌺","🤖","🧠",
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return (
    d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
    " " +
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
  );
}

function fmtTs(ts) {
  return fmtDate(new Date(ts).toISOString());
}

function notePreview(html) {
  const div = document.createElement("div");
  div.innerHTML = html || "";
  return (div.textContent || "").slice(0, 90) || "Empty note";
}

function extractTags(html) {
  const div = document.createElement("div");
  div.innerHTML = html || "";
  const text = div.textContent || "";
  return [...new Set([...text.matchAll(/#(\w+)/g)].map((m) => m[1]))];
}

function processWikiLinks(html) {
  return html.replace(/\[\[([^\]]+)\]\]/g, (_, title) => {
    const safe = title.replace(/"/g, "&quot;");
    return `<span class="wiki-link" data-wikilink="${encodeURIComponent(title)}">«${safe}»</span>`;
  });
}

// ─── Font dropdown ────────────────────────────────────────────────────────────

function FontDropdown({ onSelect, onBrowse }) {
  const { addedFonts } = useSignalPadStore();
  const [search, setSearch] = useState("");
  const q = search.toLowerCase();
  const filteredSystem = q ? SYSTEM_FONTS.filter((f) => f.name.toLowerCase().includes(q)) : SYSTEM_FONTS;
  const filteredAdded = (addedFonts ?? []).filter((f) => !q || f.toLowerCase().includes(q));

  return (
    <div className="absolute top-full left-0 right-0 z-50 bg-zinc-950 border-x border-b border-zinc-700 shadow-2xl">
      <div className="px-2 py-1.5 border-b border-zinc-800">
        <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search fonts…"
          className="w-full bg-zinc-800 text-[11px] text-zinc-200 px-2.5 py-1.5 rounded border border-zinc-700 focus:outline-none focus:border-zinc-500/80 placeholder:text-zinc-600" />
      </div>
      <div className="overflow-y-auto max-h-[220px]">
        {filteredSystem.length > 0 && (
          <div>
            <div className="px-3 pt-2 pb-0.5 text-[8px] font-bold uppercase tracking-[0.16em] text-zinc-600">System</div>
            {filteredSystem.map((f) => (
              <button key={f.name} onMouseDown={(e) => { e.preventDefault(); onSelect(f.family); }}
                className="block w-full text-left px-3 py-1.5 text-[12px] text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors"
                style={{ fontFamily: f.family || "inherit" }}>{f.name}</button>
            ))}
          </div>
        )}
        {filteredAdded.length > 0 && (
          <div>
            <div className="px-3 pt-2 pb-0.5 text-[8px] font-bold uppercase tracking-[0.16em] text-zinc-600">Your Fonts</div>
            {filteredAdded.map((f) => (
              <button key={f} onMouseDown={(e) => { e.preventDefault(); onSelect(f); }}
                className="block w-full text-left px-3 py-1.5 text-[12px] text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors"
                style={{ fontFamily: `'${f}', sans-serif` }}>{f}</button>
            ))}
          </div>
        )}
        {filteredSystem.length === 0 && filteredAdded.length === 0 && (
          <p className="py-6 text-center text-[10px] text-zinc-600">No match for "{search}"</p>
        )}
      </div>
      <div className="border-t border-zinc-800 p-1.5">
        <button onMouseDown={(e) => { e.preventDefault(); onBrowse(); }}
          className="w-full flex items-center gap-2 px-3 py-1.5 rounded text-[11px] text-zinc-400 hover:text-cyan-400 hover:bg-cyan-500/10 transition-colors">
          <Plus size={10} /> Browse Google Fonts
        </button>
      </div>
    </div>
  );
}

function GoogleFontBrowser({ onSelect, onBack }) {
  const [search, setSearch] = useState("");
  const filtered = search ? GOOGLE_FONTS.filter((f) => f.toLowerCase().includes(search.toLowerCase())) : GOOGLE_FONTS;
  return (
    <div className="absolute top-full left-0 right-0 z-50 bg-zinc-950 border-x border-b border-zinc-700 shadow-2xl">
      <div className="px-2 py-1.5 border-b border-zinc-800 flex items-center gap-1.5">
        <button onMouseDown={(e) => { e.preventDefault(); onBack(); }} className="text-zinc-600 hover:text-zinc-300 transition-colors shrink-0"><ChevronLeft size={13} /></button>
        <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search Google Fonts…"
          className="flex-1 bg-zinc-800 text-[11px] text-zinc-200 px-2.5 py-1.5 rounded border border-zinc-700 focus:outline-none focus:border-zinc-500/80 placeholder:text-zinc-600" />
      </div>
      <div className="overflow-y-auto max-h-[200px] grid grid-cols-2 p-1.5 gap-0.5">
        {filtered.map((font) => (
          <button key={font} onMouseDown={(e) => { e.preventDefault(); onSelect(font); }} title={font}
            className="text-left px-3 py-1.5 rounded text-[12px] text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors truncate"
            style={{ fontFamily: `'${font}', sans-serif` }}>{font}</button>
        ))}
        {filtered.length === 0 && <p className="col-span-2 py-6 text-center text-[10px] text-zinc-600">No match for "{search}"</p>}
      </div>
      <div className="px-3 py-1 border-t border-zinc-800 text-[8px] text-zinc-700 tracking-wider uppercase">Click to add &amp; apply</div>
    </div>
  );
}

// ─── Formatting toolbar ───────────────────────────────────────────────────────

function ToolbarBtn({ title, onClick, children }) {
  return (
    <button title={title} onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      className="px-1.5 py-1 rounded text-[11px] font-mono transition-colors text-zinc-400 hover:text-white hover:bg-zinc-700">
      {children}
    </button>
  );
}

const FONT_SIZES = [9, 10, 11, 12, 13, 14, 16, 18, 20, 24];

function FormatToolbar({ editorRef }) {
  const { addFont } = useSignalPadStore();
  const [showFontDropdown, setShowFontDropdown] = useState(false);
  const [showFontBrowser, setShowFontBrowser] = useState(false);
  const [showSizePicker, setShowSizePicker] = useState(false);
  const [currentSize, setCurrentSize] = useState(12);
  const savedRangeRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!showFontDropdown && !showFontBrowser && !showSizePicker) return;
    let handler;
    const id = setTimeout(() => {
      handler = (e) => {
        if (containerRef.current && !containerRef.current.contains(e.target)) {
          setShowFontDropdown(false); setShowFontBrowser(false); setShowSizePicker(false);
        }
      };
      document.addEventListener("mousedown", handler);
    }, 0);
    return () => { clearTimeout(id); if (handler) document.removeEventListener("mousedown", handler); };
  }, [showFontDropdown, showFontBrowser, showSizePicker]);

  const cmd = (command, value = null) => { editorRef.current?.focus(); document.execCommand(command, false, value); };
  const saveSelection = () => {
    const sel = window.getSelection();
    if (sel?.rangeCount > 0 && editorRef.current?.contains(sel.anchorNode))
      savedRangeRef.current = sel.getRangeAt(0).cloneRange();
  };
  const restoreSelection = () => {
    editorRef.current?.focus();
    const sel = window.getSelection();
    if (savedRangeRef.current) { sel.removeAllRanges(); sel.addRange(savedRangeRef.current); }
  };
  const applyFontFamily = (family) => {
    restoreSelection();
    if (!family) { document.execCommand("removeFormat"); }
    else { document.execCommand("styleWithCSS", false, true); document.execCommand("fontName", false, family); }
  };
  const applyFontSize = (sizePx) => {
    editorRef.current?.focus();
    document.execCommand("styleWithCSS", false, false);
    document.execCommand("fontSize", false, "7");
    const fontEls = editorRef.current?.querySelectorAll('font[size="7"]') ?? [];
    fontEls.forEach((el) => {
      const span = document.createElement("span");
      span.style.fontSize = sizePx;
      while (el.firstChild) span.appendChild(el.firstChild);
      el.parentNode.replaceChild(span, el);
    });
  };
  const closeAll = () => { setShowFontDropdown(false); setShowFontBrowser(false); setShowSizePicker(false); };
  const fontActive = showFontDropdown || showFontBrowser;

  const insertChecklist = () => {
    editorRef.current?.focus();
    const html = `<div class="checklist-item"><input type="checkbox" /><span>&nbsp;</span></div>`;
    document.execCommand("insertHTML", false, html);
  };

  return (
    <div ref={containerRef} className="relative shrink-0">
      <div className="flex items-center gap-0.5 px-2 py-1 border-b border-zinc-700 bg-zinc-950 overflow-x-auto">
        {/* Font controls FIRST */}
        <button title="Font" onMouseDown={(e) => { e.preventDefault(); if (fontActive) { closeAll(); return; } saveSelection(); setShowFontDropdown(true); setShowSizePicker(false); }}
          className={`px-1.5 py-1 rounded text-[10px] transition-colors flex items-center gap-0.5 ${fontActive ? "text-cyan-400 bg-zinc-700" : "text-zinc-400 hover:text-white hover:bg-zinc-700"}`}>
          <Type size={11} /><ChevronDown size={8} />
        </button>
        <button title="Font size" onMouseDown={(e) => { e.preventDefault(); setShowFontDropdown(false); setShowFontBrowser(false); setShowSizePicker((p) => !p); }}
            className={`px-1.5 py-1 rounded text-[10px] font-mono transition-colors min-w-[26px] text-center ${showSizePicker ? "text-cyan-400 bg-zinc-700" : "text-zinc-400 hover:text-white hover:bg-zinc-700"}`}>
            {currentSize}
          </button>
        <div className="w-px h-4 bg-zinc-700 mx-1" />
        <ToolbarBtn title="Bold (Ctrl+B)" onClick={() => cmd("bold")}><Bold size={11} /></ToolbarBtn>
        <ToolbarBtn title="Italic (Ctrl+I)" onClick={() => cmd("italic")}><Italic size={11} /></ToolbarBtn>
        <ToolbarBtn title="Underline (Ctrl+U)" onClick={() => cmd("underline")}><Underline size={11} /></ToolbarBtn>
        <ToolbarBtn title="Strikethrough" onClick={() => cmd("strikethrough")}><Strikethrough size={11} /></ToolbarBtn>
        <div className="w-px h-4 bg-zinc-700 mx-1" />
        <ToolbarBtn title="Heading" onClick={() => cmd("formatBlock", "<h3>")}><Heading2 size={11} /></ToolbarBtn>
        <ToolbarBtn title="Bullet list" onClick={() => cmd("insertUnorderedList")}><List size={11} /></ToolbarBtn>
        <ToolbarBtn title="Numbered list" onClick={() => cmd("insertOrderedList")}><ListOrdered size={11} /></ToolbarBtn>
        <ToolbarBtn title="Checklist" onClick={insertChecklist}><CheckSquare size={11} /></ToolbarBtn>
        <div className="w-px h-4 bg-zinc-700 mx-1" />
        <ToolbarBtn title="Divider" onClick={() => cmd("insertHorizontalRule")}><Minus size={11} /></ToolbarBtn>
        <ToolbarBtn title="Clear formatting" onClick={() => cmd("removeFormat")}><span className="text-[9px]">Tx</span></ToolbarBtn>
      </div>
      {showFontDropdown && <FontDropdown onSelect={(family) => { applyFontFamily(family); closeAll(); }} onBrowse={() => { setShowFontDropdown(false); setShowFontBrowser(true); }} />}
      {showFontBrowser && <GoogleFontBrowser onSelect={(font) => { addFont(font); applyFontFamily(font); closeAll(); }} onBack={() => { setShowFontBrowser(false); setShowFontDropdown(true); }} />}
      {showSizePicker && (
        <div className="absolute top-full right-0 z-50 mt-0.5 bg-zinc-950 border border-zinc-700 rounded shadow-xl overflow-hidden min-w-[44px]">
          {FONT_SIZES.map((s) => (
            <button key={s} onMouseDown={(e) => { e.preventDefault(); setCurrentSize(s); applyFontSize(`${s}px`); setShowSizePicker(false); }}
              className={`block w-full text-right px-3 py-1 text-[11px] font-mono transition-colors ${currentSize === s ? "text-cyan-400 bg-cyan-950" : "text-zinc-300 hover:bg-zinc-700 hover:text-white"}`}>{s}</button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Pin badge ────────────────────────────────────────────────────────────────

function PinBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-[8px] font-bold tracking-widest uppercase px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-800">
      <Pin size={7} /> Pinned
    </span>
  );
}

// ─── Emoji picker ─────────────────────────────────────────────────────────────

function EmojiPicker({ onSelect, onClear }) {
  return (
    <div className="absolute top-full left-0 z-50 mt-1 bg-zinc-950 border border-zinc-700 rounded-lg shadow-2xl p-2 w-[180px]">
      <div className="grid grid-cols-6 gap-1">
        {EMOJI_LIST.map((e) => (
          <button key={e} onClick={() => onSelect(e)}
            className="text-[16px] p-1 rounded hover:bg-zinc-800 transition-colors text-center leading-none">
            {e}
          </button>
        ))}
      </div>
      <button onClick={onClear} className="w-full mt-1.5 text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors py-1">
        Clear emoji
      </button>
    </div>
  );
}

// ─── Color picker ─────────────────────────────────────────────────────────────

function ColorPickerPanel({ current, onSelect, onClear }) {
  return (
    <div className="absolute top-full right-0 z-50 mt-1 bg-zinc-950 border border-zinc-700 rounded-lg shadow-2xl p-2">
      <div className="flex flex-wrap gap-1.5 w-[130px]">
        {COLOR_PRESETS.map((c) => (
          <button key={c} onClick={() => onSelect(c)} title={c}
            className={`w-5 h-5 rounded-full border-2 transition-transform hover:scale-110 ${current === c ? "border-white" : "border-transparent"}`}
            style={{ backgroundColor: c }} />
        ))}
      </div>
      <button onClick={onClear} className="w-full mt-1.5 text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors py-1">
        Clear colour
      </button>
    </div>
  );
}

// ─── Note card (list view) ────────────────────────────────────────────────────

function CardScenePicker({ sceneId, onSelect, onClose, anchorRef }) {
  const [pos, setPos] = useState(null);
  const pickerRef = useRef(null);

  useEffect(() => {
    if (anchorRef?.current) {
      const r = anchorRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
    }
  }, [anchorRef]);

  useEffect(() => {
    const handler = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) onClose();
    };
    const id = setTimeout(() => document.addEventListener("mousedown", handler), 0);
    return () => { clearTimeout(id); document.removeEventListener("mousedown", handler); };
  }, [onClose]);

  if (!pos) return null;

  return createPortal(
    <div
      ref={pickerRef}
      onClick={(e) => e.stopPropagation()}
      style={{ position: "fixed", top: pos.top, right: pos.right, zIndex: 9990, width: 180 }}
      className="flex flex-col bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl overflow-hidden"
    >
      <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-zinc-800 shrink-0">
        <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-500">Scene</span>
        <button onClick={onClose} className="text-zinc-600 hover:text-zinc-300 transition-colors"><X size={10} /></button>
      </div>
      <div className="overflow-y-auto max-h-[240px] p-1">
        <button onClick={() => { onSelect(null); onClose(); }}
          className={`w-full text-left px-2 py-1 rounded text-[10px] transition-colors mb-0.5 ${!sceneId ? "bg-cyan-500/20 text-cyan-300" : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"}`}>
          Document snapshot
        </button>
        {["Weather","Scenes"].map(cat => (
          <div key={cat}>
            <div className="px-2 pt-1.5 pb-0.5 text-[8px] font-bold uppercase tracking-widest text-zinc-600">{cat}</div>
            {SCENES.filter(s => s.category === cat).map(s => (
              <button key={s.id} onClick={() => { onSelect(s.id); onClose(); }}
                className={`w-full text-left px-2 py-1 rounded text-[10px] transition-colors ${sceneId === s.id ? "bg-cyan-500/20 text-cyan-300" : "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"}`}>
                {s.label}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>,
    document.body
  );
}

function NoteCard({ note, onClick, onReveal, onContextMenu, draggable, onDragStart, onDragOver, onDrop, dragOver, sceneId, onSetScene }) {
  const [showPicker, setShowPicker] = useState(false);
  const pickerBtnRef = useRef(null);

  const cardStyle = note.color
    ? { borderColor: note.color + "55", backgroundColor: note.color + "0C" }
    : {};

  return (
    <div
      onContextMenu={onContextMenu}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      style={cardStyle}
      className={`group w-full flex flex-row rounded-lg border transition-all duration-150 cursor-pointer overflow-hidden h-[76px]
        ${dragOver ? "ring-1 ring-cyan-400/50" : ""}
        ${note.pinned && !note.color
          ? "border-amber-800 bg-amber-500/[0.04] hover:bg-amber-500/[0.08]"
          : !note.color
          ? "border-zinc-700 bg-zinc-900/40 hover:bg-zinc-800 hover:border-zinc-600/60"
          : "hover:brightness-110"
        }`}
    >
      {/* Left: note info (1/4) */}
      <div className="w-1/4 min-w-0 px-2.5 py-2.5 flex flex-col justify-between" onClick={onClick}>
        <div>
          <div className="flex items-start justify-between gap-1 mb-1">
            <span className={`text-[12px] font-semibold leading-tight truncate ${note.pinned ? "text-amber-100" : "text-zinc-100"}`}>
              {note.emoji && <span className="mr-1.5">{note.emoji}</span>}
              {note.title || "Untitled"}
            </span>
            <div className="flex items-center gap-1 shrink-0">
              {note.burn && <Flame size={9} className="text-orange-400/70" />}
              {note.pinned && <PinBadge />}
              {draggable && (
                <span className="opacity-0 group-hover:opacity-100 transition-opacity text-zinc-700 cursor-grab">
                  <GripVertical size={11} />
                </span>
              )}
              <button onClick={(e) => { e.stopPropagation(); onReveal(); }} title="Show in folder"
                className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded text-zinc-600 hover:text-zinc-300 hover:bg-zinc-700">
                <FolderOpen size={11} />
              </button>
            </div>
          </div>
          <p className="text-[10px] text-zinc-500 leading-relaxed line-clamp-2">{notePreview(note.content)}</p>
        </div>
        <p className="text-[9px] text-zinc-700 mt-1">{fmtDate(note.updatedAt)}</p>
      </div>

      {/* Right: pixel art panel (3/4) */}
      <div className="w-3/4 shrink-0 relative border-l border-zinc-800 overflow-hidden">
        <SceneCanvas sceneId={sceneId} noteContent={note.content} />
        {/* choose scene button — appears on hover */}
        <button
          ref={pickerBtnRef}
          onClick={(e) => { e.stopPropagation(); setShowPicker(s => !s); }}
          title="Choose scene"
          className="absolute bottom-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded bg-zinc-900/80 text-zinc-500 hover:text-zinc-200"
        >
          <ChevronDown size={9} />
        </button>
        {showPicker && (
          <CardScenePicker
            sceneId={sceneId}
            anchorRef={pickerBtnRef}
            onSelect={(id) => { onSetScene(note.id, id); setShowPicker(false); }}
            onClose={() => setShowPicker(false)}
          />
        )}
      </div>
    </div>
  );
}

// ─── Spellcheck helpers ───────────────────────────────────────────────────────

const COMMON_CORRECTIONS = {
  "accomodate":"accommodate","acheive":"achieve","acquaintence":"acquaintance",
  "acrage":"acreage","adn":"and","agressive":"aggressive","alot":"a lot",
  "amature":"amateur","aparent":"apparent","arguement":"argument",
  "athiest":"atheist","basicaly":"basically","becuase":"because",
  "beleive":"believe","calender":"calendar","carefull":"careful",
  "cemetary":"cemetery","changable":"changeable","cheif":"chief",
  "colleage":"colleague","comming":"coming","commited":"committed",
  "concious":"conscious","convience":"convenience","critisism":"criticism",
  "definately":"definitely","desparate":"desperate","dissapear":"disappear",
  "dissapoint":"disappoint","doesnt":"doesn't","dont":"don't",
  "embarass":"embarrass","enviroment":"environment","existance":"existence",
  "experiance":"experience","firey":"fiery","foriegn":"foreign",
  "fourty":"forty","freind":"friend","futher":"further","gaurd":"guard",
  "glamourous":"glamorous","goverment":"government","grammer":"grammar",
  "harrass":"harass","hieght":"height","humerous":"humorous",
  "ignorance":"ignorance","imediately":"immediately","independant":"independent",
  "inteligent":"intelligent","intresting":"interesting","irresistable":"irresistible",
  "its":"its","knowlege":"knowledge","labratory":"laboratory",
  "languege":"language","lenth":"length","liason":"liaison","libary":"library",
  "lisence":"license","maintainance":"maintenance","medeval":"medieval",
  "memmorable":"memorable","millenium":"millennium","miniscule":"minuscule",
  "mischevious":"mischievous","misspell":"misspell","neccessary":"necessary",
  "negotate":"negotiate","nieghbor":"neighbor","noticable":"noticeable",
  "occassion":"occasion","occured":"occurred","occuring":"occurring",
  "occurance":"occurrence","ommit":"omit","oppertunity":"opportunity",
  "oppurtunity":"opportunity","outragous":"outrageous","paralell":"parallel",
  "parliment":"parliament","pasttime":"pastime","peice":"piece",
  "perseverence":"perseverance","plagarism":"plagiarism","posession":"possession",
  "potatos":"potatoes","prefered":"preferred","privelege":"privilege",
  "probaly":"probably","pronounciation":"pronunciation","publically":"publicly",
  "questionaire":"questionnaire","recieve":"receive","recomend":"recommend",
  "refered":"referred","restaraunt":"restaurant","rythm":"rhythm",
  "sacrilegious":"sacrilegious","seige":"siege","seperate":"separate",
  "sherif":"sheriff","sieze":"seize","similer":"similar","sincerely":"sincerely",
  "socialy":"socially","speach":"speech","succesful":"successful",
  "supercede":"supersede","supress":"suppress","suprise":"surprise",
  "tatoo":"tattoo","tendancy":"tendency","threshhold":"threshold",
  "tommorow":"tomorrow","tounge":"tongue","truely":"truly","twelth":"twelfth",
  "tyrany":"tyranny","untill":"until","usualy":"usually","vaccum":"vacuum",
  "vegatable":"vegetable","visious":"vicious","wich":"which","wierd":"weird",
  "whereever":"wherever","wont":"won't","writting":"writing","yesturday":"yesterday",
};

function getWordAtPoint(x, y) {
  if (!document.caretRangeFromPoint) return { word: null, range: null };
  const range = document.caretRangeFromPoint(x, y);
  if (!range) return { word: null, range: null };
  try { range.expand("word"); } catch {}
  const word = range.toString().replace(/[^a-zA-Z''-]/g, "").trim();
  return { word: word || null, range: word ? range : null };
}

function getSpellSuggestions(word) {
  if (!word) return [];
  const lower = word.toLowerCase();
  const fix = COMMON_CORRECTIONS[lower];
  return fix ? [fix] : [];
}

// ─── Note editor ──────────────────────────────────────────────────────────────

function NoteEditor({ note, onBack, onSave, onDelete, onTogglePin, mdPreview, onMdPreviewChange, zenMode, onZenChange, onNavigate, onShowContextMenu }) {
  const { saveFormat, saveNoteTo, setNoteEmoji, setNoteColor, toggleBurn, saveSnapshot, listSnapshots, readSnapshot, deleteSnapshot, saveAutoSnapshot, listAutoSnapshots, starAutoSnapshot, unstarAutoSnapshot, deleteUnstarredAutoSnapshots, starredAutoSnaps, toolbarVisible, noteScenes, setNoteScene, notePasscodes, setNotePasscode, spellcheck, setSpellcheck } = useSignalPadStore();
  const vis = (id) => toolbarVisible.has(id);

  const [title, setTitle] = useState(note.title || "");
  const [viewMode, setViewMode] = useState(note.pinned);
  const [askingFormat, setAskingFormat] = useState(false);
  const [mdText, setMdText] = useState("");
  const [wordCount, setWordCount] = useState(0);
  const [typewriterMode, setTypewriterMode] = useState(false);
  const [showSnapshots, setShowSnapshots] = useState(false);
  const [snapshots, setSnapshots] = useState([]);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [snapshotTab, setSnapshotTab]         = useState("manual");
  const [autoSnapshots, setAutoSnapshots]     = useState([]);
  const [showOverflow, setShowOverflow]       = useState(false);
  const [noteUnlocked, setNoteUnlocked]       = useState(!notePasscodes[note.id]);
  const [showNotePasscode, setShowNotePasscode] = useState(!!notePasscodes[note.id]);
  const [showSetPasscode, setShowSetPasscode]   = useState(false);

  const editorRef           = useRef(null);
  const editorWrapperRef    = useRef(null);
  const caretRef            = useRef(null);
  const dirty               = useRef(false);
  const caretBlinkTimer     = useRef(null);
  const caretAnimFrame      = useRef(null);
  const titleRef            = useRef(title);
  const lastAutoContentRef  = useRef(null);
  const mountedRef          = useRef(true);
  const overflowRef         = useRef(null);
  const lastInteractionRef  = useRef("click"); // "click" | "key"

  useEffect(() => { setViewMode(note.pinned); }, [note.pinned]);

  // ── Auto-snapshot lifecycle ───────────────────────────────────────────────
  useEffect(() => { titleRef.current = title; }, [title]);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    // Wipe unstarred auto-snapshots when note is closed
    return () => { deleteUnstarredAutoSnapshots(note.id).catch(() => {}); };
  }, [note.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!showOverflow) return;
    const handler = (e) => {
      if (overflowRef.current && !overflowRef.current.contains(e.target)) setShowOverflow(false);
    };
    const t = setTimeout(() => document.addEventListener("mousedown", handler), 0);
    return () => { clearTimeout(t); document.removeEventListener("mousedown", handler); };
  }, [showOverflow]);

  // Esc closes modes inside the editor
  useEffect(() => {
    const handler = (e) => {
      if (e.key !== "Escape") return;
      if (typewriterMode) { setTypewriterMode(false); e.stopPropagation(); return; }
      if (mdPreview) { onMdPreviewChange(false); e.stopPropagation(); return; }
      if (showSnapshots) { setShowSnapshots(false); e.stopPropagation(); return; }
      if (showEmojiPicker) { setShowEmojiPicker(false); e.stopPropagation(); return; }
      if (showColorPicker) { setShowColorPicker(false); e.stopPropagation(); return; }
      if (showNotePasscode || showSetPasscode) { e.stopPropagation(); return; }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [typewriterMode, mdPreview, showSnapshots, showEmojiPicker, showColorPicker, showNotePasscode, showSetPasscode, onMdPreviewChange]);

  useEffect(() => {
    if (viewMode) return;
    const intervalId = setInterval(async () => {
      const content = editorRef.current?.innerHTML || note.content || "";
      if (content === lastAutoContentRef.current) return;
      lastAutoContentRef.current = content;
      await saveAutoSnapshot(note.id, content, titleRef.current.trim() || "Untitled");
      if (!mountedRef.current) return;
      setAutoSnapshots(await listAutoSnapshots(note.id));
    }, 60 * 1000);
    return () => clearInterval(intervalId);
  }, [viewMode, note.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Word count ────────────────────────────────────────────────────────────
  const updateWordCount = useCallback(() => {
    const text = editorRef.current?.innerText || "";
    setWordCount(text.trim().split(/\s+/).filter(Boolean).length);
  }, []);

  useEffect(() => { updateWordCount(); }, [note.content]);

  // ── Smooth caret ──────────────────────────────────────────────────────────
  const BLINK_RESUME_MS = 500;

  const updateCaretPosition = useCallback((animate) => {
    if (!caretRef.current || !editorWrapperRef.current) return;
    const sel = window.getSelection();
    const caret = caretRef.current;
    if (!sel || sel.rangeCount === 0 || document.activeElement !== editorRef.current ||
        !sel.isCollapsed || !editorRef.current.contains(sel.anchorNode)) {
      caret.style.opacity = "0"; return;
    }
    const range = sel.getRangeAt(0).cloneRange();
    range.collapse(true);
    let rect = range.getBoundingClientRect();

    // Empty-line fallback: temp zero-width span
    if (rect.height === 0) {
      const tempSpan = document.createElement("span");
      tempSpan.appendChild(document.createTextNode("​"));
      range.insertNode(tempSpan);
      rect = tempSpan.getBoundingClientRect();
      tempSpan.parentNode?.removeChild(tempSpan);
      sel.removeAllRanges(); sel.addRange(range);
    }

    // Still zero — walk up to nearest block element for position
    if (rect.height === 0) {
      let node = sel.anchorNode;
      if (node?.nodeType === Node.TEXT_NODE) node = node.parentElement;
      const lineH = parseFloat(getComputedStyle(editorRef.current).lineHeight) || 21;
      while (node && node !== editorRef.current) {
        const pr = node.getBoundingClientRect();
        if (pr.height > 0) { rect = { top: pr.top, left: pr.left, height: lineH }; break; }
        node = node.parentElement;
      }
    }
    if (!rect || rect.height === 0) { caret.style.opacity = "0"; return; }

    const wrapperRect = editorWrapperRef.current.getBoundingClientRect();
    caret.style.transition = animate ? "left 80ms ease-out, top 80ms ease-out, height 80ms ease-out" : "none";
    if (!animate) requestAnimationFrame(() => { if (caret) caret.style.transition = "left 80ms ease-out, top 80ms ease-out, height 80ms ease-out"; });
    caret.style.top    = `${rect.top - wrapperRect.top + (editorRef.current?.scrollTop || 0)}px`;
    caret.style.left   = `${rect.left - wrapperRect.left}px`;
    caret.style.height = `${rect.height}px`;
    caret.style.opacity = "1";
    caret.classList.remove("smooth-caret--blinking");
    clearTimeout(caretBlinkTimer.current);
    // Blink immediately after mouse click, pause briefly after keystrokes
    const delay = lastInteractionRef.current === "key" ? BLINK_RESUME_MS : 0;
    caretBlinkTimer.current = setTimeout(() => caret.classList.add("smooth-caret--blinking"), delay);
  }, []);

  // ── Typewriter scroll ─────────────────────────────────────────────────────
  const enforceTypewriter = useCallback(() => {
    if (!typewriterMode || !editorRef.current) return;
    const sel = window.getSelection();
    if (!sel?.rangeCount) return;
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const editorRect = editorRef.current.getBoundingClientRect();
    const target = editorRect.top + editorRect.height / 2;
    editorRef.current.scrollTop += rect.top - target;
  }, [typewriterMode]);

  useEffect(() => {
    if (viewMode) { if (caretRef.current) caretRef.current.style.opacity = "0"; return; }
    const editor = editorRef.current;
    const wrapper = editorWrapperRef.current;
    if (!editor || !wrapper) return;
    const coalesced = (animate) => () => {
      cancelAnimationFrame(caretAnimFrame.current);
      caretAnimFrame.current = requestAnimationFrame(() => { updateCaretPosition(animate); enforceTypewriter(); });
    };
    const handleSelectionChange = coalesced(true);
    const handleScroll  = coalesced(false);
    const handleFocus   = coalesced(false);
    const handleBlur    = () => {
      cancelAnimationFrame(caretAnimFrame.current);
      clearTimeout(caretBlinkTimer.current);
      const caret = caretRef.current;
      if (caret) { caret.classList.remove("smooth-caret--blinking"); caret.style.opacity = "0"; }
    };
    const handleMouseDown = () => { lastInteractionRef.current = "click"; };
    const handleKeyDown   = () => { lastInteractionRef.current = "key"; };
    const ro = new ResizeObserver(coalesced(false));
    ro.observe(wrapper);
    document.addEventListener("selectionchange", handleSelectionChange);
    editor.addEventListener("scroll",    handleScroll);
    editor.addEventListener("focus",     handleFocus);
    editor.addEventListener("blur",      handleBlur);
    editor.addEventListener("mousedown", handleMouseDown);
    editor.addEventListener("keydown",   handleKeyDown);
    if (document.activeElement === editor) updateCaretPosition(false);
    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange);
      editor.removeEventListener("scroll",    handleScroll);
      editor.removeEventListener("focus",     handleFocus);
      editor.removeEventListener("blur",      handleBlur);
      editor.removeEventListener("mousedown", handleMouseDown);
      editor.removeEventListener("keydown",   handleKeyDown);
      ro.disconnect();
      cancelAnimationFrame(caretAnimFrame.current);
      clearTimeout(caretBlinkTimer.current);
    };
  }, [viewMode, updateCaretPosition, enforceTypewriter]);

  useEffect(() => {
    if (editorRef.current && !viewMode) {
      editorRef.current.innerHTML = note.content || "";
      updateWordCount();
      const range = document.createRange();
      const sel = window.getSelection();
      range.selectNodeContents(editorRef.current);
      range.collapse(false);
      sel?.removeAllRanges(); sel?.addRange(range);
    }
  }, [viewMode]);

  // Close pickers on outside click
  useEffect(() => {
    if (!showEmojiPicker && !showColorPicker) return;
    const handler = (e) => {
      if (!e.target.closest("[data-picker]")) {
        setShowEmojiPicker(false); setShowColorPicker(false);
      }
    };
    const id = setTimeout(() => document.addEventListener("mousedown", handler), 0);
    return () => { clearTimeout(id); document.removeEventListener("mousedown", handler); };
  }, [showEmojiPicker, showColorPicker]);

  // ── Save helpers ──────────────────────────────────────────────────────────
  const resolveAutoExt = () => saveFormat !== "ask" ? saveFormat : (note.fileExt || "md");

  const handleSave = (fileExt) => {
    const content = editorRef.current?.innerHTML || "";
    onSave({ title: title.trim() || "Untitled", content, fileExt: fileExt || resolveAutoExt() });
    dirty.current = false;
    setAskingFormat(false);
  };

  const handleSaveClick = () => {
    if (saveFormat === "ask") setAskingFormat(true);
    else handleSave(saveFormat);
  };

  const handleSaveToPath = async () => {
    const noteTitle = title.trim() || "Untitled";
    const content = editorRef.current?.innerHTML || "";
    const path = await saveDialog({ defaultPath: noteTitle, filters: [{ name: "Markdown", extensions: ["md"] }, { name: "Text", extensions: ["txt"] }] });
    if (!path) return;
    await saveNoteTo(note.id, path, { title: noteTitle, content });
    dirty.current = false; setAskingFormat(false);
  };

  const toggleMdPreview = () => {
    if (!mdPreview) {
      const text = !viewMode && editorRef.current
        ? editorRef.current.innerText || ""
        : (() => { const d = document.createElement("div"); d.innerHTML = note.content || ""; return d.innerText || ""; })();
      setMdText(text);
    }
    onMdPreviewChange(!mdPreview);
  };

  const handleBack = () => {
    if (dirty.current && !viewMode) handleSave(resolveAutoExt());
    if (note.burn) { onDelete(); return; }
    onBack();
  };

  const handlePin = () => {
    if (!viewMode) handleSave(resolveAutoExt());
    onTogglePin();
  };

  // ── Copy as Markdown ──────────────────────────────────────────────────────
  const handleCopyMd = async () => {
    const html = editorRef.current?.innerHTML || note.content || "";
    const md = td.turndown(html);
    await navigator.clipboard.writeText(md).catch(() => {});
  };

  // ── Snapshot ──────────────────────────────────────────────────────────────
  const handleSnapshot = async () => {
    const content = editorRef.current?.innerHTML || note.content || "";
    await saveSnapshot(note.id, content, title.trim() || "Untitled");
    if (showSnapshots) loadSnapshots();
  };

  const loadSnapshots = async () => {
    const list = await listSnapshots(note.id);
    setSnapshots(list);
  };

  const loadAutoSnapshots = async () => {
    const list = await listAutoSnapshots(note.id);
    setAutoSnapshots(list);
  };

  const toggleSnapshots = () => {
    if (!showSnapshots) { loadSnapshots(); loadAutoSnapshots(); }
    setShowSnapshots((s) => !s);
  };

  const handleRestoreSnapshot = async (path) => {
    if (!window.confirm("Restore this snapshot? Current content will be replaced.")) return;
    const content = await readSnapshot(path);
    if (editorRef.current) editorRef.current.innerHTML = content;
    dirty.current = true;
    updateWordCount();
    setShowSnapshots(false);
  };

  const handleDeleteSnapshot = async (path) => {
    await deleteSnapshot(path);
    loadSnapshots();
  };

  const handleDeleteAutoSnapshot = async (path) => {
    await deleteSnapshot(path);
    loadAutoSnapshots();
  };

  // ── Editor context menu ───────────────────────────────────────────────────
  const handleEditorContextMenu = (e) => {
    e.preventDefault();
    const hasSelection = !!window.getSelection()?.toString();
    const { word, range: wordRange } = getWordAtPoint(e.clientX, e.clientY);
    const suggestions = spellcheck ? getSpellSuggestions(word) : [];

    const applyCorrection = (correction) => {
      if (!wordRange || !editorRef.current) return;
      editorRef.current.focus();
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(wordRange);
      document.execCommand("insertText", false, correction);
    };

    onShowContextMenu({
      x: e.clientX, y: e.clientY,
      items: [
        // Spell suggestions at the top when available
        ...(suggestions.length > 0 ? [
          ...suggestions.map(s => ({
            label: s,
            action: () => applyCorrection(s),
          })),
          { separator: true },
        ] : []),
        ...(hasSelection ? [
          { icon: <Scissors size={11} />, label: "Cut",  shortcut: "Ctrl+X", action: () => document.execCommand("cut") },
          { icon: <Copy size={11} />,     label: "Copy", shortcut: "Ctrl+C", action: () => document.execCommand("copy") },
        ] : []),
        { label: "Paste",      shortcut: "Ctrl+V", action: () => document.execCommand("paste") },
        { label: "Select All", shortcut: "Ctrl+A", action: () => document.execCommand("selectAll") },
        { separator: true },
        { label: spellcheck ? "✓ Spell Check" : "Spell Check", action: () => setSpellcheck(!spellcheck) },
        { icon: <Copy size={11} />,   label: "Copy as Markdown", action: handleCopyMd },
        ...(!viewMode ? [{ icon: <Camera size={11} />, label: "Save Snapshot", action: handleSnapshot }] : []),
        { separator: true },
        ...(!notePasscodes[note.id]
          ? [{ icon: <Lock size={11} />, label: "Lock Note…", action: () => setShowSetPasscode(true) }]
          : [{ icon: <Lock size={11} />, label: "Remove Note Lock", action: () => setNotePasscode(note.id, null) }]
        ),
        { separator: true },
        { icon: <Trash2 size={11} />, label: "Delete Note", danger: true, action: () => { if (window.confirm("Delete this note?")) onDelete(); } },
      ],
    });
  };

  // ── Wiki link navigation + collapsible headings ───────────────────────────
  const handleContentClick = (e) => {
    const link = e.target.closest("[data-wikilink]");
    if (link) { onNavigate(decodeURIComponent(link.dataset.wikilink)); return; }

    const heading = e.target.closest("h1,h2,h3");
    if (!heading) return;
    const isCollapsed = heading.classList.toggle("collapsed");
    let el = heading.nextElementSibling;
    while (el && !["H1","H2","H3"].includes(el.tagName)) {
      el.classList.toggle("collapsed-section", isCollapsed);
      el = el.nextElementSibling;
    }
  };

  // ── Rendered HTML with wiki links ─────────────────────────────────────────
  const processedContent = processWikiLinks(note.content || "");

  const currentSceneId = noteScenes[note.id] ?? null;

  // Per-note passcode gate
  if (showNotePasscode) {
    return (
      <PasscodeModal
        mode="unlock"
        type={notePasscodes[note.id]?.startsWith("p:") ? "password" : "pin"}
        storedHash={notePasscodes[note.id]}
        title={`Unlock "${note.title || "Untitled"}"`}
        onSuccess={() => { setNoteUnlocked(true); setShowNotePasscode(false); }}
        onCancel={onBack}
      />
    );
  }

  if (showSetPasscode) {
    return (
      <PasscodeModal
        mode="set"
        type="pin"
        title="Lock This Note"
        onSuccess={(hash) => { setNotePasscode(note.id, hash); setShowSetPasscode(false); }}
        onCancel={() => setShowSetPasscode(false)}
      />
    );
  }

  return (
    <div className={`flex flex-col flex-1 min-h-0 ${zenMode ? "zen-mode" : ""}`}>
      {/* Editor header (hidden in zen mode) */}
      {!zenMode && (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-700 shrink-0 bg-zinc-900/80">
          <button onClick={handleBack} className="text-zinc-500 hover:text-zinc-300 transition-colors p-0.5 rounded">
            <ChevronLeft size={15} />
          </button>
          <input
            value={title}
            onChange={(e) => { setTitle(e.target.value); dirty.current = true; }}
            placeholder="Note title…"
            disabled={viewMode}
            className="flex-1 bg-transparent text-[13px] font-semibold focus:outline-none disabled:opacity-60 glass-input"
          />
          <div className="flex items-center gap-1">
            {vis("emoji") && (
              <div className="relative" data-picker>
                <button onClick={() => { setShowEmojiPicker((s) => !s); setShowColorPicker(false); }}
                  title="Note emoji"
                  className={`p-1.5 rounded text-[13px] leading-none transition-colors hover:bg-zinc-700 ${note.emoji ? "" : "text-zinc-600 hover:text-zinc-300"}`}>
                  {note.emoji || <Smile size={12} />}
                </button>
                {showEmojiPicker && (
                  <EmojiPicker
                    onSelect={(e) => { setNoteEmoji(note.id, e); setShowEmojiPicker(false); }}
                    onClear={() => { setNoteEmoji(note.id, ""); setShowEmojiPicker(false); }}
                  />
                )}
              </div>
            )}
            {vis("color") && (
              <div className="relative" data-picker>
                <button onClick={() => { setShowColorPicker((s) => !s); setShowEmojiPicker(false); }}
                  title="Note colour"
                  className="p-1.5 rounded transition-colors hover:bg-zinc-700">
                  <div className="w-3 h-3 rounded-full border border-zinc-600 transition-colors"
                    style={{ backgroundColor: note.color || "transparent" }} />
                </button>
                {showColorPicker && (
                  <ColorPickerPanel
                    current={note.color}
                    onSelect={(c) => { setNoteColor(note.id, c); setShowColorPicker(false); }}
                    onClear={() => { setNoteColor(note.id, ""); setShowColorPicker(false); }}
                  />
                )}
              </div>
            )}
            {note.pinned && viewMode && !mdPreview && (
              <button onClick={() => setViewMode(false)} title="Edit"
                className="p-1.5 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700 transition-colors">
                <Edit3 size={13} />
              </button>
            )}
            {vis("typewriter") && !viewMode && !mdPreview && (
              <button onClick={() => setTypewriterMode((s) => !s)} title="Typewriter mode"
                className={`p-1.5 rounded transition-colors ${typewriterMode ? "text-cyan-400 bg-cyan-950" : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700"}`}>
                <AlignCenter size={13} />
              </button>
            )}
            {vis("mdpreview") && (
              <button onClick={toggleMdPreview} title={mdPreview ? "Close preview" : "Markdown preview"}
                className={`px-1.5 py-1 rounded text-[10px] font-bold tracking-wider transition-colors ${mdPreview ? "bg-violet-950 border border-violet-800 text-violet-300" : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700"}`}>
                MD
              </button>
            )}
            {vis("pin") && (
              <button onClick={handlePin} title={note.pinned ? "Unpin" : "Pin (read-only)"}
                className={`p-1.5 rounded transition-colors ${note.pinned ? "text-amber-400 hover:text-amber-300 hover:bg-amber-950" : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700"}`}>
                {note.pinned ? <PinOff size={13} /> : <Pin size={13} />}
              </button>
            )}
            {vis("burn") && (
              <button onClick={() => toggleBurn(note.id)} title={note.burn ? "Remove burn" : "Burn after reading"}
                className={`p-1.5 rounded transition-colors ${note.burn ? "text-orange-400 bg-orange-950" : "text-zinc-600 hover:text-orange-400 hover:bg-orange-950"}`}>
                <Flame size={13} />
              </button>
            )}
            {vis("copymd") && (
              <button onClick={handleCopyMd} title="Copy as Markdown"
                className="p-1.5 rounded text-zinc-600 hover:text-zinc-300 hover:bg-zinc-700 transition-colors">
                <Copy size={13} />
              </button>
            )}
            {vis("snapshot") && !viewMode && (
              <button onClick={handleSnapshot} title="Save snapshot"
                className="p-1.5 rounded text-zinc-600 hover:text-zinc-300 hover:bg-zinc-700 transition-colors">
                <Camera size={13} />
              </button>
            )}
            {vis("history") && (
              <button onClick={toggleSnapshots} title="Snapshot history"
                className={`p-1.5 rounded transition-colors ${showSnapshots ? "text-cyan-400 bg-cyan-950" : "text-zinc-600 hover:text-zinc-300 hover:bg-zinc-700"}`}>
                <History size={13} />
              </button>
            )}
            {vis("zen") && (
              <button onClick={() => onZenChange(!zenMode)} title="Zen mode"
                className="p-1.5 rounded text-zinc-600 hover:text-zinc-300 hover:bg-zinc-700 transition-colors">
                <Maximize2 size={13} />
              </button>
            )}

            {/* Overflow — hidden configurable icons */}
            {TOOLBAR_ICON_CONFIG.some((c) => !vis(c.id)) && (
              <div className="relative" ref={overflowRef}>
                <button onClick={() => setShowOverflow((s) => !s)} title="More actions"
                  className={`p-1.5 rounded transition-colors ${showOverflow ? "text-cyan-400 bg-cyan-950" : "text-zinc-600 hover:text-zinc-300 hover:bg-zinc-700"}`}>
                  <MoreHorizontal size={13} />
                </button>
                {showOverflow && (
                  <div className="absolute top-full right-0 z-50 mt-1 min-w-[180px] bg-zinc-950 border border-zinc-700 rounded-lg shadow-2xl py-1">
                    {!vis("emoji") && (
                      <button onMouseDown={(e) => { e.preventDefault(); setShowEmojiPicker((s) => !s); setShowOverflow(false); }}
                        className={`w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-left transition-colors ${note.emoji ? "text-zinc-300" : "text-zinc-500"} hover:bg-zinc-800 hover:text-white`}>
                        <Smile size={11} className="shrink-0" />Emoji{note.emoji && <span className="ml-1">{note.emoji}</span>}
                      </button>
                    )}
                    {!vis("color") && (
                      <button onMouseDown={(e) => { e.preventDefault(); setShowColorPicker((s) => !s); setShowOverflow(false); }}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-left text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors">
                        <div className="w-3 h-3 rounded-full border border-zinc-600 shrink-0" style={{ backgroundColor: note.color || "transparent" }} />Color tint
                      </button>
                    )}
                    {!vis("typewriter") && !viewMode && !mdPreview && (
                      <button onClick={() => { setTypewriterMode((s) => !s); setShowOverflow(false); }}
                        className={`w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-left transition-colors ${typewriterMode ? "text-cyan-400" : "text-zinc-300 hover:bg-zinc-800 hover:text-white"}`}>
                        <AlignCenter size={11} className="shrink-0" />Typewriter mode{typewriterMode && <span className="ml-auto text-[8px] text-zinc-600">ON</span>}
                      </button>
                    )}
                    {!vis("mdpreview") && (
                      <button onClick={() => { toggleMdPreview(); setShowOverflow(false); }}
                        className={`w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-left transition-colors ${mdPreview ? "text-violet-400" : "text-zinc-300 hover:bg-zinc-800 hover:text-white"}`}>
                        <span className="text-[9px] font-bold w-[11px] shrink-0 leading-none">MD</span>Markdown preview{mdPreview && <span className="ml-auto text-[8px] text-zinc-600">ON</span>}
                      </button>
                    )}
                    {!vis("pin") && (
                      <button onClick={() => { handlePin(); setShowOverflow(false); }}
                        className={`w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-left transition-colors ${note.pinned ? "text-amber-400" : "text-zinc-300 hover:bg-zinc-800 hover:text-white"}`}>
                        {note.pinned ? <PinOff size={11} className="shrink-0" /> : <Pin size={11} className="shrink-0" />}{note.pinned ? "Unpin" : "Pin"}
                      </button>
                    )}
                    {!vis("burn") && (
                      <button onClick={() => { toggleBurn(note.id); setShowOverflow(false); }}
                        className={`w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-left transition-colors ${note.burn ? "text-orange-400" : "text-zinc-300 hover:bg-zinc-800 hover:text-white"}`}>
                        <Flame size={11} className="shrink-0" />{note.burn ? "Remove burn" : "Burn after reading"}
                      </button>
                    )}
                    {!vis("copymd") && (
                      <button onClick={() => { handleCopyMd(); setShowOverflow(false); }}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-left text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors">
                        <Copy size={11} className="shrink-0" />Copy as Markdown
                      </button>
                    )}
                    {!vis("snapshot") && !viewMode && (
                      <button onClick={() => { handleSnapshot(); setShowOverflow(false); }}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-left text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors">
                        <Camera size={11} className="shrink-0" />Save snapshot
                      </button>
                    )}
                    {!vis("history") && (
                      <button onClick={() => { toggleSnapshots(); setShowOverflow(false); }}
                        className={`w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-left transition-colors ${showSnapshots ? "text-cyan-400" : "text-zinc-300 hover:bg-zinc-800 hover:text-white"}`}>
                        <History size={11} className="shrink-0" />Snapshot history
                      </button>
                    )}
                    {!vis("zen") && (
                      <button onClick={() => { onZenChange(!zenMode); setShowOverflow(false); }}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-left text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors">
                        <Maximize2 size={11} className="shrink-0" />Zen mode
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {!viewMode && !mdPreview && (
              askingFormat ? (
                <div className="flex items-center gap-1">
                  <button onClick={() => handleSave("md")} className="px-2 py-1 rounded bg-cyan-950 border border-cyan-800 text-cyan-300 text-[10px] font-bold tracking-wider hover:bg-cyan-900 transition-colors">.md</button>
                  <button onClick={() => handleSave("txt")} className="px-2 py-1 rounded bg-zinc-700 border border-zinc-600 text-zinc-300 text-[10px] font-bold tracking-wider hover:bg-zinc-600 transition-colors">.txt</button>
                  <button onClick={handleSaveToPath} title="Save to…" className="p-1 rounded border border-zinc-700 bg-zinc-900 text-zinc-400 hover:text-zinc-200 hover:border-zinc-600 transition-colors"><FolderOpen size={11} /></button>
                  <button onClick={() => setAskingFormat(false)} className="p-1 rounded text-zinc-600 hover:text-zinc-400 transition-colors"><X size={10} /></button>
                </div>
              ) : (
                <button onClick={handleSaveClick} className="px-2.5 py-1 rounded bg-cyan-950 border border-cyan-800 text-cyan-300 text-[10px] font-bold tracking-wider hover:bg-cyan-900 transition-colors">SAVE</button>
              )
            )}
            <button onClick={() => { if (window.confirm("Delete this note?")) onDelete(); }}
              className="p-1.5 rounded text-zinc-600 hover:text-red-400 hover:bg-red-950 transition-colors">
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      )}

      {/* Zen mode exit button */}
      {zenMode && (
        <button onClick={() => onZenChange(false)} title="Exit zen mode"
          className="absolute top-3 right-3 z-50 p-1.5 rounded text-zinc-700 hover:text-zinc-400 hover:bg-zinc-800 transition-colors">
          <Minimize2 size={13} />
        </button>
      )}

      {/* Snapshot history panel */}
      {showSnapshots && !zenMode && (
        <div className="border-b border-zinc-800 bg-zinc-900/60 shrink-0 flex flex-col max-h-[160px]">
          <div className="flex items-center px-3 border-b border-zinc-800 shrink-0">
            {[["manual", "Manual"], ["auto", "Auto ⚡"]].map(([id, label]) => (
              <button key={id}
                onClick={() => { setSnapshotTab(id); if (id === "auto") loadAutoSnapshots(); }}
                className={`px-2.5 py-1.5 text-[9px] font-bold uppercase tracking-[0.12em] border-b-2 -mb-px transition-colors ${
                  snapshotTab === id ? "border-cyan-400 text-cyan-400" : "border-transparent text-zinc-600 hover:text-zinc-400"
                }`}>{label}
              </button>
            ))}
          </div>
          <div className="overflow-y-auto flex-1 px-3 py-1.5">
            {snapshotTab === "manual" ? (
              snapshots.length === 0
                ? <p className="text-[10px] text-zinc-600 py-1">No snapshots yet — click 📷 to save one.</p>
                : snapshots.map((s) => (
                    <div key={s.path} className="flex items-center gap-2 py-0.5">
                      <span className="text-[10px] text-zinc-400 flex-1">{fmtTs(s.ts)}</span>
                      <button onClick={() => handleRestoreSnapshot(s.path)} className="text-[9px] text-cyan-400 hover:text-cyan-300 transition-colors">Restore</button>
                      <button onClick={() => handleDeleteSnapshot(s.path)} className="text-[9px] text-zinc-600 hover:text-red-400 transition-colors">Delete</button>
                    </div>
                  ))
            ) : (
              autoSnapshots.length === 0
                ? <p className="text-[10px] text-zinc-600 py-1">No auto-snapshots yet. Saves every minute while editing.</p>
                : autoSnapshots.map((s) => {
                    const starred = starredAutoSnaps.has(s.path);
                    return (
                      <div key={s.path} className="flex items-center gap-1.5 py-0.5">
                        <button onClick={() => starred ? unstarAutoSnapshot(s.path) : starAutoSnapshot(s.path)}
                          title={starred ? "Starred — kept after close" : "Star to keep after note closes"}
                          className={`transition-colors shrink-0 ${starred ? "text-amber-400" : "text-zinc-700 hover:text-amber-400"}`}>
                          <Star size={9} fill={starred ? "currentColor" : "none"} />
                        </button>
                        <span className="text-[10px] text-zinc-400 flex-1">{fmtTs(s.ts)}</span>
                        <button onClick={() => handleRestoreSnapshot(s.path)} className="text-[9px] text-cyan-400 hover:text-cyan-300 transition-colors">Restore</button>
                        <button onClick={() => handleDeleteAutoSnapshot(s.path)} className="text-[9px] text-zinc-600 hover:text-red-400 transition-colors">Delete</button>
                      </div>
                    );
                  })
            )}
          </div>
        </div>
      )}

      {/* Toolbar */}
      {!viewMode && !mdPreview && !zenMode && <FormatToolbar editorRef={editorRef} />}

      {/* MD Preview */}
      {mdPreview && (
        <div className="flex-1 overflow-y-auto px-4 py-3 signalpad-content md-preview bg-zinc-950"
          onClick={handleContentClick}
          dangerouslySetInnerHTML={{ __html: processWikiLinks(marked.parse(mdText)) }} />
      )}

      {/* Pinned view */}
      {!mdPreview && viewMode && (
        <div className="flex-1 overflow-y-auto px-4 py-3 signalpad-content bg-zinc-950"
          onClick={handleContentClick}
          dangerouslySetInnerHTML={{ __html: processedContent || "<p class='empty'>This note is empty.</p>" }} />
      )}

      {/* Edit area */}
      {!viewMode && (
        <div ref={editorWrapperRef} className={`relative min-h-0 ${mdPreview ? "hidden" : "flex-1"}`}>
          <div className={`typewriter-overlay${typewriterMode ? " active" : ""}`} />
          <div ref={caretRef} className="smooth-caret" />
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            spellCheck={spellcheck}
            onInput={() => { dirty.current = true; updateWordCount(); }}
            onKeyDown={(e) => {
              if (e.key === "s" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); handleSaveClick(); }
            }}
            onContextMenu={handleEditorContextMenu}
            className={`absolute inset-0 overflow-y-auto px-4 py-3 focus:outline-none leading-relaxed signalpad-content bg-zinc-950 caret-transparent${mdPreview ? " invisible" : ""}`}
            data-placeholder="Start writing…"
          />
          {!mdPreview && wordCount > 0 && (
            <div className="absolute bottom-2 right-3 z-10 text-[9px] text-zinc-700/60 pointer-events-none select-none">
              {wordCount}w · {Math.max(1, Math.ceil(wordCount / 200))}min
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Window controls ──────────────────────────────────────────────────────────

function WindowControls() {
  const win = getCurrentWindow();
  return (
    <div className="flex items-center gap-0.5">
      <button onClick={() => win.minimize()} title="Minimize"
        className="w-6 h-6 flex items-center justify-center rounded text-zinc-600 hover:text-zinc-300 hover:bg-zinc-700 transition-colors">
        <Minus size={10} />
      </button>
      <button onClick={() => win.close()} title="Close"
        className="w-6 h-6 flex items-center justify-center rounded text-zinc-600 hover:text-red-400 hover:bg-red-500/15 transition-colors">
        <X size={10} />
      </button>
    </div>
  );
}

// ─── Settings view ────────────────────────────────────────────────────────────

function SettingsView({ onClose }) {
  const { notes, addedFonts, addFont, removeFont, clearNotes, saveFormat, setSaveFormat, toolbarVisible, setToolbarVisible, theme, setTheme, appPasscode, setAppPasscode, cloudBackupPath, setCloudBackupPath, runCloudBackup } = useSignalPadStore();
  const [showBrowser, setShowBrowser] = useState(false);
  const [browserSearch, setBrowserSearch] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const [showSetAppPasscode, setShowSetAppPasscode] = useState(false);
  const [backupStatus, setBackupStatus] = useState("");
  const [backupPathInput, setBackupPathInput] = useState(cloudBackupPath);

  const handleOpenFolder = async () => {
    const dir = await invoke("get_notes_dir");
    await invoke("open_folder", { path: dir });
  };

  const handleExport = () => {
    const json = JSON.stringify({ exportedAt: new Date().toISOString(), notes }, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `signalpad-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  const availableInBrowser = GOOGLE_FONTS.filter((f) => !addedFonts.includes(f) && (!browserSearch || f.toLowerCase().includes(browserSearch.toLowerCase())));

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-700 shrink-0">
        <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 transition-colors p-0.5 rounded"><ChevronLeft size={15} /></button>
        <span className="text-[13px] glass-text">Settings</span>
      </div>

      {showSetAppPasscode && (
        <PasscodeModal
          mode="set"
          type="pin"
          title="Set App Passcode"
          onSuccess={(hash) => { setAppPasscode(hash); setShowSetAppPasscode(false); }}
          onCancel={() => setShowSetAppPasscode(false)}
        />
      )}

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-7 bg-zinc-950">

        {/* ── Theme ── */}
        <section>
          <div className="flex items-center gap-1.5 mb-3">
            <Palette size={9} className="text-zinc-600" />
            <span className="text-[9px] font-bold uppercase tracking-[0.16em] text-zinc-600">Theme</span>
          </div>
          <div className="flex gap-2">
            {[
              { value: "dark",  label: "Dark",  preview: "bg-zinc-900 border-zinc-700" },
              { value: "light", label: "Light", preview: "bg-[#f5f1ec] border-[#d6d0c8]" },
              { value: "red",   label: "Signal", preview: "bg-[#0e0508] border-[#4a1a28]" },
            ].map(({ value, label, preview }) => (
              <button key={value} onClick={() => setTheme(value)}
                className={`flex-1 py-2 rounded-lg border text-[11px] font-bold transition-colors ${theme === value ? "border-[var(--accent)] text-[var(--accent)] bg-[var(--accent-bg)]" : "border-zinc-700 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600"}`}>
                <div className={`w-6 h-4 rounded mx-auto mb-1 border ${preview}`} />
                {label}
              </button>
            ))}
          </div>
        </section>

        {/* ── App Passcode ── */}
        <section>
          <div className="flex items-center gap-1.5 mb-3">
            <Lock size={9} className="text-zinc-600" />
            <span className="text-[9px] font-bold uppercase tracking-[0.16em] text-zinc-600">App Lock</span>
          </div>
          {appPasscode ? (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-zinc-400 flex-1">App is PIN-locked on startup</span>
              <button onClick={() => setAppPasscode(null)}
                className="px-3 py-1.5 rounded border border-red-900 bg-red-950 text-red-400 text-[11px] hover:bg-red-900 transition-colors">
                Remove
              </button>
            </div>
          ) : (
            <button onClick={() => setShowSetAppPasscode(true)}
              className="w-full flex items-center gap-2 px-3 py-2 rounded border border-zinc-700 bg-zinc-900 text-[11px] text-zinc-300 hover:text-white hover:bg-zinc-700 transition-colors">
              <Lock size={11} /> Set app passcode
            </button>
          )}
          <p className="text-[10px] text-zinc-700 mt-2">Locks the entire app on launch. Per-note locks available via note context menu.</p>
        </section>

        {/* ── Cloud Backup ── */}
        <section>
          <div className="flex items-center gap-1.5 mb-3">
            <Cloud size={9} className="text-zinc-600" />
            <span className="text-[9px] font-bold uppercase tracking-[0.16em] text-zinc-600">Cloud Backup</span>
          </div>
          <p className="text-[10px] text-zinc-600 mb-3">Point to your Dropbox or OneDrive folder path. Notes are copied there on backup.</p>
          <div className="flex gap-2 mb-2">
            <input
              value={backupPathInput}
              onChange={e => setBackupPathInput(e.target.value)}
              placeholder="e.g. C:\Users\You\Dropbox\Notes"
              className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-2.5 py-1.5 text-[11px] text-zinc-200 focus:outline-none focus:border-zinc-500 placeholder:text-zinc-600"
            />
            <button onClick={() => setCloudBackupPath(backupPathInput)}
              className="px-3 py-1.5 rounded border border-zinc-700 bg-zinc-900 text-[11px] text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors shrink-0">
              Save
            </button>
          </div>
          {cloudBackupPath && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-zinc-600 truncate flex-1">{cloudBackupPath}</span>
              <button onClick={async () => { setBackupStatus("Backing up…"); await runCloudBackup(); setBackupStatus("Done ✓"); setTimeout(() => setBackupStatus(""), 2500); }}
                className="px-3 py-1.5 rounded border border-cyan-800 bg-cyan-950 text-cyan-300 text-[11px] hover:bg-cyan-900 transition-colors shrink-0">
                Backup Now
              </button>
            </div>
          )}
          {backupStatus && <p className="text-[10px] text-cyan-400 mt-1">{backupStatus}</p>}
        </section>

        {/* ── Your Fonts ── */}
        <section>
          <div className="flex items-center gap-1.5 mb-3">
            <Type size={9} className="text-zinc-600" />
            <span className="text-[9px] font-bold uppercase tracking-[0.16em] text-zinc-600">Your Fonts</span>
          </div>
          {addedFonts.length > 0 && (
            <div className="space-y-1.5 mb-3">
              {addedFonts.map((font) => (
                <div key={font} className="flex items-center justify-between px-3 py-2 rounded bg-zinc-800 border border-zinc-700/30">
                  <span className="text-[13px] text-zinc-200" style={{ fontFamily: `'${font}', sans-serif` }}>{font}</span>
                  <button onClick={() => removeFont(font)} className="text-zinc-600 hover:text-red-400 hover:bg-red-950 p-1 rounded transition-colors ml-2 shrink-0"><X size={11} /></button>
                </div>
              ))}
            </div>
          )}
          {addedFonts.length === 0 && !showBrowser && <p className="text-[11px] text-zinc-600 mb-3">No fonts added yet.</p>}
          {showBrowser ? (
            <div className="border border-zinc-700 rounded overflow-hidden">
              <div className="px-2 py-1.5 border-b border-zinc-800">
                <input autoFocus value={browserSearch} onChange={(e) => setBrowserSearch(e.target.value)} placeholder="Search Google Fonts…"
                  className="w-full bg-zinc-800 text-[11px] text-zinc-200 px-2.5 py-1.5 rounded border border-zinc-700 focus:outline-none placeholder:text-zinc-600" />
              </div>
              <div className="overflow-y-auto max-h-[180px] grid grid-cols-2 p-1.5 gap-0.5">
                {availableInBrowser.map((font) => (
                  <button key={font} onClick={() => addFont(font)} title={font}
                    className="text-left px-3 py-1.5 rounded text-[12px] text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors truncate"
                    style={{ fontFamily: `'${font}', sans-serif` }}>{font}</button>
                ))}
                {availableInBrowser.length === 0 && (
                  <p className="col-span-2 py-5 text-center text-[10px] text-zinc-600">{browserSearch ? `No match for "${browserSearch}"` : "All fonts added!"}</p>
                )}
              </div>
              <div className="border-t border-zinc-800 p-1.5">
                <button onClick={() => { setShowBrowser(false); setBrowserSearch(""); }} className="w-full text-[10px] text-zinc-500 hover:text-zinc-300 py-1 transition-colors">Done</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setShowBrowser(true)} className="flex items-center gap-1.5 text-[11px] text-zinc-400 hover:text-cyan-400 transition-colors">
              <Plus size={11} /> Browse Google Fonts
            </button>
          )}
        </section>

        {/* ── Save Format ── */}
        <section>
          <div className="flex items-center gap-1.5 mb-3">
            <FileText size={9} className="text-zinc-600" />
            <span className="text-[9px] font-bold uppercase tracking-[0.16em] text-zinc-600">Save Format</span>
          </div>
          <div className="flex gap-1.5 mb-2">
            {[{ value: "md", label: ".md" }, { value: "txt", label: ".txt" }, { value: "ask", label: "Ask" }].map(({ value, label }) => (
              <button key={value} onClick={() => setSaveFormat(value)}
                className={`flex-1 py-1.5 rounded border text-[11px] font-mono transition-colors ${saveFormat === value ? "border-cyan-700 bg-cyan-950 text-cyan-300" : "border-zinc-700 bg-zinc-900 text-zinc-400 hover:text-zinc-200 hover:border-zinc-600"}`}>
                {label}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-zinc-600">
            {saveFormat === "md" && "Notes are saved as Markdown files (.md)."}
            {saveFormat === "txt" && "Notes are saved as plain text files (.txt)."}
            {saveFormat === "ask" && "You'll be prompted to pick a format each time you explicitly save."}
          </p>
        </section>

        {/* ── Toolbar ── */}
        <section>
          <div className="flex items-center gap-1.5 mb-1">
            <MoreHorizontal size={9} className="text-zinc-600" />
            <span className="text-[9px] font-bold uppercase tracking-[0.16em] text-zinc-600">Editor Toolbar</span>
          </div>
          <p className="text-[10px] text-zinc-600 mb-3">Choose which icons are always visible. Hidden ones appear under ···</p>
          <div className="space-y-1">
            {TOOLBAR_ICON_CONFIG.map(({ id, label }) => {
              const on = toolbarVisible.has(id);
              return (
                <button key={id} onClick={() => {
                  const next = new Set(toolbarVisible);
                  on ? next.delete(id) : next.add(id);
                  setToolbarVisible([...next]);
                }}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded border text-[11px] transition-colors
                    ${on
                      ? "border-cyan-800 bg-cyan-500/10 text-cyan-300"
                      : "border-zinc-700 bg-zinc-900 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600"}`}>
                  <span>{label}</span>
                  <span className={`text-[8px] font-bold tracking-widest uppercase ${on ? "text-cyan-500" : "text-zinc-700"}`}>
                    {on ? "Visible" : "Hidden"}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* ── Activity ── */}
        <section>
          <div className="flex items-center gap-1.5 mb-3">
            <Hash size={9} className="text-zinc-600" />
            <span className="text-[9px] font-bold uppercase tracking-[0.16em] text-zinc-600">Writing Activity</span>
          </div>
          <ActivityHeatmap notes={notes} />
        </section>

        {/* ── Data ── */}
        <section>
          <div className="flex items-center gap-1.5 mb-3">
            <Download size={9} className="text-zinc-600" />
            <span className="text-[9px] font-bold uppercase tracking-[0.16em] text-zinc-600">Data</span>
          </div>
          <div className="space-y-2">
            <button onClick={handleExport} disabled={notes.length === 0}
              className="w-full flex items-center gap-2 px-3 py-2 rounded border border-zinc-700 bg-zinc-900 text-[11px] text-zinc-300 hover:text-white hover:bg-zinc-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
              <Download size={11} /> Export notes as JSON
            </button>
            <button onClick={handleOpenFolder}
              className="w-full flex items-center gap-2 px-3 py-2 rounded border border-zinc-700 bg-zinc-900 text-[11px] text-zinc-300 hover:text-white hover:bg-zinc-700 transition-colors">
              <BookOpen size={11} /> Open notes folder
            </button>
            {confirmClear ? (
              <div className="flex items-center gap-2 px-1">
                <span className="text-[10px] text-red-400 flex-1">Delete all {notes.length} note{notes.length !== 1 ? "s" : ""}?</span>
                <button onClick={() => { clearNotes(); setConfirmClear(false); }} className="px-2.5 py-1 rounded text-[10px] bg-red-950 text-red-400 border border-red-900 hover:bg-red-900 transition-colors">Delete</button>
                <button onClick={() => setConfirmClear(false)} className="px-2.5 py-1 rounded text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors">Cancel</button>
              </div>
            ) : (
              <button onClick={() => setConfirmClear(true)} disabled={notes.length === 0}
                className="w-full flex items-center gap-2 px-3 py-2 rounded border border-zinc-700 bg-zinc-900 text-[11px] text-zinc-500 hover:text-red-400 hover:border-red-900 hover:bg-red-950 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                <Trash2 size={11} /> Clear all notes
              </button>
            )}
          </div>
        </section>

        {/* ── About ── */}
        <section>
          <div className="flex items-center gap-1.5 mb-3">
            <span className="text-[9px] font-bold uppercase tracking-[0.16em] text-zinc-600">About</span>
          </div>
          <div className="px-3 py-3 rounded border border-zinc-800 bg-zinc-900/30">
            <div className="flex items-center gap-2 mb-2">
              <NotebookPen size={13} className="text-cyan-400" />
              <span className="text-[12px] font-bold text-cyan-400 tracking-wider">SignalPad</span>
            </div>
            <p className="text-[10px] text-zinc-600">Version 0.1.0</p>
            <p className="text-[10px] text-zinc-700 mt-1">A minimal, focused note-taking app.</p>
          </div>
        </section>

      </div>
    </div>
  );
}

// ─── Help view ───────────────────────────────────────────────────────────────

const SHORTCUTS = [
  { keys: "Ctrl+S",         desc: "Save note" },
  { keys: "Ctrl+Shift+N",   desc: "Quick capture from anywhere (global)" },
  { keys: "Ctrl+K",         desc: "Open command palette" },
  { keys: "Esc",            desc: "Close palette / exit zen mode" },
];

const FEATURE_SECTIONS = [
  {
    heading: "Writing",
    items: [
      { icon: "✦",  label: "Note emoji",          desc: "Tap the smiley in the editor header to give a note an emoji icon." },
      { icon: "●",  label: "Note colour tint",     desc: "Tap the colour circle to tint the note card and editor with a hue." },
      { icon: "🔥", label: "Burn after reading",   desc: "The flame toggle marks a note to self-delete the moment you close it." },
      { icon: "📷", label: "Snapshots",            desc: "Camera icon saves a timestamped copy of the content. History icon browses and restores past snapshots." },
      { icon: "⊞",  label: "Copy as Markdown",     desc: "Copy button converts the note's rich-text content to clean Markdown and puts it on the clipboard." },
    ],
  },
  {
    heading: "Views",
    items: [
      { icon: "MD", label: "Markdown preview",     desc: "Renders your note's plain text as Markdown — headings, code blocks, tables, blockquotes." },
      { icon: "⊡",  label: "Zen mode",             desc: "Maximize icon strips all chrome away. Only the text remains. Press Esc or the corner button to exit." },
      { icon: "≡",  label: "Typewriter mode",      desc: "Align-center icon keeps the active line vertically centred and fades surrounding text." },
    ],
  },
  {
    heading: "Organisation",
    items: [
      { icon: "#",  label: "Hashtag collections",  desc: "Type #tagname anywhere in a note. A filter bar appears above the list so you can browse by tag." },
      { icon: "⟦⟧", label: "Wiki links",           desc: "Type [[Note title]] to create a clickable link that jumps to another note." },
      { icon: "⠿",  label: "Drag to reorder",      desc: "Grab the grip handle on any unpinned note card to drag it into a custom order." },
      { icon: "📌", label: "Pin notes",             desc: "Pinned notes are read-only by default and always shown at the top of the list." },
    ],
  },
  {
    heading: "Tools",
    items: [
      { icon: "⌘K", label: "Command palette",      desc: "Search notes by title, create, pin, or delete — all from the keyboard." },
      { icon: "♪",  label: "Ambient sound",         desc: "Speaker icon in the title bar: Rain, Brown Noise, White Noise, Focus Hum, or Deep Space." },
      { icon: "⊞",  label: "Activity heatmap",      desc: "Settings → Writing Activity shows a GitHub-style grid of your daily edit history." },
      { icon: "↑",  label: "Import",                desc: "Import any .md or .txt file from disk. SignalPad frontmatter is preserved; plain text is wrapped into a new note." },
      { icon: "↓",  label: "Export",                desc: "Settings → Data → Export all notes as a single JSON file." },
      { icon: "📂", label: "Save to…",              desc: "In Ask save-format mode, the folder icon opens a native Save As dialog so you can choose any location." },
    ],
  },
  {
    heading: "Fonts & Format",
    items: [
      { icon: "Aa", label: "Google Fonts",          desc: "Toolbar → T dropdown → Browse Google Fonts to add any of 44 typefaces and apply them per-selection." },
      { icon: ".md", label: "Save format",          desc: "Settings → Save Format: .md (Markdown), .txt (plain text), or Ask (prompts on each explicit save)." },
    ],
  },
];

function HelpView({ onClose }) {
  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-700 shrink-0">
        <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 transition-colors p-0.5 rounded">
          <ChevronLeft size={15} />
        </button>
        <span className="text-[13px] glass-text">Help</span>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-7 bg-zinc-950">

        {/* ── Quick start ── */}
        <section>
          <div className="flex items-center gap-1.5 mb-3">
            <span className="text-[9px] font-bold uppercase tracking-[0.16em] text-zinc-600">Quick Start</span>
          </div>
          <ol className="space-y-2 list-none">
            {[
              "Hit + New Note (or Ctrl+Shift+N from anywhere on your desktop) to create a note.",
              "Type a title at the top, then write freely in the editor below.",
              "Ctrl+S or the SAVE button saves your note as a .md file in Documents/SignalPad.",
              "Press Pin to lock a note read-only. Click the edit icon to unlock it again.",
              "Open the command palette with Ctrl+K to jump between notes instantly.",
            ].map((step, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <span className="shrink-0 w-4 h-4 rounded-full bg-cyan-950 border border-cyan-800 text-cyan-400 text-[8px] font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
                <span className="text-[11px] text-zinc-400 leading-relaxed">{step}</span>
              </li>
            ))}
          </ol>
        </section>

        {/* ── Keyboard shortcuts ── */}
        <section>
          <div className="flex items-center gap-1.5 mb-3">
            <span className="text-[9px] font-bold uppercase tracking-[0.16em] text-zinc-600">Keyboard Shortcuts</span>
          </div>
          <div className="space-y-1.5">
            {SHORTCUTS.map(({ keys, desc }) => (
              <div key={keys} className="flex items-center gap-3">
                <kbd className="shrink-0 px-2 py-0.5 rounded border border-zinc-700 bg-zinc-800 text-[10px] font-mono text-zinc-300 tracking-wide">{keys}</kbd>
                <span className="text-[11px] text-zinc-500">{desc}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ── Feature sections ── */}
        {FEATURE_SECTIONS.map(({ heading, items }) => (
          <section key={heading}>
            <div className="flex items-center gap-1.5 mb-3">
              <span className="text-[9px] font-bold uppercase tracking-[0.16em] text-zinc-600">{heading}</span>
            </div>
            <div className="space-y-2.5">
              {items.map(({ icon, label, desc }) => (
                <div key={label} className="flex items-start gap-3">
                  <span className="shrink-0 w-6 h-6 rounded bg-zinc-800/60 border border-zinc-700 text-[10px] text-zinc-400 font-mono flex items-center justify-center mt-0.5">
                    {icon}
                  </span>
                  <div>
                    <p className="text-[11px] font-semibold text-zinc-300 leading-none mb-0.5">{label}</p>
                    <p className="text-[10px] text-zinc-600 leading-relaxed">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}

        {/* ── Version ── */}
        <section>
          <div className="px-3 py-3 rounded border border-zinc-800 bg-zinc-900/30 flex items-center gap-2">
            <NotebookPen size={13} className="text-cyan-400 shrink-0" />
            <div>
              <span className="text-[12px] font-bold text-cyan-400 tracking-wider">SignalPad</span>
              <span className="text-[10px] text-zinc-700 ml-2">v0.1.0</span>
            </div>
          </div>
        </section>

      </div>
    </div>
  );
}

// ─── Main SignalPad ───────────────────────────────────────────────────────────

export default function SignalPad() {
  const { notes, addNote, updateNote, deleteNote, togglePin, init, loading, importNote, reorderNotes, noteOrder, appPasscode, noteScenes, setNoteScene } = useSignalPadStore();

  const [activeId, setActiveId]         = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showHelp, setShowHelp]         = useState(false);
  const [mdPreview, setMdPreview]       = useState(false);
  const [zenMode, setZenMode]           = useState(false);
  const [showPalette, setShowPalette]   = useState(false);
  const [activeTag, setActiveTag]       = useState(null);
  const [dragId, setDragId]             = useState(null);
  const [dragOverId, setDragOverId]     = useState(null);
  const [contextMenu, setContextMenu]   = useState(null);
  const [appUnlocked, setAppUnlocked]   = useState(!appPasscode);

  const openSettings = () => { setShowSettings(true);  setShowHelp(false); };
  const openHelp     = () => { setShowHelp(true);      setShowSettings(false); };
  const closePanel   = () => { setShowSettings(false); setShowHelp(false); };

  useEffect(() => { init(); }, []);
  useEffect(() => { setMdPreview(false); setZenMode(false); }, [activeId]);

  // ── Resize window when switching between list and editor ─────────────────
  useEffect(() => {
    const win = getCurrentWindow();
    const inEditor = !!activeId;
    if (inEditor) {
      win.setResizable(true).catch(() => {});
      win.setSize(new LogicalSize(680, 720)).catch(() => {});
      win.setMinSize(new LogicalSize(560, 580)).catch(() => {});
    } else {
      win.setSize(new LogicalSize(560, 660)).catch(() => {});
      win.setMinSize(new LogicalSize(560, 660)).catch(() => {});
      win.setResizable(false).catch(() => {});
    }
  }, [activeId]);

  // ── Suppress default browser context menu globally ────────────────────────
  useEffect(() => {
    const handler = (e) => e.preventDefault();
    document.addEventListener("contextmenu", handler);
    return () => document.removeEventListener("contextmenu", handler);
  }, []);

  // ── Global hotkey (Ctrl+Shift+N) ─────────────────────────────────────────
  useEffect(() => {
    registerShortcut("CommandOrControl+Shift+N", async () => {
      await invoke("focus_main_window").catch(() => {});
      const id = await addNote();
      if (id) setActiveId(id);
    }).catch(() => {});
  }, []);

  // ── Ctrl+K command palette ───────────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") { e.preventDefault(); setShowPalette((s) => !s); }
      if (e.key === "Escape") { setShowPalette(false); setZenMode(false); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const activeNote = notes.find((n) => n.id === activeId);
  const pinned     = notes.filter((n) => n.pinned);

  // Apply custom order to unpinned notes
  const unpinned = [...notes.filter((n) => !n.pinned)].sort((a, b) => {
    const ai = noteOrder.indexOf(a.id);
    const bi = noteOrder.indexOf(b.id);
    if (ai >= 0 && bi >= 0) return ai - bi;
    if (ai >= 0) return -1;
    if (bi >= 0) return 1;
    return new Date(b.updatedAt) - new Date(a.updatedAt);
  });

  // ── Tags ─────────────────────────────────────────────────────────────────
  const allTags = [...new Set(notes.flatMap((n) => extractTags(n.content)))];
  const filteredUnpinned = activeTag
    ? unpinned.filter((n) => extractTags(n.content).includes(activeTag))
    : unpinned;
  const filteredPinned = activeTag
    ? pinned.filter((n) => extractTags(n.content).includes(activeTag))
    : pinned;

  // ── Drag-to-reorder ───────────────────────────────────────────────────────
  const handleDragStart = (e, id) => { e.dataTransfer.setData("text/plain", id); e.dataTransfer.effectAllowed = "move"; setDragId(id); };
  const handleDragOver = (e, id) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDragOverId(id); };
  const handleDrop = (targetId) => {
    if (!dragId || dragId === targetId) { setDragId(null); setDragOverId(null); return; }
    const ids = unpinned.map((n) => n.id);
    const from = ids.indexOf(dragId);
    const to   = ids.indexOf(targetId);
    if (from < 0 || to < 0) { setDragId(null); setDragOverId(null); return; }
    ids.splice(from, 1);
    ids.splice(to, 0, dragId);
    reorderNotes(ids);
    setDragId(null); setDragOverId(null);
  };

  // ── Wiki navigate ─────────────────────────────────────────────────────────
  const handleWikiNavigate = (title) => {
    const target = notes.find((n) => (n.title || "Untitled").toLowerCase() === title.toLowerCase());
    if (target) setActiveId(target.id);
  };

  // ── Context menu builders ─────────────────────────────────────────────────
  const buildCardMenu = (e, n) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      x: e.clientX, y: e.clientY,
      items: [
        { icon: <BookOpen size={11} />, label: "Open", action: () => setActiveId(n.id) },
        { separator: true },
        { icon: n.pinned ? <PinOff size={11} /> : <Pin size={11} />, label: n.pinned ? "Unpin" : "Pin", action: () => togglePin(n.id) },
        { icon: <FolderOpen size={11} />, label: "Reveal in Folder", action: () => invoke("reveal_note", { noteId: n.id, fileExt: n.fileExt || "md" }) },
        { separator: true },
        { icon: <Trash2 size={11} />, label: "Delete", danger: true, action: () => { if (window.confirm(`Delete "${n.title || "Untitled"}"?`)) deleteNote(n.id); } },
      ],
    });
  };

  const buildListMenu = (e) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX, y: e.clientY,
      items: [
        { icon: <Plus size={11} />,      label: "New Note",          shortcut: "Ctrl+Shift+N", action: handleNew },
        { icon: <Upload size={11} />,    label: "Import",            action: handleImport },
        { separator: true },
        { icon: <FolderOpen size={11} />,label: "Open Notes Folder", action: () => invoke("get_notes_dir").then((dir) => invoke("open_folder", { path: dir })) },
        { icon: <Settings size={11} />,  label: "Settings",          action: openSettings },
      ],
    });
  };

  const handleNew = async () => { const id = await addNote(); if (id) setActiveId(id); };
  const handleImport = async () => {
    const path = await openDialog({ multiple: false, filters: [{ name: "Notes", extensions: ["md", "txt"] }] });
    if (!path) return;
    const id = await importNote(path);
    if (id) setActiveId(id);
  };

  if (!appUnlocked) {
    return (
      <div className="flex flex-col w-screen h-screen app-glass">
        <PasscodeModal
          mode="unlock"
          type="pin"
          storedHash={appPasscode}
          title="SignalPad — Locked"
          onSuccess={() => setAppUnlocked(true)}
          onCancel={null}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col w-screen h-screen app-glass">
      {/* Context menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x} y={contextMenu.y}
          items={contextMenu.items}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* Command palette */}
      {showPalette && (
        <CommandPalette
          notes={notes}
          onClose={() => setShowPalette(false)}
          onNavigate={(id) => setActiveId(id)}
          onNew={handleNew}
          onDelete={(id) => { deleteNote(id); if (activeId === id) setActiveId(null); }}
          onTogglePin={(id) => togglePin(id)}
        />
      )}

      {/* Inner padded column — solid side strips stop here */}
      <div className="flex flex-col flex-1 min-h-0 px-2 overflow-hidden relative">
        <div className="solid-strip absolute inset-y-0 left-0 w-2 z-10" />
        <div className="solid-strip absolute inset-y-0 right-0 w-2 z-10" />

        {/* Title bar (hidden in zen mode) */}
        {!zenMode && (
          <div data-tauri-drag-region
            className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800 bg-zinc-950 shrink-0 select-none cursor-default">
            <div className="flex items-center gap-2" data-tauri-drag-region>
              <NotebookPen size={13} className="text-cyan-400 pointer-events-none" />
              <span className="text-[11px] font-bold tracking-[0.18em] uppercase text-cyan-400 pointer-events-none">SignalPad</span>
              {showSettings && (
                <><span className="text-zinc-700 text-[10px] pointer-events-none">/</span>
                  <span className="text-[11px] text-zinc-400 pointer-events-none">Settings</span></>
              )}
              {showHelp && (
                <><span className="text-zinc-700 text-[10px] pointer-events-none">/</span>
                  <span className="text-[11px] text-zinc-400 pointer-events-none">Help</span></>
              )}
              {!showSettings && !showHelp && activeNote && (
                <><span className="text-zinc-700 text-[10px] pointer-events-none">/</span>
                  <span className="text-[11px] text-zinc-400 truncate max-w-[150px] pointer-events-none">
                    {activeNote.emoji && <span className="mr-1">{activeNote.emoji}</span>}
                    {activeNote.title || "Untitled"}
                  </span></>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <AmbientSound />
              <button onClick={() => setShowPalette((s) => !s)} title="Command palette (Ctrl+K)"
                className="w-6 h-6 flex items-center justify-center rounded text-zinc-600 hover:text-zinc-300 hover:bg-zinc-700 transition-colors text-[10px] font-mono">
                ⌘K
              </button>
              <button onClick={() => (showHelp ? closePanel() : openHelp())} title="Help"
                className={`w-6 h-6 flex items-center justify-center rounded transition-colors ${showHelp ? "text-cyan-400 bg-cyan-950" : "text-zinc-600 hover:text-zinc-300 hover:bg-zinc-700"}`}>
                <HelpCircle size={12} />
              </button>
              <button onClick={() => (showSettings ? closePanel() : openSettings())} title="Settings"
                className={`w-6 h-6 flex items-center justify-center rounded transition-colors ${showSettings ? "text-cyan-400 bg-cyan-950" : "text-zinc-600 hover:text-zinc-300 hover:bg-zinc-700"}`}>
                <Settings size={12} />
              </button>
              <WindowControls />
            </div>
          </div>
        )}

        {/* Tag filter bar */}
        {!showSettings && !showHelp && !activeNote && !zenMode && allTags.length > 0 && (
          <div className="flex items-center gap-1 px-3 py-1.5 border-b border-zinc-800 bg-zinc-950 overflow-x-auto shrink-0">
            <Hash size={9} className="text-zinc-600 shrink-0" />
            <button onClick={() => setActiveTag(null)}
              className={`px-2 py-0.5 rounded-full text-[9px] font-bold tracking-wide transition-colors shrink-0 ${!activeTag ? "bg-cyan-500/20 text-cyan-400" : "text-zinc-600 hover:text-zinc-400"}`}>
              All
            </button>
            {allTags.map((tag) => (
              <button key={tag} onClick={() => setActiveTag(activeTag === tag ? null : tag)}
                className={`px-2 py-0.5 rounded-full text-[9px] font-bold tracking-wide transition-colors shrink-0 ${activeTag === tag ? "bg-cyan-500/20 text-cyan-400" : "text-zinc-600 hover:text-zinc-400"}`}>
                #{tag}
              </button>
            ))}
          </div>
        )}

        {/* Body */}
        {showSettings ? (
          <SettingsView onClose={closePanel} />
        ) : showHelp ? (
          <HelpView onClose={closePanel} />
        ) : activeNote ? (
          <NoteEditor
            key={activeNote.id}
            note={activeNote}
            onBack={() => setActiveId(null)}
            onSave={(changes) => updateNote(activeNote.id, changes)}
            onDelete={() => { deleteNote(activeNote.id); setActiveId(null); }}
            onTogglePin={() => togglePin(activeNote.id)}
            mdPreview={mdPreview}
            onMdPreviewChange={setMdPreview}
            zenMode={zenMode}
            onZenChange={setZenMode}
            onNavigate={handleWikiNavigate}
            onShowContextMenu={setContextMenu}
          />
        ) : (
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4 bg-zinc-950" onContextMenu={buildListMenu}>
            {filteredPinned.length > 0 && (
              <section>
                <div className="flex items-center gap-1.5 mb-2 px-0.5">
                  <Pin size={9} className="text-amber-500/70" />
                  <span className="text-[9px] font-bold uppercase tracking-[0.16em] text-amber-500/70">Pinned</span>
                </div>
                <div className="space-y-2">
                  {filteredPinned.map((n) => (
                    <NoteCard key={n.id} note={n} onClick={() => setActiveId(n.id)}
                      onReveal={() => invoke("reveal_note", { noteId: n.id, fileExt: n.fileExt || "md" })}
                      onContextMenu={(e) => buildCardMenu(e, n)}
                      sceneId={noteScenes[n.id] ?? null}
                      onSetScene={setNoteScene} />
                  ))}
                </div>
              </section>
            )}
            {filteredUnpinned.length > 0 && (
              <section>
                {filteredPinned.length > 0 && (
                  <div className="flex items-center gap-1.5 mb-2 px-0.5">
                    <BookOpen size={9} className="text-zinc-600" />
                    <span className="text-[9px] font-bold uppercase tracking-[0.16em] text-zinc-600">Notes</span>
                  </div>
                )}
                <div className="space-y-2">
                  {filteredUnpinned.map((n) => (
                    <NoteCard key={n.id} note={n} onClick={() => setActiveId(n.id)}
                      onReveal={() => invoke("reveal_note", { noteId: n.id, fileExt: n.fileExt || "md" })}
                      onContextMenu={(e) => buildCardMenu(e, n)}
                      draggable={!activeTag}
                      onDragStart={(e) => handleDragStart(e, n.id)}
                      onDragOver={(e) => handleDragOver(e, n.id)}
                      onDrop={() => handleDrop(n.id)}
                      dragOver={dragOverId === n.id}
                      sceneId={noteScenes[n.id] ?? null}
                      onSetScene={setNoteScene}
                    />
                  ))}
                </div>
              </section>
            )}
            {notes.length === 0 && !loading && (
              <div className="flex flex-col items-center justify-center h-48 gap-3 text-center">
                <NotebookPen size={28} className="text-zinc-700" />
                <div>
                  <p className="text-sm text-zinc-500 font-medium">No notes yet</p>
                  <p className="text-[11px] text-zinc-700 mt-1">Create a note to get started</p>
                </div>
              </div>
            )}
          </div>
        )}

      </div>{/* end inner padded column */}

      {/* Editor footer */}
      {!showSettings && !showHelp && activeNote && !zenMode && (
        <div className="px-3 py-1.5 border-t border-zinc-800 flex items-center justify-between shrink-0">
          <span className="text-[9px] glass-text">
            {mdPreview ? "Markdown preview"
              : activeNote.burn ? "🔥 Burns when closed"
              : activeNote.pinned ? "Pinned — read-only by default"
              : "Ctrl+S to save · Ctrl+K palette"}
          </span>
          <span className="text-[9px] glass-text">{fmtDate(activeNote.updatedAt)}</span>
        </div>
      )}

      {/* Note list footer */}
      {!showSettings && !showHelp && !activeNote && (
        <div className="px-3 py-2.5 border-t border-zinc-800 flex items-center justify-between shrink-0">
          <span className="text-[9px] glass-text">
            {activeTag ? `#${activeTag} · ` : ""}{notes.length} note{notes.length !== 1 ? "s" : ""}
          </span>
          <div className="flex items-center gap-1.5">
            <button onClick={handleImport} title="Import a file"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold tracking-wide transition-all duration-150 bg-zinc-800 border border-zinc-700 text-zinc-400 hover:bg-zinc-700 hover:border-zinc-600 hover:text-zinc-200">
              <Upload size={11} /> Import
            </button>
            <button onClick={handleNew}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold tracking-wide transition-all duration-150 bg-cyan-950 border border-cyan-800 text-cyan-300 hover:bg-cyan-900 hover:border-cyan-700 hover:text-cyan-200">
              <Plus size={11} /> New Note
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
