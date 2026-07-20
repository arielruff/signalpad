# SignalPad

A Tauri 2 desktop note-taking app — React + Vite + Tailwind CSS v4 + Zustand.

## Commands

```bash
npm run tauri dev      # Full app dev (opens desktop window) — use this, not npm run dev
npm run dev            # Vite-only (no Tauri window, for isolated frontend work)
npm run tauri build    # Bundle distributable (requires Rust + cargo)
npm run build          # Vite build only
```

## Releasing

1. Add a new entry at the TOP of `src/changelog.json` — `history[0].version` is what the UI displays.
2. `npm run version:set -- <x.y.z>` — syncs package.json, tauri.conf.json, and Cargo.toml, and
   verifies the changelog entry matches. Never bump versions by hand in one file only.
3. `npm run tauri build` — produces the installer at
   `src-tauri/target/release/bundle/nsis/SignalPad_<x.y.z>_x64-setup.exe`
   (plus the portable exe at `src-tauri/target/release/signalpad.exe`).
4. The installer is unsigned — Windows SmartScreen will warn on first run. Code-signing
   requires a certificate (or Azure Trusted Signing) configured in `bundle.windows` in tauri.conf.json.

## Architecture

```text
src/
  App.jsx                     # Root — splash screen + <SignalPad />
  components/SignalPad.jsx    # Main UI (list, tabbed editor, settings, help) — large; most work happens here
  components/*.jsx            # PasscodeModal, CommandPalette, ContextMenu, PixelArtScene,
                              # AmbientSound, ActivityHeatmap, ChangelogModal, SplashScreen
  stores/useSignalPadStore.js # Zustand store — notes CRUD, snapshots, settings
  changelog.json              # Version history — history[0].version is the app version shown in UI
src-tauri/
  tauri.conf.json             # Window config (560×660 list / 680×720 editor), CSP, no OS decorations
  capabilities/default.json   # Tauri permission grants — see gotcha below
  src/lib.rs                  # Rust commands: fs (notes dir), reveal/open folder, window focus
```

## Persistence

- **Notes are files on disk** — `Documents/SignalPad/<id>.<md|txt>` with a YAML-ish frontmatter block
  (`serializeNote`/`parseNote` in the store). Snapshots are `<id>.snap.<ts>[.auto].md` alongside them.
- **Settings live in localStorage** under individual `sp-*` keys (theme, fonts, note cap, passcodes, …).
  There is no zustand persist middleware and no `signalpad-v1` key.
- **Note cap is configurable** — Settings → Storage, default 10, `0` = unlimited (`sp-note-cap`).

## Gotchas

- **Window decorations are off** — `decorations: false` in tauri.conf.json. The title bar is custom JSX; window dragging relies on `data-tauri-drag-region`. Don't remove that attribute.
- **Every Tauri API call needs a capability grant** in `src-tauri/capabilities/default.json`. Calls fail
  silently when a permission is missing (most are wrapped in `.catch(() => {})`) — if a plugin/window API
  "does nothing", check capabilities first. Capability changes require restarting `npm run tauri dev`.
- **Tailwind v4** — configured via `@tailwindcss/vite` plugin in vite.config.js. There is no `tailwind.config.js` or PostCSS setup.
- **Editor uses `document.execCommand`** — deprecated but intentional. Toolbar formatting (bold, lists, etc.) depends on it.
- **Note content is raw HTML** — `note.content` is stored as `innerHTML` strings. Render with `dangerouslySetInnerHTML` in view mode. A CSP in tauri.conf.json blocks inline script handlers.
- **Pinned notes are read-only by default** — clicking pin saves + locks the note. The Edit3 icon unlocks it. This is intentional UX.
- **Passcode hashes carry a type prefix** — password-type locks are stored as `p:<hash>`; bare hashes are
  PIN locks (`storePasscode`/`checkPasscode` in PasscodeModal.jsx). Don't strip the prefix.
- **Checklist checkboxes persist via the `checked` attribute** (mirrored from the DOM property on click)
  plus a `.checked` class on `.checklist-item` — keep both in sync when touching checklist code.
- **Theming is two parallel systems** — CSS variables for glass/semantic surfaces AND per-theme Tailwind
  zinc overrides in index.css. Read the comment block at the top of index.css before restyling.
