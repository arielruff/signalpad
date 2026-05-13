// Pre-commit: bump patch version in package.json, tauri.conf.json, changelog.json
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

const pkgPath = path.join(root, "package.json");
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));

const changelogPath = path.join(root, "src", "changelog.json");
const changelog = JSON.parse(fs.readFileSync(changelogPath, "utf8"));

// Amend detection via git reflog action env var
if ((process.env.GIT_REFLOG_ACTION || "").includes("amend")) {
  process.stdout.write("Amend detected, skipping version bump\n");
  process.exit(0);
}

// Idempotency: if the latest changelog entry has no changes yet AND its version
// already matches pkg.version, pre-commit already ran for this commit attempt
// (e.g., a retry after a hook failure) — skip to avoid double-bumping.
const latest = changelog.history[0];
if (latest && latest.changes.length === 0 && latest.version === pkg.version) {
  process.stdout.write(`Already bumped to ${pkg.version}, skipping\n`);
  process.exit(0);
}

const parts = pkg.version.split(".").map(Number);
const nextVersion = `${parts[0]}.${parts[1]}.${parts[2] + 1}`;

// Bump package.json
pkg.version = nextVersion;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

// Bump tauri.conf.json
const tauriPath = path.join(root, "src-tauri", "tauri.conf.json");
const tauri = JSON.parse(fs.readFileSync(tauriPath, "utf8"));
tauri.version = nextVersion;
fs.writeFileSync(tauriPath, JSON.stringify(tauri, null, 2) + "\n");

// Prepend new changelog entry (changes filled in by commit-msg hook)
const today = new Date().toISOString().split("T")[0];
changelog.history.unshift({ version: nextVersion, date: today, changes: [] });
fs.writeFileSync(changelogPath, JSON.stringify(changelog, null, 2) + "\n");

process.stdout.write(`Bumped to ${nextVersion}\n`);
