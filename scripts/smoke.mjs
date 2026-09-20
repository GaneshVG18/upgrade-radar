import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const out = mkdtempSync(path.join(tmpdir(), "upgrade-radar-smoke-"));
const run = spawnSync(process.execPath, ["dist/cli.js", "demo", "--out", out], { encoding: "utf8" });
assert.equal(run.status, 0, run.stderr);
const json = JSON.parse(readFileSync(path.join(out, "report.json"), "utf8"));
assert.equal(json.runMode, "illustrative_fixture");
assert.equal(json.schemaVersion, "upgrade-radar-report/v1");
const html = readFileSync(path.join(out, "report.html"), "utf8");
assert.match(html, /ILLUSTRATIVE FIXTURE/);
assert.doesNotMatch(html, /TYPESAFE_API_KEY/);
console.log(`smoke: demo report generated at ${out}`);
