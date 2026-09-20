#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { analyzeUpgrade, dryRunPlan, mergeReports } from "./analyze.js";
import { directDependenciesFromText, lockVersionFromText } from "./core/dependency.js";
import { illustrativeDemoReport } from "./demo.js";
import { BaselineProvider } from "./providers/baseline.js";
import { JevProvider } from "./providers/jev.js";
import { writeReport } from "./report/render.js";
import { gitObjectSnapshot, gitTextAt } from "./source/inventory.js";
import type { Provider, RunMode, Upgrade } from "./types.js";

export const EXIT = {
  completed: 0,
  incomplete: 2,
  invalidInput: 64,
  providerFailure: 69
} as const;

type Args = Record<string, string | boolean>;

function parseArgs(argv: string[]): { command: string; args: Args } {
  const [command, ...rest] = argv;
  if (!command) throw new Error("Missing command: demo | analyze | diff");
  const args: Args = {};
  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i]!;
    if (!token.startsWith("--")) throw new Error(`Unexpected argument: ${token}`);
    const key = token.slice(2);
    const next = rest[i + 1];
    if (!next || next.startsWith("--")) args[key] = true;
    else { args[key] = next; i += 1; }
  }
  return { command, args };
}

function required(args: Args, name: string): string {
  const value = args[name];
  if (typeof value !== "string" || !value) throw new Error(`Missing --${name}`);
  return value;
}

function providerFrom(args: Args): { provider: Provider; mode: RunMode } {
  const name = typeof args.provider === "string" ? args.provider : "baseline";
  if (name === "baseline") return { provider: new BaselineProvider(), mode: "baseline" };
  if (name === "jev") {
    if (!process.env.TYPESAFE_API_KEY?.trim()) throw Object.assign(new Error("--provider jev requires TYPESAFE_API_KEY"), { providerFailure: true });
    return { provider: new JevProvider(), mode: "jev" };
  }
  throw new Error(`Unsupported provider: ${name}`);
}

function noteFile(notesDir: string, upgrade: Upgrade): string | undefined {
  const manifestPath = path.join(notesDir, "notes-manifest.json");
  if (existsSync(manifestPath)) {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { documents?: Array<{ file: string; package: string; from: string; to: string }> };
    const row = manifest.documents?.find((d) => d.package === upgrade.package && d.from === upgrade.from && d.to === upgrade.to);
    if (row) return path.join(notesDir, row.file);
  }
  return readdirSync(notesDir).filter((f) => f.endsWith(".md")).map((f) => path.join(notesDir, f)).find((f) => {
    const text = readFileSync(f, "utf8");
    return text.includes(`package: ${upgrade.package}`) && text.includes(`from: ${upgrade.from}`) && text.includes(`to: ${upgrade.to}`);
  });
}

async function runAnalyze(args: Args): Promise<number> {
  const repo = path.resolve(required(args, "repo"));
  const upgrade = { package: required(args, "package"), from: required(args, "from"), to: required(args, "to") };
  const notesPath = path.resolve(required(args, "notes"));
  const out = path.resolve(typeof args.out === "string" ? args.out : "artifacts/review");
  const { provider, mode } = providerFrom(args);
  if (args["dry-run"] === true) {
    const plan = dryRunPlan({ repo, upgrade, notesPath, provider });
    process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
    return EXIT.completed;
  }
  const result = await analyzeUpgrade({ repo, upgrade, notesPath, provider, runMode: mode });
  writeReport(result.report, out);
  process.stdout.write(`${out}/report.html\n`);
  if (result.providerFailure) return EXIT.providerFailure;
  return result.report.complete ? EXIT.completed : EXIT.incomplete;
}

async function runDiff(args: Args): Promise<number> {
  const repo = path.resolve(required(args, "repo"));
  const base = required(args, "base");
  const head = required(args, "head");
  const notesDir = path.resolve(required(args, "notes-dir"));
  const out = path.resolve(typeof args.out === "string" ? args.out : "artifacts/review");
  const { provider, mode } = providerFrom(args);
  const baseManifest = directDependenciesFromText(gitTextAt(repo, base, "package.json"));
  const headManifest = directDependenciesFromText(gitTextAt(repo, head, "package.json"));
  const baseLock = gitTextAt(repo, base, "package-lock.json");
  const headLock = gitTextAt(repo, head, "package-lock.json");
  const upgrades: Upgrade[] = [];
  for (const name of Object.keys(headManifest)) {
    if (!(name in baseManifest)) continue;
    const from = lockVersionFromText(baseLock, name);
    const to = lockVersionFromText(headLock, name);
    if (from && to && from !== to) upgrades.push({ package: name, from, to });
  }
  if (upgrades.length === 0) throw new Error("No direct dependency version changes found between base and head");
  const snapshot = gitObjectSnapshot(repo, head);
  const reports = [];
  let providerFailure = false;
  for (const upgrade of upgrades) {
    const notesPath = noteFile(notesDir, upgrade);
    if (!notesPath) continue;
    const result = await analyzeUpgrade({ repo, upgrade, notesPath, provider, runMode: mode, snapshot, skipDependencyValidation: true });
    reports.push(result.report);
    providerFailure ||= result.providerFailure;
  }
  if (reports.length === 0) throw new Error("Dependency changes were found, but no applicable supplied notes were found");
  const report = mergeReports(reports, mode);
  mkdirSync(out, { recursive: true });
  writeReport(report, out);
  process.stdout.write(`${out}/report.html\n`);
  if (providerFailure) return EXIT.providerFailure;
  return report.complete ? EXIT.completed : EXIT.incomplete;
}

async function main(): Promise<number> {
  const { command, args } = parseArgs(process.argv.slice(2));
  if (command === "demo") {
    const out = path.resolve(typeof args.out === "string" ? args.out : "artifacts/demo");
    writeReport(illustrativeDemoReport(), out);
    process.stdout.write(`${out}/report.html\n`);
    return EXIT.completed;
  }
  if (command === "analyze") return runAnalyze(args);
  if (command === "diff") return runDiff(args);
  throw new Error(`Unknown command: ${command}`);
}

main().then((code) => { process.exitCode = code; }).catch((error: unknown) => {
  const providerFailure = Boolean(error && typeof error === "object" && "providerFailure" in error);
  process.stderr.write(`upgrade-radar: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = providerFailure ? EXIT.providerFailure : EXIT.invalidInput;
});
