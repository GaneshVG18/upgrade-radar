import { readFileSync } from "node:fs";
import path from "node:path";
import semver from "semver";
import type { Upgrade } from "../types.js";

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

interface Lockfile {
  lockfileVersion?: number;
  packages?: Record<string, { version?: string }>;
}

export function assertExactUpgrade(upgrade: Upgrade): void {
  for (const value of [upgrade.from, upgrade.to]) {
    if (!semver.valid(value) || semver.clean(value) !== value) {
      throw new Error(`Expected an exact semantic version, got ${value}`);
    }
  }
  if (!semver.lt(upgrade.from, upgrade.to)) {
    throw new Error(`Upgrade must move forward: ${upgrade.from} -> ${upgrade.to}`);
  }
}

export function validateLocalDependencyFacts(repo: string, upgrade: Upgrade): string[] {
  assertExactUpgrade(upgrade);
  const manifestPath = path.join(repo, "package.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as PackageJson;
  const declared = manifest.dependencies?.[upgrade.package]
    ?? manifest.devDependencies?.[upgrade.package]
    ?? manifest.optionalDependencies?.[upgrade.package];
  if (!declared) throw new Error(`${upgrade.package} is not a direct dependency in package.json`);

  const limitations: string[] = [];
  const lockPath = path.join(repo, "package-lock.json");
  try {
    const lock = JSON.parse(readFileSync(lockPath, "utf8")) as Lockfile;
    if (lock.lockfileVersion !== 2 && lock.lockfileVersion !== 3) {
      limitations.push(`unsupported_lockfile_version:${String(lock.lockfileVersion ?? "missing")}`);
      return limitations;
    }
    const resolved = lock.packages?.[`node_modules/${upgrade.package}`]?.version;
    if (!resolved) limitations.push(`lockfile_missing_direct_package:${upgrade.package}`);
    else if (resolved !== upgrade.from) {
      throw new Error(`Lockfile resolves ${upgrade.package}@${resolved}, which disagrees with --from ${upgrade.from}`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") limitations.push("package_lock_missing");
    else throw error;
  }
  return limitations;
}

export function lockVersionFromText(lockText: string, packageName: string): string | undefined {
  const lock = JSON.parse(lockText) as Lockfile;
  if (lock.lockfileVersion !== 2 && lock.lockfileVersion !== 3) return undefined;
  return lock.packages?.[`node_modules/${packageName}`]?.version;
}

export function directDependenciesFromText(manifestText: string): Record<string, string> {
  const manifest = JSON.parse(manifestText) as PackageJson;
  return {
    ...manifest.dependencies,
    ...manifest.devDependencies,
    ...manifest.optionalDependencies
  };
}
