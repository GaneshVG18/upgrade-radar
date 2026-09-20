# Upgrade Radar explainer

## The problem

A dependency pull request shows a version change. Your repository answers a different question: **does our code actually depend on the behavior that changed?**

Upgrade Radar connects reviewed dependency migration notes to the application code that uses the affected package behavior, then produces a short evidence-linked review queue instead of treating a package changelog as the investigation itself.

## What it does

Run Upgrade Radar from the root of a Git-tracked npm project on Node 24 or newer:

```sh
npx upgrade-radar review
```

The default `review` path uses the current repository and `HEAD`, infers the comparison base from a local `main`/`master` merge-base and falls back to `HEAD~1`, reads dependency facts from Git, applies the bundled reviewed migration notes, and writes:

- `upgrade-radar-report/report.html`
- `upgrade-radar-report/report.md`
- `upgrade-radar-report/report.json`

The deterministic baseline requires no account or API key.

For a concrete example, consider the reviewed Express transition **4.21.2 → 5.1.0**. Express 5 uses the simple query parser by default. If the repository contains application code such as:

```ts
app.get("/search", (req, res) => res.json(req.query.filters));
```

Upgrade Radar can connect that resolved `req.query` usage to the reviewed Express migration-note span for the query-parser default change. The report then shows the exact application span, the exact reviewed note span, and the reason that row was selected so a reviewer can compare the two directly.

That is the intended unit of work: a bounded evidence pair worth reviewing, not a claim that the application is broken or safe.

## How to read the three statuses

### `review`

`review` means Upgrade Radar found a resolved application usage connected to an applicable reviewed migration-note behavior. The row is asking for human review of that evidence pair.

### `no_direct_evidence`

`no_direct_evidence` means the evaluated note/site pair did not show direct evidence for that behavior. It applies only to that bounded pair. It is **never** a statement that the dependency upgrade is safe to merge.

### `unknown`

`unknown` means the available evidence or analysis coverage was insufficient. Examples include missing applicable reviewed notes, unresolved usage, bounded static-analysis limits, unsupported lockfile or project shapes, or an optional provider failure.

For packages outside first-class reviewed coverage, Upgrade Radar can still surface resolved usage locations as manual review starting points. Those rows remain `unknown`; they do not become invented breakage findings.

## Exit codes

Upgrade Radar keeps the command result separate from the review disposition:

- `0` — completed advisory report
- `2` — incomplete report because evidence or coverage is missing
- `64` — invalid input
- `69` — provider failure

Exit `2` does **not** mean the command itself failed. It means the analysis could not establish complete evidence coverage for the detected upgrade and reports that gap explicitly. Findings alone do not make a completed run fail.

## What it will not do

Upgrade Radar does not:

- execute the repository being analyzed;
- install its dependencies;
- fetch arbitrary migration URLs;
- comment on pull requests; or
- merge code.

It is an advisory compatibility-review tool. It does not replace the repository's normal tests and does not authorize automatic merge decisions.

## Current coverage and limits

The current first-class reviewed transitions are:

- Express **4.21.2 → 5.1.0**
- Zod **3.25.76 → 4.1.5**
- Glob **8.1.0 → 10.4.5**
- Commander **11.1.0 → 12.1.0**

The compatibility corpus contains 60 authored cases across ten documented behavior families. Packages outside those reviewed transitions can still receive generic resolved-usage starting points, but those generic rows do not inherit first-class coverage claims.

Important bounded areas remain explicit rather than silently treated as safe. Current limits include workspaces, non-npm package managers, transitive-only upgrades, arbitrary runtime-computed package references, unresolved wrappers, full-program call-graph/dataflow reasoning, incomplete migration notes, source/candidate caps, and unsupported lockfiles.

## Add a behavior family

Adding a first-class behavior family means adding reviewed evidence and executable coverage, not just another package name. The workflow is documented in [adding reviewed notes](adding-notes.md): add a short paraphrased reviewed note with provenance, an adapter rule where deterministic syntax is available, old/new assertions with controls, explicit unknown cases for missing evidence, and unit/integration coverage.

When corpus definitions change, run the repository checks described there, including `npm run notes:manifest`, `npm run corpus:generate` when required, and `npm run check`.

## Links

- Repository: https://github.com/GaneshVG18/upgrade-radar
- Live illustrative report: https://ganeshvg18.github.io/upgrade-radar/demo/report.html
- npm: https://www.npmjs.com/package/upgrade-radar

