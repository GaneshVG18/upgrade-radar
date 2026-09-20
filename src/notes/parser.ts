import { readFileSync } from "node:fs";
import path from "node:path";
import { marked } from "marked";
import type { NoteBlock, NoteDocument } from "../types.js";
import { safeUrl, sha256, shortHash } from "../core/util.js";

interface ManifestEntry {
  file: string;
  package: string;
  from: string;
  to: string;
  sourceUrl: string;
  retrieved: string;
  sha256: string;
}

function parseFrontmatter(text: string): { meta: Record<string, string>; bodyStartLine: number } {
  const lines = text.split(/\r?\n/);
  if (lines[0] !== "---") throw new Error("Notes must start with a small YAML-style frontmatter block");
  const meta: Record<string, string> = {};
  let end = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i] === "---") { end = i; break; }
    const match = lines[i]?.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.+)$/);
    if (match?.[1] && match[2]) meta[match[1].toLowerCase()] = match[2].trim();
  }
  if (end < 0) throw new Error("Notes frontmatter is not closed");
  return { meta, bodyStartLine: end + 2 };
}

function manifestFor(notePath: string): ManifestEntry | undefined {
  const manifestPath = path.join(path.dirname(notePath), "notes-manifest.json");
  let text: string;
  try {
    text = readFileSync(manifestPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
  try {
    const parsed = JSON.parse(text) as { documents?: unknown };
    if (!Array.isArray(parsed.documents)) return undefined;
    return (parsed.documents as ManifestEntry[]).find((entry) => entry?.file === path.basename(notePath));
  } catch (error) {
    if (error instanceof SyntaxError) return undefined;
    throw error;
  }
}

export function parseNotes(notePath: string): NoteDocument {
  const text = readFileSync(notePath, "utf8");
  marked.lexer(text);
  const fullHash = sha256(text);
  const { meta, bodyStartLine } = parseFrontmatter(text);
  const packageName = meta.package;
  const from = meta.from;
  const to = meta.to;
  const sourceUrl = safeUrl(meta.source);
  const retrieved = meta.retrieved;
  if (!packageName || !from || !to || !sourceUrl || !retrieved) {
    throw new Error("Notes frontmatter requires package, from, to, source and retrieved");
  }

  const lines = text.split(/\r?\n/);
  const blocks: NoteBlock[] = [];
  let currentFamily = "generic";
  let currentHeading = "Notes";
  let paragraphStart = -1;
  const flush = (endExclusive: number): void => {
    if (paragraphStart < 0) return;
    const raw = lines.slice(paragraphStart, endExclusive).join("\n").trim();
    paragraphStart = -1;
    if (!raw || raw.startsWith("#") || /^Family:\s*/i.test(raw)) return;
    const startLine = endExclusive - raw.split(/\r?\n/).length + 1;
    const endLine = endExclusive;
    const spanHash = sha256(raw);
    blocks.push({
      family: currentFamily,
      heading: currentHeading,
      text: raw,
      span: {
        id: `note-${shortHash(`${path.basename(notePath)}:${startLine}:${endLine}:${spanHash}`)}`,
        kind: "note",
        path: path.basename(notePath),
        startLine,
        endLine,
        sourceHash: fullHash,
        spanHash,
        excerpt: raw,
        url: sourceUrl
      }
    });
  };

  for (let i = bodyStartLine - 1; i <= lines.length; i += 1) {
    const line = lines[i] ?? "";
    const family = line.match(/^Family:\s*([a-z0-9-]+)\s*$/i);
    if (family?.[1]) {
      flush(i);
      currentFamily = family[1];
      continue;
    }
    const heading = line.match(/^#{1,6}\s+(.+)$/);
    if (heading?.[1]) {
      flush(i);
      currentHeading = heading[1].trim();
      continue;
    }
    if (line.trim() === "") {
      flush(i);
      continue;
    }
    if (paragraphStart < 0) paragraphStart = i;
  }

  const manifest = manifestFor(notePath);
  const provenanceVerified = Boolean(manifest
    && manifest.package === packageName
    && manifest.from === from
    && manifest.to === to
    && manifest.sourceUrl === sourceUrl
    && manifest.retrieved === retrieved
    && manifest.sha256 === fullHash);

  return {
    path: notePath,
    package: packageName,
    from,
    to,
    sourceUrl,
    retrieved,
    sha256: fullHash,
    blocks,
    provenanceVerified
  };
}
