import path from "node:path";
import ts from "typescript";
import type { EvidenceSpan, SourceFile, UsageSite } from "../types.js";
import { lineRange, sha256, shortHash } from "../core/util.js";

type Binding = { symbol: string };

function scriptKind(file: string): ts.ScriptKind {
  if (file.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (file.endsWith(".jsx")) return ts.ScriptKind.JSX;
  if (file.endsWith(".js") || file.endsWith(".mjs") || file.endsWith(".cjs")) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function parse(file: SourceFile): ts.SourceFile {
  return ts.createSourceFile(file.path, file.content, ts.ScriptTarget.Latest, true, scriptKind(file.path));
}

function sourceSpan(file: SourceFile, sf: ts.SourceFile, node: ts.Node, symbol: string): EvidenceSpan {
  const start = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
  const end = sf.getLineAndCharacterOfPosition(node.getEnd()).line + 1;
  const excerpt = lineRange(file.content, start, end);
  const spanHash = sha256(excerpt);
  return {
    id: `code-${shortHash(`${file.path}:${start}:${end}:${symbol}:${spanHash}`)}`,
    kind: "code",
    path: file.path,
    startLine: start,
    endLine: end,
    sourceHash: file.sha256,
    spanHash,
    excerpt
  };
}

function moduleText(node: ts.Expression): string | undefined {
  return ts.isStringLiteral(node) ? node.text : undefined;
}

function directBindings(sf: ts.SourceFile, target: string): Map<string, Binding> {
  const out = new Map<string, Binding>();
  sf.forEachChild((node) => {
    if (ts.isImportDeclaration(node) && node.importClause && moduleText(node.moduleSpecifier) === target) {
      if (node.importClause.name) out.set(node.importClause.name.text, { symbol: "default" });
      const named = node.importClause.namedBindings;
      if (named && ts.isNamespaceImport(named)) out.set(named.name.text, { symbol: "*" });
      if (named && ts.isNamedImports(named)) {
        for (const item of named.elements) out.set(item.name.text, { symbol: item.propertyName?.text ?? item.name.text });
      }
    }
    if (ts.isImportEqualsDeclaration(node)
      && ts.isExternalModuleReference(node.moduleReference)
      && node.moduleReference.expression
      && moduleText(node.moduleReference.expression) === target) {
      out.set(node.name.text, { symbol: "*" });
    }
    if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        if (!decl.initializer || !ts.isCallExpression(decl.initializer)) continue;
        const call = decl.initializer;
        if (!ts.isIdentifier(call.expression) || call.expression.text !== "require") continue;
        if (call.arguments.length !== 1 || !ts.isStringLiteral(call.arguments[0]!) || call.arguments[0]!.text !== target) continue;
        if (ts.isIdentifier(decl.name)) out.set(decl.name.text, { symbol: "*" });
        if (ts.isObjectBindingPattern(decl.name)) {
          for (const element of decl.name.elements) {
            if (ts.isIdentifier(element.name)) out.set(element.name.text, { symbol: element.propertyName && ts.isIdentifier(element.propertyName) ? element.propertyName.text : element.name.text });
          }
        }
      }
    }
  });
  return out;
}

function exportedBindings(files: SourceFile[], target: string): Map<string, Map<string, Binding>> {
  const result = new Map<string, Map<string, Binding>>();
  for (const file of files) {
    const sf = parse(file);
    const exports = new Map<string, Binding>();
    sf.forEachChild((node) => {
      if (!ts.isExportDeclaration(node) || !node.moduleSpecifier || moduleText(node.moduleSpecifier) !== target) return;
      if (!node.exportClause) {
        exports.set("*", { symbol: "*" });
      } else if (ts.isNamedExports(node.exportClause)) {
        for (const item of node.exportClause.elements) {
          exports.set(item.name.text, { symbol: item.propertyName?.text ?? item.name.text });
        }
      }
    });
    if (exports.size > 0) result.set(file.path, exports);
  }
  return result;
}

function resolveLocal(from: string, specifier: string, allPaths: Set<string>): string | undefined {
  if (!specifier.startsWith(".")) return undefined;
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(from), specifier));
  const withoutJs = base.replace(/\.(mjs|cjs|js|jsx)$/i, "");
  const candidates = [
    base,
    withoutJs,
    ...[".ts", ".tsx", ".js", ".jsx", ".mts", ".cts", ".mjs", ".cjs"].map((ext) => `${withoutJs}${ext}`),
    ...[".ts", ".tsx", ".js", ".jsx"].map((ext) => `${withoutJs}/index${ext}`)
  ];
  return candidates.find((candidate) => allPaths.has(candidate));
}

function bindingsForFile(file: SourceFile, files: SourceFile[], target: string, exports: Map<string, Map<string, Binding>>): Map<string, Binding> {
  const sf = parse(file);
  const out = directBindings(sf, target);
  const allPaths = new Set(files.map((entry) => entry.path));
  sf.forEachChild((node) => {
    if (!ts.isImportDeclaration(node) || !node.importClause || !ts.isStringLiteral(node.moduleSpecifier)) return;
    const resolved = resolveLocal(file.path, node.moduleSpecifier.text, allPaths);
    if (!resolved) return;
    const available = exports.get(resolved);
    if (!available) return;
    if (node.importClause.name) {
      const binding = available.get("default");
      if (binding) out.set(node.importClause.name.text, binding);
    }
    const named = node.importClause.namedBindings;
    if (named && ts.isNamedImports(named)) {
      for (const item of named.elements) {
        const imported = item.propertyName?.text ?? item.name.text;
        const binding = available.get(imported) ?? available.get("*");
        if (binding) out.set(item.name.text, binding);
      }
    }
  });
  return out;
}

function rootIdentifier(node: ts.Expression): string | undefined {
  if (ts.isIdentifier(node)) return node.text;
  if (ts.isPropertyAccessExpression(node)) return rootIdentifier(node.expression);
  if (ts.isCallExpression(node)) return rootIdentifier(node.expression);
  return undefined;
}

function addSite(sites: UsageSite[], file: SourceFile, sf: ts.SourceFile, node: ts.Node, pkg: string, family: string, symbol: string, configuration: Record<string, string | boolean | null> = {}, missingFacts: string[] = []): void {
  const span = sourceSpan(file, sf, node, symbol);
  const key = `${family}:${span.path}:${span.startLine}:${span.endLine}:${symbol}`;
  if (sites.some((site) => `${site.family}:${site.span.path}:${site.span.startLine}:${site.span.endLine}:${site.symbol}` === key)) return;
  sites.push({ package: pkg, family, symbol, span, configuration, missingFacts });
}

function expressSites(file: SourceFile, sf: ts.SourceFile, bindings: Map<string, Binding>): UsageSite[] {
  const sites: UsageSite[] = [];
  const appVars = new Set<string>();
  let queryParser: string | null = null;
  let queryParserUnknown = false;

  const discover = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && ts.isCallExpression(node.initializer)) {
      const expr = node.initializer.expression;
      if (ts.isIdentifier(expr) && bindings.has(expr.text)) {
        appVars.add(node.name.text);
        addSite(sites, file, sf, node.initializer, "express", "package-usage", `${expr.text}()`);
      }
      if (ts.isPropertyAccessExpression(expr) && expr.name.text === "Router" && rootIdentifier(expr) && bindings.has(rootIdentifier(expr)!)) {
        appVars.add(node.name.text);
        addSite(sites, file, sf, node.initializer, "express", "package-usage", `${rootIdentifier(expr)}.Router()`);
      }
    }
    ts.forEachChild(node, discover);
  };
  discover(sf);

  const inspectHandler = (fn: ts.FunctionLikeDeclarationBase): void => {
    const req = fn.parameters[0]?.name;
    if (!req || !ts.isIdentifier(req) || !fn.body) return;
    const reqName = req.text;
    const visit = (node: ts.Node): void => {
      if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === reqName) {
        if (node.name.text === "query") {
          addSite(sites, file, sf, node, "express", "express-query-parser-default", "req.query", { queryParser }, queryParserUnknown ? ["query_parser_configuration_is_not_literal"] : []);
        }
        if (node.name.text === "param" && ts.isCallExpression(node.parent) && node.parent.expression === node) {
          addSite(sites, file, sf, node.parent, "express", "express-req-param-removed", "req.param");
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(fn.body);
  };

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && ts.isIdentifier(node.expression.expression)) {
      const receiver = node.expression.expression.text;
      const method = node.expression.name.text;
      if (appVars.has(receiver)) {
        if (method === "set" && node.arguments[0] && ts.isStringLiteral(node.arguments[0]) && node.arguments[0].text === "query parser") {
          const value = node.arguments[1];
          if (value && ts.isStringLiteral(value)) queryParser = value.text;
          else queryParserUnknown = true;
        }
        if (method === "del") addSite(sites, file, sf, node, "express", "express-app-del-removed", `${receiver}.del`);
        const first = node.arguments[0];
        if (first && ts.isStringLiteral(first) && first.text.includes("/*")) {
          addSite(sites, file, sf, first, "express", "express-wildcard-named", `${receiver}.${method}`);
        }
        for (const arg of node.arguments) {
          if (ts.isArrowFunction(arg) || ts.isFunctionExpression(arg)) inspectHandler(arg);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return sites;
}

function zodSites(file: SourceFile, sf: ts.SourceFile, bindings: Map<string, Binding>): UsageSite[] {
  const sites: UsageSite[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const root = rootIdentifier(node.expression);
      if (root && bindings.has(root)) {
        const method = node.expression.name.text;
        const text = node.getText(sf);
        if (ts.isIdentifier(node.expression.expression) && node.expression.expression.text === root) {
          addSite(sites, file, sf, node, "zod", "package-usage", `${root}.${method}`);
        }
        if (method === "optional" && text.includes(".default(")) {
          addSite(sites, file, sf, node, "zod", "zod-optional-default", `${root}.default().optional()`);
        }
        if (method === "default" && node.expression.expression.getText(sf).includes(".transform(")) {
          addSite(sites, file, sf, node, "zod", "zod-default-short-circuit", `${root}.transform().default()`);
        }
        if (method === "number") addSite(sites, file, sf, node, "zod", "zod-number-infinity", `${root}.number`);
        if (method === "record" && node.arguments.length === 1) addSite(sites, file, sf, node, "zod", "zod-record-one-arg", `${root}.record`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return sites;
}

export function analyzeUsageSites(files: SourceFile[], targetPackage: string): UsageSite[] {
  const exports = exportedBindings(files, targetPackage);
  const sites: UsageSite[] = [];
  for (const file of files) {
    const sf = parse(file);
    const bindings = bindingsForFile(file, files, targetPackage, exports);
    if (bindings.size === 0) continue;
    if (targetPackage === "express") sites.push(...expressSites(file, sf, bindings));
    else if (targetPackage === "zod") sites.push(...zodSites(file, sf, bindings));
    else {
      const visit = (node: ts.Node): void => {
        if (ts.isIdentifier(node) && bindings.has(node.text)) {
          if (ts.isImportClause(node.parent) || ts.isImportSpecifier(node.parent) || ts.isNamespaceImport(node.parent)) return;
          addSite(sites, file, sf, node, targetPackage, "generic", bindings.get(node.text)?.symbol ?? node.text);
        }
        ts.forEachChild(node, visit);
      };
      visit(sf);
    }
  }
  return sites;
}
