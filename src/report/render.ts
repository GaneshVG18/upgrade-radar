import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Disposition, EvidenceSpan, Finding, Report, RunMode } from "../types.js";
import { escapeHtml, safeUrl } from "../core/util.js";

const dispositionLabels: Record<Disposition, string> = {
  review: "Needs review",
  no_direct_evidence: "No direct evidence",
  unknown: "Unknown"
};

const modeLabels: Record<RunMode, string> = {
  illustrative_fixture: "Illustrative fixture",
  baseline: "Deterministic baseline",
  jev: "Live Jev",
  dry_run: "Dry run"
};

const familyLabels: Record<string, string> = {
  "express-query-parser-default": "Query parser default",
  "express-wildcard-named": "Named wildcard routes",
  "express-app-del-removed": "Removed app.del method",
  "express-req-param-removed": "Removed req.param method",
  "zod-optional-default": "Optional field defaults",
  "zod-default-short-circuit": "Default short-circuiting",
  "zod-number-infinity": "Infinite number handling",
  "zod-record-one-arg": "Single-argument records"
};

const messageLabels: Record<string, string> = {
  authored_fixture_decision: "Authored fixture decision",
  executable_compatibility_fixture_confirms_old_new_output_difference: "Executable fixture confirms the old/new output difference",
  explicit_extended_query_parser_control: "Explicit extended query parser preserves the reviewed behavior",
  deterministic_family_and_resolved_package_usage_match: "Resolved package usage matches this documented behavior family",
  visible_query_parser_configuration_preserves_extended_parsing: "Visible query parser configuration preserves extended parsing",
  query_parser_configuration_is_not_literal: "Query parser configuration is not directly visible",
  jev_relevance_judgment_with_host_policy_v1: "Jev relevance judgment, validated by host policy v1",
  illustrative_fixture_decisions_are_authored_and_do_not_measure_jev_accuracy: "Illustrative decisions are authored and do not measure Jev accuracy",
  bounded_static_analysis_no_full_program_dataflow_or_call_graph: "Analysis is bounded and does not perform full-program dataflow or call-graph tracing",
  computed_imports_dynamic_requires_and_unresolved_wrappers_are_not_followed: "Computed imports, dynamic requires, and unresolved wrappers are not followed",
  workspaces_transitive_only_upgrades_and_non_npm_lockfiles_are_out_of_scope: "Workspaces, transitive-only upgrades, and non-npm lockfiles are outside this release's scope",
  supplied_notes_are_not_assumed_complete_for_intermediate_releases: "Supplied notes may not cover every intermediate release",
  selected_source_excerpts_leave_the_machine_in_live_jev_mode_and_secret_redaction_is_imperfect: "Live Jev mode sends selected source excerpts; secret redaction is intentionally conservative but imperfect",
  source_line_links_unavailable_without_supported_origin_remote: "Source line links are unavailable without a supported origin remote",
  source_line_links_unavailable_for_dirty_worktree: "Source line links are unavailable for a dirty working tree",
  notes_manifest_missing_or_hash_provenance_mismatch: "Notes provenance is unverified because the manifest is missing, malformed, or has a hash mismatch",
  generic_library_mode_has_no_express_or_zod_adapter_coverage_claim: "Generic library mode does not inherit Express or Zod adapter coverage claims"
};

function humanizeIdentifier(value: string): string {
  const known = familyLabels[value] ?? messageLabels[value];
  if (known) return known;
  if (value.startsWith("candidate_cap_reached:")) return `Candidate limit reached (${value.split(":")[1] ?? "unknown"})`;
  if (value.startsWith("source_inventory_truncated:")) return `Source inventory was truncated (${value.split(":")[1] ?? "unknown"} files)`;
  if (value.startsWith("missing_applicable_notes:")) {
    const [, packageName = "package", transition = "requested transition"] = value.split(":");
    return `No applicable reviewed notes were supplied for ${packageName} ${transition.replace("->", " → ")}`;
  }
  if (value.startsWith("unsupported_package_reference:")) {
    const [, packageName = "package", kind = "reference", source = "unknown location", line = ""] = value.split(":");
    const reference = kind === "dynamic_import" ? "dynamic import" : kind === "computed_require" ? "computed require" : kind.replaceAll("_", " ");
    return `Unsupported ${reference} for ${packageName} at ${source}${line ? `:${line}` : ""}`;
  }
  if (value.startsWith("provider_failure:")) return `Provider failure: ${value.slice("provider_failure:".length)}`;
  return value.replaceAll("_", " ").replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function findingTitle(finding: Finding): string {
  return familyLabels[finding.changeFamily] ?? humanizeIdentifier(finding.changeFamily);
}

function displayTimestamp(value: string): string {
  return value.replace("T", " ").replace(/\.\d{3}Z$/, " UTC");
}

function shortRevision(value: string): string {
  return /^[0-9a-f]{40}$/i.test(value) ? value.slice(0, 12) : value;
}

export function validateReport(report: Report): void {
  if (report.schemaVersion !== "upgrade-radar-report/v1") throw new Error("Unsupported report schema");
  if (!Array.isArray(report.findings) || !Array.isArray(report.coverageLimitations) || !Array.isArray(report.unknownItems)) throw new Error("Malformed report arrays");
  for (const finding of report.findings) {
    if (!finding.code.id || !finding.note.id || !finding.code.spanHash || !finding.note.spanHash) throw new Error("Finding is missing evidence provenance");
    if (!new Set(["review", "no_direct_evidence", "unknown"]).has(finding.disposition)) throw new Error("Invalid disposition");
  }
}

function evidenceLink(span: EvidenceSpan, targetId: string, label: string): string {
  const url = safeUrl(span.url);
  const text = `${escapeHtml(span.path)}:${span.startLine}-${span.endLine}`;
  return url
    ? `<a class="evidence-link" href="${escapeHtml(url)}" rel="noreferrer" aria-label="${escapeHtml(label)} at ${text}">${text}<span aria-hidden="true">↗</span></a>`
    : `<a class="evidence-link" href="#${targetId}" data-evidence-target="${targetId}" aria-label="${escapeHtml(label)} at ${text}">${text}</a>`;
}

function excerptLines(span: EvidenceSpan): string {
  return span.excerpt.split(/\r?\n/).map((line, index) => `<span class="code-line"><span class="line-number" aria-hidden="true">${span.startLine + index}</span><span class="line-text">${escapeHtml(line) || "&nbsp;"}</span></span>`).join("");
}

function options(report: Report, key: "package" | "disposition" | "changeFamily"): string {
  const values = new Set(report.findings.map((finding) => key === "changeFamily" ? finding.changeFamily : finding[key]));
  return [...values].sort().map((value) => {
    const label = key === "disposition" ? dispositionLabels[value as Disposition] : key === "changeFamily" ? (familyLabels[value] ?? humanizeIdentifier(value)) : value;
    return `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`;
  }).join("");
}

function renderFinding(finding: Finding, index: number): string {
  const rowId = `finding-${index + 1}`;
  const detailsId = `${rowId}-evidence`;
  const noteId = `${rowId}-note`;
  const codeId = `${rowId}-code`;
  const search = [finding.package, finding.changeFamily, findingTitle(finding), finding.relationship, finding.code.path, finding.note.path, ...finding.reasons].join(" ").toLowerCase();
  const reasons = finding.reasons.map((reason) => `<li title="${escapeHtml(reason)}">${escapeHtml(humanizeIdentifier(reason))}</li>`).join("");
  return `<article class="finding finding--${escapeHtml(finding.disposition)}" id="${rowId}" data-disposition="${escapeHtml(finding.disposition)}" data-package="${escapeHtml(finding.package)}" data-family="${escapeHtml(finding.changeFamily)}" data-search="${escapeHtml(search)}" data-finding-id="${escapeHtml(finding.id)}">
    <header class="finding-header">
      <div class="finding-heading">
        <span class="package-mark">${escapeHtml(finding.package)}</span>
        <h3>${escapeHtml(findingTitle(finding))}</h3>
      </div>
      <span class="status status--${escapeHtml(finding.disposition)}">${escapeHtml(dispositionLabels[finding.disposition])}</span>
    </header>
    <p class="relationship">${escapeHtml(finding.relationship)}</p>
    <div class="finding-sources" aria-label="Evidence locations">
      <span><span class="source-kind">Application</span>${evidenceLink(finding.code, codeId, "Application code")}</span>
      <span><span class="source-kind">Release note</span>${evidenceLink(finding.note, noteId, "Release note")}</span>
    </div>
    <details id="${detailsId}">
      <summary><span>Inspect evidence</span><span class="summary-hint" aria-hidden="true">note ↔ code</span></summary>
      <div class="evidence-grid">
        <section class="evidence-panel evidence-panel--note" id="${noteId}" tabindex="-1" data-provenance-id="${escapeHtml(finding.note.id)}">
          <div class="evidence-kicker">Reviewed release note</div>
          <h4>${escapeHtml(findingTitle(finding))}</h4>
          <pre><code>${excerptLines(finding.note)}</code></pre>
        </section>
        <section class="evidence-panel evidence-panel--code" id="${codeId}" tabindex="-1" data-provenance-id="${escapeHtml(finding.code.id)}">
          <div class="evidence-kicker">Application usage</div>
          <h4>${escapeHtml(finding.code.path)}</h4>
          <pre><code>${excerptLines(finding.code)}</code></pre>
        </section>
      </div>
      <div class="reason-block"><h4>Why this row appears</h4><ul>${reasons}</ul></div>
    </details>
  </article>`;
}

export function renderMarkdown(report: Report): string {
  const lines = [
    "# Upgrade Radar report",
    "",
    `Run mode: **${modeLabels[report.runMode]}**`,
    `Source revision: \`${report.sourceRevision}\``,
    `Complete: **${report.complete ? "yes" : "no"}**`,
    "",
    "## Upgrade",
    "",
    ...report.upgrades.map((upgrade) => `- \`${upgrade.package}\` ${upgrade.from} → ${upgrade.to}`),
    "",
    "## Review queue",
    ""
  ];
  if (report.findings.length === 0) lines.push("No evidence-linked candidates were found within the supported analysis surface.", "");
  for (const finding of report.findings) {
    lines.push(
      `### ${dispositionLabels[finding.disposition]}: ${findingTitle(finding)}`,
      "",
      finding.relationship,
      "",
      `- Code: \`${finding.code.path}:${finding.code.startLine}-${finding.code.endLine}\` (${finding.code.id})`,
      `- Note: \`${finding.note.path}:${finding.note.startLine}-${finding.note.endLine}\` (${finding.note.id})`,
      `- Reasons: ${finding.reasons.map(humanizeIdentifier).join(", ")}`,
      ""
    );
  }
  lines.push("## Coverage limitations", "", ...report.coverageLimitations.map((item) => `- ${humanizeIdentifier(item)}`), "");
  if (report.unknownItems.length > 0) lines.push("## Unknown items", "", ...report.unknownItems.map((item) => `- ${humanizeIdentifier(item)}`), "");
  lines.push("This report is advisory. A no-direct-evidence row applies only to one note/site pair and does not mean an upgrade is safe to merge.", "");
  return lines.join("\n");
}

export function renderHtml(report: Report): string {
  const reviewCount = report.findings.filter((finding) => finding.disposition === "review").length;
  const unknownFindingCount = report.findings.filter((finding) => finding.disposition === "unknown").length;
  const noDirectCount = report.findings.filter((finding) => finding.disposition === "no_direct_evidence").length;
  const rows = report.findings.map(renderFinding).join("\n");
  const upgradeCards = report.upgrades.map((upgrade) => `<li class="upgrade-card"><span class="upgrade-package">${escapeHtml(upgrade.package)}</span><span class="version old-version">${escapeHtml(upgrade.from)}</span><span class="upgrade-arrow" aria-hidden="true">→</span><span class="version new-version">${escapeHtml(upgrade.to)}</span></li>`).join("");
  const unknowns = report.unknownItems.map((item) => `<li title="${escapeHtml(item)}">${escapeHtml(humanizeIdentifier(item))}</li>`).join("");
  const limitations = report.coverageLimitations.map((item) => `<li title="${escapeHtml(item)}">${escapeHtml(humanizeIdentifier(item))}</li>`).join("");
  const illustrative = report.runMode === "illustrative_fixture" ? '<span class="fixture-badge">Illustrative fixture · no live Jev call</span>' : "";
  const incomplete = report.complete ? "" : `<section class="incomplete-notice" aria-labelledby="incomplete-title"><div class="notice-icon" aria-hidden="true">!</div><div><h2 id="incomplete-title">Analysis is incomplete</h2><p>Some evidence could not be resolved. Review the unknown items and coverage limits before relying on this queue.</p></div></section>`;
  const unknownPanel = report.unknownItems.length > 0 ? `<section class="unknown-panel" aria-labelledby="unknown-title"><div><p class="section-label">Requires attention</p><h2 id="unknown-title">Unresolved coverage</h2></div><ul>${unknowns}</ul></section>` : "";
  const unknownFilterNote = report.unknownItems.length > 0 ? '<span class="active-filter-note">Unresolved coverage above the queue remains visible while filtering.</span>' : "";
  const emptyQueue = report.findings.length === 0 ? '<div class="zero-state"><h3>No evidence-linked candidates</h3><p>No candidate usage was found within the supported analysis surface. This is not a compatibility guarantee.</p></div>' : "";
  const revision = shortRevision(report.sourceRevision);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Upgrade Radar · Dependency behavior review</title>
  <style>
  :root{color-scheme:light;--canvas:#f2eee5;--paper:#fffdf8;--paper-strong:#fffaf0;--ink:#172033;--muted:#667085;--line:#d7d0c4;--line-strong:#bdb4a5;--blue:#1859a9;--blue-soft:#e8f0fb;--amber:#815b00;--amber-soft:#fff0c7;--rose:#8a2948;--rose-soft:#ffe7ee;--code:#172033;--code-ink:#f6f1e6;--note:#f5ead3;--focus:#075fc7;--shadow:0 16px 42px rgba(54,45,30,.08);--font-display:"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif;--font-body:"Avenir Next","Trebuchet MS","Segoe UI",sans-serif;--font-mono:"SFMono-Regular",Consolas,"Liberation Mono",monospace}
  *{box-sizing:border-box}html{scroll-behavior:smooth;overflow-wrap:anywhere}body{margin:0;background:var(--canvas);color:var(--ink);font-family:var(--font-body);font-size:16px;line-height:1.55;overflow-x:hidden}.skip-link{position:fixed;left:1rem;top:1rem;z-index:20;transform:translateY(-180%);background:var(--ink);color:#fff;padding:.65rem 1rem;border-radius:.35rem}.skip-link:focus{transform:none}.shell{width:min(1180px,calc(100% - 40px));margin:0 auto;padding:22px 0 72px;min-width:0}.app-header{display:flex;align-items:center;justify-content:space-between;gap:24px;border-bottom:1px solid var(--line);padding:0 0 18px;min-width:0}.brand{display:flex;align-items:center;gap:12px;min-width:0}.brand-mark{width:38px;height:38px;color:var(--blue);flex:0 0 auto}.brand-name{font-family:var(--font-display);font-weight:700;font-size:1.45rem;letter-spacing:-.025em}.brand-subtitle{color:var(--muted);font-size:.78rem;letter-spacing:.08em;text-transform:uppercase}.run-meta{display:flex;align-items:center;justify-content:flex-end;gap:8px 18px;flex-wrap:wrap;color:var(--muted);font-size:.82rem;min-width:0}.run-meta strong{color:var(--ink)}.fixture-badge{display:inline-flex;align-items:center;border:1px solid #d9b75d;background:#fff6d9;color:#654900;border-radius:999px;padding:4px 9px;font-weight:700;font-size:.73rem}.intro{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:32px;align-items:end;padding:30px 0 22px}.intro h1{font-family:var(--font-display);font-size:clamp(2.25rem,5vw,4rem);line-height:.98;letter-spacing:-.045em;margin:0 0 10px;max-width:750px}.intro p{margin:0;color:var(--muted);max-width:680px}.analysis-state{border-left:3px solid var(--blue);padding:4px 0 4px 16px;min-width:190px}.analysis-state strong{display:block;font-size:1.05rem}.analysis-state span{color:var(--muted);font-size:.82rem}.upgrade-section{background:var(--paper);border:1px solid var(--line);box-shadow:var(--shadow);padding:18px 20px}.section-label{margin:0 0 4px;color:var(--blue);text-transform:uppercase;letter-spacing:.12em;font-size:.72rem;font-weight:800}.upgrade-section h2,.queue-heading h2,.unknown-panel h2,.incomplete-notice h2{font-family:var(--font-display);margin:0;letter-spacing:-.02em}.upgrade-list{list-style:none;padding:0;margin:14px 0 0;display:flex;gap:10px;flex-wrap:wrap}.upgrade-card{display:grid;grid-template-columns:auto auto auto auto;gap:9px;align-items:center;background:var(--paper-strong);border:1px solid var(--line);padding:9px 12px;min-width:0}.upgrade-package{font-weight:800}.version{font-family:var(--font-mono);font-size:.8rem}.old-version{color:var(--muted);text-decoration:line-through;text-decoration-thickness:1px}.new-version{color:var(--blue);font-weight:800}.upgrade-arrow{color:var(--line-strong)}.summary-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:1px;background:var(--line);border:1px solid var(--line);margin-top:16px}.summary-item{background:var(--paper);padding:14px 16px;min-width:0}.summary-value{display:block;font-family:var(--font-display);font-size:1.9rem;line-height:1}.summary-label{display:block;margin-top:5px;color:var(--muted);font-size:.78rem}.summary-item--review .summary-value{color:var(--amber)}.summary-item--unknown .summary-value{color:var(--rose)}.incomplete-notice{display:flex;gap:14px;align-items:flex-start;background:var(--rose-soft);border:1px solid #e8aabe;border-left:5px solid var(--rose);padding:16px 18px;margin-top:16px}.incomplete-notice h2{font-size:1.25rem}.incomplete-notice p{margin:3px 0 0;color:#612238}.notice-icon{display:grid;place-items:center;width:28px;height:28px;border-radius:50%;background:var(--rose);color:#fff;font-weight:900;flex:0 0 auto}.unknown-panel{display:grid;grid-template-columns:220px minmax(0,1fr);gap:24px;background:var(--paper);border:1px solid #e2a8ba;padding:18px 20px;margin-top:16px;min-width:0}.unknown-panel h2{font-size:1.35rem}.unknown-panel ul{margin:0;padding-left:20px;min-width:0}.unknown-panel li,.coverage li,.reason-block li{overflow-wrap:anywhere}.queue{margin-top:32px}.queue-heading{display:flex;align-items:end;justify-content:space-between;gap:20px;margin-bottom:12px}.queue-heading h2{font-size:1.8rem}.queue-heading p{margin:0;color:var(--muted)}.toolbar{display:grid;grid-template-columns:minmax(180px,1.4fr) repeat(3,minmax(140px,.8fr)) auto;gap:10px;align-items:end;background:var(--paper);border:1px solid var(--line);padding:14px;min-width:0}.field{display:grid;gap:5px;min-width:0}.field label{font-size:.72rem;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}input,select,button{font:inherit}input,select{width:100%;min-width:0;border:1px solid var(--line-strong);background:#fff;color:var(--ink);border-radius:0;padding:9px 10px;min-height:42px}.clear-button,.empty-clear{min-height:42px;border:1px solid var(--ink);background:transparent;color:var(--ink);padding:8px 14px;font-weight:800;cursor:pointer}.clear-button:disabled{opacity:.42;cursor:not-allowed}.filter-status{display:flex;justify-content:space-between;gap:16px;align-items:center;padding:10px 2px;color:var(--muted);font-size:.86rem}.active-filter-note{font-size:.76rem}.finding-list{display:grid;gap:12px;min-width:0}.finding{background:var(--paper);border:1px solid var(--line);border-left:5px solid var(--line-strong);box-shadow:0 8px 22px rgba(54,45,30,.04);padding:18px 20px;scroll-margin-top:18px;min-width:0;overflow:hidden}.finding--review{border-left-color:#c18a00}.finding--unknown{border-left-color:var(--rose)}.finding--no_direct_evidence{border-left-color:var(--blue)}.finding-header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;min-width:0}.finding-heading{display:flex;align-items:center;gap:10px;min-width:0}.finding-heading h3{font-family:var(--font-display);font-size:1.35rem;line-height:1.15;margin:0;overflow-wrap:anywhere}.package-mark{background:var(--ink);color:#fff;font-family:var(--font-mono);font-size:.72rem;padding:4px 7px;overflow-wrap:anywhere}.status{flex:0 0 auto;font-size:.7rem;font-weight:900;text-transform:uppercase;letter-spacing:.08em;padding:5px 8px}.status--review{background:var(--amber-soft);color:var(--amber)}.status--unknown{background:var(--rose-soft);color:var(--rose)}.status--no_direct_evidence{background:var(--blue-soft);color:#174a84}.relationship{margin:10px 0;color:#424c5f;overflow-wrap:anywhere}.finding-sources{display:flex;gap:12px 22px;flex-wrap:wrap;font-size:.82rem;min-width:0}.finding-sources>span{display:flex;align-items:center;gap:7px;min-width:0}.source-kind{color:var(--muted);font-size:.7rem;text-transform:uppercase;letter-spacing:.08em;font-weight:800;flex:0 0 auto}.evidence-link{color:var(--blue);text-underline-offset:3px;overflow-wrap:anywhere;min-width:0}.evidence-link span{font-size:.75rem;margin-left:3px}details{margin-top:13px;border-top:1px solid var(--line);padding-top:10px;min-width:0}summary{display:flex;align-items:center;justify-content:space-between;gap:12px;cursor:pointer;font-weight:800;color:var(--blue);list-style:none}summary::-webkit-details-marker{display:none}summary::before{content:"+";display:inline-grid;place-items:center;width:20px;height:20px;border:1px solid currentColor;margin-right:8px;flex:0 0 auto}details[open] summary::before{content:"−"}.summary-hint{margin-left:auto;color:var(--muted);font-size:.72rem;font-weight:600}.evidence-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px;margin-top:14px;min-width:0}.evidence-panel{min-width:0;padding:16px;scroll-margin-top:18px;overflow:hidden}.evidence-panel:target,.evidence-panel:focus{outline:3px solid var(--focus);outline-offset:2px}.evidence-panel--note{background:var(--note);border:1px solid #dfcdaa}.evidence-panel--code{background:var(--code);color:var(--code-ink);border:1px solid var(--code)}.evidence-kicker{font-size:.68rem;text-transform:uppercase;letter-spacing:.12em;font-weight:900;opacity:.72}.evidence-panel h4{font-family:var(--font-display);font-size:1.05rem;margin:4px 0 12px;overflow-wrap:anywhere}.evidence-panel pre{margin:0;white-space:pre-wrap;word-break:break-word;overflow-wrap:anywhere;max-width:100%;font:inherit}.evidence-panel code{display:grid;font-family:var(--font-mono);font-size:.78rem;line-height:1.6;min-width:0}.code-line{display:grid;grid-template-columns:3ch minmax(0,1fr);gap:10px;min-width:0}.line-number{user-select:none;text-align:right;opacity:.5}.line-text{min-width:0;overflow-wrap:anywhere;word-break:break-word}.reason-block{margin-top:12px;border:1px solid var(--line);background:#faf8f2;padding:12px 14px;min-width:0}.reason-block h4{margin:0 0 5px;font-size:.78rem;text-transform:uppercase;letter-spacing:.08em}.reason-block ul{margin:0;padding-left:18px;color:var(--muted);font-size:.83rem}.empty-state,.zero-state{border:1px dashed var(--line-strong);background:var(--paper);padding:30px;text-align:center}.empty-state h3,.zero-state h3{font-family:var(--font-display);font-size:1.4rem;margin:0}.empty-state p,.zero-state p{color:var(--muted);margin:5px auto 14px;max-width:560px}.coverage{margin-top:24px;background:var(--paper);border:1px solid var(--line);padding:14px 18px;min-width:0}.coverage summary{color:var(--ink)}.coverage ul{columns:2;column-gap:36px;margin:16px 0 2px;padding-left:20px;color:var(--muted);font-size:.85rem;min-width:0}.advisory{margin-top:18px;padding-top:16px;border-top:1px solid var(--line);color:var(--muted);font-size:.78rem;overflow-wrap:anywhere}.sr-only{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important}[hidden]{display:none!important}a:focus-visible,button:focus-visible,input:focus-visible,select:focus-visible,summary:focus-visible{outline:3px solid var(--focus);outline-offset:3px}@media(prefers-contrast:more){:root{--ink:#000;--muted:#343434;--line:#6c6c6c;--focus:#0000c7}a{text-decoration-thickness:2px}.finding{border-width:2px;border-left-width:6px}}@media(max-width:900px){.toolbar{grid-template-columns:1fr 1fr}.search-field{grid-column:1/-1}.clear-button{width:100%}.summary-grid{grid-template-columns:repeat(3,1fr)}.unknown-panel{grid-template-columns:1fr}.coverage ul{columns:1}}@media(max-width:620px){.shell{width:min(100% - 24px,1180px);padding-top:12px}.app-header{align-items:flex-start}.brand-subtitle{display:none}.run-meta{display:grid;gap:2px;text-align:right;max-width:58%;font-size:.74rem}.run-meta .generated{font-size:.7rem}.fixture-badge{white-space:normal}.intro{grid-template-columns:1fr;gap:14px;padding:22px 0 16px}.intro h1{font-size:2.45rem}.analysis-state{border-left:0;border-top:3px solid var(--blue);padding:10px 0 0}.upgrade-section{padding:15px}.upgrade-list{display:grid}.upgrade-card{grid-template-columns:minmax(0,1fr) auto auto auto}.summary-grid{grid-template-columns:1fr 1fr}.summary-item{padding:12px}.toolbar{grid-template-columns:1fr}.search-field{grid-column:auto}.queue-heading{align-items:flex-start;flex-direction:column;gap:2px}.finding{padding:15px 14px}.finding-header{display:grid}.status{justify-self:start}.finding-heading{align-items:flex-start;flex-wrap:wrap}.finding-sources{display:grid;gap:6px}.finding-sources>span{align-items:flex-start;flex-wrap:wrap}.evidence-grid{grid-template-columns:minmax(0,1fr)}.summary-hint{display:none}.filter-status{align-items:flex-start;flex-direction:column;gap:2px}}@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}
  </style></head><body><a class="skip-link" href="#review-queue">Skip to review queue</a><div class="shell">
  <header class="app-header"><div class="brand"><svg class="brand-mark" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="19" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="24" cy="24" r="11" fill="none" stroke="currentColor" stroke-width="2" opacity=".55"/><path d="M24 24 38 15" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><circle cx="24" cy="24" r="3" fill="currentColor"/></svg><div><div class="brand-name">Upgrade Radar</div><div class="brand-subtitle">Evidence-linked dependency review</div></div></div><div class="run-meta">${illustrative}<span><strong>${escapeHtml(modeLabels[report.runMode])}</strong></span><span title="${escapeHtml(report.sourceRevision)}">Revision <strong>${escapeHtml(revision)}</strong></span><time class="generated" datetime="${escapeHtml(report.generatedAt)}">${escapeHtml(displayTimestamp(report.generatedAt))}</time></div></header>
  <main><section class="intro" aria-labelledby="page-title"><div><p class="section-label">Dependency behavior review</p><h1 id="page-title">Find the application code worth reviewing.</h1><p>Migration notes are connected to resolved package usage, exact source lines, and explicit gaps in evidence.</p></div><div class="analysis-state"><strong>${report.complete ? "Analysis complete" : "Analysis incomplete"}</strong><span>Advisory result · not a compatibility approval</span></div></section>
  <section class="upgrade-section" aria-labelledby="upgrade-title"><p class="section-label">Analyzed transition${report.upgrades.length === 1 ? "" : "s"}</p><h2 id="upgrade-title">Upgrade scope</h2><ul class="upgrade-list">${upgradeCards}</ul></section>
  <section class="summary-grid" aria-label="Review summary"><div class="summary-item summary-item--review"><strong class="summary-value">${reviewCount}</strong><span class="summary-label">Need review</span></div><div class="summary-item summary-item--unknown"><strong class="summary-value">${unknownFindingCount}</strong><span class="summary-label">Unknown findings</span></div><div class="summary-item summary-item--unknown"><strong class="summary-value">${report.unknownItems.length}</strong><span class="summary-label">Coverage unknowns</span></div><div class="summary-item"><strong class="summary-value">${noDirectCount}</strong><span class="summary-label">No direct evidence</span></div><div class="summary-item"><strong class="summary-value">${report.findings.length}</strong><span class="summary-label">Evidence-linked rows</span></div></section>
  ${incomplete}${unknownPanel}
  <section class="queue" id="review-queue" aria-labelledby="queue-title"><div class="queue-heading"><div><p class="section-label">Evidence queue</p><h2 id="queue-title">Review findings</h2></div><p>Open a row to compare the note with application code.</p></div>
  <form class="toolbar" id="filters" role="search"><div class="field search-field"><label for="search">Search findings</label><input id="search" type="search" placeholder="Package, behavior, file…" autocomplete="off"></div><div class="field"><label for="package">Package</label><select id="package"><option value="">All packages</option>${options(report, "package")}</select></div><div class="field"><label for="disposition">Status</label><select id="disposition"><option value="">All statuses</option>${options(report, "disposition")}</select></div><div class="field"><label for="family">Behavior</label><select id="family"><option value="">All behaviors</option>${options(report, "changeFamily")}</select></div><button class="clear-button" id="clear-filters" type="button" disabled>Clear filters</button></form>
  <div class="filter-status"><span id="result-count" role="status" aria-live="polite">Showing ${report.findings.length} of ${report.findings.length} findings</span>${unknownFilterNote}</div>
  <div class="finding-list" id="finding-list">${rows}</div>${emptyQueue}<div class="empty-state" id="empty-filter-state" hidden><h3>No findings match these filters</h3><p>Adjust the search or clear the filters to return to the full evidence queue.</p><button type="button" class="empty-clear" id="empty-clear">Clear filters</button></div></section>
  <details class="coverage"><summary>Coverage limits <span class="summary-hint">${report.coverageLimitations.length} reported</span></summary><ul>${limitations || "<li>No additional coverage limits were reported.</li>"}</ul></details>
  <p class="advisory">This report is advisory. “No direct evidence” applies only to the evaluated note/site pair and does not mean an upgrade is safe to merge. Analysis completeness describes processing coverage, not application compatibility.</p>
  </main></div><script>
  (()=>{const form=document.getElementById('filters'),search=document.getElementById('search'),packageSelect=document.getElementById('package'),disposition=document.getElementById('disposition'),family=document.getElementById('family'),clear=document.getElementById('clear-filters'),emptyClear=document.getElementById('empty-clear'),empty=document.getElementById('empty-filter-state'),count=document.getElementById('result-count'),rows=[...document.querySelectorAll('.finding')],total=rows.length;const update=()=>{const query=search.value.trim().toLowerCase(),pkg=packageSelect.value,status=disposition.value,behavior=family.value;let visible=0;for(const row of rows){const matches=(!query||row.dataset.search.includes(query))&&(!pkg||row.dataset.package===pkg)&&(!status||row.dataset.disposition===status)&&(!behavior||row.dataset.family===behavior);row.hidden=!matches;if(matches)visible+=1}const active=Boolean(query||pkg||status||behavior);count.textContent='Showing '+visible+' of '+total+' findings';empty.hidden=visible!==0||total===0;clear.disabled=!active};const reset=()=>{form.reset();update();search.focus()};const revealHash=(focus)=>{if(!location.hash)return;let id;try{id=decodeURIComponent(location.hash.slice(1))}catch{return}const target=document.getElementById(id);if(!target||!target.classList.contains('evidence-panel'))return;const details=target.closest('details');if(details)details.open=true;requestAnimationFrame(()=>{if(focus)target.focus({preventScroll:true});target.scrollIntoView({block:'center'})})};form.addEventListener('submit',(event)=>event.preventDefault());form.addEventListener('input',update);form.addEventListener('change',update);clear.addEventListener('click',reset);emptyClear.addEventListener('click',reset);document.addEventListener('click',(event)=>{const link=event.target.closest('[data-evidence-target]');if(!link)return;const target=document.getElementById(link.dataset.evidenceTarget);if(!target)return;event.preventDefault();history.replaceState(null,'','#'+target.id);revealHash(true)});window.addEventListener('hashchange',()=>revealHash(true));update();revealHash(false)})();
  </script></body></html>`;
}

export function writeReport(report: Report, outDir: string): void {
  validateReport(report);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(path.join(outDir, "report.md"), renderMarkdown(report));
  writeFileSync(path.join(outDir, "report.html"), renderHtml(report));
}
