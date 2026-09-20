import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { assertExactUpgrade, directDependenciesFromText, lockVersionFromText } from "../../src/core/dependency.js";
import { escapeHtml, redactSecrets, sha256 } from "../../src/core/util.js";
import { parseNotes } from "../../src/notes/parser.js";

describe("deterministic facts and provenance", () => {
  it("validates exact semver and package-lock v2/v3 facts", () => {
    expect(() => assertExactUpgrade({ package: "x", from: "1.0.0", to: "2.0.0" })).not.toThrow();
    expect(() => assertExactUpgrade({ package: "x", from: "^1.0.0", to: "2.0.0" })).toThrow(/exact semantic version/);
    expect(lockVersionFromText(JSON.stringify({ lockfileVersion: 3, packages: { "node_modules/x": { version: "2.0.0" } } }), "x")).toBe("2.0.0");
    expect(lockVersionFromText(JSON.stringify({ lockfileVersion: 1, packages: {} }), "x")).toBeUndefined();
    expect(directDependenciesFromText('{"dependencies":{"x":"^1"},"devDependencies":{"y":"2"}}')).toEqual({ x: "^1", y: "2" });
  });

  it("redacts likely secrets and escapes untrusted report text", () => {
    const text = redactSecrets('token=supersecretvalue Bearer abcdefghijklmnopqrstuvwxyz');
    expect(text).not.toContain("supersecretvalue");
    expect(text).not.toContain("abcdefghijklmnopqrstuvwxyz");
    expect(escapeHtml('<script>alert("x")</script>')).toBe("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
  });

  it("verifies notes against the local provenance manifest", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "radar-notes-"));
    const note = '---\npackage: x\nfrom: 1.0.0\nto: 2.0.0\nsource: https://example.com/notes\nretrieved: 2026-09-20\n---\n\n# Change\n\nFamily: generic\n\nA reviewed behavior changed.\n';
    writeFileSync(path.join(dir, "x.md"), note);
    writeFileSync(path.join(dir, "notes-manifest.json"), JSON.stringify({ documents: [{ file: "x.md", package: "x", from: "1.0.0", to: "2.0.0", sourceUrl: "https://example.com/notes", retrieved: "2026-09-20", sha256: sha256(note) }] }));
    const parsed = parseNotes(path.join(dir, "x.md"));
    expect(parsed.provenanceVerified).toBe(true);
    expect(parsed.blocks[0]?.span.spanHash).toBe(sha256("A reviewed behavior changed."));
  });
});
