import React, { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  X, Plus, Pin, PinOff, Trash2, ChevronLeft, Edit3,
  Bold, Italic, Underline, Strikethrough, List, ListOrdered, Minus,
  Heading2, BookOpen, NotebookPen, Type, ChevronDown, Settings, Download, FolderOpen,
  FileText, Upload, Camera, Flame, Maximize2, Minimize2, Copy, GripVertical,
  Hash, AlignCenter, History, Smile, HelpCircle, Star, MoreHorizontal, Scissors,
  CheckSquare, Lock, Palette, Table2, BookMarked, Crosshair, Monitor, Square,
} from "lucide-react";
import { SceneCanvas, SCENES } from "./PixelArtScene";
import PasscodeModal from "./PasscodeModal";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LogicalSize } from "@tauri-apps/api/dpi";
import { invoke } from "@tauri-apps/api/core";
import { save as saveDialog, open as openDialog, confirm as tauriConfirm } from "@tauri-apps/plugin-dialog";
import { marked } from "marked";
import TurndownService from "turndown";
import { register as registerShortcut } from "@tauri-apps/plugin-global-shortcut";
import { useSignalPadStore } from "../stores/useSignalPadStore";
import ContextMenu from "./ContextMenu";
import CommandPalette from "./CommandPalette";
import ActivityHeatmap from "./ActivityHeatmap";
import AmbientSound from "./AmbientSound";
import ChangelogModal from "./ChangelogModal";
import changelog from "../changelog.json";

marked.setOptions({ gfm: true, breaks: true });

const td = new TurndownService({ headingStyle: "atx", bulletListMarker: "-" });

// ─── Google Fonts ─────────────────────────────────────────────────────────────

const TOOLBAR_ICON_CONFIG = [
  { id: "emoji", label: "Emoji picker" },
  { id: "color", label: "Color tint" },
  { id: "typewriter", label: "Typewriter mode" },
  { id: "focusmode", label: "Paragraph focus" },
  { id: "scratch", label: "Research notes" },
  { id: "mdpreview", label: "Markdown preview" },
  { id: "pin", label: "Pin" },
  { id: "burn", label: "Burn after reading" },
  { id: "copymd", label: "Copy as Markdown" },
  { id: "snapshot", label: "Snapshot" },
  { id: "history", label: "Snapshot history" },
  { id: "zen", label: "Zen mode" },
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
  "📝", "💡", "🔥", "⭐", "📚", "🎯", "💪", "🎨", "🌙", "☀️",
  "🏆", "🔮", "💬", "🎵", "🌿", "⚡", "🛠️", "🎲", "🌊", "🔑",
  "💎", "🦋", "🐉", "🌈", "📌", "💼", "🏠", "🌺", "🤖", "🧠",
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

function processWikiLinks(html, existingTitles) {
  return html.replace(/\[\[([^\]]+)\]\]/g, (_, title) => {
    const safe = title.replace(/"/g, "&quot;");
    const broken = existingTitles ? !existingTitles.has(title.toLowerCase()) : false;
    const cls = broken ? "wiki-link wiki-link--broken" : "wiki-link";
    const tip = broken ? "No note with this title" : "Open note";
    return `<span class="${cls}" data-wikilink="${encodeURIComponent(title)}" title="${tip}">«${safe}»</span>`;
  });
}

// ─── DOCX export helper ───────────────────────────────────────────────────────

function htmlToDocxElements(html, { Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType }) {
  const container = document.createElement("div");
  container.innerHTML = html || "";

  function textRuns(el) {
    const runs = [];
    function walk(node, b = false, i = false, u = false, s = false) {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent;
        if (text) runs.push(new TextRun({ text, bold: b, italics: i, underline: u ? {} : undefined, strike: s }));
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const t = node.tagName;
        for (const c of node.childNodes)
          walk(c, b || t === "STRONG" || t === "B", i || t === "EM" || t === "I",
            u || t === "U", s || t === "S" || t === "STRIKE" || t === "DEL");
      }
    }
    walk(el);
    return runs.length ? runs : [new TextRun("")];
  }

  const elements = [];
  for (const child of container.children) {
    const t = child.tagName;
    if (t === "H1") elements.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: textRuns(child) }));
    else if (t === "H2") elements.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: textRuns(child) }));
    else if (t === "H3") elements.push(new Paragraph({ heading: HeadingLevel.HEADING_3, children: textRuns(child) }));
    else if (t === "UL") {
      for (const li of child.querySelectorAll("li"))
        elements.push(new Paragraph({ bullet: { level: 0 }, children: textRuns(li) }));
    } else if (t === "OL") {
      let n = 1;
      for (const li of child.querySelectorAll("li"))
        elements.push(new Paragraph({ children: [new TextRun(`${n++}. `), ...textRuns(li)] }));
    } else if (t === "TABLE") {
      const rows = [];
      for (const tr of child.querySelectorAll("tr")) {
        const cells = [];
        for (const td of tr.querySelectorAll("td,th"))
          cells.push(new TableCell({ children: [new Paragraph({ children: textRuns(td) })] }));
        if (cells.length) rows.push(new TableRow({ children: cells }));
      }
      if (rows.length) elements.push(new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } }));
    } else {
      const runs = textRuns(child);
      if (runs.length) elements.push(new Paragraph({ children: runs }));
    }
  }
  return elements.length ? elements : [new Paragraph({ children: [new TextRun("")] })];
}

// ─── Font dropdown ────────────────────────────────────────────────────────────

function FontDropdown({ onSelect, onBrowse }) {
  const { addedFonts } = useSignalPadStore();
  const [search, setSearch] = useState("");
  const q = search.toLowerCase();
  const filteredSystem = q ? SYSTEM_FONTS.filter((f) => f.name.toLowerCase().includes(q)) : SYSTEM_FONTS;
  const filteredAdded = (addedFonts ?? []).filter((f) => !q || f.toLowerCase().includes(q));

  return (
    <div className="bg-zinc-950 border border-zinc-700 rounded shadow-2xl">
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
          className="w-full flex items-center gap-2 px-3 py-1.5 rounded text-[11px] text-zinc-400 hover:text-zinc-100 hover:bg-zinc-500/10 transition-colors">
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
    <div className="bg-zinc-950 border border-zinc-700 rounded shadow-2xl">
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

const FONT_SIZES = [9, 10, 11, 12, 13, 14, 16, 18, 20, 24, 32, 48, 72, 100];

function FormatToolbar({ editorRef }) {
  const { addFont } = useSignalPadStore();
  const [showFontDropdown, setShowFontDropdown] = useState(false);
  const [showFontBrowser, setShowFontBrowser] = useState(false);
  const [showSizePicker, setShowSizePicker] = useState(false);
  const [currentSize, setCurrentSize] = useState(12);
  const [customSizeInput, setCustomSizeInput] = useState("");
  const savedRangeRef = useRef(null);
  const containerRef = useRef(null);
  const fontWrapRef = useRef(null);
  const sizeWrapRef = useRef(null);

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

  // Keep the size indicator in sync with the actual font size at the caret
  useEffect(() => {
    const handler = () => {
      const sel = window.getSelection();
      let node = sel?.anchorNode;
      if (!node || !editorRef.current?.contains(node)) return;
      if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
      if (!(node instanceof HTMLElement)) return;
      const size = Math.round(parseFloat(getComputedStyle(node).fontSize));
      if (Number.isFinite(size) && size > 0) setCurrentSize(size);
    };
    document.addEventListener("selectionchange", handler);
    return () => document.removeEventListener("selectionchange", handler);
  }, [editorRef]);

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
    document.execCommand("styleWithCSS", false, true);
    // "inherit" resolves to the editor's base font — clears the family without
    // stripping bold/italic the way removeFormat would.
    document.execCommand("fontName", false, family || "inherit");
  };
  const applyFontSize = (sizePx) => {
    restoreSelection();
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

  const insertTable = () => {
    editorRef.current?.focus();
    const html = `<table class="sp-table"><tbody><tr><th>&nbsp;</th><th>&nbsp;</th><th>&nbsp;</th></tr><tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr><tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr></tbody></table><p><br></p>`;
    document.execCommand("insertHTML", false, html);
  };

  const commitCustomSize = () => {
    const n = parseInt(customSizeInput, 10);
    if (!Number.isFinite(n) || n < 1) return;
    const clamped = Math.min(100, Math.max(1, n));
    setCurrentSize(clamped);
    applyFontSize(`${clamped}px`);
    setCustomSizeInput("");
    setShowSizePicker(false);
  };

  return (
    <div ref={containerRef} className="relative shrink-0">
      <div className="flex flex-wrap items-center gap-0.5 px-2 py-1 border-b border-zinc-700 bg-zinc-950">
        {/* Font family — dropdown anchored under this specific button */}
        <div ref={fontWrapRef} className="relative">
          <button title="Font" onMouseDown={(e) => { e.preventDefault(); if (fontActive) { closeAll(); return; } saveSelection(); setShowFontDropdown(true); setShowSizePicker(false); }}
            className={`px-1.5 py-1 rounded text-[10px] transition-colors flex items-center gap-0.5 ${fontActive ? "text-zinc-100 bg-zinc-700" : "text-zinc-400 hover:text-white hover:bg-zinc-700"}`}>
            <Type size={11} /><ChevronDown size={8} />
          </button>
          {showFontDropdown && (
            <div className="absolute top-full left-0 z-50 mt-0.5 w-[220px]">
              <FontDropdown onSelect={(family) => { applyFontFamily(family); closeAll(); }} onBrowse={() => { setShowFontDropdown(false); setShowFontBrowser(true); }} />
            </div>
          )}
          {showFontBrowser && (
            <div className="absolute top-full left-0 z-50 mt-0.5 w-[300px]">
              <GoogleFontBrowser onSelect={(font) => { addFont(font); applyFontFamily(font); closeAll(); }} onBack={() => { setShowFontBrowser(false); setShowFontDropdown(true); }} />
            </div>
          )}
        </div>

        {/* Font size — dropdown anchored under this specific button (not the entire toolbar) */}
        <div ref={sizeWrapRef} className="relative">
          <button title="Font size" onMouseDown={(e) => { e.preventDefault(); saveSelection(); setShowFontDropdown(false); setShowFontBrowser(false); setShowSizePicker((p) => !p); }}
            className={`px-1.5 py-1 rounded text-[10px] font-mono transition-colors min-w-[26px] text-center ${showSizePicker ? "text-zinc-100 bg-zinc-700" : "text-zinc-400 hover:text-white hover:bg-zinc-700"}`}>
            {currentSize}
          </button>
          {showSizePicker && (
            <div className="absolute top-full left-0 z-50 mt-0.5 bg-zinc-950 border border-zinc-700 rounded shadow-xl overflow-hidden min-w-[80px]">
              <div className="px-1.5 py-1 border-b border-zinc-800">
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={customSizeInput}
                  onChange={(e) => setCustomSizeInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitCustomSize(); } }}
                  placeholder="1–100"
                  className="w-full bg-zinc-800 text-[11px] font-mono text-zinc-200 px-2 py-1 rounded border border-zinc-700 focus:outline-none focus:border-zinc-500/80 placeholder:text-zinc-600 text-center"
                />
              </div>
              <div className="max-h-[200px] overflow-y-auto">
                {FONT_SIZES.map((s) => (
                  <button key={s} onMouseDown={(e) => { e.preventDefault(); setCurrentSize(s); applyFontSize(`${s}px`); setShowSizePicker(false); }}
                    className={`block w-full text-right px-3 py-1 text-[11px] font-mono transition-colors ${currentSize === s ? "text-zinc-100 bg-zinc-900" : "text-zinc-300 hover:bg-zinc-700 hover:text-white"}`}>{s}</button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="w-px h-4 bg-zinc-700 mx-1" />
        <ToolbarBtn title="Bold (Ctrl+B)" onClick={() => cmd("bold")}><Bold size={13} /></ToolbarBtn>
        <ToolbarBtn title="Italic (Ctrl+I)" onClick={() => cmd("italic")}><Italic size={13} /></ToolbarBtn>
        <ToolbarBtn title="Underline (Ctrl+U)" onClick={() => cmd("underline")}><Underline size={13} /></ToolbarBtn>
        <ToolbarBtn title="Strikethrough" onClick={() => cmd("strikethrough")}><Strikethrough size={13} /></ToolbarBtn>
        <div className="w-px h-4 bg-zinc-700 mx-1" />
        <ToolbarBtn title="Heading" onClick={() => cmd("formatBlock", "<h3>")}><Heading2 size={13} /></ToolbarBtn>
        <ToolbarBtn title="Bullet list" onClick={() => cmd("insertUnorderedList")}><List size={13} /></ToolbarBtn>
        <ToolbarBtn title="Numbered list" onClick={() => cmd("insertOrderedList")}><ListOrdered size={13} /></ToolbarBtn>
        <ToolbarBtn title="Checklist" onClick={insertChecklist}><CheckSquare size={13} /></ToolbarBtn>
        <ToolbarBtn title="Insert table" onClick={insertTable}><Table2 size={13} /></ToolbarBtn>
        <div className="w-px h-4 bg-zinc-700 mx-1" />
        <ToolbarBtn title="Divider" onClick={() => cmd("insertHorizontalRule")}><Minus size={11} /></ToolbarBtn>
        <ToolbarBtn title="Clear formatting" onClick={() => cmd("removeFormat")}><span className="text-[9px]">Tx</span></ToolbarBtn>
      </div>
    </div>
  );
}

// ─── Pin badge ────────────────────────────────────────────────────────────────

function PinBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-[8px] font-bold tracking-widest uppercase px-1.5 py-0.5 rounded border pinned-badge">
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
      const pickerHeight = 280; // max-h-[240px] + header ~40px
      const spaceBelow = window.innerHeight - r.bottom;
      const rightEdge = window.innerWidth - r.right;
      if (spaceBelow >= pickerHeight) {
        setPos({ top: r.bottom + 4, right: rightEdge });
      } else {
        setPos({ bottom: window.innerHeight - r.top + 4, right: rightEdge });
      }
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
      style={{ position: "fixed", top: pos.top, bottom: pos.bottom, right: pos.right, zIndex: 9990, width: 180 }}
      className="flex flex-col bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl overflow-hidden"
    >
      <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-zinc-800 shrink-0">
        <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-500">Scene</span>
        <button onClick={onClose} className="text-zinc-600 hover:text-zinc-300 transition-colors"><X size={10} /></button>
      </div>
      <div className="overflow-y-auto max-h-[240px] p-1">
        <button onClick={() => { onSelect(null); onClose(); }}
          className={`w-full text-left px-2 py-1 rounded text-[10px] transition-colors mb-0.5 ${!sceneId ? "bg-zinc-500/20 text-zinc-300" : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"}`}>
          Document snapshot
        </button>
        {["Weather", "Scenes"].map(cat => (
          <div key={cat}>
            <div className="px-2 pt-1.5 pb-0.5 text-[8px] font-bold uppercase tracking-widest text-zinc-600">{cat}</div>
            {SCENES.filter(s => s.category === cat).map(s => (
              <button key={s.id} onClick={() => { onSelect(s.id); onClose(); }}
                className={`w-full text-left px-2 py-1 rounded text-[10px] transition-colors ${sceneId === s.id ? "bg-zinc-500/20 text-zinc-300" : "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"}`}>
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

function NoteCard({ note, onClick, onReveal, onDelete, onContextMenu, draggable, onGripPointerDown, dragOver, isDragging, sceneId, onSetScene, cardScenesEnabled, density }) {
  const [showPicker, setShowPicker] = useState(false);
  const pickerBtnRef = useRef(null);

  const cardStyle = note.color
    ? { borderColor: note.color + "55", backgroundColor: note.color + "0C" }
    : {};

  return (
    <div
      onContextMenu={onContextMenu}
      data-note-id={note.id}
      style={cardStyle}
      className={`group w-full flex flex-col rounded-lg border transition-all duration-150 cursor-pointer overflow-hidden
        ${isDragging ? "opacity-40 scale-[0.98]" : ""}
        ${dragOver ? "ring-2 ring-zinc-400/70 ring-offset-1 ring-offset-transparent" : ""}
        ${note.pinned && !note.color
          ? "pinned-card"
          : !note.color
            ? "border-zinc-700 bg-zinc-900/40 hover:bg-zinc-800 hover:border-zinc-600/60"
            : "hover:brightness-110"
        }`}
    >
      {/* Title bar */}
      <div
        className={`flex items-center gap-1.5 px-2.5 py-[6px] border-b shrink-0
          ${note.pinned && !note.color ? "pinned-header" : "border-zinc-800 bg-zinc-900/60"}`}
        onClick={onClick}
      >
        {note.emoji && <span className="text-[11px] leading-none">{note.emoji}</span>}
        <span className="flex items-baseline gap-1 flex-1 min-w-0">
          <span className={`text-[11px] font-semibold leading-none truncate ${note.pinned ? "pinned-title" : "text-zinc-100"}`}>
            {note.title || "Untitled"}
          </span>
          <span className={`text-[11px] font-mono leading-none shrink-0 ${note.pinned ? "pinned-title-dim" : "text-zinc-400"}`}>.{note.fileExt || "md"}</span>
        </span>
        <div className="flex items-center gap-1 shrink-0">
          {note.burn && <Flame size={11} className="text-orange-400/70" />}
          {note.pinned && <PinBadge />}
          {draggable && (
            <span
              className="opacity-0 group-hover:opacity-100 transition-opacity text-zinc-500 cursor-grab active:cursor-grabbing select-none"
              onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); onGripPointerDown?.(e, note.id); }}
            >
              <GripVertical size={13} />
            </span>
          )}
          <button onClick={(e) => { e.stopPropagation(); onReveal(); }} title="Show in folder"
            className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded text-zinc-600 hover:text-zinc-300 hover:bg-zinc-700">
            <FolderOpen size={13} />
          </button>
          <button
            onClick={async (e) => { e.stopPropagation(); if (await tauriConfirm(`Delete "${note.title || "Untitled"}"?`, { title: "Delete note", kind: "warning" })) onDelete(); }}
            title="Delete note"
            className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded text-zinc-600 hover:text-red-400 hover:bg-red-950"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* Content row */}
      <div className={`flex flex-row flex-1 min-h-0 ${density === "compact" ? "h-[48px]" : density === "spacious" ? "h-[92px]" : "h-[72px]"}`}>
        {/* Left: note meta */}
        <div className={`${cardScenesEnabled ? "w-1/4" : "w-full"} min-w-0 px-2.5 py-2 flex flex-col justify-between`} onClick={onClick}>
          <p className={`text-[10px] text-zinc-500 leading-relaxed ${density === "spacious" ? "line-clamp-4" : "line-clamp-2"}`}>{notePreview(note.content)}</p>
          <p className="text-[9px] text-zinc-700">{fmtDate(note.updatedAt)}</p>
        </div>

        {/* Right: pixel art panel (3/4) — hidden when scenes disabled */}
        {cardScenesEnabled && <div className="w-3/4 shrink-0 relative border-l border-zinc-800 overflow-hidden">
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
        </div>}
      </div>
    </div>
  );
}

// ─── Spellcheck helpers ───────────────────────────────────────────────────────

const COMMON_CORRECTIONS = {
  "accomodate": "accommodate", "acheive": "achieve", "acquaintence": "acquaintance",
  "acrage": "acreage", "adn": "and", "agressive": "aggressive", "alot": "a lot",
  "amature": "amateur", "aparent": "apparent", "arguement": "argument",
  "athiest": "atheist", "basicaly": "basically", "becuase": "because",
  "beleive": "believe", "calender": "calendar", "carefull": "careful",
  "cemetary": "cemetery", "changable": "changeable", "cheif": "chief",
  "colleage": "colleague", "comming": "coming", "commited": "committed",
  "concious": "conscious", "convience": "convenience", "critisism": "criticism",
  "definately": "definitely", "desparate": "desperate", "dissapear": "disappear",
  "dissapoint": "disappoint", "doesnt": "doesn't", "dont": "don't",
  "embarass": "embarrass", "enviroment": "environment", "existance": "existence",
  "experiance": "experience", "firey": "fiery", "foriegn": "foreign",
  "fourty": "forty", "freind": "friend", "futher": "further", "gaurd": "guard",
  "glamourous": "glamorous", "goverment": "government", "grammer": "grammar",
  "harrass": "harass", "hieght": "height", "humerous": "humorous",
  "imediately": "immediately", "independant": "independent",
  "inteligent": "intelligent", "intresting": "interesting", "irresistable": "irresistible",
  "knowlege": "knowledge", "labratory": "laboratory",
  "languege": "language", "lenth": "length", "liason": "liaison", "libary": "library",
  "lisence": "license", "maintainance": "maintenance", "medeval": "medieval",
  "memmorable": "memorable", "millenium": "millennium", "miniscule": "minuscule",
  "mischevious": "mischievous", "neccessary": "necessary",
  "negotate": "negotiate", "nieghbor": "neighbor", "noticable": "noticeable",
  "occassion": "occasion", "occured": "occurred", "occuring": "occurring",
  "occurance": "occurrence", "ommit": "omit", "oppertunity": "opportunity",
  "oppurtunity": "opportunity", "outragous": "outrageous", "paralell": "parallel",
  "parliment": "parliament", "pasttime": "pastime", "peice": "piece",
  "perseverence": "perseverance", "plagarism": "plagiarism", "posession": "possession",
  "potatos": "potatoes", "prefered": "preferred", "privelege": "privilege",
  "probaly": "probably", "pronounciation": "pronunciation", "publically": "publicly",
  "questionaire": "questionnaire", "recieve": "receive", "recomend": "recommend",
  "refered": "referred", "restaraunt": "restaurant", "rythm": "rhythm",
  "seige": "siege", "seperate": "separate",
  "sherif": "sheriff", "sieze": "seize", "similer": "similar",
  "socialy": "socially", "speach": "speech", "succesful": "successful",
  "supercede": "supersede", "supress": "suppress", "suprise": "surprise",
  "tatoo": "tattoo", "tendancy": "tendency", "threshhold": "threshold",
  "tommorow": "tomorrow", "tounge": "tongue", "truely": "truly", "twelth": "twelfth",
  "tyrany": "tyranny", "untill": "until", "usualy": "usually", "vaccum": "vacuum",
  "vegatable": "vegetable", "visious": "vicious", "wich": "which", "wierd": "weird",
  "whereever": "wherever", "wont": "won't", "writting": "writing", "yesturday": "yesterday",
};

// ─── nspell lazy loader ───────────────────────────────────────────────────────

let _spellChecker = null;
let _spellCheckerPromise = null;

async function loadSpellChecker() {
  if (_spellCheckerPromise) return _spellCheckerPromise;
  _spellCheckerPromise = (async () => {
    try {
      const [{ default: nspell }, affText, dicText] = await Promise.all([
        import("nspell"),
        fetch("/spell/en.aff").then((r) => r.text()),
        fetch("/spell/en.dic").then((r) => r.text()),
      ]);
      _spellChecker = nspell({ aff: affText, dic: dicText });
    } catch {
      /* fall back to COMMON_CORRECTIONS only */
    }
  })();
  return _spellCheckerPromise;
}

function getWordAtPoint(x, y) {
  // Prefer the standard API; fall back to the Chrome/WebKit non-standard one
  let node, offset;
  if (document.caretPositionFromPoint) {
    const p = document.caretPositionFromPoint(x, y);
    if (!p) return { word: null, range: null };
    node = p.offsetNode; offset = p.offset;
  } else if (document.caretRangeFromPoint) {
    const r = document.caretRangeFromPoint(x, y);
    if (!r) return { word: null, range: null };
    node = r.startContainer; offset = r.startOffset;
  } else {
    return { word: null, range: null };
  }

  // Resolve element nodes to an adjacent text child
  if (node.nodeType !== Node.TEXT_NODE) {
    const child = node.childNodes[offset] ?? node.childNodes[offset - 1];
    if (!child || child.nodeType !== Node.TEXT_NODE) return { word: null, range: null };
    node = child; offset = 0;
  }

  const text = node.textContent || "";
  let start = offset;
  let end = offset;

  // Expand over letters, apostrophes and hyphens (handles contractions/hyphenated words)
  while (start > 0 && /[a-zA-Z'-]/.test(text[start - 1])) start--;
  while (end < text.length && /[a-zA-Z'-]/.test(text[end])) end++;

  // Strip leading/trailing punctuation so we don't include surrounding quotes/dashes
  while (start < end && !/[a-zA-Z]/.test(text[start])) start++;
  while (end > start && !/[a-zA-Z]/.test(text[end - 1])) end--;

  if (start >= end) return { word: null, range: null };

  const word = text.slice(start, end);
  const wordRange = document.createRange();
  wordRange.setStart(node, start);
  wordRange.setEnd(node, end);
  return { word, range: wordRange };
}

function getSpellSuggestions(word) {
  if (!word) return [];
  const lower = word.toLowerCase();

  // Instant lookup from known corrections table
  const exact = COMMON_CORRECTIONS[lower];
  if (exact) return [exact];

  // nspell when loaded — skip correctly-spelled words
  if (_spellChecker) {
    if (_spellChecker.correct(word)) return [];
    return _spellChecker.suggest(word).slice(0, 5);
  }

  return [];
}

// ─── Timeline view ───────────────────────────────────────────────────────────

function TimelineView({ items, onRestore, starredAutoSnaps, onStar, onUnstar }) {
  const [selected, setSelected] = useState(null);
  return (
    <div className="flex flex-col gap-2">
      {/* Dot rail */}
      <div className="flex items-center gap-0 overflow-x-auto py-2 px-1">
        {items.map((item, i) => {
          const isManual = item.kind === "manual";
          const isSelected = selected?.path === item.path;
          return (
            <React.Fragment key={item.path}>
              {i > 0 && <div className="h-px flex-1 min-w-[6px] bg-zinc-700" />}
              <button
                onClick={() => setSelected(isSelected ? null : item)}
                title={fmtTs(item.ts)}
                className={`shrink-0 rounded-full border-2 transition-all ${isManual
                  ? `w-3 h-3 ${isSelected ? "border-zinc-400 bg-zinc-400" : "border-zinc-700 bg-zinc-900 hover:bg-zinc-900"}`
                  : `w-2 h-2 ${isSelected ? "border-zinc-300 bg-zinc-300" : "border-zinc-600 bg-zinc-900 hover:bg-zinc-700"}`
                  }`}
              />
            </React.Fragment>
          );
        })}
      </div>
      {/* Selected info */}
      {selected && (
        <div className="flex items-center gap-2 px-1 pb-1">
          <span className={`text-[9px] font-bold uppercase tracking-widest ${selected.kind === "manual" ? "text-zinc-500" : "text-zinc-500"}`}>
            {selected.kind === "manual" ? "Manual" : "Auto"}
          </span>
          <span className="text-[10px] text-zinc-400 flex-1">{fmtTs(selected.ts)}</span>
          {selected.kind === "auto" && (
            <button
              onClick={() => starredAutoSnaps.has(selected.path) ? onUnstar(selected.path) : onStar(selected.path)}
              className={`transition-colors shrink-0 star-btn${starredAutoSnaps.has(selected.path) ? " starred" : ""}`}>
              <Star size={9} fill={starredAutoSnaps.has(selected.path) ? "currentColor" : "none"} />
            </button>
          )}
          <button onClick={() => onRestore(selected.path)} className="text-[9px] text-zinc-100 hover:text-zinc-300 transition-colors">Restore</button>
        </div>
      )}
    </div>
  );
}

// ─── Note editor ──────────────────────────────────────────────────────────────

function NoteEditor({ note, onBack, onSave, onDelete, onTogglePin, mdPreview, onMdPreviewChange, zenMode, onZenChange, onNavigate, onShowContextMenu, onWordCountChange, isActive = true, desktopMode = false }) {
  const { pageStyle, pageScheme, pageWidth } = useSignalPadStore();
  const pageCls = desktopMode ? ` sp-page sp-width-${pageWidth}` : "";
  // Zen strips all chrome, so the well treatment turns off with it
  const wellActive = desktopMode && !zenMode;
  const wellCls = wellActive ? ` sp-well sp-style-${pageStyle} sp-scheme-${pageScheme}` : "";
  const frameDecor = wellActive && pageStyle === "frame" ? (
    <>
      <span className="sp-ck tl" /><span className="sp-ck tr" /><span className="sp-ck bl" /><span className="sp-ck br" />
      <span className="sp-doclabel">DOC · {note.fileExt || "md"}</span>
    </>
  ) : null;
  const { notes, saveFormat, saveNoteTo, setNoteEmoji, setNoteColor, toggleBurn, saveSnapshot, listSnapshots, readSnapshot, deleteSnapshot, saveAutoSnapshot, listAutoSnapshots, starAutoSnapshot, unstarAutoSnapshot, deleteUnstarredAutoSnapshots, starredAutoSnaps, toolbarVisible, notePasscodes, setNotePasscode, spellcheck, setSpellcheck, spellcheckLang, autoSaveDelay } = useSignalPadStore();
  const autoSaveTimer = useRef(null);
  const vis = (id) => toolbarVisible.has(id);

  const [title, setTitle] = useState(note.title || "");
  const [viewMode, setViewMode] = useState(note.pinned);
  const [askingFormat, setAskingFormat] = useState(false);
  const [mdText, setMdText] = useState("");
  const [typewriterMode, setTypewriterMode] = useState(false);
  const [showSnapshots, setShowSnapshots] = useState(false);
  const [snapshots, setSnapshots] = useState([]);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [snapshotTab, setSnapshotTab] = useState("manual");
  const [autoSnapshots, setAutoSnapshots] = useState([]);
  const [showOverflow, setShowOverflow] = useState(false);
  const [, setNoteUnlocked] = useState(!notePasscodes[note.id]);
  const [showNotePasscode, setShowNotePasscode] = useState(!!notePasscodes[note.id]);
  const [showSetPasscode, setShowSetPasscode] = useState(false);

  const [paragraphFocusMode, setParagraphFocusMode] = useState(false);
  const [scratchOpen, setScratchOpen] = useState(false);
  const [scratchContent, setScratchContent] = useState(note.scratch || "");
  const scratchSaveTimer = useRef(null);
  const [toast, setToast] = useState(null); // { msg, kind }
  const toastTimer = useRef(null);
  const showToast = useCallback((msg, kind = "info") => {
    clearTimeout(toastTimer.current);
    setToast({ msg, kind });
    toastTimer.current = setTimeout(() => setToast(null), 1800);
  }, []);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const editorRef = useRef(null);
  const editorWrapperRef = useRef(null);
  const caretRef = useRef(null);
  const caretLastTop = useRef(null);
  const dirty = useRef(false);
  const caretBlinkTimer = useRef(null);
  const caretAnimFrame = useRef(null);
  const titleRef = useRef(title);
  const lastAutoContentRef = useRef(null);
  const mountedRef = useRef(true);
  const overflowRef = useRef(null);
  const lastInteractionRef = useRef("click"); // "click" | "key"
  const paragraphFocusModeRef = useRef(false);
  const focusedBlockRef = useRef(null);

  useEffect(() => { setViewMode(note.pinned); }, [note.pinned]);

  // Paragraph focus — keep ref in sync and clean up classes when mode is off
  useEffect(() => {
    paragraphFocusModeRef.current = paragraphFocusMode;
    if (!paragraphFocusMode && editorRef.current) {
      editorRef.current.querySelectorAll(".sp-focused-block").forEach(el => el.classList.remove("sp-focused-block"));
      focusedBlockRef.current = null;
    }
  }, [paragraphFocusMode]);

  // Scratch notes — debounce-save into the note file
  const handleScratchChange = useCallback((text) => {
    setScratchContent(text);
    clearTimeout(scratchSaveTimer.current);
    scratchSaveTimer.current = setTimeout(() => onSave({ scratch: text }), 800);
  }, [onSave]);

  useEffect(() => () => clearTimeout(scratchSaveTimer.current), []);

  // ── Auto-snapshot lifecycle ───────────────────────────────────────────────
  useEffect(() => { titleRef.current = title; }, [title]);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    // Wipe unstarred auto-snapshots when note is closed
    return () => { deleteUnstarredAutoSnapshots(note.id).catch(() => { }); };
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
      if (!isActive || e.key !== "Escape") return;
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
    if (viewMode || !isActive) return;
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
    const count = text.trim().split(/\s+/).filter(Boolean).length;
    onWordCountChange?.(count);
  }, [onWordCountChange]);

  useEffect(() => { updateWordCount(); }, [note.content]);
  useEffect(() => { if (isActive) updateWordCount(); }, [isActive, updateWordCount]);

  // Pre-warm nspell so suggestions are ready before first right-click
  useEffect(() => { if (spellcheck) loadSpellChecker(); }, [spellcheck]);

  // ── Smooth caret ──────────────────────────────────────────────────────────
  const updateParagraphFocus = useCallback(() => {
    if (!paragraphFocusModeRef.current || !editorRef.current) return;
    const sel = window.getSelection();
    let node = sel?.anchorNode;
    if (!node) return;
    while (node && node.parentElement !== editorRef.current) node = node.parentElement;
    if (focusedBlockRef.current && focusedBlockRef.current !== node)
      focusedBlockRef.current.classList.remove("sp-focused-block");
    if (node instanceof HTMLElement && node.parentElement === editorRef.current) {
      node.classList.add("sp-focused-block");
      focusedBlockRef.current = node;
    }
  }, []);

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
    // Caret is absolute-positioned inside the wrapper, which does not scroll.
    // rect.top is viewport-relative and already accounts for editor scroll, so no scrollTop add.
    const newTop = rect.top - wrapperRect.top;
    const newLeft = rect.left - wrapperRect.left;
    const lineChanged = caretLastTop.current !== null && Math.abs(newTop - caretLastTop.current) > rect.height * 0.5;
    caretLastTop.current = newTop;

    if (!animate || lineChanged) {
      // Snap both axes instantly on line changes or non-animated updates
      caret.style.transition = "none";
      caret.style.top = `${newTop}px`;
      caret.style.left = `${newLeft}px`;
      caret.style.height = `${rect.height}px`;
      requestAnimationFrame(() => { if (caret) caret.style.transition = "left 80ms ease-out"; });
    } else {
      // Same line — only slide horizontally
      caret.style.transition = "left 80ms ease-out";
      caret.style.top = `${newTop}px`;
      caret.style.height = `${rect.height}px`;
      caret.style.left = `${newLeft}px`;
    }
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
    if (!sel?.rangeCount || !editorRef.current.contains(sel.anchorNode)) return;
    const range = sel.getRangeAt(0).cloneRange();
    range.collapse(true);
    let rect = range.getBoundingClientRect();
    // Empty line — fall back to nearest block element rect
    if (rect.height === 0) {
      let node = sel.anchorNode;
      if (node?.nodeType === Node.TEXT_NODE) node = node.parentElement;
      while (node && node !== editorRef.current) {
        const pr = node.getBoundingClientRect();
        if (pr.height > 0) { rect = pr; break; }
        node = node.parentElement;
      }
    }
    if (!rect || rect.height === 0) return;
    const editorRect = editorRef.current.getBoundingClientRect();
    const target = editorRect.top + editorRect.height / 2;
    const delta = rect.top - target;
    if (Math.abs(delta) > 0.5) editorRef.current.scrollTop += delta;
  }, [typewriterMode]);

  // Re-center caret when typewriter mode is toggled on so the cursor jumps to vertical centre.
  useEffect(() => {
    if (!typewriterMode) return;
    const id = requestAnimationFrame(enforceTypewriter);
    return () => cancelAnimationFrame(id);
  }, [typewriterMode, enforceTypewriter]);

  useEffect(() => {
    if (viewMode) { if (caretRef.current) caretRef.current.style.opacity = "0"; return; }
    const editor = editorRef.current;
    const wrapper = editorWrapperRef.current;
    if (!editor || !wrapper) return;
    const coalesced = (animate) => () => {
      cancelAnimationFrame(caretAnimFrame.current);
      caretAnimFrame.current = requestAnimationFrame(() => { updateCaretPosition(animate); enforceTypewriter(); updateParagraphFocus(); });
    };
    const handleSelectionChange = coalesced(true);
    const handleScroll = coalesced(false);
    const handleFocus = coalesced(false);
    const handleBlur = () => {
      cancelAnimationFrame(caretAnimFrame.current);
      clearTimeout(caretBlinkTimer.current);
      caretLastTop.current = null;
      const caret = caretRef.current;
      if (caret) { caret.classList.remove("smooth-caret--blinking"); caret.style.opacity = "0"; }
    };
    const handleMouseDown = () => { lastInteractionRef.current = "click"; };
    const handleKeyDown = () => { lastInteractionRef.current = "key"; };
    const ro = new ResizeObserver(coalesced(false));
    ro.observe(wrapper);
    document.addEventListener("selectionchange", handleSelectionChange);
    editor.addEventListener("scroll", handleScroll);
    editor.addEventListener("focus", handleFocus);
    editor.addEventListener("blur", handleBlur);
    editor.addEventListener("mousedown", handleMouseDown);
    editor.addEventListener("keydown", handleKeyDown);
    if (document.activeElement === editor) updateCaretPosition(false);
    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange);
      editor.removeEventListener("scroll", handleScroll);
      editor.removeEventListener("focus", handleFocus);
      editor.removeEventListener("blur", handleBlur);
      editor.removeEventListener("mousedown", handleMouseDown);
      editor.removeEventListener("keydown", handleKeyDown);
      ro.disconnect();
      cancelAnimationFrame(caretAnimFrame.current);
      clearTimeout(caretBlinkTimer.current);
    };
  }, [viewMode, updateCaretPosition, enforceTypewriter, updateParagraphFocus]);

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

  // Close Save As menu on outside click
  useEffect(() => {
    if (!askingFormat) return;
    const handler = (e) => { if (!e.target.closest("[data-saveas]")) setAskingFormat(false); };
    const id = setTimeout(() => document.addEventListener("mousedown", handler), 0);
    return () => { clearTimeout(id); document.removeEventListener("mousedown", handler); };
  }, [askingFormat]);

  // ── Save helpers ──────────────────────────────────────────────────────────
  const resolveAutoExt = () => note.fileExt || (saveFormat !== "ask" ? saveFormat : "md");

  const handleSave = (fileExt) => {
    clearTimeout(autoSaveTimer.current);
    editorRef.current?.querySelectorAll(".sp-focused-block").forEach(el => el.classList.remove("sp-focused-block"));
    focusedBlockRef.current = null;
    const content = editorRef.current?.innerHTML || "";
    onSave({ title: title.trim() || "Untitled", content, fileExt: fileExt || resolveAutoExt() });
    dirty.current = false;
    setAskingFormat(false);
  };

  // Auto-save when switching away from this tab (isActive flips false) so unsaved edits aren't lost.
  const wasActiveRef = useRef(isActive);
  useEffect(() => {
    if (wasActiveRef.current && !isActive && dirty.current && !viewMode) {
      handleSave(resolveAutoExt());
    }
    wasActiveRef.current = isActive;
  }, [isActive]); // eslint-disable-line react-hooks/exhaustive-deps

  // Save on unmount (tab ✕, palette delete of another note, etc.) — the ref
  // always holds the latest closure so the cleanup sees current state.
  const saveOnUnmountRef = useRef(() => { });
  saveOnUnmountRef.current = () => {
    if (dirty.current && !viewMode) handleSave(resolveAutoExt());
  };
  useEffect(() => () => saveOnUnmountRef.current(), []);

  useEffect(() => () => clearTimeout(autoSaveTimer.current), []);

  // SAVE — never prompts; uses the note's existing file type.
  const handleSaveClick = () => {
    handleSave(resolveAutoExt());
    showToast("Saved", "success");
  };

  const handleExportDocx = async (filePath, html) => {
    const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType } =
      await import("docx");
    const elements = htmlToDocxElements(html, { Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType });
    const doc = new Document({ sections: [{ properties: {}, children: elements }] });
    const buf = await Packer.toBuffer(doc);
    await invoke("write_file_bytes", { path: filePath, data: Array.from(new Uint8Array(buf)) });
    dirty.current = false; setAskingFormat(false);
  };

  // Save As — opens system file dialog. Optionally restrict to a single format.
  const handleSaveToPath = async (onlyExt) => {
    const noteTitle = title.trim() || "Untitled";
    const content = editorRef.current?.innerHTML || "";
    const allFilters = [
      { name: "Markdown",      extensions: ["md"] },
      { name: "Text",          extensions: ["txt"] },
      { name: "Word Document", extensions: ["docx"] },
    ];
    const filters = onlyExt ? allFilters.filter(f => f.extensions[0] === onlyExt) : allFilters;
    const defaultPath = onlyExt ? `${noteTitle}.${onlyExt}` : noteTitle;
    const path = await saveDialog({ defaultPath, filters });
    if (!path) return;
    if (path.toLowerCase().endsWith(".docx")) {
      await handleExportDocx(path, content);
      showToast("Exported .docx", "success");
      return;
    }
    await saveNoteTo(note.id, path, { title: noteTitle, content });
    dirty.current = false; setAskingFormat(false);
    showToast("Saved to disk", "success");
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
    try {
      await navigator.clipboard.writeText(md);
      showToast("Copied as Markdown", "success");
    } catch {
      showToast("Copy failed", "error");
    }
  };

  // ── Paste (context menu) — execCommand("paste") is blocked in WebView2 ────
  const handlePaste = async () => {
    editorRef.current?.focus();
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imgType = item.types.find((t) => t.startsWith("image/"));
        if (imgType) {
          const blob = await item.getType(imgType);
          const dataUrl = await new Promise((res, rej) => {
            const r = new FileReader();
            r.onload = () => res(r.result);
            r.onerror = rej;
            r.readAsDataURL(blob);
          });
          document.execCommand("insertHTML", false, `<img src="${dataUrl}" />`);
          return;
        }
      }
    } catch { /* fall through to text */ }
    try {
      const text = await navigator.clipboard.readText();
      if (text) document.execCommand("insertText", false, text);
    } catch {
      showToast("Clipboard unavailable", "error");
    }
  };

  // ── Checklist checkbox toggle — mirror the live property into the attribute
  // so innerHTML serialization keeps the state, and drive the .checked style.
  const handleEditorClick = (e) => {
    const cb = e.target;
    if (!(cb instanceof HTMLInputElement) || cb.type !== "checkbox") return;
    const item = cb.closest(".checklist-item");
    if (cb.checked) { cb.setAttribute("checked", ""); item?.classList.add("checked"); }
    else { cb.removeAttribute("checked"); item?.classList.remove("checked"); }
    editorRef.current?.dispatchEvent(new Event("input", { bubbles: true }));
  };

  // ── Snapshot ──────────────────────────────────────────────────────────────
  const handleSnapshot = async () => {
    const content = editorRef.current?.innerHTML || note.content || "";
    try {
      await saveSnapshot(note.id, content, title.trim() || "Untitled");
      showToast("Snapshot saved", "success");
      if (showSnapshots) loadSnapshots();
    } catch (err) {
      showToast("Snapshot failed", "error");
    }
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
    if (!await tauriConfirm("Restore this snapshot? Current content will be replaced.", { title: "Restore snapshot", kind: "warning" })) return;
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

  // ── Checklist Enter handling ──────────────────────────────────────────────
  // Default Enter splits the flex div into a checkbox-less clone that can render
  // zero-height, so the caret looks stuck. Continue the checklist ourselves;
  // an empty item exits back to a plain paragraph (like lists do).
  const handleChecklistEnter = (e) => {
    const sel = window.getSelection();
    if (!sel?.rangeCount) return false;
    let node = sel.anchorNode;
    if (node?.nodeType === Node.TEXT_NODE) node = node.parentElement;
    const item = node?.closest?.(".checklist-item");
    if (!item || !editorRef.current?.contains(item)) return false;
    e.preventDefault();

    const placeCaret = (target) => {
      const r = document.createRange();
      r.selectNodeContents(target);
      r.collapse(true);
      sel.removeAllRanges();
      sel.addRange(r);
    };

    const itemText = (item.textContent || "").replace(/ /g, " ").trim();
    if (!itemText) {
      const p = document.createElement("p");
      p.appendChild(document.createElement("br"));
      item.replaceWith(p);
      placeCaret(p);
    } else {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      const newItem = document.createElement("div");
      newItem.className = "checklist-item";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      const newSpan = document.createElement("span");
      const span = item.querySelector("span");
      if (span && span.contains(range.startContainer)) {
        const rest = document.createRange();
        rest.setStart(range.startContainer, range.startOffset);
        rest.setEnd(span, span.childNodes.length);
        newSpan.appendChild(rest.extractContents());
      }
      if (!newSpan.textContent) newSpan.innerHTML = "&nbsp;";
      newItem.append(cb, newSpan);
      item.after(newItem);
      placeCaret(newSpan);
    }
    editorRef.current.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  };

  // ── Copy image to clipboard ───────────────────────────────────────────────
  const handleCopyImage = async (img) => {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      canvas.getContext("2d").drawImage(img, 0, 0);
      const blob = await new Promise((res, rej) =>
        canvas.toBlob((b) => (b ? res(b) : rej(new Error("toBlob failed"))), "image/png"));
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      showToast("Image copied", "success");
    } catch {
      showToast("Couldn't copy image", "error");
    }
  };

  // ── Editor context menu ───────────────────────────────────────────────────
  const handleEditorContextMenu = (e) => {
    e.preventDefault();
    const imgTarget = e.target.closest?.("img");
    const hasSelection = !!window.getSelection()?.toString();
    const { word, range: wordRange } = getWordAtPoint(e.clientX, e.clientY);
    const savedRange = wordRange ? wordRange.cloneRange() : null;
    const suggestions = spellcheck ? getSpellSuggestions(word) : [];

    const applyCorrection = (correction) => {
      if (!savedRange || !editorRef.current) return;
      editorRef.current.focus();
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(savedRange.cloneRange());
      document.execCommand("insertText", false, correction);
    };

    onShowContextMenu({
      x: e.clientX, y: e.clientY,
      items: [
        // Spell suggestions at the top when available
        ...(suggestions.length > 0 ? [
          ...suggestions.map(s => ({
            label: s,
            suggestion: true,
            action: () => applyCorrection(s),
          })),
          { separator: true },
        ] : []),
        ...(imgTarget ? [
          { icon: <Copy size={11} />, label: "Copy Image", action: () => handleCopyImage(imgTarget) },
        ] : []),
        ...(hasSelection ? [
          { icon: <Scissors size={11} />, label: "Cut", shortcut: "Ctrl+X", action: () => document.execCommand("cut") },
          { icon: <Copy size={11} />, label: "Copy", shortcut: "Ctrl+C", action: () => document.execCommand("copy") },
        ] : []),
        { label: "Paste", shortcut: "Ctrl+V", action: handlePaste },
        { label: "Select All", shortcut: "Ctrl+A", action: () => document.execCommand("selectAll") },
        { separator: true },
        { label: spellcheck ? "✓ Spell Check" : "Spell Check", action: () => setSpellcheck(!spellcheck) },
        { icon: <Copy size={11} />, label: "Copy as Markdown", action: handleCopyMd },
        ...(!viewMode ? [{ icon: <Camera size={11} />, label: "Save Snapshot", action: handleSnapshot }] : []),
        { separator: true },
        ...(!notePasscodes[note.id]
          ? [{ icon: <Lock size={11} />, label: "Lock Note…", action: () => setShowSetPasscode(true) }]
          : [{ icon: <Lock size={11} />, label: "Remove Note Lock", action: () => setNotePasscode(note.id, null) }]
        ),
        { separator: true },
        { icon: <Trash2 size={11} />, label: "Delete Note", danger: true, action: async () => { if (await tauriConfirm("Delete this note?", { title: "Delete note", kind: "warning" })) onDelete(); } },
      ],
    });
  };

  // ── Wiki link navigation + collapsible headings ───────────────────────────
  const handleContentClick = (e) => {
    // Read-only views: don't let checkboxes toggle — the change would never persist
    if (e.target instanceof HTMLInputElement && e.target.type === "checkbox") {
      e.preventDefault();
      return;
    }
    const link = e.target.closest("[data-wikilink]");
    if (link) { onNavigate(decodeURIComponent(link.dataset.wikilink)); return; }

    const heading = e.target.closest("h1,h2,h3");
    if (!heading) return;
    const isCollapsed = heading.classList.toggle("collapsed");
    let el = heading.nextElementSibling;
    while (el && !["H1", "H2", "H3"].includes(el.tagName)) {
      el.classList.toggle("collapsed-section", isCollapsed);
      el = el.nextElementSibling;
    }
  };

  // ── Rendered HTML with wiki links ─────────────────────────────────────────
  const noteTitles = new Set(notes.map((n) => (n.title || "Untitled").toLowerCase()));
  const processedContent = processWikiLinks(note.content || "", noteTitles);

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

  // Active mode chips shown top-right so users can see + dismiss what's on.
  const activeModes = [
    typewriterMode      && { id: "typewriter", label: "Typewriter", off: () => setTypewriterMode(false) },
    paragraphFocusMode  && { id: "focus",      label: "Focus",      off: () => setParagraphFocusMode(false) },
    scratchOpen         && { id: "scratch",    label: "Research",   off: () => setScratchOpen(false) },
    mdPreview           && { id: "mdpreview",  label: "MD Preview", off: () => onMdPreviewChange(false) },
    zenMode             && { id: "zen",        label: "Zen",        off: () => onZenChange(false) },
  ].filter(Boolean);

  // Compact chip used for the mode indicator
  const renderModeChip = (m) => (
    <button
      key={m.id}
      onClick={m.off}
      title={`${m.label} mode is on — click to turn off`}
      className="sp-mode-chip group flex items-center gap-1 px-2 py-0.5 rounded-full border border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 hover:text-amber-100 text-[9px] font-bold uppercase tracking-wider transition-colors shadow-lg backdrop-blur-sm"
    >
      <span>{m.label}</span>
      <X size={9} className="opacity-70 group-hover:opacity-100" />
    </button>
  );

  return (
    <div className={`relative flex flex-col flex-1 min-h-0 ${zenMode ? "zen-mode" : ""}`}>
      {/* Zen-mode floating chips (header is hidden, so overlay top-right of editor) */}
      {zenMode && activeModes.length > 0 && (
        <div className="absolute top-3 right-12 z-50 flex flex-wrap gap-1 justify-end">
          {activeModes.map(renderModeChip)}
        </div>
      )}

      {/* Transient toast (snapshot saved, etc.) */}
      {toast && (
        <div
          className={`absolute top-2 left-1/2 -translate-x-1/2 z-[60] px-3 py-1.5 rounded text-[10px] font-semibold tracking-wide shadow-2xl pointer-events-none
            ${toast.kind === "success" ? "sp-toast-success" : toast.kind === "error" ? "sp-toast-error" : "sp-toast-info"}`}>
          {toast.msg}
        </div>
      )}
      {/* Editor header (hidden in zen mode) */}
      {!zenMode && (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-700 shrink-0 surface-900">
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
                className={`p-1.5 rounded transition-colors ${typewriterMode ? "text-zinc-100 bg-zinc-950" : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700"}`}>
                <AlignCenter size={13} />
              </button>
            )}
            {vis("focusmode") && !viewMode && !mdPreview && (
              <button onClick={() => setParagraphFocusMode((s) => !s)} title="Paragraph focus"
                className={`p-1.5 rounded transition-colors ${paragraphFocusMode ? "text-zinc-100 bg-zinc-950" : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700"}`}>
                <Crosshair size={13} />
              </button>
            )}
            {vis("scratch") && !viewMode && !mdPreview && (
              <button onClick={() => setScratchOpen((s) => !s)} title="Research notes"
                className={`p-1.5 rounded transition-colors ${scratchOpen ? "text-amber-400 bg-amber-950" : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700"}`}>
                <BookMarked size={13} />
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
                className={`p-1.5 rounded transition-colors ${note.pinned ? "pinned-btn" : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700"}`}>
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
                className={`p-1.5 rounded transition-colors ${showSnapshots ? "text-zinc-100 bg-zinc-950" : "text-zinc-600 hover:text-zinc-300 hover:bg-zinc-700"}`}>
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
                  className={`p-1.5 rounded transition-colors ${showOverflow ? "text-zinc-100 bg-zinc-950" : "text-zinc-600 hover:text-zinc-300 hover:bg-zinc-700"}`}>
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
                        className={`w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-left transition-colors ${typewriterMode ? "text-zinc-100" : "text-zinc-300 hover:bg-zinc-800 hover:text-white"}`}>
                        <AlignCenter size={11} className="shrink-0" />Typewriter mode{typewriterMode && <span className="ml-auto text-[8px] text-zinc-600">ON</span>}
                      </button>
                    )}
                    {!vis("focusmode") && !viewMode && !mdPreview && (
                      <button onClick={() => { setParagraphFocusMode((s) => !s); setShowOverflow(false); }}
                        className={`w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-left transition-colors ${paragraphFocusMode ? "text-zinc-100" : "text-zinc-300 hover:bg-zinc-800 hover:text-white"}`}>
                        <Crosshair size={11} className="shrink-0" />Paragraph focus{paragraphFocusMode && <span className="ml-auto text-[8px] text-zinc-600">ON</span>}
                      </button>
                    )}
                    {!vis("scratch") && !viewMode && !mdPreview && (
                      <button onClick={() => { setScratchOpen((s) => !s); setShowOverflow(false); }}
                        className={`w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-left transition-colors ${scratchOpen ? "text-amber-400" : "text-zinc-300 hover:bg-zinc-800 hover:text-white"}`}>
                        <BookMarked size={11} className="shrink-0" />Research notes{scratchOpen && <span className="ml-auto text-[8px] text-zinc-600">ON</span>}
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
                        className={`w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-left transition-colors ${note.pinned ? "text-pinned" : "text-zinc-300 hover:bg-zinc-800 hover:text-white"}`}>
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
                        className={`w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-left transition-colors ${showSnapshots ? "text-zinc-100" : "text-zinc-300 hover:bg-zinc-800 hover:text-white"}`}>
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

            {/* Active mode chips — sit beside the SAVE button so the user sees what's on */}
            {!zenMode && activeModes.length > 0 && (
              <div className="flex items-center gap-1 mr-1">
                {activeModes.map(renderModeChip)}
              </div>
            )}

            {!viewMode && !mdPreview && (
              <div className="relative flex items-stretch" data-saveas>
                <button onClick={handleSaveClick} title={`Save (.${resolveAutoExt()})`} className="btn btn-primary rounded-r-none pr-2">SAVE</button>
                <button
                  onClick={() => setAskingFormat((s) => !s)}
                  title="Save As…"
                  className="btn btn-primary rounded-l-none border-l border-black/20 px-1.5 flex items-center"
                >
                  <ChevronDown size={11} />
                </button>
                {askingFormat && (
                  <div className="absolute top-full right-0 z-50 mt-1 min-w-[200px] bg-zinc-950 border border-zinc-700 rounded-lg shadow-2xl py-1">
                    <div className="px-3 py-1 text-[8px] font-bold uppercase tracking-widest text-zinc-600 border-b border-zinc-800">Save As</div>
                    <button onClick={() => { handleSave("md");  setAskingFormat(false); showToast("Saved as .md", "success"); }}
                      className="w-full flex items-center justify-between px-3 py-1.5 text-[11px] text-left text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors">
                      <span>Markdown</span><span className="font-mono text-[10px] text-zinc-600">.md</span>
                    </button>
                    <button onClick={() => { handleSave("txt"); setAskingFormat(false); showToast("Saved as .txt", "success"); }}
                      className="w-full flex items-center justify-between px-3 py-1.5 text-[11px] text-left text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors">
                      <span>Plain text</span><span className="font-mono text-[10px] text-zinc-600">.txt</span>
                    </button>
                    <button onClick={() => { setAskingFormat(false); handleSaveToPath("docx"); }}
                      className="w-full flex items-center justify-between px-3 py-1.5 text-[11px] text-left text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors">
                      <span>Word Document</span><span className="font-mono text-[10px] text-zinc-600">.docx</span>
                    </button>
                    <div className="border-t border-zinc-800 my-0.5" />
                    <button onClick={() => { setAskingFormat(false); handleSaveToPath(); }}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-left text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors">
                      <FolderOpen size={11} /><span>Save to disk…</span>
                    </button>
                  </div>
                )}
              </div>
            )}
            <button onClick={async () => { if (await tauriConfirm("Delete this note?", { title: "Delete note", kind: "warning" })) onDelete(); }}
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
            {[["manual", "Manual"], ["auto", "Auto ⚡"], ["timeline", "Timeline"]].map(([id, label]) => (
              <button key={id}
                onClick={() => { setSnapshotTab(id); if (id === "auto") loadAutoSnapshots(); if (id === "timeline") { loadSnapshots(); loadAutoSnapshots(); } }}
                className={`px-2.5 py-1.5 text-[9px] font-bold uppercase tracking-[0.12em] border-b-2 -mb-px transition-colors ${snapshotTab === id ? "border-zinc-400 text-zinc-100" : "border-transparent text-zinc-600 hover:text-zinc-400"
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
                    <button onClick={() => handleRestoreSnapshot(s.path)} className="text-[9px] text-zinc-100 hover:text-zinc-300 transition-colors">Restore</button>
                    <button onClick={() => handleDeleteSnapshot(s.path)} className="text-[9px] text-zinc-600 hover:text-red-400 transition-colors">Delete</button>
                  </div>
                ))
            ) : snapshotTab === "auto" ? (
              autoSnapshots.length === 0
                ? <p className="text-[10px] text-zinc-600 py-1">No auto-snapshots yet. Saves every minute while editing.</p>
                : autoSnapshots.map((s) => {
                  const starred = starredAutoSnaps.has(s.path);
                  return (
                    <div key={s.path} className="flex items-center gap-1.5 py-0.5">
                      <button onClick={() => starred ? unstarAutoSnapshot(s.path) : starAutoSnapshot(s.path)}
                        title={starred ? "Starred — kept after close" : "Star to keep after note closes"}
                        className={`transition-colors shrink-0 star-btn${starred ? " starred" : ""}`}>
                        <Star size={9} fill={starred ? "currentColor" : "none"} />
                      </button>
                      <span className="text-[10px] text-zinc-400 flex-1">{fmtTs(s.ts)}</span>
                      <button onClick={() => handleRestoreSnapshot(s.path)} className="text-[9px] text-zinc-100 hover:text-zinc-300 transition-colors">Restore</button>
                      <button onClick={() => handleDeleteAutoSnapshot(s.path)} className="text-[9px] text-zinc-600 hover:text-red-400 transition-colors">Delete</button>
                    </div>
                  );
                })
            ) : (
              /* ── Timeline tab ── */
              (() => {
                const all = [
                  ...snapshots.map(s => ({ ...s, kind: "manual" })),
                  ...autoSnapshots.map(s => ({ ...s, kind: "auto" })),
                ].sort((a, b) => a.ts - b.ts);
                if (!all.length) return <p className="text-[10px] text-zinc-600 py-1">No snapshots yet.</p>;
                return (
                  <TimelineView items={all} onRestore={handleRestoreSnapshot} starredAutoSnaps={starredAutoSnaps} onStar={starAutoSnapshot} onUnstar={unstarAutoSnapshot} />
                );
              })()
            )}
          </div>
        </div>
      )}

      {/* Toolbar */}
      {!viewMode && !mdPreview && !zenMode && <FormatToolbar editorRef={editorRef} />}

      {/* MD Preview */}
      {mdPreview && (
        <div className={`flex-1 flex min-h-0 relative${wellCls}`}>
          {frameDecor}
          <div className={`flex-1 overflow-y-auto px-4 py-3 signalpad-content md-preview bg-zinc-950${pageCls}`}
            onClick={handleContentClick}
            dangerouslySetInnerHTML={{ __html: processWikiLinks(marked.parse(mdText), noteTitles) }} />
        </div>
      )}

      {/* Pinned view */}
      {!mdPreview && viewMode && (
        <div className={`flex-1 flex min-h-0 relative${wellCls}`}>
          {frameDecor}
          <div className={`flex-1 overflow-y-auto px-4 py-3 signalpad-content bg-zinc-950${pageCls}`}
            onClick={handleContentClick}
            dangerouslySetInnerHTML={{ __html: processedContent || "<p class='empty'>This note is empty.</p>" }} />
        </div>
      )}

      {/* Scratch notes panel */}
      {!zenMode && !viewMode && !mdPreview && scratchOpen && (
        <div className="shrink-0 border-t border-zinc-700 bg-zinc-900/50 flex flex-col" style={{ maxHeight: 140 }}>
          <div className="flex items-center justify-between px-3 py-1 border-b border-zinc-800 shrink-0">
            <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-500 flex items-center gap-1.5">
              <BookMarked size={9} /> Research Notes
            </span>
            <button onClick={() => setScratchOpen(false)} className="text-zinc-700 hover:text-zinc-400 transition-colors p-0.5 rounded"><X size={9} /></button>
          </div>
          <textarea
            value={scratchContent}
            onChange={(e) => handleScratchChange(e.target.value)}
            placeholder="Quick notes, references, ideas…"
            className="flex-1 resize-none bg-transparent text-[11px] text-zinc-400 px-3 py-2 focus:outline-none placeholder:text-zinc-700 leading-relaxed"
          />
        </div>
      )}

      {/* Edit area */}
      {!viewMode && (
        <div ref={editorWrapperRef} className={`relative min-h-0 ${mdPreview ? "hidden" : "flex-1"}${wellCls}`}>
          <div className={`typewriter-overlay${typewriterMode ? " active" : ""}`} />
          <div ref={caretRef} className="smooth-caret" />
          {frameDecor}
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            spellCheck={spellcheck}
            lang={spellcheckLang}
            onClick={handleEditorClick}
            onInput={() => {
              // Chromium leaves a lone <br> after deleting all text, which defeats
              // the :empty placeholder — clear it so "Start writing…" returns.
              const el = editorRef.current;
              if (el && ["<br>", "<div><br></div>", "<p><br></p>"].includes(el.innerHTML)) el.innerHTML = "";
              dirty.current = true;
              updateWordCount();
              if (autoSaveDelay > 0) {
                clearTimeout(autoSaveTimer.current);
                autoSaveTimer.current = setTimeout(() => { if (dirty.current) handleSave(resolveAutoExt()); }, autoSaveDelay);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "s" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); handleSaveClick(); return; }
              if (e.key === "Enter" && !e.shiftKey) handleChecklistEnter(e);
            }}
            onContextMenu={handleEditorContextMenu}
            className={`absolute inset-0 overflow-y-auto px-4 py-3 focus:outline-none leading-relaxed signalpad-content bg-zinc-950 caret-transparent${pageCls}${mdPreview ? " invisible" : ""}${paragraphFocusMode ? " paragraph-focus-mode" : ""}${typewriterMode ? " typewriter-active" : ""}`}
            data-placeholder="Start writing…"
          />
        </div>
      )}
    </div>
  );
}

// ─── Window controls ──────────────────────────────────────────────────────────

function WindowControls({ showMaximize = false }) {
  const win = getCurrentWindow();
  return (
    <div className="flex items-center gap-1">
      <button onClick={() => win.minimize()} title="Minimize"
        className="w-7 h-7 flex items-center justify-center rounded text-zinc-600 hover:text-zinc-300 hover:bg-zinc-700 transition-colors">
        <Minus size={13} strokeWidth={2} />
      </button>
      {showMaximize && (
        <button onClick={() => win.toggleMaximize()} title="Maximize"
          className="w-7 h-7 flex items-center justify-center rounded text-zinc-600 hover:text-zinc-300 hover:bg-zinc-700 transition-colors">
          <Square size={11} strokeWidth={2} />
        </button>
      )}
      <button onClick={() => win.close()} title="Close"
        className="close-btn w-7 h-7 flex items-center justify-center rounded hover:bg-red-500/95">
        <X size={13} strokeWidth={3} />
      </button>
    </div>
  );
}

// ─── Desktop-mode sidebar ─────────────────────────────────────────────────────

function DesktopSidebar({ pinned, unpinned, activeTabId, onOpen, onContextMenu, onNew }) {
  const renderRow = (n) => (
    <button
      key={n.id}
      onClick={() => onOpen(n.id)}
      onContextMenu={(e) => onContextMenu(e, n)}
      className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors border-l-2 ${
        n.id === activeTabId
          ? "border-l-[var(--accent)] bg-zinc-900 text-zinc-100"
          : "border-l-transparent text-zinc-400 hover:bg-zinc-900/60 hover:text-zinc-200"
      }`}
    >
      {n.emoji && <span className="text-[12px] leading-none shrink-0">{n.emoji}</span>}
      <span className="flex-1 min-w-0">
        <span className="block text-[11.5px] font-medium truncate">{n.title || "Untitled"}</span>
        <span className="block text-[9px] text-zinc-600 truncate">{fmtDate(n.updatedAt)}</span>
      </span>
      {n.burn && <Flame size={10} className="text-orange-400/70 shrink-0" />}
      {n.pinned && <Pin size={10} className="pinned-section shrink-0" />}
    </button>
  );

  return (
    <aside className="w-[232px] shrink-0 flex flex-col border-r border-zinc-800 bg-zinc-950">
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800 shrink-0">
        <span className="section-label">All Notes</span>
        <button onClick={onNew} title="New note"
          className="p-1 rounded text-zinc-600 hover:text-zinc-200 hover:bg-zinc-800 transition-colors">
          <Plus size={12} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {pinned.map(renderRow)}
        {pinned.length > 0 && unpinned.length > 0 && <div className="border-t border-zinc-800/80 my-1 mx-3" />}
        {unpinned.map(renderRow)}
        {pinned.length === 0 && unpinned.length === 0 && (
          <p className="px-3 py-4 text-[10px] text-zinc-600">No notes yet.</p>
        )}
      </div>
    </aside>
  );
}

// ─── Settings view ────────────────────────────────────────────────────────────

function SettingsView({ onClose }) {
  const { notes, addedFonts, addFont, removeFont, clearNotes, saveFormat, setSaveFormat, toolbarVisible, setToolbarVisible, theme, setTheme, appPasscode, setAppPasscode, cloudBackupPath, setCloudBackupPath, runCloudBackup, cardScenesEnabled, setCardScenesEnabled, cardDensity, setCardDensity, accentColor, setAccentColor, autoLockMinutes, setAutoLockMinutes, autoBackupSchedule, setAutoBackupSchedule, noteCap, setNoteCap, defaultTemplate, setDefaultTemplate, spellcheck, setSpellcheck, spellcheckLang, setSpellcheckLang, autoSaveDelay, setAutoSaveDelay, pageStyle, setPageStyle, pageScheme, setPageScheme, pageWidth, setPageWidth } = useSignalPadStore();
  const [tab, setTab] = useState("appearance");
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

  const TABS = [
    { id: "appearance", label: "Appearance", icon: <Palette size={11} /> },
    { id: "writing", label: "Writing", icon: <FileText size={11} /> },
    { id: "security", label: "Security", icon: <Lock size={11} /> },
    { id: "storage", label: "Storage", icon: <Download size={11} /> },
  ];

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-800 shrink-0">
        <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 transition-colors p-0.5 rounded"><ChevronLeft size={15} /></button>
        <span className="text-[13px] glass-text">Settings</span>
      </div>

      {/* Tab bar */}
      <div className="flex shrink-0 border-b border-zinc-800 bg-zinc-950 px-2 pt-2 gap-0.5">
        {TABS.map(({ id, label, icon }) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-t text-[10px] font-semibold tracking-wide transition-colors
              ${tab === id
                ? "bg-zinc-950 border border-b-zinc-950 border-zinc-800 text-zinc-100 -mb-px pb-[7px]"
                : "text-zinc-600 hover:text-zinc-400"}`}>
            {icon}{label}
          </button>
        ))}
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

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6 bg-zinc-950">

        {/* ── APPEARANCE ── */}
        {tab === "appearance" && (<>
          <section>
            <p className="section-label mb-3">Theme</p>
            <div className="flex gap-2">
              {[
                { value: "dark", label: "Dark", preview: "bg-zinc-900 border-zinc-700" },
                { value: "light", label: "Light", preview: "bg-[#f5f1ec] border-[#d6d0c8]" },
                { value: "red", label: "Signal", preview: "bg-[#962f2f] border-[#c86060]" },
              ].map(({ value, label, preview }) => (
                <button key={value} onClick={() => setTheme(value)}
                  className={`flex-1 py-2 rounded-lg border text-[11px] font-bold transition-colors ${theme === value ? "border-[var(--accent)] text-[var(--accent)] bg-[var(--accent-bg)]" : "border-zinc-700 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600"}`}>
                  <div className={`w-6 h-4 rounded mx-auto mb-1 border ${preview}`} />
                  {label}
                </button>
              ))}
            </div>
          </section>

          <section>
            <p className="section-label mb-1">Big View Page</p>
            <p className="text-[10px] text-zinc-600 mb-3">Style of the writing surface in desktop mode.</p>
            <div className="grid grid-cols-2 gap-1.5 mb-3">
              {[
                ["sheet", "Floating Sheet", "Lifted on soft shadows"],
                ["carved", "Carved Well", "Recessed into the chrome"],
                ["stack", "Paper Stack", "Sheets peek out behind"],
                ["frame", "Drafting Frame", "Blueprint grid + corners"],
              ].map(([v, l, d]) => (
                <button key={v} onClick={() => setPageStyle(v)}
                  className={`py-2 px-3 rounded-lg border text-left transition-colors ${pageStyle === v ? "border-[var(--accent)] bg-[var(--accent-bg)]" : "border-zinc-700 bg-zinc-900 hover:border-zinc-600"}`}>
                  <p className={`text-[11px] font-bold ${pageStyle === v ? "text-[var(--accent)]" : "text-zinc-300"}`}>{l}</p>
                  <p className="text-[9px] text-zinc-600 mt-0.5">{d}</p>
                </button>
              ))}
            </div>
            <p className="text-[10px] text-zinc-500 mb-2">Page color</p>
            <div className="flex gap-1.5 mb-3">
              {[["theme", "Match theme"], ["light", "Light"], ["dark", "Dark"]].map(([v, l]) => (
                <button key={v} onClick={() => setPageScheme(v)}
                  className={`flex-1 py-1.5 rounded border text-[10px] transition-colors ${pageScheme === v ? "border-zinc-700 bg-zinc-950 text-zinc-300" : "border-zinc-700 bg-zinc-900 text-zinc-500 hover:text-zinc-200 hover:border-zinc-600"}`}>
                  {l}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-zinc-500 mb-2">Page width</p>
            <div className="flex gap-1.5">
              {[["narrow", "Narrow"], ["standard", "Standard"], ["wide", "Wide"]].map(([v, l]) => (
                <button key={v} onClick={() => setPageWidth(v)}
                  className={`flex-1 py-1.5 rounded border text-[10px] transition-colors ${pageWidth === v ? "border-zinc-700 bg-zinc-950 text-zinc-300" : "border-zinc-700 bg-zinc-900 text-zinc-500 hover:text-zinc-200 hover:border-zinc-600"}`}>
                  {l}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-zinc-700 mt-2">
              {pageWidth === "narrow" ? "Focused column — best for prose." : pageWidth === "wide" ? "Roomy column — best for tables and lists." : "Standard document width."}
            </p>
          </section>

          <section>
            <p className="section-label mb-1">Editor Toolbar</p>
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
                      ${on ? "border-zinc-800 bg-zinc-500/10 text-zinc-300" : "border-zinc-700 bg-zinc-900 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600"}`}>
                    <span>{label}</span>
                    <span className={`text-[8px] font-bold tracking-widest uppercase ${on ? "text-zinc-500" : "text-zinc-700"}`}>{on ? "Visible" : "Hidden"}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <section>
            <p className="section-label mb-3">Fonts</p>
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
                <div className="overflow-y-auto max-h-[160px] grid grid-cols-2 p-1.5 gap-0.5">
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
              <button onClick={() => setShowBrowser(true)} className="flex items-center gap-1.5 text-[11px] text-zinc-400 hover:text-zinc-100 transition-colors">
                <Plus size={11} /> Browse Google Fonts
              </button>
            )}
          </section>

          <section>
            <p className="section-label mb-3">Card Layout</p>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-zinc-300">Show pixel art panels</span>
                <button onClick={() => setCardScenesEnabled(!cardScenesEnabled)}
                  className={`w-9 h-5 rounded-full transition-colors relative ${cardScenesEnabled ? "sp-toggle-on" : "bg-zinc-700"}`}>
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${cardScenesEnabled ? "left-[18px]" : "left-0.5"}`} />
                </button>
              </div>
              <div>
                <p className="text-[10px] text-zinc-500 mb-2">Card density</p>
                <div className="flex gap-1.5">
                  {[["compact", "Compact"], ["default", "Default"], ["spacious", "Spacious"]].map(([v, l]) => (
                    <button key={v} onClick={() => setCardDensity(v)}
                      className={`flex-1 py-1.5 rounded border text-[10px] transition-colors ${cardDensity === v ? "border-zinc-700 bg-zinc-950 text-zinc-300" : "border-zinc-700 bg-zinc-900 text-zinc-500 hover:text-zinc-200 hover:border-zinc-600"}`}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section>
            <p className="section-label mb-2">Accent Color</p>
            <div className="flex items-center gap-3">
              <input type="color" value={accentColor || "#f75454"}
                onChange={e => setAccentColor(e.target.value)}
                className="w-8 h-8 rounded border border-zinc-700 bg-zinc-900 cursor-pointer p-0.5" />
              <span className="text-[11px] text-zinc-400 font-mono flex-1">{accentColor || "theme default"}</span>
              {accentColor && (
                <button onClick={() => setAccentColor(null)}
                  className="text-[10px] text-zinc-600 hover:text-zinc-300 transition-colors">Reset</button>
              )}
            </div>
          </section>
        </>)}

        {/* ── WRITING ── */}
        {tab === "writing" && (<>
          <section>
            <p className="section-label mb-1">Spellcheck</p>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] text-zinc-300">Enable spellcheck</span>
              <button onClick={() => setSpellcheck(!spellcheck)}
                className={`w-9 h-5 rounded-full transition-colors relative ${spellcheck ? "sp-toggle-on" : "bg-zinc-700"}`}>
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${spellcheck ? "left-[18px]" : "left-0.5"}`} />
              </button>
            </div>
            {spellcheck && (
              <>
                <div className="flex gap-1.5 flex-wrap">
                  {[["en-US", "English (US)"], ["en-GB", "English (UK)"]].map(([v, l]) => (
                    <button key={v} onClick={() => setSpellcheckLang(v)}
                      className={`px-2.5 py-1 rounded border text-[10px] transition-colors ${spellcheckLang === v ? "border-zinc-700 bg-zinc-950 text-zinc-300" : "border-zinc-700 bg-zinc-900 text-zinc-500 hover:text-zinc-200"}`}>
                      {l}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-zinc-700 mt-2">Suggestions use an English dictionary. More languages later.</p>
              </>
            )}
          </section>

          <section>
            <p className="section-label mb-2">Auto-save</p>
            <div className="flex gap-1.5">
              {[[0, "Manual"], [500, "0.5s"], [1000, "1s"], [2000, "2s"]].map(([v, l]) => (
                <button key={v} onClick={() => setAutoSaveDelay(v)}
                  className={`flex-1 py-1.5 rounded border text-[10px] transition-colors ${autoSaveDelay === v ? "border-zinc-700 bg-zinc-950 text-zinc-300" : "border-zinc-700 bg-zinc-900 text-zinc-500 hover:text-zinc-200 hover:border-zinc-600"}`}>
                  {l}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-zinc-700 mt-2">
              {autoSaveDelay === 0 ? "Notes only save on Ctrl+S or when leaving the editor." : `Notes auto-save ${autoSaveDelay / 1000}s after you stop typing.`}
            </p>
          </section>

          <section>
            <p className="section-label mb-1">Default Note Template</p>
            <p className="text-[10px] text-zinc-600 mb-2">Text shown in every new note. Each line becomes a paragraph.</p>
            <textarea
              value={defaultTemplate}
              onChange={e => setDefaultTemplate(e.target.value)}
              placeholder={"e.g.\nDate: \nContext:\n\n"}
              rows={5}
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-2.5 py-2 text-[11px] text-zinc-200 font-mono resize-none focus:outline-none focus:border-zinc-500 placeholder:text-zinc-600"
            />
            {defaultTemplate && (
              <button onClick={() => setDefaultTemplate("")}
                className="text-[10px] text-zinc-600 hover:text-red-400 transition-colors mt-1">Clear template</button>
            )}
          </section>
        </>)}

        {/* ── SECURITY ── */}
        {tab === "security" && (<>
          <section>
            <p className="section-label mb-3">App Lock</p>
            {appPasscode ? (
              <div className="flex items-center gap-2 px-3 py-2.5 rounded border border-zinc-700 bg-zinc-900">
                <Lock size={12} className="text-zinc-100 shrink-0" />
                <span className="text-[11px] text-zinc-300 flex-1">App is PIN-locked on startup</span>
                <button onClick={() => setAppPasscode(null)}
                  className="px-2.5 py-1 rounded border border-red-900 bg-red-950 text-red-400 text-[10px] hover:bg-red-900 transition-colors shrink-0">
                  Remove
                </button>
              </div>
            ) : (
              <button onClick={() => setShowSetAppPasscode(true)}
                className="w-full flex items-center gap-2 px-3 py-2.5 rounded border border-zinc-700 bg-zinc-900 text-[11px] text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors">
                <Lock size={12} /> Set app passcode
              </button>
            )}
            <p className="text-[10px] text-zinc-700 mt-2">Locks the entire app on launch. Per-note locks are available via the note context menu. Locks deter casual access — note files on disk remain unencrypted.</p>
          </section>

          <section>
            <p className="section-label mb-2">Auto-lock After Inactivity</p>
            <div className="flex gap-1.5">
              {[[0, "Off"], [5, "5m"], [15, "15m"], [30, "30m"], [60, "1h"]].map(([v, l]) => (
                <button key={v} onClick={() => setAutoLockMinutes(v)}
                  className={`flex-1 py-1.5 rounded border text-[10px] transition-colors ${autoLockMinutes === v ? "border-zinc-700 bg-zinc-950 text-zinc-300" : "border-zinc-700 bg-zinc-900 text-zinc-500 hover:text-zinc-200 hover:border-zinc-600"}`}>
                  {l}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-zinc-700 mt-2">{autoLockMinutes === 0 ? "App will not auto-lock." : `App locks after ${autoLockMinutes} minute${autoLockMinutes > 1 ? "s" : ""} of inactivity.`}</p>
          </section>
        </>)}

        {/* ── STORAGE ── */}
        {tab === "storage" && (<>
          <section>
            <p className="section-label mb-2">Note Cap</p>
            <div className="flex gap-1.5">
              {[[5, "5"], [10, "10"], [15, "15"], [20, "20"], [0, "∞"]].map(([v, l]) => (
                <button key={v} onClick={() => setNoteCap(v)}
                  className={`flex-1 py-1.5 rounded border text-[10px] transition-colors ${noteCap === v ? "border-zinc-700 bg-zinc-950 text-zinc-300" : "border-zinc-700 bg-zinc-900 text-zinc-500 hover:text-zinc-200 hover:border-zinc-600"}`}>
                  {l}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-zinc-700 mt-2">{noteCap === 0 ? "No limit on number of notes." : `Maximum ${noteCap} notes. New notes are blocked when full.`}</p>
          </section>

          <section>
            <p className="section-label mb-2">Auto-backup Schedule</p>
            <div className="flex gap-1.5">
              {[["manual", "Manual"], ["onclose", "On close"], ["hourly", "Hourly"], ["daily", "Daily"]].map(([v, l]) => (
                <button key={v} onClick={() => setAutoBackupSchedule(v)}
                  className={`flex-1 py-1.5 rounded border text-[10px] transition-colors ${autoBackupSchedule === v ? "border-zinc-700 bg-zinc-950 text-zinc-300" : "border-zinc-700 bg-zinc-900 text-zinc-500 hover:text-zinc-200 hover:border-zinc-600"}`}>
                  {l}
                </button>
              ))}
            </div>
            {!cloudBackupPath && <p className="text-[10px] text-orange-500/70 mt-2">Set a backup path above to enable auto-backup.</p>}
          </section>

          <section>
            <p className="section-label mb-2">Default Save Format</p>
            <div className="flex gap-1.5 mb-2">
              {[{ value: "md", label: ".md", desc: "Markdown" }, { value: "txt", label: ".txt", desc: "Plain text" }, { value: "ask", label: "Ask", desc: "Prompt each time" }].map(({ value, label, desc }) => (
                <button key={value} onClick={() => setSaveFormat(value)}
                  className={`flex-1 py-2 rounded border text-center transition-colors ${saveFormat === value ? "border-zinc-700 bg-zinc-950 text-zinc-300" : "border-zinc-700 bg-zinc-900 text-zinc-500 hover:text-zinc-200 hover:border-zinc-600"}`}>
                  <p className="text-[11px] font-mono font-bold">{label}</p>
                  <p className="text-[9px] mt-0.5 opacity-60">{desc}</p>
                </button>
              ))}
            </div>
          </section>

          <section>
            <p className="section-label mb-1">Cloud Backup</p>
            <p className="text-[10px] text-zinc-600 mb-3">Path to your Dropbox or OneDrive folder. Notes are copied there on backup.</p>
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
                  className="px-3 py-1.5 rounded border border-zinc-800 bg-zinc-950 text-zinc-300 text-[11px] hover:bg-zinc-900 transition-colors shrink-0">
                  Backup Now
                </button>
              </div>
            )}
            {backupStatus && <p className="text-[10px] text-zinc-100 mt-1">{backupStatus}</p>}
          </section>

          <section>
            <p className="section-label mb-3">Data</p>
            <div className="space-y-2">
              <button onClick={handleExport} disabled={notes.length === 0}
                className="w-full flex items-center gap-2 px-3 py-2 rounded border border-zinc-700 bg-zinc-900 text-[11px] text-zinc-300 hover:text-white hover:bg-zinc-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                <Download size={11} /> Export all notes as JSON
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

          <section>
            <div className="px-3 py-3 rounded border border-zinc-800 bg-zinc-900/30">
              <div className="flex items-center gap-2 mb-1">
                <NotebookPen size={12} className="app-name" />
                <span className="text-[11px] font-bold tracking-wider app-name">SignalPad</span>
              </div>
              <p className="text-[10px] text-zinc-600">Version {changelog.history[0]?.version ?? "0.1.0"} · A minimal, focused note-taking app.</p>
            </div>
          </section>
        </>)}

      </div>

      {/* ── Permanent activity footer ── */}
      <div className="shrink-0 border-t border-zinc-800 bg-zinc-950 px-4 py-3">
        <p className="section-label mb-2">Writing Activity</p>
        <ActivityHeatmap notes={notes} />
      </div>
    </div>
  );
}

// ─── Help view ───────────────────────────────────────────────────────────────

const SHORTCUTS = [
  { keys: "Ctrl+S", desc: "Save note" },
  { keys: "Ctrl+Shift+N", desc: "Quick capture from anywhere (global)" },
  { keys: "Ctrl+K", desc: "Open command palette" },
  { keys: "Esc", desc: "Close palette / exit zen mode" },
];

const FEATURE_SECTIONS = [
  {
    heading: "Writing",
    items: [
      { icon: "✦", label: "Note emoji", desc: "Tap the smiley in the editor header to give a note an emoji icon." },
      { icon: "●", label: "Note colour tint", desc: "Tap the colour circle to tint the note card and editor with a hue." },
      { icon: "🔥", label: "Burn after reading", desc: "The flame toggle marks a note to self-delete the moment you close it." },
      { icon: "📷", label: "Snapshots", desc: "Camera icon saves a timestamped copy of the content. History icon browses and restores past snapshots." },
      { icon: "⊞", label: "Copy as Markdown", desc: "Copy button converts the note's rich-text content to clean Markdown and puts it on the clipboard." },
    ],
  },
  {
    heading: "Views",
    items: [
      { icon: "MD", label: "Markdown preview", desc: "Renders your note's plain text as Markdown — headings, code blocks, tables, blockquotes." },
      { icon: "⊡", label: "Zen mode", desc: "Maximize icon strips all chrome away. Only the text remains. Press Esc or the corner button to exit." },
      { icon: "≡", label: "Typewriter mode", desc: "Align-center icon keeps the active line vertically centred and fades surrounding text." },
    ],
  },
  {
    heading: "Organisation",
    items: [
      { icon: "#", label: "Hashtag collections", desc: "Type #tagname anywhere in a note. A filter bar appears above the list so you can browse by tag." },
      { icon: "⟦⟧", label: "Wiki links", desc: "Type [[Note title]] to create a clickable link that jumps to another note." },
      { icon: "⠿", label: "Drag to reorder", desc: "Grab the grip handle on any unpinned note card to drag it into a custom order." },
      { icon: "📌", label: "Pin notes", desc: "Pinned notes are read-only by default and always shown at the top of the list." },
    ],
  },
  {
    heading: "Tools",
    items: [
      { icon: "⌘K", label: "Command palette", desc: "Search notes by title, create, pin, or delete — all from the keyboard." },
      { icon: "♪", label: "Ambient sound", desc: "Speaker icon in the title bar: Rain, Brown Noise, White Noise, Focus Hum, or Deep Space." },
      { icon: "⊞", label: "Activity heatmap", desc: "Settings → Writing Activity shows a GitHub-style grid of your daily edit history." },
      { icon: "↑", label: "Import", desc: "Import any .md or .txt file from disk. SignalPad frontmatter is preserved; plain text is wrapped into a new note." },
      { icon: "↓", label: "Export", desc: "Settings → Data → Export all notes as a single JSON file." },
      { icon: "📂", label: "Save to…", desc: "In Ask save-format mode, the folder icon opens a native Save As dialog so you can choose any location." },
    ],
  },
  {
    heading: "Fonts & Format",
    items: [
      { icon: "Aa", label: "Google Fonts", desc: "Toolbar → T dropdown → Browse Google Fonts to add any of 44 typefaces and apply them per-selection." },
      { icon: ".md", label: "Save format", desc: "Settings → Save Format: .md (Markdown), .txt (plain text), or Ask (prompts on each explicit save)." },
    ],
  },
];

function HelpView({ onClose, onShowChangelog }) {
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
            <span className="section-label">Quick Start</span>
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
                <span className="shrink-0 w-4 h-4 rounded-full bg-zinc-950 border border-zinc-800 text-zinc-100 text-[8px] font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
                <span className="text-[11px] text-zinc-400 leading-relaxed">{step}</span>
              </li>
            ))}
          </ol>
        </section>

        {/* ── Keyboard shortcuts ── */}
        <section>
          <div className="flex items-center gap-1.5 mb-3">
            <span className="section-label">Keyboard Shortcuts</span>
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
              <span className="section-label">{heading}</span>
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
          <button
            onClick={onShowChangelog}
            className="w-full px-3 py-3 rounded border border-zinc-800 bg-zinc-900/30 flex items-center gap-2 hover:border-zinc-700 hover:bg-zinc-800/40 transition-colors text-left"
          >
            <NotebookPen size={13} className="app-name shrink-0" />
            <div>
              <span className="text-[12px] font-bold tracking-wider app-name">SignalPad</span>
              <span className="text-[10px] text-zinc-600 ml-2">v{changelog.history[0]?.version ?? "0.1.0"}</span>
            </div>
            <span className="ml-auto text-[9px] text-zinc-700 hover:text-zinc-500 transition-colors">Patch notes</span>
          </button>
        </section>

      </div>
    </div>
  );
}

// ─── Main SignalPad ───────────────────────────────────────────────────────────

export default function SignalPad() {
  const { notes, addNote, updateNote, deleteNote, togglePin, init, loading, importNote, importDocxNote, noteOrder, appPasscode, noteScenes, setNoteScene, accentColor, autoLockMinutes, autoBackupSchedule, cloudBackupPath, runCloudBackup, noteCap, cardScenesEnabled, cardDensity, desktopMode, setDesktopMode } = useSignalPadStore();

  const [openTabs, setOpenTabs] = useState([]);
  const [activeTabId, setActiveTabId] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [mdPreview, setMdPreview] = useState(false);
  const [zenMode, setZenMode] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  const [showChangelog, setShowChangelog] = useState(false);
  const [activeTag, setActiveTag] = useState(null);
  const [dragId, setDragId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [appUnlocked, setAppUnlocked] = useState(!appPasscode);

  const openSettings = () => { setShowSettings(true); setShowHelp(false); };
  const openHelp = () => { setShowHelp(true); setShowSettings(false); };
  const closePanel = () => { setShowSettings(false); setShowHelp(false); };

  const [capWarning, setCapWarning] = useState(false);
  const [editorWordCount, setEditorWordCount] = useState(0);

  const openTab = useCallback((id) => {
    setOpenTabs((prev) => prev.includes(id) ? prev : [...prev, id]);
    setActiveTabId(id);
  }, []);

  const closeTab = useCallback((id) => {
    setOpenTabs((prev) => {
      const next = prev.filter((t) => t !== id);
      setActiveTabId((cur) => {
        if (cur !== id) return cur;
        const idx = prev.indexOf(id);
        return next[idx] ?? next[idx - 1] ?? null;
      });
      return next;
    });
    setEditorWordCount(0);
    // Burn-after-reading fires however the note is closed — tab ✕ included,
    // not just the editor's back button.
    const { notes: cur, deleteNote: del } = useSignalPadStore.getState();
    if (cur.find((n) => n.id === id)?.burn) del(id);
  }, []);

  useEffect(() => { init(); }, []);
  useEffect(() => { setMdPreview(false); setZenMode(false); }, [activeTabId]);

  // ── Accent color ─────────────────────────────────────────────────────────
  useEffect(() => {
    const root = document.documentElement;
    if (accentColor) {
      root.style.setProperty("--accent", accentColor);
      const r = parseInt(accentColor.slice(1, 3), 16), g = parseInt(accentColor.slice(3, 5), 16), b = parseInt(accentColor.slice(5, 7), 16);
      root.style.setProperty("--accent-bg", `rgba(${r},${g},${b},0.12)`);
    } else {
      root.style.removeProperty("--accent");
      root.style.removeProperty("--accent-bg");
    }
  }, [accentColor]);

  // ── Auto-lock on inactivity ──────────────────────────────────────────────
  useEffect(() => {
    if (!appPasscode || !autoLockMinutes || !appUnlocked) return;
    let timer;
    const reset = () => { clearTimeout(timer); timer = setTimeout(() => setAppUnlocked(false), autoLockMinutes * 60_000); };
    const events = ["mousemove", "keydown", "mousedown", "touchstart"];
    events.forEach(ev => document.addEventListener(ev, reset));
    reset();
    return () => { clearTimeout(timer); events.forEach(ev => document.removeEventListener(ev, reset)); };
  }, [appPasscode, autoLockMinutes, appUnlocked]);

  // ── Auto-backup schedule ─────────────────────────────────────────────────
  useEffect(() => {
    if (!cloudBackupPath || autoBackupSchedule === "manual") return;
    if (autoBackupSchedule === "onclose") {
      const win = getCurrentWindow();
      let unlisten;
      win.onCloseRequested(async (ev) => { ev.preventDefault(); await runCloudBackup(); win.destroy(); }).then(u => { unlisten = u; });
      return () => { unlisten?.(); };
    }
    const ms = autoBackupSchedule === "hourly" ? 3_600_000 : 86_400_000;
    const id = setInterval(() => runCloudBackup(), ms);
    return () => clearInterval(id);
  }, [cloudBackupPath, autoBackupSchedule]);

  // ── Resize window between layouts: list, editor, desktop (Big View) ───────
  // Only act on layout boundaries — re-running on every tab-count change would
  // stomp a manually resized window.
  const prevLayoutRef = useRef(null);
  useEffect(() => {
    const inEditor = openTabs.length > 0;
    const layout = desktopMode ? "desktop" : inEditor ? "editor" : "list";
    if (prevLayoutRef.current === layout) return;
    const wasDesktop = prevLayoutRef.current === "desktop";
    prevLayoutRef.current = layout;
    const win = getCurrentWindow();
    if (layout === "desktop") {
      win.setResizable(true).catch(() => { });
      win.setMaxSize(null).catch(() => { });
      win.setMinSize(new LogicalSize(880, 600)).catch(() => { });
      win.setSize(new LogicalSize(1180, 760)).catch(() => { });
    } else if (layout === "editor") {
      if (wasDesktop) win.unmaximize().catch(() => { });
      win.setResizable(true).catch(() => { });
      win.setMaxSize(null).catch(() => { });
      win.setMinSize(new LogicalSize(560, 580)).catch(() => { });
      win.setSize(new LogicalSize(680, 720)).catch(() => { });
    } else {
      if (wasDesktop) win.unmaximize().catch(() => { });
      win.setMaxSize(new LogicalSize(560, 660)).catch(() => { });
      win.setMinSize(new LogicalSize(560, 660)).catch(() => { });
      win.setSize(new LogicalSize(560, 660)).catch(() => { });
      win.setResizable(false).catch(() => { });
    }
  }, [openTabs.length, desktopMode]);

  // ── Suppress default browser context menu globally ────────────────────────
  useEffect(() => {
    const handler = (e) => e.preventDefault();
    document.addEventListener("contextmenu", handler);
    return () => document.removeEventListener("contextmenu", handler);
  }, []);

  // ── Global hotkey (Ctrl+Shift+N) ─────────────────────────────────────────
  useEffect(() => {
    registerShortcut("CommandOrControl+Shift+N", async (event) => {
      // Plugin fires on both key-down and key-up — only act on the press
      if (event?.state === "Released") return;
      await invoke("focus_main_window").catch(() => { });
      const id = await addNote();
      if (id) openTab(id);
    }).catch(() => { });
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

  const activeNote = notes.find((n) => n.id === activeTabId);
  const pinned = notes.filter((n) => n.pinned);

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

  // ── Drag-to-reorder (pointer-event based) ────────────────────────────────
  const pointerDrag = useRef({ active: false, id: null, overId: null });

  const handleGripPointerDown = useCallback((_e, noteId) => {
    pointerDrag.current = { active: true, id: noteId, overId: null };
    setDragId(noteId);

    const onMove = (mv) => {
      if (!pointerDrag.current.active) return;
      const els = document.elementsFromPoint(mv.clientX, mv.clientY);
      const cardEl = els.find(el => el.dataset?.noteId && el.dataset.noteId !== noteId);
      const overId = cardEl?.dataset.noteId ?? null;
      if (overId !== pointerDrag.current.overId) {
        pointerDrag.current.overId = overId;
        setDragOverId(overId);
      }
    };

    const onUp = () => {
      const { id, overId } = pointerDrag.current;
      if (id && overId && id !== overId) {
        const { notes: cur, noteOrder: ord, reorderNotes: reorder } = useSignalPadStore.getState();
        const unpinnedIds = [...cur.filter(n => !n.pinned)]
          .sort((a, b) => { const ai = ord.indexOf(a.id), bi = ord.indexOf(b.id); return (ai >= 0 && bi >= 0) ? ai - bi : ai >= 0 ? -1 : bi >= 0 ? 1 : 0; })
          .map(n => n.id);
        const from = unpinnedIds.indexOf(id);
        const to = unpinnedIds.indexOf(overId);
        if (from >= 0 && to >= 0) {
          unpinnedIds.splice(from, 1);
          unpinnedIds.splice(to, 0, id);
          reorder(unpinnedIds);
        }
      }
      pointerDrag.current = { active: false, id: null, overId: null };
      setDragId(null);
      setDragOverId(null);
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }, []);

  // ── Wiki navigate ─────────────────────────────────────────────────────────
  const handleWikiNavigate = (title) => {
    const target = notes.find((n) => (n.title || "Untitled").toLowerCase() === title.toLowerCase());
    if (target) openTab(target.id);
  };

  // ── Context menu builders ─────────────────────────────────────────────────
  const buildCardMenu = (e, n) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      x: e.clientX, y: e.clientY,
      items: [
        { icon: <BookOpen size={11} />, label: "Open", action: () => openTab(n.id) },
        { separator: true },
        { icon: n.pinned ? <PinOff size={11} /> : <Pin size={11} />, label: n.pinned ? "Unpin" : "Pin", action: () => togglePin(n.id) },
        { icon: <FolderOpen size={13} />, label: "Reveal in Folder", action: () => invoke("reveal_note", { noteId: n.id, fileExt: n.fileExt || "md" }) },
        { separator: true },
        { icon: <Trash2 size={11} />, label: "Delete", danger: true, action: async () => { if (await tauriConfirm(`Delete "${n.title || "Untitled"}"?`, { title: "Delete note", kind: "warning" })) deleteNote(n.id); } },
      ],
    });
  };

  const buildListMenu = (e) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX, y: e.clientY,
      items: [
        { icon: <Plus size={11} />, label: "New Note", shortcut: "Ctrl+Shift+N", action: handleNew },
        { icon: <Upload size={11} />, label: "Import", action: handleImport },
        { separator: true },
        { icon: <FolderOpen size={13} />, label: "Open Notes Folder", action: () => invoke("get_notes_dir").then((dir) => invoke("open_folder", { path: dir })) },
        { icon: <Settings size={11} />, label: "Settings", action: openSettings },
      ],
    });
  };

  const handleNew = async () => {
    if (noteCap > 0 && notes.length >= noteCap) {
      setCapWarning(true);
      setTimeout(() => setCapWarning(false), 3000);
      return;
    }
    const id = await addNote();
    if (id) openTab(id);
  };
  const handleImport = async () => {
    const path = await openDialog({ multiple: false, filters: [{ name: "Documents", extensions: ["md", "txt", "docx"] }] });
    if (!path) return;
    let id;
    if (path.toLowerCase().endsWith(".docx")) {
      id = await importDocxNote(path);
    } else {
      id = await importNote(path);
    }
    if (id) openTab(id);
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

  // Shared body chunks — used by both the compact layout and the desktop split view.
  // All open tabs render simultaneously; only the active tab is visible.
  const editorsBody = (
    <>
      {openTabs.map((tabId) => {
        const tn = notes.find((n) => n.id === tabId);
        if (!tn) return null;
        const isActiveTab = tabId === activeTabId;
        return (
          <div key={tabId} style={{ display: isActiveTab ? "flex" : "none", flexDirection: "column", flex: 1, minHeight: 0 }}>
            <NoteEditor
              note={tn}
              isActive={isActiveTab}
              desktopMode={desktopMode}
              onBack={() => closeTab(tabId)}
              onSave={(changes) => updateNote(tabId, changes)}
              onDelete={() => { deleteNote(tabId); closeTab(tabId); }}
              onTogglePin={() => togglePin(tabId)}
              mdPreview={isActiveTab ? mdPreview : false}
              onMdPreviewChange={isActiveTab ? setMdPreview : () => { }}
              zenMode={isActiveTab ? zenMode : false}
              onZenChange={isActiveTab ? setZenMode : () => { }}
              onNavigate={handleWikiNavigate}
              onShowContextMenu={setContextMenu}
              onWordCountChange={isActiveTab ? setEditorWordCount : () => { }}
            />
          </div>
        );
      })}
    </>
  );

  const listBody = (
    <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4 bg-zinc-950" onContextMenu={buildListMenu}>
      {filteredPinned.length > 0 && (
        <section>
          <div className="flex items-center gap-1.5 mb-2 px-0.5 text-zinc-600">
            <Pin size={9} className="pinned-section" />
            <span className="section-label">Pinned</span>
          </div>
          <div className="space-y-2">
            {filteredPinned.map((n) => (
              <NoteCard key={n.id} note={n} onClick={() => openTab(n.id)}
                onReveal={() => invoke("reveal_note", { noteId: n.id, fileExt: n.fileExt || "md" })}
                onDelete={() => deleteNote(n.id)}
                onContextMenu={(e) => buildCardMenu(e, n)}
                sceneId={noteScenes[n.id] ?? null}
                onSetScene={setNoteScene}
                cardScenesEnabled={cardScenesEnabled}
                density={cardDensity} />
            ))}
          </div>
        </section>
      )}
      {filteredUnpinned.length > 0 && (
        <section>
          {filteredPinned.length > 0 && (
            <div className="flex items-center gap-1.5 mb-2 px-0.5">
              <BookOpen size={9} className="text-zinc-600" />
              <span className="section-label">Notes</span>
            </div>
          )}
          <div className="space-y-2">
            {filteredUnpinned.map((n) => (
              <NoteCard key={n.id} note={n} onClick={() => openTab(n.id)}
                onReveal={() => invoke("reveal_note", { noteId: n.id, fileExt: n.fileExt || "md" })}
                onDelete={() => deleteNote(n.id)}
                onContextMenu={(e) => buildCardMenu(e, n)}
                draggable={!activeTag}
                onGripPointerDown={handleGripPointerDown}
                dragOver={dragOverId === n.id}
                isDragging={dragId === n.id}
                sceneId={noteScenes[n.id] ?? null}
                onSetScene={setNoteScene}
                cardScenesEnabled={cardScenesEnabled}
                density={cardDensity}
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
  );

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

      {/* Changelog / patch notes */}
      {showChangelog && <ChangelogModal onClose={() => setShowChangelog(false)} />}

      {/* Command palette */}
      {showPalette && (
        <CommandPalette
          notes={notes}
          onClose={() => setShowPalette(false)}
          onNavigate={(id) => openTab(id)}
          onNew={handleNew}
          onDelete={(id) => { deleteNote(id); closeTab(id); }}
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
            className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-950 shrink-0 select-none cursor-default">
            <div className="flex items-center gap-2" data-tauri-drag-region>
              <NotebookPen size={15} className="app-name pointer-events-none" />
              <span className="text-[12px] font-bold tracking-[0.18em] uppercase pointer-events-none app-name">SignalPad</span>
              <button
                onClick={() => setShowChangelog(true)}
                title="View patch notes"
                className="text-[10px] font-mono text-zinc-600 hover:text-zinc-500 hover:bg-zinc-800 transition-colors px-1 py-0.5 rounded leading-none"
              >
                v{changelog.history[0]?.version ?? "0.1.0"}
              </button>
              {showSettings && (
                <><span className="text-zinc-700 text-[11px] pointer-events-none">/</span>
                  <span className="text-[12px] text-zinc-400 pointer-events-none">Settings</span></>
              )}
              {showHelp && (
                <><span className="text-zinc-700 text-[11px] pointer-events-none">/</span>
                  <span className="text-[12px] text-zinc-400 pointer-events-none">Help</span></>
              )}
              {!showSettings && !showHelp && activeNote && (
                <><span className="text-zinc-700 text-[11px] pointer-events-none">/</span>
                  <span className="text-[12px] text-zinc-400 truncate max-w-[150px] pointer-events-none">
                    {activeNote.emoji && <span className="mr-1">{activeNote.emoji}</span>}
                    {activeNote.title || "Untitled"}
                  </span></>
              )}
            </div>
            <div className="flex items-center gap-2">
              <AmbientSound />
              <button onClick={() => setShowPalette((s) => !s)} title="Command palette (Ctrl+K)"
                className="w-7 h-7 flex items-center justify-center rounded text-zinc-600 hover:text-zinc-300 hover:bg-zinc-700 transition-colors text-[11px] font-mono leading-none">
                ⌘K
              </button>
              <button onClick={() => setDesktopMode(!desktopMode)} title={desktopMode ? "Exit desktop mode" : "Desktop mode (big view)"}
                className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${desktopMode ? "text-zinc-100 bg-zinc-950" : "text-zinc-600 hover:text-zinc-300 hover:bg-zinc-700"}`}>
                <Monitor size={14} />
              </button>
              <button onClick={() => (showSettings ? closePanel() : openSettings())} title="Settings"
                className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${showSettings ? "text-zinc-100 bg-zinc-950" : "text-zinc-600 hover:text-zinc-300 hover:bg-zinc-700"}`}>
                <Settings size={14} />
              </button>
              <WindowControls showMaximize={desktopMode} />
            </div>
          </div>
        )}

        {/* Tab bar — shown when notes are open */}
        {!showSettings && !showHelp && openTabs.length > 0 && !zenMode && (
          <div className="sp-tab-bar shrink-0">
            {/* Home button — returns to note list without closing tabs */}
            <button
              onClick={() => setActiveTabId(null)}
              title="All notes"
              className={`flex items-center justify-center px-2.5 py-1.5 border-r border-zinc-800 shrink-0 transition-colors ${activeTabId === null ? "bg-zinc-900 text-zinc-300" : "text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800/50"}`}>
              <BookOpen size={11} />
            </button>
            {openTabs.map((tabId) => {
              const tn = notes.find((n) => n.id === tabId);
              if (!tn) return null;
              const isActive = tabId === activeTabId;
              return (
                <button key={tabId} onClick={() => setActiveTabId(tabId)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] border-r border-zinc-800 shrink-0 max-w-[140px] transition-colors ${isActive ? "bg-zinc-900 text-zinc-100 border-b border-b-zinc-900" : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"}`}>
                  {tn.emoji && <span className="text-[10px] leading-none">{tn.emoji}</span>}
                  <span className="truncate flex-1">{tn.title || "Untitled"}</span>
                  <span
                    role="button"
                    aria-label="Close tab"
                    onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); closeTab(tabId); }}
                    className="ml-0.5 text-zinc-700 hover:text-zinc-400 transition-colors p-0.5 rounded leading-none cursor-pointer">
                    <X size={9} />
                  </span>
                </button>
              );
            })}
            <button onClick={handleNew} title="New note"
              className="px-2.5 py-1.5 text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 transition-colors shrink-0">
              <Plus size={11} />
            </button>
          </div>
        )}

        {/* Tag filter bar — visible in list view (no tabs, or home button active) */}
        {!showSettings && !showHelp && (openTabs.length === 0 || activeTabId === null) && !zenMode && allTags.length > 0 && (
          <div className="flex items-center gap-1 px-3 py-1.5 border-b border-zinc-800 bg-zinc-950 overflow-x-auto shrink-0">
            <Hash size={9} className="text-zinc-600 shrink-0" />
            <button onClick={() => setActiveTag(null)}
              className={`px-2 py-0.5 rounded-full text-[9px] font-bold tracking-wide transition-colors shrink-0 ${!activeTag ? "bg-zinc-500/20 text-zinc-100" : "text-zinc-600 hover:text-zinc-400"}`}>
              All
            </button>
            {allTags.map((tag) => (
              <button key={tag} onClick={() => setActiveTag(activeTag === tag ? null : tag)}
                className={`px-2 py-0.5 rounded-full text-[12px] font-bold tracking-wide transition-colors shrink-0 ${activeTag === tag ? "bg-zinc-500/20 text-zinc-100" : "text-zinc-600 hover:text-zinc-400"}`}>
                #{tag}
              </button>
            ))}
          </div>
        )}

        {/* Body */}
        {showSettings ? (
          <SettingsView onClose={closePanel} />
        ) : showHelp ? (
          <HelpView onClose={closePanel} onShowChangelog={() => setShowChangelog(true)} />
        ) : desktopMode ? (
          /* Desktop (Big View) — sidebar for browsing, main column for cards/editor */
          <div className="flex flex-1 min-h-0">
            {!zenMode && (
              <DesktopSidebar
                pinned={filteredPinned}
                unpinned={filteredUnpinned}
                activeTabId={activeTabId}
                onOpen={openTab}
                onContextMenu={buildCardMenu}
                onNew={handleNew}
              />
            )}
            <div className="flex flex-col flex-1 min-w-0">
              {openTabs.length > 0 && activeTabId !== null ? editorsBody : listBody}
            </div>
          </div>
        ) : openTabs.length > 0 && activeTabId !== null ? editorsBody : listBody}

      </div>{/* end inner padded column */}

      {/* Editor footer */}
      {!showSettings && !showHelp && activeTabId !== null && activeNote && !zenMode && (
        <div className="px-3 py-1.5 border-t border-zinc-800 flex items-center justify-between shrink-0 surface-800">
          <span className="text-[12px] glass-text">
            {mdPreview ? "Markdown preview"
              : activeNote.burn ? "🔥 Burns when closed"
                : activeNote.pinned ? "Pinned — read-only by default"
                  : "Ctrl+S to save · Ctrl+K palette"}
          </span>
          <div className="flex items-center gap-3">
            {editorWordCount > 0 && (
              <span className="text-[9px] text-zinc-600 tabular-nums">
                {editorWordCount}w · {Math.max(1, Math.ceil(editorWordCount / 200))}min
              </span>
            )}
            <span className="text-[12px] glass-text">{fmtDate(activeNote.updatedAt)}</span>
          </div>
        </div>
      )}

      {/* Note list footer */}
      {!showSettings && !showHelp && (openTabs.length === 0 || activeTabId === null) && (
        <div className="px-3 py-2.5 border-t border-zinc-800 flex items-center justify-between shrink-0 surface-800">
          <span className="text-[12px] glass-text">
            {activeTag ? `#${activeTag} · ` : ""}{notes.length} note{notes.length !== 1 ? "s" : ""}
          </span>
          <div className="flex items-center gap-1.5">
            {capWarning && (
              <span className="text-[10px] text-orange-400 animate-pulse">Cap of {noteCap} reached</span>
            )}
            <button onClick={handleImport} title="Import a file" className="btn btn-secondary">
              <Upload size={11} /> Import
            </button>
            <button onClick={handleNew} className="btn btn-primary">
              <Plus size={11} /> New Note
            </button>
            <button onClick={() => (showHelp ? closePanel() : openHelp())} title="Help"
              className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${showHelp ? "text-zinc-100 bg-zinc-950" : "text-zinc-600 hover:text-zinc-300 hover:bg-zinc-700"}`}>
              <HelpCircle size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
