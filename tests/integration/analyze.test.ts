import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { analyzeUpgrade } from "../../src/analyze.js";
import { sha256 } from "../../src/core/util.js";
import { BaselineProvider } from "../../src/providers/baseline.js";
import { renderHtml, validateReport } from "../../src/report/render.js";
import type { Provider } from "../../src/types.js";

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
    expect(() => validateReport(report)).not.toThrow();
  });

  it("keeps a provider failure visible as unknown and incomplete", async () => {
    const root = fixtureRepo();
    const provider: Provider = { name: "jev", payload: (candidate) => new BaselineProvider().payload(candidate), judge: async () => { throw new Error("429"); } };
    const { report, providerFailure } = await analyzeUpgrade({ repo: root, upgrade: { package: "express", from: "4.21.2", to: "5.1.0" }, notesPath: path.join(root, "notes.md"), provider, runMode: "jev" });
    expect(providerFailure).toBe(true);
    expect(report.complete).toBe(false);
    expect(report.findings[0]?.disposition).toBe("unknown");
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

  it("uses stable CLI exit codes and never silently falls back from Jev", () => {
    const demo = spawnSync(process.execPath, [path.resolve("dist/cli.js"), "demo", "--out", path.join(fixtureRepo(), "out")], { encoding: "utf8", env: { ...process.env, TYPESAFE_API_KEY: "" } });
    expect(demo.status).toBe(0);
    const missingKey = spawnSync(process.execPath, [path.resolve("dist/cli.js"), "analyze", "--repo", fixtureRepo(), "--package", "express", "--from", "4.21.2", "--to", "5.1.0", "--notes", path.join(fixtureRepo(), "notes.md"), "--provider", "jev"], { encoding: "utf8", env: { ...process.env, TYPESAFE_API_KEY: "" } });
    expect(missingKey.status).toBe(69);
    expect(missingKey.stderr).toMatch(/requires TYPESAFE_API_KEY/);
  });
});
