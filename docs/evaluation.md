# Evaluation methodology

Engineering correctness and semantic evaluation are separate gates.

## Compatibility corpus

The authored corpus contains 60 isolated cases across ten documented change families. Families, rather than paraphrases, define the development/held-out split: the four Express families plus the Glob and Commander families are under `fixtures/dev/`; the four Zod families remain under `fixtures/holdout/`. `fixtures/manifest.json` records each case's exact package versions, upstream source URL, fixture path, and hashes for its source, note, and metadata.

Each family has a canonical positive, a canonical negative control, an intentionally unknown case, and marked robustness variants. Positive/negative expected outputs are exercised against pinned old/new packages by `npm run test:compat`. Unknown cases document the missing evidence. Robustness variants are not counted as independent behavior families or independent statistical samples.

The ten families are Express query-parser default, wildcard naming, `app.del` removal, `req.param` removal; Zod optional defaults, default short-circuiting, infinity rejection, and one-argument `z.record` migration; Glob callable default/root export removal; and Commander CommonJS global-program export removal.

## Semantic layer

Fixture labels are established before any Jev call. Candidate recall is measured before model judgments. A private evaluation should compare the deterministic baseline against the same candidate inventory plus Jev and report candidate recall, positive precision/recall, false positives, review-queue size, abstention/coverage, and per-family outcomes. End-to-end retrieval failures must be separated from judgment errors.

An abstained positive is not counted as a successful positive prediction. Threshold/policy choices belong on the development families; held-out family failures must not be tuned away while continuing to call that set held out. `npm run eval:live -- --output .private-evals/run` derives candidate inventory through the real adapters, evaluates the deterministic baseline and Jev on the same retrieved pairs, separates primary cases from robustness variants, and computes family/split metrics plus small-sample Wilson intervals. The command requires a real provider key and has no mock fallback.

## Publication boundary

Live Jev results, timings, costs, raw responses, and evaluation summaries belong under ignored `.private-evals/`. This repository publishes the evaluation code, authored fixtures, deterministic compatibility assertions, and methodology, but does not publish service benchmark/performance claims. A future public benchmark would require separately established permission.
