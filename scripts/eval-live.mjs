import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { analyzeUsageSites, unsupportedPackageReferences } from "../dist/adapters/index.js";
import { sha256, shortHash } from "../dist/core/util.js";
import { BaselineProvider } from "../dist/providers/baseline.js";
import { JevProvider } from "../dist/providers/jev.js";

const { values } = parseArgs({ args: process.argv.slice(2), options: { output: { type: "string" } } });
if (!process.env.TYPESAFE_API_KEY?.trim()) {
  console.error("eval:live requires TYPESAFE_API_KEY; no mock fallback is used");
  process.exit(69);
}

const output = path.resolve(values.output ?? ".private-evals/run");
mkdirSync(output, { recursive: true });
const projectRoot = path.resolve(new URL("..", import.meta.url).pathname);
const corpus = [
  ...JSON.parse(readFileSync(path.join(projectRoot, "fixtures/dev/corpus.json"), "utf8")),
  ...JSON.parse(readFileSync(path.join(projectRoot, "fixtures/holdout/corpus.json"), "utf8"))
];

const baseline = new BaselineProvider();
const jev = new JevProvider();

function noteFor(item) {
  const text = item.noteText;
  return {
    family: item.family,
    heading: item.family,
    text,
    span: {
      id: `note-${shortHash(`${item.id}:${text}`)}`,
      kind: "note",
      path: `${item.fixturePath}/note.md`,
      startLine: 1,
      endLine: 1,
      sourceHash: sha256(text),
      spanHash: sha256(text),
      excerpt: text,
      url: item.sourceUrl
    }
  };
}

function candidateFor(item) {
  const sourcePath = path.join(projectRoot, item.fixturePath, item.sourceFile);
  const content = readFileSync(sourcePath, "utf8");
  const source = { path: item.sourceFile, content, sha256: sha256(content) };
  const matches = analyzeUsageSites([source], item.package).filter((site) => site.family === item.family);
  const unsupportedReferences = unsupportedPackageReferences([source], item.package);
  if (matches.length === 0) return { candidate: undefined, matchCount: 0, unsupportedReferences };
  const usage = matches[0];
  return {
    matchCount: matches.length,
    unsupportedReferences,
    candidate: {
      id: `eval-${shortHash(`${item.id}:${usage.span.id}`)}`,
      upgrade: { package: item.package, from: item.versions.old, to: item.versions.new },
      note: noteFor(item),
      usage
    }
  };
}

function wilson(numerator, denominator) {
  if (denominator === 0) return { numerator, denominator, value: null, low95: null, high95: null };
  const z = 1.959963984540054;
  const p = numerator / denominator;
  const z2 = z * z;
  const denominatorTerm = 1 + z2 / denominator;
  const center = (p + z2 / (2 * denominator)) / denominatorTerm;
  const half = z * Math.sqrt((p * (1 - p) / denominator) + z2 / (4 * denominator * denominator)) / denominatorTerm;
  return { numerator, denominator, value: p, low95: Math.max(0, center - half), high95: Math.min(1, center + half) };
}

function summarize(rows, decisionKey, predicate = () => true) {
  const selected = rows.filter(predicate);
  const known = selected.filter((row) => row.label === "positive" || row.label === "negative");
  const positives = selected.filter((row) => row.label === "positive");
  const negatives = selected.filter((row) => row.label === "negative");
  const retrievedPositives = positives.filter((row) => row.candidateRetrieved);
  const retrievedNegatives = negatives.filter((row) => row.candidateRetrieved);
  const judgedKnown = known.filter((row) => row.candidateRetrieved && row[decisionKey]?.status === "ok");
  const reviews = judgedKnown.filter((row) => row[decisionKey].disposition === "review");
  const truePositiveReviews = reviews.filter((row) => row.label === "positive");
  const falsePositiveReviews = reviews.filter((row) => row.label === "negative");
  const abstentions = judgedKnown.filter((row) => row[decisionKey].disposition === "unknown");
  const providerFailures = selected.filter((row) => row.candidateRetrieved && row[decisionKey]?.status === "provider_failure");
  return {
    cases: selected.length,
    knownCases: known.length,
    positiveCases: positives.length,
    negativeCases: negatives.length,
    candidatePositiveRecall: wilson(retrievedPositives.length, positives.length),
    negativeCandidateRate: wilson(retrievedNegatives.length, negatives.length),
    positiveRecallEndToEnd: wilson(truePositiveReviews.length, positives.length),
    reviewPrecision: wilson(truePositiveReviews.length, reviews.length),
    falsePositiveReviews: { numerator: falsePositiveReviews.length, denominator: negatives.length },
    reviewQueueSize: reviews.length,
    abstentionAmongJudgedKnown: wilson(abstentions.length, judgedKnown.length),
    providerFailures: providerFailures.length,
    retrievalMisses: selected.filter((row) => !row.candidateRetrieved).length
  };
}

const rows = [];
const startedAt = Date.now();
for (const item of corpus) {
  const { candidate, matchCount, unsupportedReferences } = candidateFor(item);
  const row = {
    id: item.id,
    family: item.family,
    split: item.split,
    caseRole: item.caseRole,
    label: item.label,
    candidateRetrieved: Boolean(candidate),
    candidateMatchCount: matchCount,
    unsupportedReferences,
    baseline: undefined,
    jev: undefined
  };
  if (candidate) {
    const baselineDecision = await baseline.judge(candidate);
    row.baseline = { status: "ok", disposition: baselineDecision.disposition, reasons: baselineDecision.reasons };
    try {
      const jevDecision = await jev.judge(candidate);
      row.jev = {
        status: "ok",
        disposition: jevDecision.disposition,
        reasons: jevDecision.reasons,
        semantic: jevDecision.semantic
      };
    } catch (error) {
      row.jev = { status: "provider_failure", error: error instanceof Error ? `${error.name}:${error.message}` : String(error) };
    }
  }
  rows.push(row);
}

const primary = (row) => row.caseRole === "canonical" || row.caseRole === "canonical_control";
const robustness = (row) => row.caseRole === "robustness" || row.caseRole === "robustness_control";
const report = {
  schemaVersion: "upgrade-radar-private-eval/v1",
  generatedAt: new Date().toISOString(),
  durationMs: Date.now() - startedAt,
  labelsEstablishedFromTrackedCorpus: true,
  splitRule: "Express change families are development; Zod change families are sealed heldout. No heldout tuning is performed by this script.",
  corpus: {
    totalCases: corpus.length,
    families: [...new Set(corpus.map((item) => item.family))],
    devFamilies: [...new Set(corpus.filter((item) => item.split === "dev").map((item) => item.family))],
    heldoutFamilies: [...new Set(corpus.filter((item) => item.split === "holdout").map((item) => item.family))]
  },
  metrics: {
    primary: {
      baseline: summarize(rows, "baseline", primary),
      jev: summarize(rows, "jev", primary),
      devBaseline: summarize(rows, "baseline", (row) => primary(row) && row.split === "dev"),
      devJev: summarize(rows, "jev", (row) => primary(row) && row.split === "dev"),
      heldoutBaseline: summarize(rows, "baseline", (row) => primary(row) && row.split === "holdout"),
      heldoutJev: summarize(rows, "jev", (row) => primary(row) && row.split === "holdout")
    },
    robustness: {
      baseline: summarize(rows, "baseline", robustness),
      jev: summarize(rows, "jev", robustness)
    },
    perFamily: Object.fromEntries([...new Set(rows.map((row) => row.family))].map((family) => [family, {
      baseline: summarize(rows, "baseline", (row) => primary(row) && row.family === family),
      jev: summarize(rows, "jev", (row) => primary(row) && row.family === family)
    }]))
  },
  endToEnd: {
    retrievalMissCaseIds: rows.filter((row) => !row.candidateRetrieved).map((row) => row.id),
    retrievalMissesWithExplicitUnsupportedCoverage: rows
      .filter((row) => !row.candidateRetrieved && row.unsupportedReferences.length > 0)
      .map((row) => ({ id: row.id, unsupportedReferences: row.unsupportedReferences })),
    silentUnknownCaseIds: rows
      .filter((row) => row.label === "unknown" && !row.candidateRetrieved && row.unsupportedReferences.length === 0)
      .map((row) => row.id),
    jevProviderFailureCaseIds: rows.filter((row) => row.jev?.status === "provider_failure").map((row) => row.id),
    unknownLabelCases: rows.filter((row) => row.label === "unknown").map((row) => ({
      id: row.id,
      candidateRetrieved: row.candidateRetrieved,
      unsupportedReferences: row.unsupportedReferences,
      jevDisposition: row.jev?.disposition ?? null
    }))
  },
  resolvedModels: [...new Set(rows.map((row) => row.jev?.semantic?.model).filter(Boolean))],
  rows
};

writeFileSync(path.join(output, "evaluation.private.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(`private live evaluation completed; results remain under ignored ${path.relative(projectRoot, output)}`);
