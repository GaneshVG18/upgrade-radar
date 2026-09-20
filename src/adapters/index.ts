import path from "node:path";
import ts from "typescript";
import type { EvidenceSpan, SourceFile, UsageSite } from "../types.js";
import { lineRange, sha256, shortHash } from "../core/util.js";

type BindingKind = "esm-default" | "esm-namespace" | "esm-named" | "commonjs-root" | "commonjs-named";
type Binding = { symbol: string; bindingPath: string; kind: BindingKind };

const FIRST_CLASS_PACKAGES = new Set(["commander", "express", "glob", "zod"]);

export function isFirstClassPackage(packageName: string): boolean {
  return FIRST_CLASS_PACKAGES.has(packageName);
}

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
      if (node.importClause.name) out.set(node.importClause.name.text, { symbol: "default", bindingPath: `${target} -> default as ${node.importClause.name.text}`, kind: "esm-default" });
      const named = node.importClause.namedBindings;
      if (named && ts.isNamespaceImport(named)) out.set(named.name.text, { symbol: "*", bindingPath: `${target} -> * as ${named.name.text}`, kind: "esm-namespace" });
      if (named && ts.isNamedImports(named)) {
        for (const item of named.elements) {
          const symbol = item.propertyName?.text ?? item.name.text;
          out.set(item.name.text, { symbol, bindingPath: `${target} -> ${symbol} as ${item.name.text}`, kind: symbol === "default" ? "esm-default" : "esm-named" });
        }
      }
    }
    if (ts.isImportEqualsDeclaration(node)
      && ts.isExternalModuleReference(node.moduleReference)
      && node.moduleReference.expression
      && moduleText(node.moduleReference.expression) === target) {
      out.set(node.name.text, { symbol: "*", bindingPath: `${target} -> * as ${node.name.text}`, kind: "commonjs-root" });
    }
    if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        if (!decl.initializer || !ts.isCallExpression(decl.initializer)) continue;
        const call = decl.initializer;
        if (!ts.isIdentifier(call.expression) || call.expression.text !== "require") continue;
        if (call.arguments.length !== 1 || !ts.isStringLiteral(call.arguments[0]!) || call.arguments[0]!.text !== target) continue;
        if (ts.isIdentifier(decl.name)) out.set(decl.name.text, { symbol: "*", bindingPath: `${target} -> * as ${decl.name.text}`, kind: "commonjs-root" });
        if (ts.isObjectBindingPattern(decl.name)) {
          for (const element of decl.name.elements) {
            if (ts.isIdentifier(element.name)) {
              const symbol = element.propertyName && ts.isIdentifier(element.propertyName) ? element.propertyName.text : element.name.text;
              out.set(element.name.text, { symbol, bindingPath: `${target} -> ${symbol} as ${element.name.text}`, kind: "commonjs-named" });
            }
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
        exports.set("*", { symbol: "*", bindingPath: `${target} -> *`, kind: "esm-namespace" });
      } else if (ts.isNamedExports(node.exportClause)) {
        for (const item of node.exportClause.elements) {
          const symbol = item.propertyName?.text ?? item.name.text;
          exports.set(item.name.text, { symbol, bindingPath: `${target} -> ${symbol}`, kind: symbol === "default" ? "esm-default" : "esm-named" });
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
      if (binding) out.set(node.importClause.name.text, { ...binding, bindingPath: `${binding.bindingPath} -> ${resolved} -> default as ${node.importClause.name.text}` });
    }
    const named = node.importClause.namedBindings;
    if (named && ts.isNamedImports(named)) {
      for (const item of named.elements) {
        const imported = item.propertyName?.text ?? item.name.text;
        const binding = available.get(imported) ?? available.get("*");
        if (binding) out.set(item.name.text, { ...binding, bindingPath: `${binding.bindingPath} -> ${resolved} -> ${imported} as ${item.name.text}` });
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
  const localHandlers = new Map<string, ts.FunctionLikeDeclarationBase>();
  const queryParserByApp = new Map<string, { value: string | null; unknown: boolean }>();

  const discover = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && node.name && node.body) {
      localHandlers.set(node.name.text, node);
    }
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && ts.isCallExpression(node.initializer)) {
      const expr = node.initializer.expression;
      if (ts.isIdentifier(expr) && bindings.has(expr.text)) {
        appVars.add(node.name.text);
        queryParserByApp.set(node.name.text, { value: null, unknown: false });
        addSite(sites, file, sf, node.initializer, "express", "package-usage", `${expr.text}()`);
      }
      if (ts.isPropertyAccessExpression(expr) && expr.name.text === "Router" && rootIdentifier(expr) && bindings.has(rootIdentifier(expr)!)) {
        appVars.add(node.name.text);
        queryParserByApp.set(node.name.text, { value: null, unknown: false });
        addSite(sites, file, sf, node.initializer, "express", "package-usage", `${rootIdentifier(expr)}.Router()`);
      }
    }
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer
      && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))) {
      localHandlers.set(node.name.text, node.initializer);
    }
    ts.forEachChild(node, discover);
  };
  discover(sf);

  const inspectHandler = (fn: ts.FunctionLikeDeclarationBase, receiver: string): void => {
    const parserState = queryParserByApp.get(receiver) ?? { value: null, unknown: true };
    const req = fn.parameters[0]?.name;
    if (!req || !fn.body) return;
    if (ts.isObjectBindingPattern(req)) {
      for (const element of req.elements) {
        const property = element.propertyName && ts.isIdentifier(element.propertyName)
          ? element.propertyName.text
          : ts.isIdentifier(element.name) ? element.name.text : undefined;
        if (property === "query") {
          addSite(sites, file, sf, element, "express", "express-query-parser-default", `req.query (destructured via ${receiver})`, { queryParser: parserState.value }, parserState.unknown ? ["query_parser_configuration_is_not_literal"] : []);
        }
      }
      return;
    }
    if (!ts.isIdentifier(req)) return;
    const reqName = req.text;
    const visit = (node: ts.Node): void => {
      if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === reqName) {
        if (node.name.text === "query") {
          addSite(sites, file, sf, node, "express", "express-query-parser-default", `req.query via ${receiver}`, { queryParser: parserState.value }, parserState.unknown ? ["query_parser_configuration_is_not_literal"] : []);
        }
        if (node.name.text === "param" && ts.isCallExpression(node.parent) && node.parent.expression === node) {
          addSite(sites, file, sf, node.parent, "express", "express-req-param-removed", "req.param");
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(fn.body);
  };

  const collectConfiguration = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && ts.isIdentifier(node.expression.expression)) {
      const receiver = node.expression.expression.text;
      const method = node.expression.name.text;
      if (appVars.has(receiver) && method === "set" && node.arguments[0] && ts.isStringLiteral(node.arguments[0]) && node.arguments[0].text === "query parser") {
        const value = node.arguments[1];
        const topLevelStatement = ts.isExpressionStatement(node.parent) && ts.isSourceFile(node.parent.parent);
        if (topLevelStatement && value && ts.isStringLiteral(value)) {
          queryParserByApp.set(receiver, { value: value.text, unknown: false });
        } else {
          queryParserByApp.set(receiver, { value: null, unknown: true });
        }
      }
    }
    ts.forEachChild(node, collectConfiguration);
  };
  collectConfiguration(sf);

  const hasUnnamedWildcard = (route: string): boolean => /\*(?![A-Za-z_$"])/.test(route);
  const routeMethods = new Set(["all", "delete", "del", "get", "head", "options", "patch", "post", "put"]);

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && ts.isIdentifier(node.expression.expression)) {
      const receiver = node.expression.expression.text;
      const method = node.expression.name.text;
      if (appVars.has(receiver)) {
        if (method === "del") addSite(sites, file, sf, node, "express", "express-app-del-removed", `${receiver}.del`);
        const first = node.arguments[0];
        if (routeMethods.has(method) && first) {
          if (ts.isStringLiteral(first) && hasUnnamedWildcard(first.text)) {
            addSite(sites, file, sf, first, "express", "express-wildcard-named", `${receiver}.${method}`);
          } else if (!ts.isStringLiteral(first)) {
            addSite(sites, file, sf, first, "express", "express-wildcard-named", `${receiver}.${method}`, {}, ["route_path_is_not_literal"]);
          }
        }
        for (const arg of node.arguments) {
          if (ts.isArrowFunction(arg) || ts.isFunctionExpression(arg)) inspectHandler(arg, receiver);
          else if (ts.isIdentifier(arg)) {
            const handler = localHandlers.get(arg.text);
            if (handler) inspectHandler(handler, receiver);
          }
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
  type TrackedSchema = {
    kind: "number" | "default-transform";
    node: ts.CallExpression;
    root: string;
    identity: ts.Node;
  };
  const schemaVariables = new Map<string, TrackedSchema>();
  const trackedSchemas: TrackedSchema[] = [];
  const consumedSchemas = new Set<ts.Node>();

  const trackedSchema = (node: ts.Expression): TrackedSchema | undefined => {
    if (ts.isIdentifier(node)) return schemaVariables.get(node.text);
    if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) return undefined;
    const root = rootIdentifier(node.expression);
    const method = node.expression.name.text;
    if (root && bindings.has(root)) {
      if (method === "number") return { kind: "number", node, root, identity: node };
      if (method === "default" && node.expression.expression.getText(sf).includes(".transform(")) {
        return { kind: "default-transform", node, root, identity: node };
      }
    }
    if (method === "parse" || method === "safeParse") return undefined;
    const inherited = trackedSchema(node.expression.expression);
    return inherited ? { ...inherited, node } : undefined;
  };

  const discoverSchemas = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const tracked = trackedSchema(node.initializer);
      if (tracked) {
        schemaVariables.set(node.name.text, tracked);
        if (!trackedSchemas.some((item) => item.identity === tracked.identity)) trackedSchemas.push(tracked);
      }
    }
    if (ts.isExportAssignment(node) && ts.isCallExpression(node.expression)) {
      const tracked = trackedSchema(node.expression);
      if (tracked && !trackedSchemas.some((item) => item.identity === tracked.identity)) trackedSchemas.push(tracked);
    }
    ts.forEachChild(node, discoverSchemas);
  };
  discoverSchemas(sf);

  const isUndefinedInput = (node: ts.Expression | undefined): boolean =>
    !node
    || (ts.isIdentifier(node) && node.text === "undefined")
    || ts.isVoidExpression(node);
  const isInfinityInput = (node: ts.Expression | undefined): boolean => {
    if (!node) return false;
    if (ts.isIdentifier(node) && node.text === "Infinity") return true;
    return ts.isPrefixUnaryExpression(node) && ts.isIdentifier(node.operand) && node.operand.text === "Infinity";
  };
  const isDefinitelyLiteral = (node: ts.Expression | undefined): boolean => {
    if (!node) return false;
    if (ts.isStringLiteral(node) || ts.isNumericLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return true;
    if (node.kind === ts.SyntaxKind.TrueKeyword || node.kind === ts.SyntaxKind.FalseKeyword || node.kind === ts.SyntaxKind.NullKeyword) return true;
    return ts.isPrefixUnaryExpression(node) && ts.isNumericLiteral(node.operand);
  };

  const inspectParseCall = (node: ts.CallExpression): void => {
    if (!ts.isPropertyAccessExpression(node.expression)) return;
    const method = node.expression.name.text;
    if (method !== "parse" && method !== "safeParse") return;
    const tracked = trackedSchema(node.expression.expression);
    if (!tracked) return;
    consumedSchemas.add(tracked.identity);
    const input = node.arguments[0];
    if (tracked.kind === "number") {
      if (isInfinityInput(input)) {
        addSite(sites, file, sf, node, "zod", "zod-number-infinity", `${tracked.root}.number().${method}()`, { parseInput: "Infinity" });
      } else if (!isDefinitelyLiteral(input)) {
        addSite(sites, file, sf, node, "zod", "zod-number-infinity", `${tracked.root}.number().${method}()`, { parseInput: null }, ["zod_number_parse_input_is_not_literal"]);
      }
      return;
    }
    if (isUndefinedInput(input)) {
      addSite(sites, file, sf, node, "zod", "zod-default-short-circuit", `${tracked.root}.transform().default().${method}()`, { parseInput: "undefined" });
    } else if (!isDefinitelyLiteral(input)) {
      addSite(sites, file, sf, node, "zod", "zod-default-short-circuit", `${tracked.root}.transform().default().${method}()`, { parseInput: null }, ["zod_default_parse_input_is_not_literal"]);
    }
  };

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
        if (method === "record" && node.arguments.length === 1) addSite(sites, file, sf, node, "zod", "zod-record-one-arg", `${root}.record`);
      }
      inspectParseCall(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);

  for (const tracked of trackedSchemas) {
    if (consumedSchemas.has(tracked.identity)) continue;
    if (tracked.kind === "number") {
      addSite(sites, file, sf, tracked.node, "zod", "zod-number-infinity", `${tracked.root}.number`, { parseInput: null }, ["zod_number_parse_input_not_visible"]);
    } else {
      addSite(sites, file, sf, tracked.node, "zod", "zod-default-short-circuit", `${tracked.root}.transform().default()`, { parseInput: null }, ["zod_default_parse_input_not_visible"]);
    }
  }
  return sites;
}

function globSites(file: SourceFile, sf: ts.SourceFile, bindings: Map<string, Binding>): UsageSite[] {
  const sites: UsageSite[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const binding = bindings.get(node.expression.text);
      if (binding && (binding.kind === "commonjs-root" || binding.kind === "esm-default")) {
        addSite(
          sites,
          file,
          sf,
          node,
          "glob",
          "glob-default-export-removed",
          node.expression.text,
          { resolvedSymbol: binding.symbol, bindingPath: binding.bindingPath }
        );
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return sites;
}

const COMMANDER_GLOBAL_METHODS = new Set([
  "action",
  "addArgument",
  "addCommand",
  "addHelpCommand",
  "addHelpText",
  "addOption",
  "allowExcessArguments",
  "allowUnknownOption",
  "argument",
  "arguments",
  "command",
  "configureHelp",
  "configureOutput",
  "description",
  "enablePositionalOptions",
  "exitOverride",
  "helpOption",
  "hook",
  "name",
  "option",
  "parse",
  "parseAsync",
  "passThroughOptions",
  "requiredOption",
  "showHelpAfterError",
  "showSuggestionAfterError",
  "storeOptionsAsProperties",
  "summary",
  "usage",
  "version"
]);

function commanderSites(file: SourceFile, sf: ts.SourceFile, bindings: Map<string, Binding>): UsageSite[] {
  const sites: UsageSite[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && ts.isIdentifier(node.expression.expression)) {
      const root = node.expression.expression.text;
      const binding = bindings.get(root);
      const method = node.expression.name.text;
      if (binding?.kind === "commonjs-root" && COMMANDER_GLOBAL_METHODS.has(method)) {
        addSite(
          sites,
          file,
          sf,
          node,
          "commander",
          "commander-commonjs-global-export-removed",
          `${root}.${method}`,
          { resolvedSymbol: `${root}.${method}`, bindingPath: `${binding.bindingPath} -> ${root}.${method}` }
        );
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
    else if (targetPackage === "glob") sites.push(...globSites(file, sf, bindings));
    else if (targetPackage === "commander") sites.push(...commanderSites(file, sf, bindings));
    else {
      const visit = (node: ts.Node): void => {
        if (ts.isIdentifier(node) && bindings.has(node.text)) {
          if (ts.isImportClause(node.parent) || ts.isImportSpecifier(node.parent) || ts.isNamespaceImport(node.parent)) return;
          const binding = bindings.get(node.text)!;
          let usageNode: ts.Node = node;
          let resolvedSymbol = binding.symbol;
          let bindingPath = binding.bindingPath;
          if (ts.isPropertyAccessExpression(node.parent) && node.parent.expression === node) {
            usageNode = node.parent;
            const property = node.parent.name.text;
            resolvedSymbol = binding.symbol === "*" || binding.symbol === "default" ? `${node.text}.${property}` : `${binding.symbol}.${property}`;
            bindingPath = `${bindingPath} -> ${node.text}.${property}`;
          }
          addSite(sites, file, sf, usageNode, targetPackage, "generic", resolvedSymbol, { resolvedSymbol, bindingPath });
        }
        ts.forEachChild(node, visit);
      };
      visit(sf);
    }
  }
  return sites;
}

export function unsupportedPackageReferences(files: SourceFile[], targetPackage: string): string[] {
  const items: string[] = [];
  for (const file of files) {
    const sf = parse(file);
    const targetBindings = directBindings(sf, targetPackage);
    const localImports = new Set<string>();
    sf.forEachChild((node) => {
      if (!ts.isImportDeclaration(node) || !node.importClause || !ts.isStringLiteral(node.moduleSpecifier) || !node.moduleSpecifier.text.startsWith(".")) return;
      if (node.importClause.name) localImports.add(node.importClause.name.text);
      const named = node.importClause.namedBindings;
      if (named && ts.isNamespaceImport(named)) localImports.add(named.name.text);
      if (named && ts.isNamedImports(named)) {
        for (const element of named.elements) localImports.add(element.name.text);
      }
    });
    const literalBindings = new Map<string, string>();
    const collectLiterals = (node: ts.Node): void => {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
        if (ts.isStringLiteral(node.initializer) || ts.isNoSubstitutionTemplateLiteral(node.initializer)) {
          literalBindings.set(node.name.text, node.initializer.text);
        }
      }
      ts.forEachChild(node, collectLiterals);
    };
    collectLiterals(sf);

    const appVars = new Set<string>();
    const localHandlers = new Map<string, ts.FunctionLikeDeclarationBase>();
    const expressHandlerMethods = new Set(["all", "delete", "del", "get", "head", "options", "patch", "post", "put", "use"]);
    if (targetPackage === "express") {
      const discoverExpress = (node: ts.Node): void => {
        if (ts.isFunctionDeclaration(node) && node.name && node.body) localHandlers.set(node.name.text, node);
        if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
          if (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer)) {
            localHandlers.set(node.name.text, node.initializer);
          } else if (ts.isCallExpression(node.initializer)) {
            const root = rootIdentifier(node.initializer.expression);
            if (root && targetBindings.has(root)) appVars.add(node.name.text);
          }
        }
        ts.forEachChild(node, discoverExpress);
      };
      discoverExpress(sf);
    }

    const moduleName = (node: ts.Expression | undefined): string | undefined => {
      if (!node) return undefined;
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
      if (ts.isIdentifier(node)) return literalBindings.get(node.text);
      return undefined;
    };
    const add = (node: ts.Node, kind: "dynamic_import" | "computed_require" | "unresolved_local_wrapper"): void => {
      const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
      items.push(`unsupported_package_reference:${targetPackage}:${kind}:${file.path}:${line}`);
    };

    const callUsesTargetExpression = (node: ts.CallExpression): boolean =>
      node.arguments.some((arg) => {
        const root = rootIdentifier(arg);
        return Boolean(root && targetBindings.has(root));
      });

    const inspectExpressHandler = (fn: ts.FunctionLikeDeclarationBase): void => {
      const req = fn.parameters[0]?.name;
      if (!req || !ts.isIdentifier(req) || !fn.body) return;
      const visitHandler = (node: ts.Node): void => {
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && localImports.has(node.expression.text)
          && node.arguments.some((arg) => ts.isIdentifier(arg) && arg.text === req.text)) {
          add(node, "unresolved_local_wrapper");
        }
        ts.forEachChild(node, visitHandler);
      };
      visitHandler(fn.body);
    };

    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node) && node.arguments.length >= 1) {
        const arg = node.arguments[0];
        if (!arg) return;
        if (node.expression.kind === ts.SyntaxKind.ImportKeyword && moduleName(arg) === targetPackage) {
          add(node, "dynamic_import");
        } else if (ts.isIdentifier(node.expression) && node.expression.text === "require"
          && !ts.isStringLiteral(arg) && moduleName(arg) === targetPackage) {
          add(node, "computed_require");
        } else if (ts.isIdentifier(node.expression) && localImports.has(node.expression.text)
          && (callUsesTargetExpression(node) || node.arguments.some((value) => ts.isIdentifier(value) && appVars.has(value.text)))) {
          add(node, "unresolved_local_wrapper");
        }

        if (targetPackage === "express" && ts.isPropertyAccessExpression(node.expression)
          && ts.isIdentifier(node.expression.expression) && appVars.has(node.expression.expression.text)) {
          if (expressHandlerMethods.has(node.expression.name.text)) {
            const handlerArguments = node.expression.name.text === "use"
              ? (node.arguments.length === 1 ? node.arguments : node.arguments.slice(1))
              : node.arguments.slice(1);
            for (const value of handlerArguments) {
              if (ts.isIdentifier(value) && localImports.has(value.text)) add(value, "unresolved_local_wrapper");
            }
          }
          for (const value of node.arguments) {
            if (ts.isArrowFunction(value) || ts.isFunctionExpression(value)) inspectExpressHandler(value);
            else if (ts.isIdentifier(value)) {
              const handler = localHandlers.get(value.text);
              if (handler) inspectExpressHandler(handler);
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return [...new Set(items)];
}
