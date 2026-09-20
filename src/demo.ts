import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { EvidenceSpan, Finding, Report } from "./types.js";
import { lineRange, sha256, shortHash } from "./core/util.js";

function projectRoot(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.basename(here) === "dist" ? path.dirname(here) : path.dirname(here);
}

function fixtureSpan(filePath: string, search: string, kind: "code" | "note"): EvidenceSpan {
  const content = readFileSync(filePath, "utf8");
  const lines = content.split(/\r?\n/);
  const index = lines.findIndex((line) => line.includes(search));
  if (index < 0) throw new Error(`Demo fixture search text not found: ${search}`);
  const excerpt = lineRange(content, index + 1, index + 1);
  const relativePath = path.relative(projectRoot(), filePath).replaceAll(path.sep, "/");
  return {
    id: `${kind}-${shortHash(`${relativePath}:${index + 1}:${excerpt}`)}`,
    kind,
    path: relativePath,
    startLine: index + 1,
    endLine: index + 1,
    sourceHash: sha256(content),
    spanHash: sha256(excerpt),
    excerpt
  };
}

export function illustrativeDemoReport(): Report {
  const root = projectRoot();
  const expressFile = path.join(root, "examples/express-app/src/app.ts");
  const zodFile = path.join(root, "examples/zod-app/src/schema.ts");
  const expressNote = path.join(root, "examples/notes/express-5.md");
  const zodNote = path.join(root, "examples/notes/zod-4.md");
  const findings: Finding[] = [
    {
      id: "demo-express-query-review",
      package: "express",
      changeFamily: "express-query-parser-default",
      disposition: "review",
      relationship: "Express 5 changes the default query parser; this handler reads a nested query object without an explicit extended-parser setting.",
      code: fixtureSpan(expressFile, "req.query.filters", "code"),
      note: fixtureSpan(expressNote, "simple query parser by default", "note"),
      reasons: ["authored_fixture_decision", "executable_compatibility_fixture_confirms_old_new_output_difference"]
    },
    {
      id: "demo-express-control",
      package: "express",
      changeFamily: "express-query-parser-default",
      disposition: "no_direct_evidence",
      relationship: "This control app explicitly selects the extended query parser, preserving the nested query shape covered by the note.",
      code: fixtureSpan(expressFile, "query parser", "code"),
      note: fixtureSpan(expressNote, "simple query parser by default", "note"),
      reasons: ["authored_fixture_decision", "explicit_extended_query_parser_control"]
    },
    {
      id: "demo-zod-optional-default",
      package: "zod",
      changeFamily: "zod-optional-default",
      disposition: "review",
      relationship: "Zod 4 applies a default inside an optional object field; this schema uses that exact shape and changes parsed output.",
      code: fixtureSpan(zodFile, ".default('dark').optional()", "code"),
      note: fixtureSpan(zodNote, "defaults inside optional object fields", "note"),
      reasons: ["authored_fixture_decision", "executable_compatibility_fixture_confirms_old_new_output_difference"]
    }
  ];
  return {
    schemaVersion: "upgrade-radar-report/v1",
    runMode: "illustrative_fixture",
    generatedAt: new Date().toISOString(),
    sourceRevision: "authored-demo-fixtures",
    upgrades: [
      { package: "express", from: "4.21.2", to: "5.1.0" },
      { package: "zod", from: "3.25.76", to: "4.1.5" }
    ],
    noteProvenance: [],
    counts: { scanned: 2, skipped: 0, truncated: 0, candidates: findings.length, findings: findings.length, unknown: 0 },
    complete: true,
    findings,
    unknownItems: [],
    coverageLimitations: [
      "illustrative_fixture_decisions_are_authored_and_do_not_measure_jev_accuracy",
      "bounded_static_analysis_no_full_program_dataflow_or_call_graph",
      "computed_imports_dynamic_requires_and_unresolved_wrappers_are_not_followed"
    ]
  };
}
