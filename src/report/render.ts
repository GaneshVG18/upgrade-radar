import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Finding, Report } from "../types.js";
import { escapeHtml, safeUrl } from "../core/util.js";

export function validateReport(report: Report): void {
  if (report.schemaVersion !== "upgrade-radar-report/v1") throw new Error("Unsupported report schema");
  if (!Array.isArray(report.findings) || !Array.isArray(report.coverageLimitations)) throw new Error("Malformed report arrays");
  for (const finding of report.findings) {
    if (!finding.code.id || !finding.note.id || !finding.code.spanHash || !finding.note.spanHash) throw new Error("Finding is missing evidence provenance");
    if (!new Set(["review", "no_direct_evidence", "unknown"]).has(finding.disposition)) throw new Error("Invalid disposition");
  }
}

function link(span: Finding["code"]): string {
  const url = safeUrl(span.url);
  const label = `${escapeHtml(span.path)}:${span.startLine}-${span.endLine}`;
  return url ? `<a href="${escapeHtml(url)}" rel="noreferrer">${label}</a>` : `<a href="#${escapeHtml(span.id)}">${label}</a>`;
}

export function renderMarkdown(report: Report): string {
  const lines = [
    "# Upgrade Radar report",
    "",
    `Run mode: **${report.runMode}**`,
    `Source revision: \`${report.sourceRevision}\``,
    `Complete: **${report.complete ? "yes" : "no"}**`,
    "",
    "## Upgrade",
    "",
    ...report.upgrades.map((u) => `- \`${u.package}\` ${u.from} → ${u.to}`),
    "",
    "## Review queue",
    ""
  ];
  if (report.findings.length === 0) lines.push("No evidence-linked candidates were found within the supported analysis surface.", "");
  for (const finding of report.findings) {
    lines.push(
      `### ${finding.disposition}: ${finding.changeFamily}`,
      "",
      `${finding.relationship}`,
      "",
      `- Code: \`${finding.code.path}:${finding.code.startLine}-${finding.code.endLine}\` (${finding.code.id})`,
      `- Note: \`${finding.note.path}:${finding.note.startLine}-${finding.note.endLine}\` (${finding.note.id})`,
      `- Reasons: ${finding.reasons.join(", ")}`,
      ""
    );
  }
  lines.push("## Coverage limitations", "", ...report.coverageLimitations.map((item) => `- ${item}`), "");
  if (report.unknownItems.length > 0) lines.push("## Unknown items", "", ...report.unknownItems.map((item) => `- ${item}`), "");
  lines.push("This report is advisory. A negative row is only about the evaluated note/site pair and is not an upgrade compatibility guarantee.", "");
  return lines.join("\n");
}

export function renderHtml(report: Report): string {
  const badge = report.runMode === "illustrative_fixture"
    ? '<div class="fixture">ILLUSTRATIVE FIXTURE — authored decisions, no live Jev call</div>'
    : "";
  const rows = report.findings.map((finding) => `<article class="finding" data-disposition="${escapeHtml(finding.disposition)}" data-package="${escapeHtml(finding.package)}" data-family="${escapeHtml(finding.changeFamily)}">
    <div class="rowhead"><span class="pill ${escapeHtml(finding.disposition)}">${escapeHtml(finding.disposition)}</span><strong>${escapeHtml(finding.changeFamily)}</strong></div>
    <p>${escapeHtml(finding.relationship)}</p>
    <div class="links">Code ${link(finding.code)} · Note ${link(finding.note)}</div>
    <details><summary>Evidence</summary>
      <div class="evidence"><section id="${escapeHtml(finding.note.id)}"><h4>Release note</h4><pre>${escapeHtml(finding.note.excerpt)}</pre></section>
      <section id="${escapeHtml(finding.code.id)}"><h4>Application code</h4><pre>${escapeHtml(finding.code.excerpt)}</pre></section></div>
      <p class="small">${escapeHtml(finding.reasons.join(" · "))}</p>
    </details>
  </article>`).join("\n");
  const options = (key: "package" | "disposition" | "changeFamily") => {
    const values = new Set(report.findings.map((f) => key === "changeFamily" ? f.changeFamily : f[key]));
    return [...values].sort().map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join("");
  };
  const limitations = report.coverageLimitations.map((x) => `<li>${escapeHtml(x)}</li>`).join("");
  const unknowns = report.unknownItems.map((x) => `<li>${escapeHtml(x)}</li>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Upgrade Radar report</title>
  <style>
  :root{color-scheme:dark;background:#0a0d12;color:#e9eef7;font-family:Inter,ui-sans-serif,system-ui,sans-serif}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 20% 0,#18263e 0,transparent 40%),#0a0d12}.wrap{max-width:1100px;margin:auto;padding:48px 24px 80px}.eyebrow{color:#91a4c5;text-transform:uppercase;letter-spacing:.13em;font-size:12px}.hero{display:grid;grid-template-columns:1.4fr .6fr;gap:24px;align-items:end;margin:18px 0 32px}.hero h1{font-size:clamp(44px,8vw,86px);letter-spacing:-.055em;line-height:.92;margin:0}.hero p{color:#b8c4d8;line-height:1.55}.fixture{border:1px solid #f2c94c;background:#2d260d;color:#ffe895;padding:12px 16px;font-weight:800;margin:20px 0}.stats{display:flex;gap:12px;flex-wrap:wrap}.stat,.filters,.finding,.panel{background:#111722;border:1px solid #263145;border-radius:14px}.stat{padding:12px 16px}.filters{padding:14px;display:flex;gap:12px;flex-wrap:wrap;margin:20px 0}.filters select{background:#0b111b;color:#eef4ff;border:1px solid #34435b;padding:9px 12px;border-radius:9px}.finding{padding:20px;margin:12px 0;box-shadow:0 14px 40px #0004}.rowhead{display:flex;gap:12px;align-items:center}.pill{font-size:12px;text-transform:uppercase;letter-spacing:.08em;padding:5px 9px;border-radius:999px}.review{background:#36260a;color:#ffd978}.no_direct_evidence{background:#0c2e28;color:#8ee8d5}.unknown{background:#38202a;color:#ffb6cc}.finding p{color:#c3cee0}.links{color:#8799b6;font-size:13px}.links a{color:#a9c7ff}.evidence{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px}.evidence section{min-width:0}pre{white-space:pre-wrap;word-break:break-word;background:#090d14;border:1px solid #202a3a;padding:14px;border-radius:10px;color:#d8e2f2}.panel{padding:18px;margin-top:24px}.panel h2{margin-top:0}.small{font-size:12px;color:#8090aa}@media(max-width:760px){.hero,.evidence{grid-template-columns:1fr}.wrap{padding:28px 16px}.hero h1{font-size:52px}}
  </style></head><body><main class="wrap"><div class="eyebrow">Evidence-linked dependency review</div>${badge}<div class="hero"><h1>Upgrade<br>Radar</h1><p>Find the application code worth reviewing when a dependency changes behavior. Evidence stays tied to exact code and note spans.</p></div>
  <div class="stats"><div class="stat"><strong>${report.upgrades.map((u)=>`${escapeHtml(u.package)} ${escapeHtml(u.from)} → ${escapeHtml(u.to)}`).join(" · ")}</strong></div><div class="stat">${report.counts.findings} rows</div><div class="stat">${report.counts.unknown} unknown</div><div class="stat">${report.complete ? "complete" : "incomplete"}</div></div>
  <div class="filters"><label>Package <select id="package"><option value="">all</option>${options("package")}</select></label><label>Disposition <select id="disposition"><option value="">all</option>${options("disposition")}</select></label><label>Change family <select id="family"><option value="">all</option>${options("changeFamily")}</select></label></div>
  <section id="queue">${rows || "<p>No evidence-linked rows.</p>"}</section>
  <section class="panel"><h2>Coverage limitations</h2><ul>${limitations || "<li>None reported.</li>"}</ul>${unknowns ? `<h2>Unknown items</h2><ul>${unknowns}</ul>` : ""}<p class="small">Advisory output only. no_direct_evidence applies to one note/site pair and does not mean an upgrade is safe to merge.</p></section></main>
  <script>for(const id of ['package','disposition','family'])document.getElementById(id).addEventListener('change',()=>{const p=document.getElementById('package').value,d=document.getElementById('disposition').value,f=document.getElementById('family').value;for(const row of document.querySelectorAll('.finding'))row.hidden=!!((p&&row.dataset.package!==p)||(d&&row.dataset.disposition!==d)||(f&&row.dataset.family!==f))});</script>
  </body></html>`;
}

export function writeReport(report: Report, outDir: string): void {
  validateReport(report);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(path.join(outDir, "report.md"), renderMarkdown(report));
  writeFileSync(path.join(outDir, "report.html"), renderHtml(report));
}
