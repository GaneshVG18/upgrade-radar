import { mkdirSync, writeFileSync } from "node:fs";

const definitions = [
  ["express-query-parser-default", "dev", { status: 200, body: "{\"a\":{\"b\":\"1\"}}" }, { status: 200, body: "{\"a[b]\":\"1\"}" }, { status: 200, body: "{\"a\":{\"b\":\"1\"}}" }, "const filters = req.query.filters;", "configured.set(\"query parser\", \"extended\")"],
  ["express-wildcard-named", "dev", "registered", "error:PathError", "registered", "app.get(\"/*\", handler)", "app.get(\"/health\", handler)"],
  ["express-app-del-removed", "dev", "function", "undefined", "function", "app.del(\"/item\", handler)", "app.delete(\"/item\", handler)"],
  ["express-req-param-removed", "dev", { status: 200, body: "42" }, { status: 500, body: "error:TypeError" }, { status: 200, body: "42" }, "req.param(\"id\")", "req.params.id"],
  ["zod-optional-default", "holdout", {}, { a: "x" }, { a: "x" }, "z.object({ a: z.string().default(\"x\").optional() })", "z.object({ a: z.string().default(\"x\") })"],
  ["zod-default-short-circuit", "holdout", "X", "x", "A", "z.string().transform(upper).default(\"x\")", "schema.parse(\"a\")"],
  ["zod-number-infinity", "holdout", true, false, true, "z.number().safeParse(Infinity)", "z.number().safeParse(1)"],
  ["zod-record-one-arg", "holdout", true, "error:TypeError", true, "z.record(z.string())", "z.record(z.string(), z.string())"]
];

const buckets = { dev: [], holdout: [] };
for (const [family, split, oldPositive, newPositive, stable, positiveSource, negativeSource] of definitions) {
  const prefix = family.replaceAll("-", "_");
  buckets[split].push(
    { id: `${prefix}_positive`, family, split, label: "positive", caseRole: "canonical", sourceSnippet: positiveSource, noteFamily: family, expected: { old: oldPositive, new: newPositive }, command: "npm run test:compat" },
    { id: `${prefix}_negative`, family, split, label: "negative", caseRole: "canonical_control", sourceSnippet: negativeSource, noteFamily: family, expected: { old: stable, new: stable }, command: "npm run test:compat" },
    { id: `${prefix}_unknown`, family, split, label: "unknown", caseRole: "missing_evidence", sourceSnippet: `const value = wrapper.${prefix};`, noteFamily: family, missingEvidence: "behavior-relevant value is hidden behind an unresolved wrapper", command: "npm run test:compat" },
    { id: `${prefix}_robust_alias`, family, split, label: "positive", caseRole: "robustness", sourceSnippet: `// alias/import variant\n${positiveSource}`, noteFamily: family, expected: { old: oldPositive, new: newPositive }, command: "npm run test:compat" },
    { id: `${prefix}_robust_cjs`, family, split, label: "positive", caseRole: "robustness", sourceSnippet: `// CommonJS/literal require variant\n${positiveSource}`, noteFamily: family, expected: { old: oldPositive, new: newPositive }, command: "npm run test:compat" },
    { id: `${prefix}_robust_control`, family, split, label: "negative", caseRole: "robustness_control", sourceSnippet: `// stable control variant\n${negativeSource}`, noteFamily: family, expected: { old: stable, new: stable }, command: "npm run test:compat" }
  );
}

mkdirSync("fixtures/dev", { recursive: true });
mkdirSync("fixtures/holdout", { recursive: true });
mkdirSync("fixtures/robustness", { recursive: true });
writeFileSync("fixtures/dev/corpus.json", `${JSON.stringify(buckets.dev, null, 2)}\n`);
writeFileSync("fixtures/holdout/corpus.json", `${JSON.stringify(buckets.holdout, null, 2)}\n`);
writeFileSync("fixtures/robustness/README.md", "# Robustness cases\n\nCases marked `caseRole: robustness` in the dev/holdout corpus vary source shape around the same underlying behavior. They are robustness checks and are not counted as independent behavior families or independent benchmark samples.\n");
console.log(`wrote ${buckets.dev.length + buckets.holdout.length} cases across ${definitions.length} families`);
