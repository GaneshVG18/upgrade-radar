import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { analyzeUsageSites, unsupportedPackageReferences } from "../../src/adapters/index.js";
import { sha256 } from "../../src/core/util.js";

function file(path: string, content: string) { return { path, content, sha256: sha256(content) }; }

describe("source identity and supported syntax", () => {
  it("never treats contains imported from another package as target-package evidence", () => {
    const sites = analyzeUsageSites([file("app.ts", 'import { contains } from "other-lib";\ncontains("x");')], "express");
    expect(sites).toEqual([]);
  });

  it("follows a bounded local re-export", () => {
    const files = [
      file("deps.ts", 'export { default as web } from "express";'),
      file("app.ts", 'import { web } from "./deps.js";\nconst app=web();\napp.get("/x",(req,res)=>res.json(req.query.filters));')
    ];
    const sites = analyzeUsageSites(files, "express");
    expect(sites.some((site) => site.family === "express-query-parser-default")).toBe(true);
  });

  it("supports aliases, namespaces and literal CommonJS requires", () => {
    const files = [
      file("alias.ts", 'import web from "express"; const app=web(); app.del("/x",()=>{});'),
      file("ns.ts", 'import * as z from "zod"; export const n=z.number();'),
      file("cjs.js", 'const express=require("express"); const app=express(); app.get("/*",()=>{});')
    ];
    expect(analyzeUsageSites([files[0]!], "express").map((x)=>x.family)).toContain("express-app-del-removed");
    expect(analyzeUsageSites([files[1]!], "zod").map((x)=>x.family)).toContain("zod-number-infinity");
    expect(analyzeUsageSites([files[2]!], "express").map((x)=>x.family)).toContain("express-wildcard-named");
  });

  it("does not claim computed imports", () => {
    const sites = analyzeUsageSites([file("dynamic.ts", 'const p="express"; const web=await import(p);')], "express");
    expect(sites).toEqual([]);
  });

  it("does not treat comments or string literals as package usage", () => {
    const sites = analyzeUsageSites([file("text.ts", '// import express from "express"\nconst example="req.query";')], "express");
    expect(sites).toEqual([]);
  });

  it("retains bounded package-level usage for generic/default notes", () => {
    const expressSites = analyzeUsageSites([file("health.ts", 'import express from "express";\nconst app=express();\napp.get("/health",(_req,res)=>res.send("ok"));')], "express");
    expect(expressSites.some((site) => site.family === "package-usage")).toBe(true);
    const zodSites = analyzeUsageSites([file("schema.ts", 'import { z } from "zod";\nexport const name=z.string();')], "zod");
    expect(zodSites.some((site) => site.family === "package-usage")).toBe(true);
  });

  it("marks non-literal Express query-parser configuration as missing evidence", () => {
    const sites = analyzeUsageSites([file("app.ts", 'import express from "express";\nimport { parser } from "./config.js";\nconst app=express();\napp.set("query parser",parser);\napp.get("/q",(req,res)=>res.json(req.query.a));')], "express");
    const query = sites.find((site) => site.family === "express-query-parser-default");
    expect(query?.missingFacts).toContain("query_parser_configuration_is_not_literal");
  });

  it("follows same-file named Express handlers and destructured req.query", () => {
    const named = analyzeUsageSites([file("named.ts", 'import express from "express";\nconst app=express();\nfunction search(req,res){ return res.json(req.query.filters); }\napp.get("/q", search);')], "express");
    expect(named.some((site) => site.family === "express-query-parser-default" && site.span.startLine === 3)).toBe(true);

    const destructured = analyzeUsageSites([file("destructured.ts", 'import express from "express";\nconst app=express();\napp.get("/q", ({query},res)=>res.json(query.filters));')], "express");
    expect(destructured.some((site) => site.family === "express-query-parser-default" && site.symbol.includes("destructured"))).toBe(true);
  });

  it("distinguishes unnamed Express wildcards from valid named wildcard routes", () => {
    const sites = analyzeUsageSites([file("routes.ts", 'import express from "express";\nconst app=express();\napp.get("/*",()=>{});\napp.get("/*splat",()=>{});\napp.get("/{*splat}",()=>{});')], "express");
    const wildcardSites = sites.filter((site) => site.family === "express-wildcard-named");
    expect(wildcardSites).toHaveLength(1);
    expect(wildcardSites[0]?.span.startLine).toBe(3);
  });

  it("keeps non-literal Express route paths as explicit wildcard-family unknowns", () => {
    const sites = analyzeUsageSites([file("routes.ts", 'import express from "express";\nimport {routePattern} from "./routes.js";\nconst app=express();\napp.get(routePattern,()=>{});')], "express");
    const wildcard = sites.find((site) => site.family === "express-wildcard-named");
    expect(wildcard?.missingFacts).toContain("route_path_is_not_literal");
  });

  it("uses the final visible query-parser setting for handlers regardless of registration order", () => {
    const sites = analyzeUsageSites([file("app.ts", 'import express from "express";\nconst app=express();\napp.get("/q",(req,res)=>res.json(req.query.a));\napp.set("query parser","extended");')], "express");
    const query = sites.find((site) => site.family === "express-query-parser-default");
    expect(query?.configuration.queryParser).toBe("extended");
    expect(query?.missingFacts).toEqual([]);
  });

  it("does not treat conditional Express parser configuration as definitely active", () => {
    const sites = analyzeUsageSites([file("app.ts", 'import express from "express";\nconst app=express();\nif (process.env.LEGACY) app.set("query parser","extended");\napp.get("/q",(req,res)=>res.json(req.query.a));')], "express");
    const query = sites.find((site) => site.family === "express-query-parser-default");
    expect(query?.configuration.queryParser).toBeNull();
    expect(query?.missingFacts).toContain("query_parser_configuration_is_not_literal");
  });

  it("keeps Express parser configuration scoped to the app instance that owns the handler", () => {
    const sites = analyzeUsageSites([file("apps.ts", 'import express from "express";\nconst legacy=express();\nconst modern=express();\nlegacy.set("query parser","extended");\nlegacy.get("/q",(req,res)=>res.json(req.query.a));\nmodern.get("/q",(req,res)=>res.json(req.query.a));')], "express");
    const querySites = sites.filter((site) => site.family === "express-query-parser-default");
    expect(querySites.find((site) => site.symbol.includes("legacy"))?.configuration.queryParser).toBe("extended");
    expect(querySites.find((site) => site.symbol.includes("modern"))?.configuration.queryParser).toBeNull();
  });

  it("uses visible Zod parse inputs for Infinity and default short-circuit relevance", () => {
    const infinity = analyzeUsageSites([file("n.ts", 'import {z} from "zod";\nconst schema=z.number();\nschema.safeParse(Infinity);\nschema.safeParse(1);')], "zod");
    const infinitySites = infinity.filter((site) => site.family === "zod-number-infinity");
    expect(infinitySites).toHaveLength(1);
    expect(infinitySites[0]?.configuration.parseInput).toBe("Infinity");
    expect(infinitySites[0]?.span.startLine).toBe(3);

    const defaults = analyzeUsageSites([file("d.ts", 'import {z} from "zod";\nconst schema=z.string().transform(v=>v.toUpperCase()).default("x");\nschema.parse(undefined);\nschema.parse("a");')], "zod");
    const defaultSites = defaults.filter((site) => site.family === "zod-default-short-circuit");
    expect(defaultSites).toHaveLength(1);
    expect(defaultSites[0]?.configuration.parseInput).toBe("undefined");
    expect(defaultSites[0]?.span.startLine).toBe(3);
  });

  it("follows bounded local Zod schema chains to their visible parse inputs", () => {
    const numberSites = analyzeUsageSites([file("number.ts", 'import {z} from "zod";\nconst schema=z.number().min(0);\nschema.safeParse(Infinity);')], "zod");
    const infinity = numberSites.find((site) => site.family === "zod-number-infinity");
    expect(infinity?.configuration.parseInput).toBe("Infinity");
    expect(infinity?.missingFacts).toEqual([]);
    expect(infinity?.span.startLine).toBe(3);

    const defaultSites = analyzeUsageSites([file("default.ts", 'import {z} from "zod";\nconst schema=z.string().transform(v=>v.toUpperCase()).default("x").optional();\nschema.parse(undefined);')], "zod");
    const shortCircuit = defaultSites.find((site) => site.family === "zod-default-short-circuit");
    expect(shortCircuit?.configuration.parseInput).toBe("undefined");
    expect(shortCircuit?.missingFacts).toEqual([]);
    expect(shortCircuit?.span.startLine).toBe(3);
  });

  it("marks hidden Zod behavior-relevant parse inputs as missing evidence", () => {
    const hiddenNumber = analyzeUsageSites([file("n.ts", 'import {z} from "zod";\nimport {runtimeNumber} from "./input.js";\nconst schema=z.number();\nschema.safeParse(runtimeNumber);')], "zod");
    expect(hiddenNumber.find((site) => site.family === "zod-number-infinity")?.missingFacts).toContain("zod_number_parse_input_is_not_literal");

    const hiddenDefault = analyzeUsageSites([file("d.ts", 'import {z} from "zod";\nimport {runtimeValue} from "./input.js";\nconst schema=z.string().transform(v=>v.toUpperCase()).default("x");\nschema.parse(runtimeValue);')], "zod");
    expect(hiddenDefault.find((site) => site.family === "zod-default-short-circuit")?.missingFacts).toContain("zod_default_parse_input_is_not_literal");
  });

  it("does not turn an unconsumed Zod schema into a confident behavior finding", () => {
    const sites = analyzeUsageSites([file("schema.ts", 'import {z} from "zod";\nexport const n=z.number();\nexport const d=z.string().transform(v=>v.toUpperCase()).default("x");')], "zod");
    expect(sites.find((site) => site.family === "zod-number-infinity")?.missingFacts).toContain("zod_number_parse_input_not_visible");
    expect(sites.find((site) => site.family === "zod-default-short-circuit")?.missingFacts).toContain("zod_default_parse_input_not_visible");
  });

  it("surfaces unresolved local wrappers instead of silently dropping target-package behavior", () => {
    const zod = file("schema.ts", 'import {z} from "zod";\nimport {withDefault} from "./wrapper.js";\nexport const schema=withDefault(z.string());');
    expect(unsupportedPackageReferences([zod], "zod")).toContain("unsupported_package_reference:zod:unresolved_local_wrapper:schema.ts:3");

    const expressApp = file("app.ts", 'import express from "express";\nimport {registerDelete} from "./routes.js";\nconst app=express();\nregisterDelete(app);');
    expect(unsupportedPackageReferences([expressApp], "express")).toContain("unsupported_package_reference:express:unresolved_local_wrapper:app.ts:4");

    const expressReq = file("params.ts", 'import express from "express";\nimport {readParameter} from "./params.js";\nconst app=express();\napp.get("/u/:id",(req,res)=>res.end(String(readParameter(req,"id"))));');
    expect(unsupportedPackageReferences([expressReq], "express")).toContain("unsupported_package_reference:express:unresolved_local_wrapper:params.ts:4");

    const importedHandler = file("routes.ts", 'import express from "express";\nimport {search} from "./search.js";\nconst app=express();\napp.get("/q",search);');
    expect(unsupportedPackageReferences([importedHandler], "express")).toContain("unsupported_package_reference:express:unresolved_local_wrapper:routes.ts:4");

    const importedRoutePath = file("path.ts", 'import express from "express";\nimport {routePattern} from "./routes.js";\nconst app=express();\napp.get(routePattern,()=>{});');
    expect(unsupportedPackageReferences([importedRoutePath], "express")).toEqual([]);
  });

  it("keeps every authored corpus unknown visible as a candidate or explicit unsupported reference", () => {
    const corpus = [
      ...JSON.parse(readFileSync("fixtures/dev/corpus.json", "utf8")),
      ...JSON.parse(readFileSync("fixtures/holdout/corpus.json", "utf8"))
    ] as Array<{ id: string; label: string; package: string; family: string; fixturePath: string; sourceFile: string }>;

    const silentUnknowns: string[] = [];
    const missedPositives: string[] = [];
    for (const item of corpus) {
      const sourcePath = path.join(item.fixturePath, item.sourceFile);
      const content = readFileSync(sourcePath, "utf8");
      const source = file(item.sourceFile, content);
      const matches = analyzeUsageSites([source], item.package).filter((site) => site.family === item.family);
      const unsupported = unsupportedPackageReferences([source], item.package);
      if (item.label === "positive" && matches.length === 0) missedPositives.push(item.id);
      if (item.label === "unknown" && matches.length === 0 && unsupported.length === 0) silentUnknowns.push(item.id);
    }

    expect(missedPositives).toEqual([]);
    expect(silentUnknowns).toEqual([]);
  });
});
