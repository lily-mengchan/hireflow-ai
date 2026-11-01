/* eslint-disable @typescript-eslint/no-require-imports -- Git upload audit; no credential values are printed. */
const fs = require("node:fs"), cp = require("node:child_process"), path = require("node:path");
require("@next/env").loadEnvConfig(process.cwd());
const paths = [...new Set(cp.execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean))];
const values = ["OPENAI_API_KEY", "RAG_EMBEDDING_API_KEY", "GH_TOKEN", "GITHUB_TOKEN", "VERCEL_TOKEN"].map(n => process.env[n]).filter(v => v && v.length >= 8);
const issues = [];
for (const file of paths) {
  if (/(^|\/)(?:\.env(?!\.example$)|\.local\/|\.vercel\/|uploads\/|resumes\/|private\/)|\.(pdf|docx?|pem|key|p12|pfx)$/i.test(file)) issues.push({ file, reason: "sensitive-path" });
  const absolute = path.resolve(file);
  if (!absolute.startsWith(process.cwd() + path.sep)) throw Error("Unexpected path outside workspace");
  if (fs.lstatSync(absolute).isSymbolicLink()) { issues.push({ file, reason: "symlink-needs-review" }); continue; }
  const content = fs.readFileSync(absolute);
  if (values.some(v => content.includes(Buffer.from(v)))) issues.push({ file, reason: "configured-secret-found" });
  if (/\b(?:ghp_|github_pat_|sk-proj-|sk-)[A-Za-z0-9_]{25,}\b/.test(content.toString("utf8"))) issues.push({ file, reason: "credential-shaped-value" });
}
const ignoredEnv = cp.spawnSync("git", ["check-ignore", ".env.local", ".local/deployment-audit.json"], { encoding: "utf8" }).status === 0;
fs.mkdirSync(".local", { recursive: true });
fs.writeFileSync(".local/upload-safety.json", JSON.stringify({ checkedAt: new Date().toISOString(), files: paths.length, issues, ignoredEnv }, null, 2));
console.log(JSON.stringify({ filesScanned: paths.length, configuredSecretValuesScanned: values.length, issueCount: issues.length, ignoredEnv }));
if (issues.length || !ignoredEnv) process.exitCode = 1;
