import assert from "node:assert/strict";
import http from "node:http";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import express4 from "express4";
import express5 from "express5";
import * as zod3 from "zod3";
import * as zod4 from "zod4";

const require = createRequire(import.meta.url);
const glob8 = require("glob8");
const glob10 = require("glob10");
const commander11 = require("commander11");
const commander12 = require("commander12");

const corpus = [
  ...JSON.parse(readFileSync(new URL("../fixtures/dev/corpus.json", import.meta.url), "utf8")),
  ...JSON.parse(readFileSync(new URL("../fixtures/holdout/corpus.json", import.meta.url), "utf8"))
];

async function request(app, route) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    const response = await fetch(`http://127.0.0.1:${port}${route}`);
    return { status: response.status, body: await response.text() };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function expressQuery(express, variant) {
  const app = express();
  if (variant === "negative") app.set("query parser", "extended");
  app.get("/q", (req, res) => res.json(req.query));
  return request(app, "/q?a[b]=1");
}

function expressWildcard(express, variant) {
  const app = express();
  try {
    app.get(variant === "positive" ? "/*" : "/*splat", (_req, res) => res.end("ok"));
    return "registered";
  } catch (error) {
    return `error:${error.constructor.name}`;
  }
}

function expressDel(express, variant) {
  return typeof express()[variant === "positive" ? "del" : "delete"];
}

async function expressParam(express, variant) {
  const app = express();
  app.get("/u/:id", (req, res) => {
    if (variant === "positive") {
      try { res.end(String(req.param("id"))); }
      catch (error) { res.status(500).end(`error:${error.constructor.name}`); }
    } else {
      res.end(String(req.params.id));
    }
  });
  return request(app, "/u/42");
}

function zodOptional(z, variant) {
  if (variant === "positive") return z.object({ a: z.string().default("x").optional() }).parse({});
  return z.object({ a: z.string().default("x") }).parse({});
}

function zodDefault(z, variant) {
  const schema = z.string().transform((value) => value.toUpperCase()).default("x");
  return schema.parse(variant === "positive" ? undefined : "a");
}

function zodInfinity(z, variant) {
  return z.number().safeParse(variant === "positive" ? Infinity : 1).success;
}

function zodRecord(z, variant) {
  try {
    const schema = variant === "positive" ? z.record(z.string()) : z.record(z.string(), z.string());
    return schema.safeParse({ a: "x" }).success;
  } catch (error) {
    return `error:${error.constructor.name}`;
  }
}

function globExport(glob, variant) {
  return variant === "positive" ? typeof glob : glob.hasMagic("*.js");
}

function commanderExport(commander, variant) {
  return variant === "positive" ? typeof commander.option : typeof commander.program.option;
}

const runners = {
  "express-query-parser-default": (variant) => Promise.all([expressQuery(express4, variant), expressQuery(express5, variant)]),
  "express-wildcard-named": (variant) => [expressWildcard(express4, variant), expressWildcard(express5, variant)],
  "express-app-del-removed": (variant) => [expressDel(express4, variant), expressDel(express5, variant)],
  "express-req-param-removed": (variant) => Promise.all([expressParam(express4, variant), expressParam(express5, variant)]),
  "zod-optional-default": (variant) => [zodOptional(zod3, variant), zodOptional(zod4, variant)],
  "zod-default-short-circuit": (variant) => [zodDefault(zod3, variant), zodDefault(zod4, variant)],
  "zod-number-infinity": (variant) => [zodInfinity(zod3, variant), zodInfinity(zod4, variant)],
  "zod-record-one-arg": (variant) => [zodRecord(zod3, variant), zodRecord(zod4, variant)],
  "glob-default-export-removed": (variant) => [globExport(glob8, variant), globExport(glob10, variant)],
  "commander-commonjs-global-export-removed": (variant) => [commanderExport(commander11, variant), commanderExport(commander12, variant)]
};

let executed = 0;
for (const item of corpus) {
  assert.equal(typeof runners[item.family], "function", `runner exists for ${item.family}`);
  if (item.label === "unknown") {
    assert.ok(item.missingEvidence, `${item.id} documents missing evidence`);
    continue;
  }
  const [oldOutput, newOutput] = await runners[item.family](item.label);
  assert.deepEqual(oldOutput, item.expected.old, `${item.id} old output`);
  assert.deepEqual(newOutput, item.expected.new, `${item.id} new output`);
  if (item.label === "positive") assert.notDeepEqual(oldOutput, newOutput, `${item.id} must demonstrate a behavior delta`);
  if (item.label === "negative") assert.deepEqual(oldOutput, newOutput, `${item.id} negative control must remain stable`);
  executed += 1;
}

assert.equal(corpus.length, 60, "compatibility corpus contains 60 authored cases");
assert.equal(new Set(corpus.map((item) => item.family)).size, 10, "corpus covers ten change families");
console.log(`compat: ${corpus.length} cases, ${executed} executable positive/negative assertions, 10 change families`);
