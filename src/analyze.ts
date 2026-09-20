import path from "node:path";
import { analyzeUsageSites } from "./adapters/index.js";
import { validateLocalDependencyFacts } from "./core/dependency.js";
import { safeUrl, sha256, shortHash } from "./core/util.js";
import { parseNotes } from "./notes/parser.js";
import { workingTreeSnapshot } from "./source/inventory.js";
import type { Candidate, Finding, NoteDocument, Provider, Report, RunMode, SourceSnapshot, Upgrade } from "./types.js";

const MAX_CANDIDATES = 200;
const commonLimitations = [
  "bounded_static_analysis_no_full_program_dataflow_or_call_graph",
  "computed_imports_dynamic_requires_and_unresolved_wrappers_are_not_followed",
  "workspaces_transitive_only_upgrades_and_non_npm_lockfiles_are_out_of_scope",
  "supplied_notes_are_not_assumed_complete_for_intermediate_releases",
  "selected_source_excerpts_leave_the_machine_in_live_jev_mode_and_secret_redaction_is_imperfect"
];

interface PreparedAnalysis {
  upgrade: Upgrade;
  notes: NoteDocument;
  snapshot: SourceSnapshot;
  candidates: Candidate[];
  limitations: string[];
  hardIncomplete: boolean;
}

export interface AnalyzeOptions {
  repo: string;
  upgrade: Upgrade;
  notesPath: string;
  provider: Provider;
  runMode: RunMode;
  snapshot?: SourceSnapshot;
  skipDependencyValidation?: boolean;
}

function prepare(options: Omit<AnalyzeOptions, "provider" | "runMode">): PreparedAnalysis {
  const notes = parseNotes(options.notesPath);
  if (notes.package !== options.upgrade.package || notes.from !== options.upgrade.from || notes.to !== options.upgrade.to) {
    throw new Error(`Notes applicability mismatch: notes are ${notes.package} ${notes.from}->${notes.to}`);
  }
  const factLimitations = options.skipDependencyValidation ? [] : validateLocalDependencyFacts(options.repo, options.upgrade);
  const snapshot = options.snapshot ?? workingTreeSnapshot(options.repo);
  const usageSites = analyzeUsageSites(snapshot.files, options.upgrade.package);
  const cleanRevision = /^[0-9a-f]{40}$/i.test(snapshot.revision);
  if (snapshot.sourceWebBase && cleanRevision) {
    for (const usage of usageSites) {
      const fullPath = [snapshot.repositoryPrefix, usage.span.path].filter(Boolean).join("/");
      const encodedPath = fullPath.split("/").map(encodeURIComponent).join("/");
      const lineAnchor = usage.span.startLine === usage.span.endLine
        ? `#L${usage.span.startLine}`
        : `#L${usage.span.startLine}-L${usage.span.endLine}`;
      const url = safeUrl(`${snapshot.sourceWebBase}/blob/${snapshot.revision}/${encodedPath}${lineAnchor}`);
      if (url) usage.span.url = url;
    }
  }
  const candidates: Candidate[] = [];
  let capped = false;
  for (const note of notes.blocks) {
    const matching = usageSites.filter((usage) => note.family === "generic" || usage.family === note.family);
    for (const usage of matching) {
      if (candidates.length >= MAX_CANDIDATES) { capped = true; break; }
      candidates.push({
        id: `candidate-${shortHash(`${options.upgrade.package}:${note.span.id}:${usage.span.id}`)}`,
        upgrade: options.upgrade,
        note,
        usage
      });
    }
    if (capped) break;
  }
  const limitations = [...commonLimitations, ...factLimitations, ...snapshot.limitations];
  let hardIncomplete = snapshot.truncatedCount > 0;
  if (!notes.provenanceVerified) {
    limitations.push("notes_manifest_missing_or_hash_provenance_mismatch");
    hardIncomplete = true;
  }
  if (capped) {
    limitations.push(`candidate_cap_reached:${MAX_CANDIDATES}`);
    hardIncomplete = true;
  }
  if (options.upgrade.package !== "express" && options.upgrade.package !== "zod") {
    limitations.push("generic_library_mode_has_no_express_or_zod_adapter_coverage_claim");
  }
  if (!cleanRevision) limitations.push("source_line_links_unavailable_for_dirty_worktree");
  else if (!snapshot.sourceWebBase) limitations.push("source_line_links_unavailable_without_supported_origin_remote");
  return { upgrade: options.upgrade, notes, snapshot, candidates, limitations, hardIncomplete };
}

function verifyEvidence(candidate: Candidate, prepared: PreparedAnalysis): void {
  if (candidate.note.span.sourceHash !== prepared.notes.sha256) throw new Error(`Note source hash changed: ${candidate.note.span.id}`);
  const source = prepared.snapshot.files.find((file) => file.path === candidate.usage.span.path);
  if (!source || source.sha256 !== candidate.usage.span.sourceHash) throw new Error(`Code source hash changed: ${candidate.usage.span.id}`);
  if (sha256(candidate.note.span.excerpt) !== candidate.note.span.spanHash) throw new Error(`Note span hash changed: ${candidate.note.span.id}`);
  if (sha256(candidate.usage.span.excerpt) !== candidate.usage.span.spanHash) throw new Error(`Code span hash changed: ${candidate.usage.span.id}`);
}

export async function analyzeUpgrade(options: AnalyzeOptions): Promise<{ report: Report; providerFailure: boolean }> {
  const prepared = prepare(options);
  const findings: Finding[] = [];
  let providerFailure = false;
  for (const candidate of prepared.candidates) {
    verifyEvidence(candidate, prepared);
    const relationship = `The supplied ${candidate.upgrade.package} note family '${candidate.note.family}' is linked to resolved package usage '${candidate.usage.symbol}' at ${candidate.usage.span.path}:${candidate.usage.span.startLine}.`;
    try {
      const judgment = await options.provider.judge(candidate);
      findings.push({
        id: `finding-${shortHash(`${candidate.id}:${judgment.disposition}`)}`,
        package: candidate.upgrade.package,
        changeFamily: candidate.note.family,
        disposition: judgment.disposition,
        relationship,
        code: candidate.usage.span,
        note: candidate.note.span,
        ...(judgment.semantic ? { semantic: judgment.semantic } : {}),
        reasons: judgment.reasons
      });
    } catch (error) {
      providerFailure = true;
      findings.push({
        id: `finding-${shortHash(`${candidate.id}:provider-failure`)}`,
        package: candidate.upgrade.package,
        changeFamily: candidate.note.family,
        disposition: "unknown",
        relationship,
        code: candidate.usage.span,
        note: candidate.note.span,
        reasons: [`provider_failure:${error instanceof Error ? error.name : "unknown"}`]
      });
    }
  }
  const unknownItems = findings.filter((f) => f.disposition === "unknown").map((f) => `${f.id}:${f.reasons.join("|")}`);
  const complete = !prepared.hardIncomplete && unknownItems.length === 0 && !providerFailure;
  const report: Report = {
    schemaVersion: "upgrade-radar-report/v1",
    runMode: options.runMode,
    generatedAt: new Date().toISOString(),
    sourceRevision: prepared.snapshot.revision,
    upgrades: [prepared.upgrade],
    noteProvenance: [{
      path: path.basename(prepared.notes.path),
      package: prepared.notes.package,
      from: prepared.notes.from,
      to: prepared.notes.to,
      sourceUrl: prepared.notes.sourceUrl,
      retrieved: prepared.notes.retrieved,
      sha256: prepared.notes.sha256,
      verified: prepared.notes.provenanceVerified
    }],
    counts: {
      scanned: prepared.snapshot.scannedCount,
      skipped: prepared.snapshot.skippedCount,
      truncated: prepared.snapshot.truncatedCount,
      candidates: prepared.candidates.length,
      findings: findings.length,
      unknown: unknownItems.length
    },
    complete,
    findings,
    unknownItems,
    coverageLimitations: prepared.limitations
  };
  return { report, providerFailure };
}

export function dryRunPlan(options: Omit<AnalyzeOptions, "runMode">) {
  const prepared = prepare(options);
  return {
    runMode: "dry_run" as const,
    sourceRevision: prepared.snapshot.revision,
    upgrade: prepared.upgrade,
    candidateCount: prepared.candidates.length,
    coverageLimitations: prepared.limitations,
    payloads: prepared.candidates.map((candidate) => ({ candidateId: candidate.id, payload: options.provider.payload(candidate) }))
  };
}

export function mergeReports(reports: Report[], mode: RunMode): Report {
  if (reports.length === 0) throw new Error("No supported direct dependency upgrades were found");
  const findings = reports.flatMap((report) => report.findings);
  const unknownItems = reports.flatMap((report) => report.unknownItems);
  return {
    schemaVersion: "upgrade-radar-report/v1",
    runMode: mode,
    generatedAt: new Date().toISOString(),
    sourceRevision: reports[0]!.sourceRevision,
    upgrades: reports.flatMap((report) => report.upgrades),
    noteProvenance: reports.flatMap((report) => report.noteProvenance),
    counts: {
      scanned: Math.max(...reports.map((report) => report.counts.scanned)),
      skipped: Math.max(...reports.map((report) => report.counts.skipped)),
      truncated: Math.max(...reports.map((report) => report.counts.truncated)),
      candidates: reports.reduce((sum, report) => sum + report.counts.candidates, 0),
      findings: findings.length,
      unknown: unknownItems.length
    },
    complete: reports.every((report) => report.complete),
    findings,
    unknownItems,
    coverageLimitations: [...new Set(reports.flatMap((report) => report.coverageLimitations))]
  };
}
