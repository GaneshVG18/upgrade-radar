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
});
