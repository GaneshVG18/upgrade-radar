import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const EXPRESS_URL = "https://expressjs.com/en/guide/migrating-5.html";
const ZOD_URL = "https://zod.dev/v4/changelog";
const GLOB_URL = "https://github.com/isaacs/node-glob/blob/main/changelog.md";
const COMMANDER_URL = "https://github.com/tj/commander.js/blob/master/CHANGELOG.md";

function expressApp(style, body) {
  if (style === "cjs") return `const express=require("express");\nconst app=express();\n${body}\n`;
  const local = style === "alias" ? "web" : "express";
  return `import ${local} from "express";\nconst app=${local}();\n${body}\n`;
}

function zodSource(style, body) {
  if (style === "cjs") return `const { z }=require("zod");\n${body}\n`;
  if (style === "alias") return `import { z as schemaLib } from "zod";\n${body.replaceAll("z.", "schemaLib.")}\n`;
  return `import { z } from "zod";\n${body}\n`;
}

function globCallableSource(style) {
  if (style === "cjs") return 'const glob=require("glob");\nglob("*.js",()=>{});\n';
  const local = style === "alias" ? "matchFiles" : "glob";
  return `import ${local} from "glob";\n${local}("*.js",()=>{});\n`;
}

function globNamedSource(style) {
  if (style === "cjs") return 'const {hasMagic}=require("glob");\nmodule.exports=hasMagic("*.js");\n';
  const local = style === "alias" ? "matchesPattern" : "hasMagic";
  const imported = style === "alias" ? "hasMagic as matchesPattern" : "hasMagic";
  return `import { ${imported} } from "glob";\nexport const result=${local}("*.js");\n`;
}

function commanderRootSource(style) {
  const local = style === "alias" ? "cli" : "commander";
  return `const ${local}=require("commander");\n${local}.option("-d, --debug");\n`;
}

function commanderNamedProgramSource(style) {
  if (style === "alias") return 'const {program:cli}=require("commander");\ncli.option("-d, --debug");\n';
  return 'const {program}=require("commander");\nprogram.option("-d, --debug");\n';
}

const definitions = [
  {
    family: "express-query-parser-default", split: "dev", package: "express", from: "4.21.2", to: "5.1.0", sourceUrl: EXPRESS_URL,
    behavior: "nested query-string parsing under the default parser",
    noteText: "Express 5 uses the simple query parser by default. Code relying on nested query-string objects should be reviewed unless the extended parser is explicitly selected.",
    oldPositive: { status: 200, body: "{\"a\":{\"b\":\"1\"}}" }, newPositive: { status: 200, body: "{\"a[b]\":\"1\"}" }, stable: { status: 200, body: "{\"a\":{\"b\":\"1\"}}" },
    positive: (style) => expressApp(style, 'app.get("/q", (req, res) => res.json(req.query.filters));'),
    negative: (style) => expressApp(style, 'app.set("query parser", "extended");\napp.get("/q", (req, res) => res.json(req.query.filters));'),
    unknown: () => 'import express from "express";\nimport { queryParser } from "./config.js";\nconst app=express();\napp.set("query parser", queryParser);\napp.get("/q",(req,res)=>res.json(req.query.filters));\n'
  },
  {
    family: "express-wildcard-named", split: "dev", package: "express", from: "4.21.2", to: "5.1.0", sourceUrl: EXPRESS_URL,
    behavior: "route registration for unnamed versus named wildcards",
    noteText: "Express 5 route path syntax requires wildcard parameters to be named; legacy unnamed wildcard strings such as `/*` need review.",
    oldPositive: "registered", newPositive: "error:PathError", stable: "registered",
    positive: (style) => expressApp(style, 'app.get("/*", (_req, res) => res.end("ok"));'),
    negative: (style) => expressApp(style, 'app.get("/*splat", (_req, res) => res.end("ok"));'),
    unknown: () => 'import express from "express";\nimport { routePattern } from "./routes.js";\nconst app=express();\napp.get(routePattern, (_req,res)=>res.end("ok"));\n'
  },
  {
    family: "express-app-del-removed", split: "dev", package: "express", from: "4.21.2", to: "5.1.0", sourceUrl: EXPRESS_URL,
    behavior: "availability of the legacy app.del route alias",
    noteText: "Express 5 removes the legacy `app.del()` alias; applications should use the normal DELETE route method.",
    oldPositive: "function", newPositive: "undefined", stable: "function",
    positive: (style) => expressApp(style, 'app.del("/item/:id", (_req, res) => res.sendStatus(204));'),
    negative: (style) => expressApp(style, 'app.delete("/item/:id", (_req, res) => res.sendStatus(204));'),
    unknown: () => 'import express from "express";\nimport { registerDelete } from "./routes.js";\nconst app=express();\nregisterDelete(app);\n'
  },
  {
    family: "express-req-param-removed", split: "dev", package: "express", from: "4.21.2", to: "5.1.0", sourceUrl: EXPRESS_URL,
    behavior: "availability of req.param(name) versus explicit parameter sources",
    noteText: "Express 5 removes `req.param(name)`; callers must read the intended route, body, or query parameter source explicitly.",
    oldPositive: { status: 200, body: "42" }, newPositive: { status: 500, body: "error:TypeError" }, stable: { status: 200, body: "42" },
    positive: (style) => expressApp(style, 'app.get("/u/:id", (req, res) => res.end(String(req.param("id"))));'),
    negative: (style) => expressApp(style, 'app.get("/u/:id", (req, res) => res.end(String(req.params.id)));'),
    unknown: () => 'import express from "express";\nimport { readParameter } from "./params.js";\nconst app=express();\napp.get("/u/:id",(req,res)=>res.end(String(readParameter(req,"id"))));\n'
  },
  {
    family: "zod-optional-default", split: "holdout", package: "zod", from: "3.25.76", to: "4.1.5", sourceUrl: ZOD_URL,
    behavior: "materialization of defaults inside optional object fields",
    noteText: "Zod 4 applies defaults inside optional object fields, so an omitted field can materialize its default value in parsed output.",
    oldPositive: {}, newPositive: { a: "x" }, stable: { a: "x" },
    positive: (style) => zodSource(style, 'export const schema=z.object({a:z.string().default("x").optional()});'),
    negative: (style) => zodSource(style, 'export const schema=z.object({a:z.string().default("x")});'),
    unknown: () => 'import { z } from "zod";\nimport { optionalWithDefault } from "./schema-wrapper.js";\nexport const schema=z.object({a:optionalWithDefault(z.string())});\n'
  },
  {
    family: "zod-default-short-circuit", split: "holdout", package: "zod", from: "3.25.76", to: "4.1.5", sourceUrl: ZOD_URL,
    behavior: "whether a default value passes through an earlier transform",
    noteText: "Zod 4 defaults short-circuit parsing for `undefined`, so the default is returned without passing through the earlier transform pipeline.",
    oldPositive: "X", newPositive: "x", stable: "A",
    positive: (style) => zodSource(style, 'export const schema=z.string().transform(v=>v.toUpperCase()).default("x");\nexport const output=schema.parse(undefined);'),
    negative: (style) => zodSource(style, 'export const schema=z.string().transform(v=>v.toUpperCase()).default("x");\nexport const output=schema.parse("a");'),
    unknown: () => 'import { z } from "zod";\nimport { withDefault } from "./schema-wrapper.js";\nexport const schema=withDefault(z.string().transform(v=>v.toUpperCase()));\n'
  },
  {
    family: "zod-number-infinity", split: "holdout", package: "zod", from: "3.25.76", to: "4.1.5", sourceUrl: ZOD_URL,
    behavior: "acceptance of Infinity by a number schema",
    noteText: "Zod 4 number validation rejects infinite values, changing the result for schemas that accepted `Infinity` under Zod 3.",
    oldPositive: true, newPositive: false, stable: true,
    positive: (style) => zodSource(style, 'const schema=z.number();\nexport const result=schema.safeParse(Infinity).success;'),
    negative: (style) => zodSource(style, 'const schema=z.number();\nexport const result=schema.safeParse(1).success;'),
    unknown: () => 'import { z } from "zod";\nimport { runtimeNumber } from "./input.js";\nconst schema=z.number();\nexport const result=schema.safeParse(runtimeNumber).success;\n'
  },
  {
    family: "zod-record-one-arg", split: "holdout", package: "zod", from: "3.25.76", to: "4.1.5", sourceUrl: ZOD_URL,
    behavior: "the one-argument z.record value-schema signature",
    noteText: "Zod 4 changes `z.record()` so the former one-argument value-schema form must migrate to the current key/value signature.",
    oldPositive: true, newPositive: "error:TypeError", stable: true,
    positive: (style) => zodSource(style, 'export const schema=z.record(z.string());'),
    negative: (style) => zodSource(style, 'export const schema=z.record(z.string(), z.string());'),
    unknown: () => 'import { z } from "zod";\nimport { makeRecord } from "./schema-wrapper.js";\nexport const schema=makeRecord(z.string());\n'
  },
  {
    family: "glob-default-export-removed", split: "dev", package: "glob", from: "8.1.0", to: "10.4.5", sourceUrl: GLOB_URL,
    behavior: "availability of the callable package root/default export",
    noteText: "Glob 9 moved from callbacks to promises and changed exported function names; Glob 10 removed the default export, so code that calls the imported or required package root needs migration to a named API.",
    oldPositive: "function", newPositive: "object", stable: true,
    positive: (style) => globCallableSource(style),
    negative: (style) => globNamedSource(style),
    unknown: () => 'import glob from "glob";\nimport { runGlob } from "./glob-wrapper.js";\nrunGlob(glob);\n'
  },
  {
    family: "commander-commonjs-global-export-removed", split: "dev", package: "commander", from: "11.1.0", to: "12.1.0", sourceUrl: COMMANDER_URL,
    behavior: "availability of Command methods directly on the CommonJS package root",
    noteText: "Commander 12 removed the CommonJS default export of the global Command instance; CommonJS callers must use the named program export or an explicit Command instance.",
    oldPositive: "function", newPositive: "undefined", stable: "function",
    positive: (style) => commanderRootSource(style),
    negative: (style) => commanderNamedProgramSource(style),
    unknown: () => 'import * as commander from "commander";\nimport { configureCli } from "./cli-wrapper.js";\nconfigureCli(commander);\n'
  }
];

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

function reviewedNote(definition) {
  return `---\npackage: ${definition.package}\nfrom: ${definition.from}\nto: ${definition.to}\nsource: ${definition.sourceUrl}\nretrieved: 2026-09-20\n---\n\n# ${definition.family}\n\nFamily: ${definition.family}\n\n${definition.noteText}\n`;
}

const buckets = { dev: [], holdout: [] };
const manifestCases = [];
for (const definition of definitions) {
  const prefix = definition.family.replaceAll("-", "_");
  const variants = [
    ["positive", "canonical", "positive", definition.oldPositive, definition.newPositive],
    ["negative", "canonical_control", "negative", definition.stable, definition.stable],
    ["unknown", "missing_evidence", "unknown", undefined, undefined],
    ["robust_alias", "robustness", "positive", definition.oldPositive, definition.newPositive],
    ["robust_cjs", "robustness", "positive", definition.oldPositive, definition.newPositive],
    ["robust_control", "robustness_control", "negative", definition.stable, definition.stable]
  ];
  for (const [suffix, caseRole, label, oldOutput, newOutput] of variants) {
    const id = `${prefix}_${suffix}`;
    const style = suffix === "robust_alias" || suffix === "robust_control" ? "alias" : suffix === "robust_cjs" ? "cjs" : "direct";
    const source = label === "unknown" ? definition.unknown() : label === "negative" ? definition.negative(style) : definition.positive(style);
    const note = reviewedNote(definition);
    const caseRoot = path.join("fixtures", definition.split, "cases", id);
    mkdirSync(caseRoot, { recursive: true });
    const metadata = {
      id,
      family: definition.family,
      split: definition.split,
      label,
      caseRole,
      package: definition.package,
      versions: { old: definition.from, new: definition.to },
      sourceUrl: definition.sourceUrl,
      behavior: definition.behavior,
      noteText: definition.noteText,
      sourceFile: "source.js",
      noteFile: "note.md",
      ...(label === "unknown"
        ? { missingEvidence: "behavior-relevant value or configuration is hidden behind an unresolved local wrapper/input" }
        : { expected: { old: oldOutput, new: newOutput } }),
      command: "npm run test:compat"
    };
    const metadataText = `${JSON.stringify(metadata, null, 2)}\n`;
    writeFileSync(path.join(caseRoot, "source.js"), source);
    writeFileSync(path.join(caseRoot, "note.md"), note);
    writeFileSync(path.join(caseRoot, "case.json"), metadataText);
    const fixturePath = caseRoot.replaceAll(path.sep, "/");
    buckets[definition.split].push({ ...metadata, fixturePath, sourceSnippet: source.trim() });
    manifestCases.push({
      id,
      fixturePath,
      package: definition.package,
      versions: metadata.versions,
      sourceUrl: definition.sourceUrl,
      hashes: { source: sha256(source), note: sha256(note), metadata: sha256(metadataText) }
    });
  }
}

for (const split of ["dev", "holdout"]) {
  const casesRoot = path.join("fixtures", split, "cases");
  const expected = new Set(buckets[split].map((item) => path.basename(item.fixturePath)));
  mkdirSync(casesRoot, { recursive: true });
  for (const entry of readdirSync(casesRoot, { withFileTypes: true })) {
    if (entry.isDirectory() && !expected.has(entry.name)) rmSync(path.join(casesRoot, entry.name), { recursive: true, force: true });
  }
}

mkdirSync("fixtures/robustness", { recursive: true });
writeFileSync("fixtures/dev/corpus.json", `${JSON.stringify(buckets.dev, null, 2)}\n`);
writeFileSync("fixtures/holdout/corpus.json", `${JSON.stringify(buckets.holdout, null, 2)}\n`);
writeFileSync("fixtures/manifest.json", `${JSON.stringify({ schemaVersion: "upgrade-radar-fixtures/v1", generated: "2026-09-20", cases: manifestCases }, null, 2)}\n`);
writeFileSync("fixtures/robustness/README.md", "# Robustness cases\n\nCases marked `caseRole: robustness` or `robustness_control` vary source shape around the same underlying behavior. They are robustness checks and are not counted as independent behavior families or independent benchmark samples. Each generated case lives in its own fixture directory and is covered by `fixtures/manifest.json`.\n");
console.log(`wrote ${buckets.dev.length + buckets.holdout.length} isolated cases across ${definitions.length} families`);
