import { describe, expect, it } from "vitest";
import { analyzeUsageSites } from "../../src/adapters/index.js";
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
});
