import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const temp = mkdtempSync(path.join(os.tmpdir(), "upgrade-radar-package-smoke-"));

function run(command, args, cwd) {
  return execFileSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 32 * 1024 * 1024
  });
}

function writeConsumerVersion(root, version) {
  writeFileSync(
    path.join(root, "package.json"),
    `${JSON.stringify({ name: "upgrade-radar-package-smoke-consumer", private: true, dependencies: { express: version } })}\n`
  );
  writeFileSync(
    path.join(root, "package-lock.json"),
    `${JSON.stringify({
      lockfileVersion: 3,
      packages: {
        "": { dependencies: { express: version } },
        "node_modules/express": { version }
      }
    })}\n`
  );
}

try {
  const packDir = path.join(temp, "pack");
  const runner = path.join(temp, "runner");
  const consumer = path.join(temp, "consumer");
  const reportOut = path.join(temp, "report");
  mkdirSync(packDir, { recursive: true });
  mkdirSync(runner, { recursive: true });
  mkdirSync(path.join(consumer, "src"), { recursive: true });

  run(npm, ["pack", "--pack-destination", packDir], projectRoot);
  const tarballs = readdirSync(packDir).filter((name) => name.endsWith(".tgz"));
  assert.equal(tarballs.length, 1, "npm pack should produce exactly one tarball");
  const tarball = path.join(packDir, tarballs[0]);

  writeFileSync(path.join(runner, "package.json"), '{"name":"upgrade-radar-package-smoke-runner","private":true}\n');
  run(npm, ["install", "--omit=dev", "--no-save", "--package-lock=false", "--prefer-offline", tarball], runner);
  const installedRoot = path.join(runner, "node_modules", "upgrade-radar");
  assert.ok(existsSync(path.join(installedRoot, "dist", "cli.js")), "packed CLI should be installed");
  assert.ok(existsSync(path.join(installedRoot, "examples", "notes", "notes-manifest.json")), "bundled notes should be installed");
  assert.ok(existsSync(path.join(runner, "node_modules", "typescript", "package.json")), "TypeScript compiler API must be a runtime dependency");

  writeConsumerVersion(consumer, "4.21.2");
  writeFileSync(
    path.join(consumer, "src", "app.ts"),
    'import express from "express";\nconst app = express();\napp.get("/search", (req, res) => res.json(req.query.filters));\n'
  );
  run("git", ["init", "-q", "-b", "main"], consumer);
  run("git", ["config", "user.email", "package-smoke@example.invalid"], consumer);
  run("git", ["config", "user.name", "Upgrade Radar package smoke"], consumer);
  run("git", ["add", "."], consumer);
  run("git", ["commit", "-qm", "base"], consumer);
  run("git", ["checkout", "-qb", "feature/upgrade"], consumer);

  writeConsumerVersion(consumer, "5.1.0");
  run("git", ["add", "package.json", "package-lock.json"], consumer);
  run("git", ["commit", "-qm", "upgrade express"], consumer);
  writeFileSync(path.join(consumer, "src", "later.ts"), "export const laterFeatureWork = true;\n");
  run("git", ["add", "src/later.ts"], consumer);
  run("git", ["commit", "-qm", "later feature work"], consumer);

  const cli = path.join(installedRoot, "dist", "cli.js");
  const review = spawnSync(process.execPath, [cli, "review", "--repo", consumer, "--out", reportOut], {
    cwd: consumer,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024
  });
  assert.equal(review.status, 0, `packed review should succeed: ${review.stderr}`);
  assert.equal(review.stderr, "", "packed review should not emit stderr on success");

  const report = JSON.parse(readFileSync(path.join(reportOut, "report.json"), "utf8"));
  assert.equal(report.complete, true);
  assert.deepEqual(report.upgrades, [{ package: "express", from: "4.21.2", to: "5.1.0" }]);
  assert.ok(report.findings.some((finding) => finding.changeFamily === "express-query-parser-default" && finding.disposition === "review"));
  assert.ok(report.noteProvenance.some((note) => note.package === "express" && note.verified === true));

  // Regression guard: `demo` reads the authored example sources, which must be
  // present in the published tarball. Shipping only examples/notes made the
  // documented no-key entry point fail with ENOENT for every npm consumer.
  const demoOut = path.join(temp, "demo-report");
  const demo = spawnSync(process.execPath, [cli, "demo", "--out", demoOut], {
    cwd: temp,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024
  });
  assert.equal(demo.status, 0, `packed demo should succeed: ${demo.stderr || demo.stdout}`);
  const demoReport = JSON.parse(readFileSync(path.join(demoOut, "report.json"), "utf8"));
  assert.ok(demoReport.findings.length > 0, "packed demo should produce findings");

  console.log("package-smoke: production-only install + zero-config multi-commit review + packed demo passed");
} finally {
  rmSync(temp, { recursive: true, force: true });
}
