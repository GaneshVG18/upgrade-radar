# Evaluation methodology

Engineering correctness and semantic evaluation are separate gates.

## Compatibility corpus

The authored corpus contains 48 cases across eight documented change families. Families, rather than paraphrases, define the development/held-out split: the four Express families are under `fixtures/dev/`; the four Zod families are under `fixtures/holdout/`.

Each family has a canonical positive, a canonical negative control, an intentionally unknown case, and marked robustness variants. Positive/negative expected outputs are exercised against pinned old/new packages by `npm run test:compat`. Unknown cases document the missing evidence. Robustness variants are not counted as independent behavior families or independent statistical samples.

The eight families are Express query-parser default, wildcard naming, `app.del` removal, `req.param` removal, and Zod optional defaults, default short-circuiting, infinity rejection, and one-argument `z.record` migration.

## Semantic layer

Fixture labels are established before any Jev call. Candidate recall is measured before model judgments. A private evaluation should compare the deterministic baseline against the same candidate inventory plus Jev and report candidate recall, positive precision/recall, false positives, review-queue size, abstention/coverage, and per-family outcomes. End-to-end retrieval failures must be separated from judgment errors.

An abstained positive is not counted as a successful positive prediction. Threshold/policy choices belong on the development families; held-out family failures must not be tuned away while continuing to call that set held out.

## Publication boundary

Live Jev results, timings, costs, raw responses, and evaluation summaries belong under ignored `.private-evals/`. This repository publishes the evaluation code, authored fixtures, and deterministic compatibility assertions, but does not publish service benchmark/performance claims. A future public benchmark would require separately established permission.
