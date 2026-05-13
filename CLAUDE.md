# SignalPad

A Tauri 2 desktop note-taking app — React + Vite + Tailwind CSS v4 + Zustand.

## Commands

```bash
npm run tauri dev      # Full app dev (opens desktop window) — use this, not npm run dev
npm run dev            # Vite-only (no Tauri window, for isolated frontend work)
npm run tauri build    # Bundle distributable (requires Rust + cargo)
npm run build          # Vite build only
```

## Architecture

```
src/
  App.jsx                     # Root — renders <SignalPad />
  components/SignalPad.jsx    # Entire UI (list view + editor, window controls)
  stores/useSignalPadStore.js # Zustand store with persist middleware
src-tauri/
  tauri.conf.json             # Window config (560×660, no OS decorations)
  src/lib.rs                  # Rust entry — no custom commands, intentionally minimal
```

## Gotchas

- **Window decorations are off** — `decorations: false` in tauri.conf.json. The title bar is custom JSX; window dragging relies on `data-tauri-drag-region`. Don't remove that attribute.
- **Tailwind v4** — configured via `@tailwindcss/vite` plugin in vite.config.js. There is no `tailwind.config.js` or PostCSS setup.
- **Editor uses `document.execCommand`** — deprecated but intentional. Toolbar formatting (bold, lists, etc.) depends on it.
- **Note content is raw HTML** — `note.content` is stored as `innerHTML` strings. Render with `dangerouslySetInnerHTML` in view mode.
- **Pinned notes are read-only by default** — clicking pin saves + locks the note. The Edit3 icon unlocks it. This is intentional UX.
- **Hard cap: 10 notes** — `MAX_NOTES = 10` in the store. The `canAdd()` selector gates the New Note button.
- **Persistence key is `signalpad-v1`** — stored in localStorage. Changing this key will wipe existing notes on upgrade.
