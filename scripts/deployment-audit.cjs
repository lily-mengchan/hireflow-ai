/* eslint-disable @typescript-eslint/no-require-imports -- Local build/secret audit; never prints credentials. */
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
require("@next/env").loadEnvConfig(process.cwd());
const names = ["OPENAI_API_KEY", "OPENAI_BASE_URL", "RAG_CHAT_MODEL", "RAG_EMBEDDING_API_KEY", "RAG_EMBEDDING_BASE_URL", "RAG_EMBEDDING_MODEL", "RAG_EMBEDDING_DIMENSIONS", "RAG_MIN_SIMILARITY"];
const keys = ["OPENAI_API_KEY", "RAG_EMBEDDING_API_KEY"].map(name => process.env[name]).filter(value => value && value.length >= 8);
function files(dir) { return fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(path.join(dir, entry.name)) : [path.join(dir, entry.name)]) : []; }
const hash = file => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const clientFiles = files(".next/static").filter(f => /\.(js|css|json|map)$/.test(f));
if (!clientFiles.length) throw Error("Run npm run build before the deployment audit");
let exposed = 0;
for (const file of [...clientFiles, ...files("public").filter(f => /\.(js|mjs|json|html|txt)$/.test(f))]) {
  const content = fs.readFileSync(file, "utf8"); if (keys.some(key => content.includes(key))) exposed++;
}
const publicSecretNames = Object.keys(process.env).filter(name => /^NEXT_PUBLIC_.*(?:KEY|SECRET|TOKEN|PASSWORD)/i.test(name));
const traceFiles = files(".next").filter(f => f.endsWith(".nft.json"));
let tracedEnvFiles = 0, tracedLocalInstall = 0;
for (const file of traceFiles) {
  const trace = JSON.parse(fs.readFileSync(file, "utf8"));
  for (const entry of trace.files ?? []) {
    if (/[/\\]\.env(?:\.local|\.production(?:\.local)?)?$/.test(entry)) tracedEnvFiles++;
    if (entry.includes("deploy-install") || entry.includes("npm-cache")) tracedLocalInstall++;
  }
}
const workerMatches = hash("public/pdf.worker.min.mjs") === hash("node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs");
const expectedMaps = files("node_modules/pdfjs-dist/cmaps"), mapsMatch = expectedMaps.every(file => {
  const target = path.join("public/pdf-cmaps", path.basename(file)); return fs.existsSync(target) && hash(file) === hash(target);
});
const functions = JSON.parse(fs.readFileSync(".next/server/functions-config-manifest.json", "utf8"));
const report = {
  auditedAt: new Date().toISOString(), node: process.version,
  environment: names.map(name => ({ name, configured: !!process.env[name]?.trim() })),
  clientFilesScanned: clientFiles.length, configuredSecretValuesFound: exposed,
  publicSecretVariableNames: publicSecretNames, tracedEnvironmentFiles: tracedEnvFiles, tracedLocalInstallFiles: tracedLocalInstall,
  pdfWorkerMatchesInstalledVersion: workerMatches, pdfCMapFiles: expectedMaps.length, pdfCMapsMatch: mapsMatch,
  functionBudgets: functions.functions,
};
fs.mkdirSync(".local", { recursive: true }); fs.writeFileSync(".local/deployment-audit.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (exposed || publicSecretNames.length || tracedEnvFiles || tracedLocalInstall || !workerMatches || !mapsMatch) process.exitCode = 1;
