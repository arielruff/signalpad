Added npm run release as an alias, so the whole release flow is now two commands:


npm run version:set -- 1.1.0    # optional — syncs all 4 version files
npm run release                  # rebuilds the setup .exe
The installer lands at src-tauri\target\release\bundle\nsis\SignalPad_<version>_x64-setup.exe every time, and CLAUDE.md documents the full process.

One caveat for right now: your working tree has the uncommitted theming fixes, and npm run release builds from the current source — so it'll pick those up. That's what you want, just be aware the installer version will still say 1.0.1 (what the pre-commit hook set) unless you bump it first.