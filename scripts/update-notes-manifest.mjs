import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

function hash(text) {
  return createHash("sha256").update(text).digest("hex");
}

function meta(text, key) {
  const match = text.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
  if (!match) throw new Error(`missing ${key}`);
  return match[1].trim();
}

const dir = path.resolve("examples/notes");
const files = readdirSync(dir).filter((file) => file.endsWith(".md")).sort();
const documents = files.map((file) => {
  const text = readFileSync(path.join(dir, file), "utf8");
  return {
    file,
    package: meta(text, "package"),
    from: meta(text, "from"),
    to: meta(text, "to"),
    sourceUrl: meta(text, "source"),
    retrieved: meta(text, "retrieved"),
    sha256: hash(text)
  };
});
writeFileSync(path.join(dir, "notes-manifest.json"), `${JSON.stringify({ schemaVersion: "upgrade-radar-notes/v1", documents }, null, 2)}\n`);
console.log(`updated ${documents.length} note provenance records`);
