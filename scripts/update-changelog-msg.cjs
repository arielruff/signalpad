// commit-msg: read commit subject and write it into the latest changelog entry
const fs = require("fs");
const path = require("path");

const msgFile = process.argv[2];
if (!msgFile) process.exit(0);

const raw = fs.readFileSync(msgFile, "utf8");
// Take first non-comment, non-empty line as the summary
const summary = raw
  .split("\n")
  .filter((l) => !l.startsWith("#") && l.trim())
  .map((l) => l.trim())
  [0] || "Update";

const changelogPath = path.join(__dirname, "..", "src", "changelog.json");
const changelog = JSON.parse(fs.readFileSync(changelogPath, "utf8"));

// Only populate if the latest entry has no changes yet (set by bump-version.cjs)
if (changelog.history.length > 0 && changelog.history[0].changes.length === 0) {
  changelog.history[0].changes = [summary];
  fs.writeFileSync(changelogPath, JSON.stringify(changelog, null, 2) + "\n");
}
