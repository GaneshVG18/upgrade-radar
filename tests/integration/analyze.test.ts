import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { analyzeUpgrade } from "../../src/analyze.js";
import { sha256 } from "../../src/core/util.js";
import { BaselineProvider } from "../../src/providers/baseline.js";
import { renderHtml, validateReport } from "../../src/report/render.js";
import { workingTreeSnapshot } from "../../src/source/inventory.js";
import type { Provider, Report } from "../../src/types.js";

function fixtureRepo() {
  const root = mkdtempSync(path.join(tmpdir(), "upgrade-radar-int-"));
  mkdirSync(path.join(root, "src"));
  writeFileSync(path.join(root, "package.json"), '{"name":"fixture","dependencies":{"express":"4.21.2"}}\n');
  writeFileSync(path.join(root, "package-lock.json"), '{"lockfileVersion":3,"packages":{"":{"dependencies":{"express":"4.21.2"}},"node_modules/express":{"version":"4.21.2"}}}\n');
  writeFileSync(path.join(root, "src/app.ts"), 'import express from "express";\nconst app=express();\napp.get("/q",(req,res)=>res.json(req.query.filters));\n');
  const note = '---\npackage: express\nfrom: 4.21.2\nto: 5.1.0\nsource: https://example.com/express\nretrieved: 2026-09-20\n---\n\n# Query\n\nFamily: express-query-parser-default\n\nThe default parser changed.\n';
  writeFileSync(path.join(root, "notes.md"), note);
  writeFileSync(path.join(root, "notes-manifest.json"), JSON.stringify({ documents: [{ file: "notes.md", package: "express", from: "4.21.2", to: "5.1.0", sourceUrl: "https://example.com/express", retrieved: "2026-09-20", sha256: sha256(note) }] }));
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: root });
  execFileSync("git", ["config", "user.email", "fixture@example.com"], { cwd: root });
  execFileSync("git", ["config", "user.name", "Fixture"], { cwd: root });
  execFileSync("git", ["add", "."], { cwd: root });
  execFileSync("git", ["commit", "-qm", "fixture"], { cwd: root });
  execFileSync("git", ["remote", "add", "origin", "https://github.com/example/fixture.git"], { cwd: root });
  return root;
}

describe("analysis integration", () => {
  it("builds an evidence-linked baseline report", async () => {
    const root = fixtureRepo();
    const { report } = await analyzeUpgrade({ repo: root, upgrade: { package: "express", from: "4.21.2", to: "5.1.0" }, notesPath: path.join(root, "notes.md"), provider: new BaselineProvider(), runMode: "baseline" });
    expect(report.complete).toBe(true);
    expect(report.findings).toHaveLength(1);
    expect(report.findings[0]?.disposition).toBe("review");
    expect(report.noteProvenance[0]?.verified).toBe(true);
    const revision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
    expect(report.findings[0]?.code.url).toBe(`https://github.com/example/fixture/blob/${revision}/src/app.ts#L3`);
    expect(() => validateReport(report)).not.toThrow();
  });

  it("builds revision-pinned source links only for supported remote URL shapes", async () => {
    const root = fixtureRepo();
    const revision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();

    execFileSync("git", ["remote", "set-url", "origin", "https://gitlab.com/example/fixture.git"], { cwd: root });
    const gitlab = await analyzeUpgrade({ repo: root, upgrade: { package: "express", from: "4.21.2", to: "5.1.0" }, notesPath: path.join(root, "notes.md"), provider: new BaselineProvider(), runMode: "baseline" });
    expect(gitlab.report.findings[0]?.code.url).toBe(`https://gitlab.com/example/fixture/-/blob/${revision}/src/app.ts#L3`);

    execFileSync("git", ["remote", "set-url", "origin", "https://example.com/example/fixture.git"], { cwd: root });
    const unsupported = await analyzeUpgrade({ repo: root, upgrade: { package: "express", from: "4.21.2", to: "5.1.0" }, notesPath: path.join(root, "notes.md"), provider: new BaselineProvider(), runMode: "baseline" });
    expect(unsupported.report.findings[0]?.code.url).toBeUndefined();
    expect(unsupported.report.coverageLimitations).toContain("source_line_links_unavailable_without_supported_origin_remote");
  });

  it("keeps a provider failure visible as unknown and incomplete", async () => {
    const root = fixtureRepo();
    const provider: Provider = { name: "jev", payload: (candidate) => new BaselineProvider().payload(candidate), judge: async () => { throw new Error("429"); } };
    const { report, providerFailure } = await analyzeUpgrade({ repo: root, upgrade: { package: "express", from: "4.21.2", to: "5.1.0" }, notesPath: path.join(root, "notes.md"), provider, runMode: "jev" });
    expect(providerFailure).toBe(true);
    expect(report.complete).toBe(false);
    expect(report.findings[0]?.disposition).toBe("unknown");
  });

  it("rejects notes that do not apply to the exact requested transition", async () => {
    const root = fixtureRepo();
    await expect(analyzeUpgrade({ repo: root, upgrade: { package: "express", from: "4.21.2", to: "5.2.0" }, notesPath: path.join(root, "notes.md"), provider: new BaselineProvider(), runMode: "baseline" })).rejects.toThrow(/Notes applicability mismatch/);
  });

  it("continues a partial provider batch and preserves successful rows", async () => {
    const root = fixtureRepo();
    writeFileSync(path.join(root, "src/app.ts"), 'import express from "express";\nconst app=express();\napp.get("/q1",(req,res)=>res.json(req.query.a));\napp.get("/q2",(req,res)=>res.json(req.query.b));\n');
    execFileSync("git", ["add", "."], { cwd: root });
    execFileSync("git", ["commit", "-qm", "two candidates"], { cwd: root });
    let calls = 0;
    const baseline = new BaselineProvider();
    const provider: Provider = {
      name: "jev",
      payload: (candidate) => baseline.payload(candidate),
      judge: async (candidate) => {
        calls += 1;
        if (calls === 1) throw new Error("timeout");
        return baseline.judge(candidate);
      }
    };
    const { report, providerFailure } = await analyzeUpgrade({ repo: root, upgrade: { package: "express", from: "4.21.2", to: "5.1.0" }, notesPath: path.join(root, "notes.md"), provider, runMode: "jev" });
    expect(providerFailure).toBe(true);
    expect(report.findings).toHaveLength(2);
    expect(report.findings.map((finding) => finding.disposition).sort()).toEqual(["review", "unknown"]);
  });

  it("escapes repository text in standalone HTML", async () => {
    const root = fixtureRepo();
    writeFileSync(path.join(root, "src/app.ts"), 'import express from "express";\nconst app=express();\napp.get("/q",(req,res)=>res.json(req.query["<script>alert(1)</script>"]));\n');
    execFileSync("git", ["add", "."], { cwd: root });
    execFileSync("git", ["commit", "-qm", "html"], { cwd: root });
    const { report } = await analyzeUpgrade({ repo: root, upgrade: { package: "express", from: "4.21.2", to: "5.1.0" }, notesPath: path.join(root, "notes.md"), provider: new BaselineProvider(), runMode: "baseline" });
    const html = renderHtml(report);
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it("renders shared evidence as unique per-finding navigation targets", async () => {
    const root = fixtureRepo();
    const { report } = await analyzeUpgrade({ repo: root, upgrade: { package: "express", from: "4.21.2", to: "5.1.0" }, notesPath: path.join(root, "notes.md"), provider: new BaselineProvider(), runMode: "baseline" });
    const first = report.findings[0]!;
    const localEvidence = { ...first, code: { ...first.code }, note: { ...first.note } };
    delete localEvidence.code.url;
    delete localEvidence.note.url;
    const shared: Report = {
      ...report,
      findings: [localEvidence, { ...localEvidence, id: `${first.id}-second` }],
      counts: { ...report.counts, findings: 2, candidates: 2 }
    };
    const html = renderHtml(shared);
    expect(html.match(/id="finding-1-note"/g)).toHaveLength(1);
    expect(html.match(/id="finding-2-note"/g)).toHaveLength(1);
    expect(html).toContain('href="#finding-1-note" data-evidence-target="finding-1-note"');
    expect(html).toContain('href="#finding-2-note" data-evidence-target="finding-2-note"');
    expect(html.match(new RegExp(`data-provenance-id="${first.note.id}"`, "g"))).toHaveLength(2);
  });

  it("separates finding unknowns from unresolved coverage and keeps run context visible", async () => {
    const root = fixtureRepo();
    const { report } = await analyzeUpgrade({ repo: root, upgrade: { package: "express", from: "4.21.2", to: "5.1.0" }, notesPath: path.join(root, "notes.md"), provider: new BaselineProvider(), runMode: "baseline" });
    const withCoverageGap: Report = {
      ...report,
      complete: false,
      unknownItems: ["unsupported_package_reference:express:dynamic_import:src/app.ts:1"],
      counts: { ...report.counts, unknown: 1 }
    };
    const html = renderHtml(withCoverageGap);
    expect(html).toContain("Deterministic baseline");
    expect(html).toContain("Revision <strong>");
    expect(html).toContain('class="generated"');
    expect(html).toContain('<strong class="summary-value">0</strong><span class="summary-label">Unknown findings</span>');
    expect(html).toContain('<strong class="summary-value">1</strong><span class="summary-label">Coverage unknowns</span>');
    expect(html).toContain("Unresolved coverage above the queue remains visible while filtering.");
  });

  it("uses stable CLI exit codes and never silently falls back from Jev", () => {
    const help = spawnSync(process.execPath, [path.resolve("dist/cli.js"), "--help"], { encoding: "utf8" });
    expect(help.status).toBe(0);
    expect(help.stdout).toMatch(/Usage:/);
    expect(help.stdout).toMatch(/analyze/);
    expect(help.stderr).toBe("");
    const demo = spawnSync(process.execPath, [path.resolve("dist/cli.js"), "demo", "--out", path.join(fixtureRepo(), "out")], { encoding: "utf8", env: { ...process.env, TYPESAFE_API_KEY: "" } });
    expect(demo.status).toBe(0);
    const missingKey = spawnSync(process.execPath, [path.resolve("dist/cli.js"), "analyze", "--repo", fixtureRepo(), "--package", "express", "--from", "4.21.2", "--to", "5.1.0", "--notes", path.join(fixtureRepo(), "notes.md"), "--provider", "jev"], { encoding: "utf8", env: { ...process.env, TYPESAFE_API_KEY: "" } });
    expect(missingKey.status).toBe(69);
    expect(missingKey.stderr).toMatch(/requires TYPESAFE_API_KEY/);
    const invalid = spawnSync(process.execPath, [path.resolve("dist/cli.js"), "wat"], { encoding: "utf8" });
    expect(invalid.status).toBe(64);
    const incompleteRoot = fixtureRepo();
    unlinkSync(path.join(incompleteRoot, "notes-manifest.json"));
    const incomplete = spawnSync(process.execPath, [path.resolve("dist/cli.js"), "analyze", "--repo", incompleteRoot, "--package", "express", "--from", "4.21.2", "--to", "5.1.0", "--notes", path.join(incompleteRoot, "notes.md"), "--provider", "baseline", "--out", path.join(incompleteRoot, "out")], { encoding: "utf8" });
    expect(incomplete.status).toBe(2);
  });

  it("rejects tracked source symlinks and reports source-size truncation", () => {
    const symlinkRoot = fixtureRepo();
    symlinkSync("app.ts", path.join(symlinkRoot, "src/link.ts"));
    execFileSync("git", ["add", "src/link.ts"], { cwd: symlinkRoot });
    execFileSync("git", ["commit", "-qm", "symlink"], { cwd: symlinkRoot });
    expect(() => workingTreeSnapshot(symlinkRoot)).toThrow(/Symlink source paths are not analyzed/);

    const largeRoot = fixtureRepo();
    writeFileSync(path.join(largeRoot, "src/large.ts"), `export const payload="${"x".repeat(300_000)}";\n`);
    execFileSync("git", ["add", "src/large.ts"], { cwd: largeRoot });
    execFileSync("git", ["commit", "-qm", "large"], { cwd: largeRoot });
    const snapshot = workingTreeSnapshot(largeRoot);
    expect(snapshot.truncatedCount).toBe(1);
    expect(snapshot.limitations).toContain("source_inventory_truncated:1");
  });

  it("diff reads Git objects without altering the working tree", () => {
    const root = fixtureRepo();
    const base = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
    writeFileSync(path.join(root, "package.json"), '{"name":"fixture","dependencies":{"express":"5.1.0"}}\n');
    writeFileSync(path.join(root, "package-lock.json"), '{"lockfileVersion":3,"packages":{"":{"dependencies":{"express":"5.1.0"}},"node_modules/express":{"version":"5.1.0"}}}\n');
    execFileSync("git", ["add", "package.json", "package-lock.json"], { cwd: root });
    execFileSync("git", ["commit", "-qm", "upgrade express"], { cwd: root });
    const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
    const notesDir = path.join(root, "reviewed-notes");
    mkdirSync(notesDir);
    const note = '---\npackage: express\nfrom: 4.21.2\nto: 5.1.0\nsource: https://example.com/express\nretrieved: 2026-09-20\n---\n\n# Query\n\nFamily: express-query-parser-default\n\nThe default parser changed.\n';
    writeFileSync(path.join(notesDir, "express.md"), note);
    writeFileSync(path.join(notesDir, "notes-manifest.json"), JSON.stringify({ documents: [{ file: "express.md", package: "express", from: "4.21.2", to: "5.1.0", sourceUrl: "https://example.com/express", retrieved: "2026-09-20", sha256: sha256(note) }] }));
    const before = execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" });
    const out = mkdtempSync(path.join(tmpdir(), "upgrade-radar-diff-out-"));
    const run = spawnSync(process.execPath, [path.resolve("dist/cli.js"), "diff", "--repo", root, "--base", base, "--head", head, "--notes-dir", notesDir, "--provider", "baseline", "--out", out], { encoding: "utf8" });
    expect(run.status).toBe(0);
    expect(run.stderr).not.toMatch(/No such remote/);
    const after = execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" });
    expect(after).toBe(before);
  });

  it("keeps dependency upgrades visible and incomplete when supplied notes are missing", () => {
    const root = fixtureRepo();
    writeFileSync(path.join(root, "package.json"), '{"name":"fixture","dependencies":{"express":"4.21.2","zod":"3.25.76"}}\n');
    writeFileSync(path.join(root, "package-lock.json"), '{"lockfileVersion":3,"packages":{"":{"dependencies":{"express":"4.21.2","zod":"3.25.76"}},"node_modules/express":{"version":"4.21.2"},"node_modules/zod":{"version":"3.25.76"}}}\n');
    writeFileSync(path.join(root, "src/schema.ts"), 'import { z } from "zod";\nexport const schema=z.object({a:z.string().default("x").optional()});\n');
    execFileSync("git", ["add", "."], { cwd: root });
    execFileSync("git", ["commit", "-qm", "two dependency baseline"], { cwd: root });
    const base = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();

    writeFileSync(path.join(root, "package.json"), '{"name":"fixture","dependencies":{"express":"5.1.0","zod":"4.1.5"}}\n');
    writeFileSync(path.join(root, "package-lock.json"), '{"lockfileVersion":3,"packages":{"":{"dependencies":{"express":"5.1.0","zod":"4.1.5"}},"node_modules/express":{"version":"5.1.0"},"node_modules/zod":{"version":"4.1.5"}}}\n');
    execFileSync("git", ["add", "package.json", "package-lock.json"], { cwd: root });
    execFileSync("git", ["commit", "-qm", "upgrade express and zod"], { cwd: root });
    const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();

    const notesDir = path.join(root, "partial-notes");
    mkdirSync(notesDir);
    const note = '---\npackage: express\nfrom: 4.21.2\nto: 5.1.0\nsource: https://example.com/express\nretrieved: 2026-09-20\n---\n\n# Query\n\nFamily: express-query-parser-default\n\nThe default parser changed.\n';
    writeFileSync(path.join(notesDir, "express.md"), note);
    writeFileSync(path.join(notesDir, "notes-manifest.json"), JSON.stringify({ documents: [{ file: "express.md", package: "express", from: "4.21.2", to: "5.1.0", sourceUrl: "https://example.com/express", retrieved: "2026-09-20", sha256: sha256(note) }] }));
    const out = mkdtempSync(path.join(tmpdir(), "upgrade-radar-partial-notes-"));
    const run = spawnSync(process.execPath, [path.resolve("dist/cli.js"), "diff", "--repo", root, "--base", base, "--head", head, "--notes-dir", notesDir, "--provider", "baseline", "--out", out], { encoding: "utf8" });

    expect(run.status).toBe(2);
    const report = JSON.parse(readFileSync(path.join(out, "report.json"), "utf8")) as Report;
    expect(report.complete).toBe(false);
    expect(report.upgrades).toEqual([
      { package: "express", from: "4.21.2", to: "5.1.0" },
      { package: "zod", from: "3.25.76", to: "4.1.5" }
    ]);
    expect(report.unknownItems).toContain("missing_applicable_notes:zod:3.25.76->4.1.5");
    expect(report.coverageLimitations).toContain("missing_applicable_notes:zod:3.25.76->4.1.5");
  });

  it("treats a malformed notes manifest as unverified provenance instead of invalid input", () => {
    const root = fixtureRepo();
    const base = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
    writeFileSync(path.join(root, "package.json"), '{"name":"fixture","dependencies":{"express":"5.1.0"}}\n');
    writeFileSync(path.join(root, "package-lock.json"), '{"lockfileVersion":3,"packages":{"":{"dependencies":{"express":"5.1.0"}},"node_modules/express":{"version":"5.1.0"}}}\n');
    execFileSync("git", ["add", "package.json", "package-lock.json"], { cwd: root });
    execFileSync("git", ["commit", "-qm", "upgrade express"], { cwd: root });
    const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();

    const notesDir = path.join(root, "malformed-notes");
    mkdirSync(notesDir);
    const note = readFileSync(path.join(root, "notes.md"), "utf8");
    writeFileSync(path.join(notesDir, "express.md"), note);
    writeFileSync(path.join(notesDir, "notes-manifest.json"), "{invalid json\n");
    const out = mkdtempSync(path.join(tmpdir(), "upgrade-radar-malformed-notes-"));
    const run = spawnSync(process.execPath, [path.resolve("dist/cli.js"), "diff", "--repo", root, "--base", base, "--head", head, "--notes-dir", notesDir, "--provider", "baseline", "--out", out], { encoding: "utf8" });

    expect(run.status).toBe(2);
    expect(run.stderr).toBe("");
    const report = JSON.parse(readFileSync(path.join(out, "report.json"), "utf8")) as Report;
    expect(report.complete).toBe(false);
    expect(report.noteProvenance[0]?.verified).toBe(false);
    expect(report.coverageLimitations).toContain("notes_manifest_missing_or_hash_provenance_mismatch");
  });

  it("marks target-package dynamic imports as explicit unknowns", () => {
    const root = fixtureRepo();
    writeFileSync(path.join(root, "src/app.ts"), 'const mod = await import("express");\nconst express = mod.default;\nconst app = express();\napp.get("/q", (req, res) => res.json(req.query.filters));\n');
    execFileSync("git", ["add", "src/app.ts"], { cwd: root });
    execFileSync("git", ["commit", "-qm", "dynamic express import"], { cwd: root });
    const out = mkdtempSync(path.join(tmpdir(), "upgrade-radar-dynamic-import-"));
    const run = spawnSync(process.execPath, [path.resolve("dist/cli.js"), "analyze", "--repo", root, "--package", "express", "--from", "4.21.2", "--to", "5.1.0", "--notes", path.join(root, "notes.md"), "--provider", "baseline", "--out", out], { encoding: "utf8" });

    expect(run.status).toBe(2);
    const report = JSON.parse(readFileSync(path.join(out, "report.json"), "utf8")) as Report;
    expect(report.complete).toBe(false);
    expect(report.counts.unknown).toBe(1);
    expect(report.unknownItems).toContain("unsupported_package_reference:express:dynamic_import:src/app.ts:1");
    expect(report.coverageLimitations).toContain("unsupported_package_reference:express:dynamic_import:src/app.ts:1");
  });

  it("marks computed requires with a resolved target-package literal as explicit unknowns", () => {
    const root = fixtureRepo();
    writeFileSync(path.join(root, "src/app.ts"), 'const packageName = "express";\nconst express = require(packageName);\nconst app = express();\napp.get("/q", (req, res) => res.json(req.query.filters));\n');
    execFileSync("git", ["add", "src/app.ts"], { cwd: root });
    execFileSync("git", ["commit", "-qm", "computed express require"], { cwd: root });
    const out = mkdtempSync(path.join(tmpdir(), "upgrade-radar-computed-require-"));
    const run = spawnSync(process.execPath, [path.resolve("dist/cli.js"), "analyze", "--repo", root, "--package", "express", "--from", "4.21.2", "--to", "5.1.0", "--notes", path.join(root, "notes.md"), "--provider", "baseline", "--out", out], { encoding: "utf8" });

    expect(run.status).toBe(2);
    const report = JSON.parse(readFileSync(path.join(out, "report.json"), "utf8")) as Report;
    expect(report.complete).toBe(false);
    expect(report.unknownItems).toContain("unsupported_package_reference:express:computed_require:src/app.ts:2");
  });
});
