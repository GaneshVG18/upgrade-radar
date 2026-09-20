import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

export function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

export function shortHash(value: string): string {
  return sha256(value).slice(0, 16);
}

export function readUtf8(file: string): string {
  return readFileSync(file, "utf8");
}

export function safeRelative(root: string, candidate: string): string {
  const rel = path.relative(root, candidate);
  if (rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel))) return rel || ".";
  throw new Error(`Path escapes repository root: ${candidate}`);
}

export function lineRange(content: string, start: number, end: number): string {
  return content.split(/\r?\n/).slice(Math.max(0, start - 1), end).join("\n");
}

export function lineOf(content: string, offset: number): number {
  return content.slice(0, offset).split(/\r?\n/).length;
}

export function truncate(value: string, max: number): { value: string; truncated: boolean } {
  if (value.length <= max) return { value, truncated: false };
  return { value: `${value.slice(0, max)}\n…[truncated]`, truncated: true };
}

const secretPatterns: Array<[RegExp, string]> = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, "[REDACTED_PRIVATE_KEY]"],
  [/\b(Bearer\s+)[A-Za-z0-9._~+/=-]{12,}\b/gi, "$1[REDACTED_TOKEN]"],
  [/\b(sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9_]{20,})\b/g, "[REDACTED_TOKEN]"],
  [/(password|passwd|secret|api[_-]?key|token)\s*[:=]\s*["']?[^\s"']{8,}/gi, "$1=[REDACTED]"]
];

export function redactSecrets(value: string): string {
  return secretPatterns.reduce((current, [pattern, replacement]) => current.replace(pattern, replacement), value);
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function safeUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : undefined;
  } catch {
    return undefined;
  }
}
