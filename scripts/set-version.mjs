#!/usr/bin/env node
// Sets the app version everywhere it lives:
//   package.json, src-tauri/tauri.conf.json, src-tauri/Cargo.toml
// and warns if src/changelog.json (which drives the in-app version display)
// doesn't have a matching entry yet.
//
// Usage: npm run version:set -- 1.0.1
import { readFileSync, writeFileSync } from "node:fs";

const v = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(v ?? "")) {
  console.error("Usage: npm run version:set -- <major.minor.patch>   e.g. 1.0.1");
  process.exit(1);
}

const edit = (path, fn) => {
  const src = readFileSync(path, "utf8");
  const out = fn(src);
  if (out === src) {
    console.error(`✗ ${path} — version field not found, nothing changed`);
    process.exit(1);
  }
  writeFileSync(path, out);
  console.log(`✓ ${path} → ${v}`);
};

edit("package.json", (s) => s.replace(/"version":\s*"[^"]+"/, `"version": "${v}"`));
edit("src-tauri/tauri.conf.json", (s) => s.replace(/"version":\s*"[^"]+"/, `"version": "${v}"`));
edit("src-tauri/Cargo.toml", (s) => s.replace(/^version = "[^"]+"/m, `version = "${v}"`));

const changelog = JSON.parse(readFileSync("src/changelog.json", "utf8"));
const latest = changelog.history[0]?.version;
if (latest !== v) {
  console.warn(`⚠ src/changelog.json latest entry is ${latest} — add a ${v} entry so the in-app version matches.`);
} else {
  console.log(`✓ src/changelog.json already has a ${v} entry`);
}
