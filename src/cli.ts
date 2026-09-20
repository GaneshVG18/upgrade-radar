#!/usr/bin/env node
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import path from "node:path";
import { analyzeUpgrade, dryRunPlan, mergeReports } from "./analyze.js";
import { assertExactUpgrade, directDependenciesFromText, lockfileVersionFromText, lockVersionFromText, manifestUsesWorkspaces } from "./core/dependency.js";
import { illustrativeDemoReport } from "./demo.js";
import { BaselineProvider, providerPayload } from "./providers/baseline.js";
import { JevProvider } from "./providers/jev.js";
import { writeReport } from "./report/render.js";
import { gitObjectSnapshot, gitTextAt } from "./source/inventory.js";
import type { Provider, Report, RunMode, SourceSnapshot, Upgrade } from "./types.js";

export const EXIT = {
  completed: 0,
  incomplete: 2,
  invalidInput: 64,
  providerFailure: 69
} as const;

type Args = Record<string, string | boolean>;

const HELP = `Upgrade Radar — evidence-linked dependency upgrade review

Usage:
  upgrade-radar demo [--out <dir>]
  upgrade-radar analyze --repo <path> --package <name> --from <version> --to <version> --notes <file> [--provider baseline|jev] [--dry-run] [--out <dir>]
  upgrade-radar diff --repo <path> --base <sha> --head <sha> --notes-dir <dir> [--provider baseline|jev] [--out <dir>]

Commands:
  demo      Generate the authored, no-network illustrative report.
  analyze   Analyze one explicit dependency upgrade in a local source tree.
  diff      Infer direct dependency upgrades between two local Git revisions.

Exit codes: 0 completed, 2 incomplete, 64 invalid input, 69 provider failure.
`;

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

function providerNameFrom(args: Args): "baseline" | "jev" {
  const name = typeof args.provider === "string" ? args.provider : "baseline";
  if (name === "baseline" || name === "jev") return name;
  throw new Error(`Unsupported provider: ${name}`);
}

function providerFrom(args: Args): { provider: Provider; mode: RunMode } {
  const name = providerNameFrom(args);
  if (name === "baseline") return { provider: new BaselineProvider(), mode: "baseline" };
  if (name === "jev") {
    if (!process.env.TYPESAFE_API_KEY?.trim()) throw Object.assign(new Error("--provider jev requires TYPESAFE_API_KEY"), { providerFailure: true });
    return { provider: new JevProvider(), mode: "jev" };
  }
  throw new Error(`Unsupported provider: ${String(name)}`);
}

function noteCandidate(notesDir: string, file: string): string | undefined {
  const root = realpathSync(notesDir);
  const candidate = path.resolve(root, file);
  const relative = path.relative(root, candidate);
  if (!relative || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative) || !existsSync(candidate)) return undefined;
  const stat = lstatSync(candidate);
  if (!stat.isFile() || stat.isSymbolicLink()) return undefined;
  const real = realpathSync(candidate);
  const realRelative = path.relative(root, real);
  if (!realRelative || realRelative.startsWith(`..${path.sep}`) || path.isAbsolute(realRelative)) return undefined;
  return real;
}

function noteFile(notesDir: string, upgrade: Upgrade): string | undefined {
  const manifestPath = path.join(notesDir, "notes-manifest.json");
  if (existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { documents?: unknown };
      if (Array.isArray(manifest.documents)) {
        const row = (manifest.documents as Array<{ file?: unknown; package?: unknown; from?: unknown; to?: unknown }>).find(
          (d) => d.package === upgrade.package && d.from === upgrade.from && d.to === upgrade.to && typeof d.file === "string"
        );
        if (row && typeof row.file === "string") {
          const candidate = noteCandidate(notesDir, row.file);
          if (candidate) return candidate;
        }
      }
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
    }
  }
  return readdirSync(notesDir).filter((f) => f.endsWith(".md")).map((f) => noteCandidate(notesDir, f)).filter((f): f is string => Boolean(f)).find((f) => {
    const text = readFileSync(f, "utf8");
    return text.includes(`package: ${upgrade.package}`) && text.includes(`from: ${upgrade.from}`) && text.includes(`to: ${upgrade.to}`);
  });
}

function missingNotesReport(upgrade: Upgrade, snapshot: SourceSnapshot, mode: RunMode): Report {
  const gap = `missing_applicable_notes:${upgrade.package}:${upgrade.from}->${upgrade.to}`;
  return {
    schemaVersion: "upgrade-radar-report/v1",
    runMode: mode,
    generatedAt: new Date().toISOString(),
    sourceRevision: snapshot.revision,
    upgrades: [upgrade],
    noteProvenance: [],
    counts: {
      scanned: snapshot.scannedCount,
      skipped: snapshot.skippedCount,
      truncated: snapshot.truncatedCount,
      candidates: 0,
      findings: 0,
      unknown: 1
    },
    complete: false,
    findings: [],
    unknownItems: [gap],
    coverageLimitations: [...new Set([...snapshot.limitations, gap])]
  };
}

function coverageGapReport(snapshot: SourceSnapshot, mode: RunMode, gaps: string[]): Report {
  const unique = [...new Set(gaps)];
  return {
    schemaVersion: "upgrade-radar-report/v1",
    runMode: mode,
    generatedAt: new Date().toISOString(),
    sourceRevision: snapshot.revision,
    upgrades: [],
    noteProvenance: [],
    counts: {
      scanned: snapshot.scannedCount,
      skipped: snapshot.skippedCount,
      truncated: snapshot.truncatedCount,
      candidates: 0,
      findings: 0,
      unknown: unique.length
    },
    complete: false,
    findings: [],
    unknownItems: unique,
    coverageLimitations: [...new Set([...snapshot.limitations, ...unique])]
  };
}

function optionalGitTextAt(repo: string, revision: string, file: string): string | undefined {
  try {
    return gitTextAt(repo, revision, file);
  } catch {
    return undefined;
  }
}

async function runAnalyze(args: Args): Promise<number> {
  const repo = path.resolve(required(args, "repo"));
  const upgrade = { package: required(args, "package"), from: required(args, "from"), to: required(args, "to") };
  const notesPath = path.resolve(required(args, "notes"));
  const out = path.resolve(typeof args.out === "string" ? args.out : "artifacts/review");
  if (args["dry-run"] === true) {
    providerNameFrom(args);
    const plan = dryRunPlan({ repo, upgrade, notesPath, provider: { payload: providerPayload } });
    process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
    return EXIT.completed;
  }
  const { provider, mode } = providerFrom(args);
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
  const snapshot = gitObjectSnapshot(repo, head);
  const baseManifestText = gitTextAt(repo, base, "package.json");
  const headManifestText = gitTextAt(repo, head, "package.json");
  const baseManifest = directDependenciesFromText(baseManifestText);
  const headManifest = directDependenciesFromText(headManifestText);
  const baseLock = optionalGitTextAt(repo, base, "package-lock.json");
  const headLock = optionalGitTextAt(repo, head, "package-lock.json");
  const dependencyGaps: string[] = [];
  if (manifestUsesWorkspaces(baseManifestText) || manifestUsesWorkspaces(headManifestText)) {
    dependencyGaps.push("npm_workspaces_not_supported");
  }
  if (!baseLock) dependencyGaps.push("dependency_diff_base_package_lock_missing");
  if (!headLock) dependencyGaps.push("dependency_diff_head_package_lock_missing");
  if (baseLock) {
    const version = lockfileVersionFromText(baseLock);
    if (version !== 2 && version !== 3) dependencyGaps.push(`dependency_diff_unsupported_base_lockfile_version:${String(version ?? "missing")}`);
  }
  if (headLock) {
    const version = lockfileVersionFromText(headLock);
    if (version !== 2 && version !== 3) dependencyGaps.push(`dependency_diff_unsupported_head_lockfile_version:${String(version ?? "missing")}`);
  }
  const upgrades: Upgrade[] = [];
  for (const name of Object.keys(headManifest)) {
    if (!(name in baseManifest)) continue;
    const from = baseLock ? lockVersionFromText(baseLock, name) : undefined;
    const to = headLock ? lockVersionFromText(headLock, name) : undefined;
    const manifestChanged = baseManifest[name] !== headManifest[name];
    if ((!from || !to) && manifestChanged) {
      dependencyGaps.push(`dependency_diff_unresolved_direct_version:${name}`);
      continue;
    }
    if (from && to && from !== to) {
      const upgrade = { package: name, from, to };
      try {
        assertExactUpgrade(upgrade);
        upgrades.push(upgrade);
      } catch {
        dependencyGaps.push(`dependency_diff_non_upgrade_or_invalid_semver:${name}:${from}->${to}`);
      }
    }
  }
  if (upgrades.length === 0 && dependencyGaps.length === 0) throw new Error("No direct dependency version changes found between base and head");
  const reports: Report[] = dependencyGaps.length > 0 ? [coverageGapReport(snapshot, mode, dependencyGaps)] : [];
  let providerFailure = false;
  for (const upgrade of upgrades) {
    const notesPath = noteFile(notesDir, upgrade);
    if (!notesPath) {
      reports.push(missingNotesReport(upgrade, snapshot, mode));
      continue;
    }
    const result = await analyzeUpgrade({ repo, upgrade, notesPath, provider, runMode: mode, snapshot, skipDependencyValidation: true });
    reports.push(result.report);
    providerFailure ||= result.providerFailure;
  }
  const report = mergeReports(reports, mode);
  mkdirSync(out, { recursive: true });
  writeReport(report, out);
  process.stdout.write(`${out}/report.html\n`);
  if (providerFailure) return EXIT.providerFailure;
  return report.complete ? EXIT.completed : EXIT.incomplete;
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h") || argv[0] === "help") {
    process.stdout.write(HELP);
    return EXIT.completed;
  }
  const { command, args } = parseArgs(argv);
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
