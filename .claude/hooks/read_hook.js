// Blocks Claude from reading/exfiltrating .env-style secrets, and from
// reasonably foreseeable ways around a plain filename check.
//
// This is defense in depth, not a hard guarantee: a shell-executing tool
// (Bash/PowerShell) can always be obfuscated around a static text check
// (e.g. variable indirection, glob brackets). The real backstop for those
// tools is an OS-level ACL denying read access to the secret file(s).

// Suffixes that are known-safe (templates with no real secrets).
const SAFE_SUFFIXES = new Set(["example", "sample", "template", "dist"]);

// A single .env-family path segment, e.g. ".env", ".env.local", ".Env.PRODUCTION".
const ENV_SEGMENT = /^\.env(?:\.([A-Za-z0-9_-]+))?$/i;

// Commands whose whole purpose is to print already-loaded environment
// variables (bypasses any file-path check entirely, since no filename
// is involved).
const ENV_DUMP_PATTERNS = [
  /\bprintenv\b/i,
  /(^|[;|&]|\n)\s*env\s*($|[;|&\n])/i,
  /\bGet-ChildItem\s+(-Path\s+)?Env:/i,
  /\bGet-Item\s+(-Path\s+)?Env:/i,
  /\bGet-Content\s+Env:/i,
  /\[Environment\]::GetEnvironmentVariables/i,
  /\bos\.environ\b/i,
  /\bprocess\.env\b/i,
];

// Commands that can pull a committed/historical copy of a file out of git
// without the literal filename ever appearing in this particular command
// (e.g. `git rev-list --objects --all` to find the blob hash, then
// `git cat-file -p <hash>` to dump it).
const GIT_HISTORY_PATTERNS = [
  /\bgit\s+cat-file\b/i,
  /\bgit\s+show\b[^\n]*:/i,
  /\bgit\s+log\b[^\n]*-p\b/i,
  /\brev-list\s+--objects\b/i,
];

function segmentIsEnv(segment) {
  const m = ENV_SEGMENT.exec(segment);
  if (!m) return false;
  if (m[1] && SAFE_SUFFIXES.has(m[1].toLowerCase())) return false;
  return true;
}

// Extracts every ".env" / ".env.<suffix>" token bounded by a path
// separator, shell/URL delimiter, whitespace, or start/end of string --
// then lets segmentIsEnv() apply the safe-suffix exception uniformly, so
// a single delimiter set is used everywhere (path fields, glob filters,
// URLs, and de-quoted shell command text alike).
const ENV_TOKEN = /(?:^|[\\/=:?&\s"'`])(\.env(?:\.[A-Za-z0-9_-]+)?)(?=$|[\\/=:?&\s"'`])/gi;

function pathStringReferencesEnv(str) {
  if (!str || typeof str !== "string") return false;
  let m;
  ENV_TOKEN.lastIndex = 0;
  while ((m = ENV_TOKEN.exec(str))) {
    if (segmentIsEnv(m[1])) return true;
  }
  return false;
}

// For Bash/PowerShell command text. Strip shell quoting/escaping
// characters first, since `.en''v` / `".e""n""v"` / `.e\nv` all execute as
// `.env` but wouldn't contain that literal substring untouched.
function shellStringReferencesEnv(command) {
  if (!command) return false;
  const dequoted = command
    .replace(/['"`]/g, "")
    .replace(/\\(?=[a-zA-Z])/g, "");
  if (pathStringReferencesEnv(dequoted)) return true;
  if (ENV_DUMP_PATTERNS.some((re) => re.test(command))) return true;
  if (GIT_HISTORY_PATTERNS.some((re) => re.test(command))) return true;
  return false;
}

function collectStrings(value, out) {
  if (typeof value === "string") {
    out.push(value);
  } else if (Array.isArray(value)) {
    for (const v of value) collectStrings(v, out);
  } else if (value && typeof value === "object") {
    for (const v of Object.values(value)) collectStrings(v, out);
  }
}

async function main() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8").replace(/^﻿/, "");
  const toolArgs = JSON.parse(raw);
  const input = toolArgs.tool_input ?? {};
  const toolName = toolArgs.tool_name ?? "";

  const isShell = toolName === "Bash" || toolName === "PowerShell";

  let blocked = false;

  if (isShell) {
    blocked = shellStringReferencesEnv(input.command ?? "");
  } else {
    // Scan every string value in tool_input generically (not a hardcoded
    // field allowlist), so any current or future param -- Grep's `glob`
    // filter, WebFetch's `url`, NotebookEdit's `notebook_path`, etc. --
    // is covered automatically.
    const strings = [];
    collectStrings(input, strings);
    blocked = strings.some(pathStringReferencesEnv);
  }

  if (blocked) {
    process.stdout.write(
      JSON.stringify({
        continue: false,
        stopReason: "Blocked: accessing .env files (or dumping environment variables / raw git objects) is not permitted.",
      })
    );
    process.exit(0);
  }
}

main();
