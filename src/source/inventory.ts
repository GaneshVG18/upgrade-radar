import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import type { SourceFile, SourceSnapshot } from "../types.js";
import { sha256 } from "../core/util.js";

const MAX_FILE_BYTES = 256 * 1024;
const MAX_FILES = 4000;
const supported = new Set([".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".mts", ".cts"]);
const excludedParts = new Set(["node_modules", "dist", "build", "coverage", "vendor", ".git", ".next"]);

function git(root: string, args: string[]): string {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
}

function allowedPath(rel: string): boolean {
  const parts = rel.split("/");
  if (parts.some((part) => excludedParts.has(part))) return false;
  const base = path.basename(rel).toLowerCase();
  if (base.startsWith(".env") || /(?:credential|secret|private[-_.]?key)/i.test(base)) return false;
  return supported.has(path.extname(rel).toLowerCase());
}

function buildSnapshot(repoPath: string, revision: string, rows: Array<{ path: string; read: () => Buffer }>): SourceSnapshot {
  const files: SourceFile[] = [];
  const limitations: string[] = [];
  let skippedCount = 0;
  let truncatedCount = 0;
  for (const row of rows) {
    if (files.length >= MAX_FILES) {
      truncatedCount += 1;
      continue;
    }
    if (!allowedPath(row.path)) {
      skippedCount += 1;
      continue;
    }
    const data = row.read();
    if (data.byteLength > MAX_FILE_BYTES) {
      truncatedCount += 1;
      continue;
    }
    const content = data.toString("utf8");
    files.push({ path: row.path, content, sha256: sha256(content) });
  }
  if (truncatedCount > 0) limitations.push(`source_inventory_truncated:${truncatedCount}`);
  return {
    repoPath,
    revision,
    files,
    scannedCount: files.length,
    skippedCount,
    truncatedCount,
    limitations
  };
}

export function workingTreeSnapshot(repo: string): SourceSnapshot {
  const root = realpathSync(git(repo, ["rev-parse", "--show-toplevel"]).trim());
  const repoAbs = realpathSync(path.resolve(repo));
  const prefix = path.relative(root, repoAbs).replaceAll(path.sep, "/");
  const pathspec = prefix ? `${prefix}/` : ".";
  const tracked = git(root, ["ls-files", "-z", "--", pathspec]).split("\0").filter(Boolean);
  const dirty = git(root, ["status", "--porcelain", "--", pathspec]).trim().length > 0;
  const revision = `${git(root, ["rev-parse", "HEAD"]).trim()}${dirty ? "+dirty" : ""}`;
  const rows = tracked.map((rootRel) => {
    const absolute = path.join(root, rootRel);
    const rel = prefix ? path.posix.relative(prefix, rootRel) : rootRel;
    return {
      path: rel,
      read: () => {
        const stat = lstatSync(absolute);
        if (stat.isSymbolicLink()) throw new Error(`Symlink source paths are not analyzed: ${rel}`);
        return readFileSync(absolute);
      }
    };
  });
  return buildSnapshot(repoAbs, revision, rows);
}

export function gitObjectSnapshot(repo: string, revisionInput: string): SourceSnapshot {
  const root = realpathSync(git(repo, ["rev-parse", "--show-toplevel"]).trim());
  const revision = git(root, ["rev-parse", "--verify", `${revisionInput}^{commit}`]).trim();
  const repoAbs = realpathSync(path.resolve(repo));
  const prefix = path.relative(root, repoAbs).replaceAll(path.sep, "/");
  const pathspec = prefix ? `${prefix}/` : ".";
  const tracked = git(root, ["ls-tree", "-r", "-z", "--name-only", revision, "--", pathspec]).split("\0").filter(Boolean);
  const rows = tracked.map((rootRel) => ({
    path: prefix ? path.posix.relative(prefix, rootRel) : rootRel,
    read: () => Buffer.from(execFileSync("git", ["-C", root, "show", `${revision}:${rootRel}`], { maxBuffer: 32 * 1024 * 1024 }))
  }));
  return buildSnapshot(repoAbs, revision, rows);
}

export function gitTextAt(repo: string, revisionInput: string, file: string): string {
  const root = realpathSync(git(repo, ["rev-parse", "--show-toplevel"]).trim());
  const revision = git(root, ["rev-parse", "--verify", `${revisionInput}^{commit}`]).trim();
  const repoAbs = realpathSync(path.resolve(repo));
  const prefix = path.relative(root, repoAbs).replaceAll(path.sep, "/");
  const target = prefix ? `${prefix}/${file}` : file;
  return git(root, ["show", `${revision}:${target}`]);
}
