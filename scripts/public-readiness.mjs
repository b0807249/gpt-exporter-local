import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function git(args) {
  return execFileSync("git", args, {
    cwd: projectRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function gitWithNoMatch(args) {
  try {
    return git(args);
  } catch (error) {
    if (error?.status === 1) return "";
    throw error;
  }
}

const trackedFiles = git(["ls-files", "--cached", "--others", "--exclude-standard", "-z"])
  .split("\0")
  .filter(Boolean);
const findings = [];
const forbiddenPaths = [
  [/(^|\/)\.env(?:\.|$)/i, "environment file"],
  [/(^|\/)(?:secrets?|credentials?|cookies?|browser-profile)(?:\/|$)/i, "credential or browser-state path"],
  [/\.(?:pem|key|p12|pfx|har|sqlite3?|db|zip|crx)$/i, "private, captured, or packaged artifact"],
  [/(^|\/)(?:exports?|private-fixtures?)(?:\/|$)/i, "private export or fixture path"],
];

for (const file of trackedFiles) {
  const normalized = file.replaceAll("\\", "/");
  for (const [pattern, label] of forbiddenPaths) {
    if (pattern.test(normalized)) findings.push(`${file}: forbidden ${label}`);
  }
}

const commits = git(["rev-list", "--all"]).split(/\r?\n/).filter(Boolean);
for (const commit of commits) {
  const historicalPaths = git(["ls-tree", "-r", "--name-only", commit]).split(/\r?\n/).filter(Boolean);
  for (const file of historicalPaths) {
    const normalized = file.replaceAll("\\", "/");
    for (const [pattern, label] of forbiddenPaths) {
      if (pattern.test(normalized)) findings.push(`git history ${commit.slice(0, 7)}:${file}: forbidden ${label}`);
    }
  }
}

const textExtensions = new Set([".css", ".html", ".js", ".json", ".md", ".mjs", ".txt", ".yaml", ".yml"]);
const contentRules = [
  [/\b[A-Za-z]:\\(?:Users|dev|research|Obsidian)\\/i, "local absolute path"],
  [/(?:^|[^A-Z0-9._%+-])[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}(?:$|[^A-Z0-9.-])/i, "email address"],
  [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, "private-key marker"],
  [/\b(?:https?|[a-z][a-z0-9+.-]*):\/\/[^\s/:]+:[^\s/@]+@/i, "credential-bearing URL"],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}\b/, "GitHub token shape"],
  [/\bsk-[A-Za-z0-9_-]{16,}\b/, "API-key shape"],
];

for (const file of trackedFiles) {
  if (!textExtensions.has(path.extname(file).toLowerCase())) continue;
  const source = await readFile(path.join(projectRoot, file), "utf8");
  for (const [pattern, label] of contentRules) {
    if (pattern.test(source)) findings.push(`${file}: possible ${label}`);
  }
}

const historyContentRules = [
  ["[A-Za-z]:\\\\(Users|dev|research|Obsidian)\\\\", "local absolute path"],
  ["[[:alnum:]._%+-]+@[[:alnum:].-]+\\.[[:alpha:]]{2,}", "email address"],
  ["BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY", "private-key marker"],
  ["gh[pousr]_[A-Za-z0-9]{20,}", "GitHub token shape"],
  ["sk-[A-Za-z0-9_-]{16,}", "API-key shape"],
];
for (const commit of commits) {
  for (const [pattern, label] of historyContentRules) {
    const matchedFiles = gitWithNoMatch(["grep", "-I", "-l", "-E", "--", pattern, commit])
      .split(/\r?\n/)
      .filter(Boolean);
    for (const match of matchedFiles) {
      const file = match.includes(":") ? match.slice(match.indexOf(":") + 1) : match;
      findings.push(`git history ${commit.slice(0, 7)}:${file}: possible ${label}`);
    }
  }
}

const authorEmails = git(["log", "--all", "--format=%ae"])
  .split(/\r?\n/)
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean);
const nonNoreplyCount = authorEmails.filter((email) => !email.endsWith("@users.noreply.github.com")).length;
if (nonNoreplyCount > 0) {
  findings.push(`git history: ${nonNoreplyCount} commit author address(es) are not GitHub noreply addresses`);
}

if (findings.length > 0) {
  console.error("Public-readiness audit failed. No suspected value is printed; inspect these locations locally:");
  for (const finding of findings) console.error(`- ${finding}`);
  process.exitCode = 1;
} else {
  console.log(`Public-readiness audit passed for ${trackedFiles.length} tracked files and Git author metadata.`);
}
