# Upgrade Radar

[![CI](https://github.com/GaneshVG18/upgrade-radar/actions/workflows/ci.yml/badge.svg)](https://github.com/GaneshVG18/upgrade-radar/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**The dependency PR changed two lines. Which application behavior changed?**

Upgrade Radar connects reviewed dependency migration notes to the unchanged application code that actually uses the affected package behavior. It returns a short evidence-linked review queue with exact code and note spans, explicit unknowns, and coverage limitations.

[See the standalone illustrative report →](https://ganeshvg18.github.io/upgrade-radar/demo/report.html)

![Upgrade Radar terminal demo](docs/demo/terminal.gif)

![Illustrative Upgrade Radar report](docs/demo/report.png)

The screenshot is generated from the repository's authored no-key demo. It is permanently labeled **ILLUSTRATIVE FIXTURE** and does not represent a live Jev evaluation.

## Why this exists

Migration guides describe what changed in a dependency. Your repository answers a different question: **does our code actually depend on that changed behavior?** Upgrade Radar joins those two pieces without pretending static analysis knows more than it does.

For each supported upgrade it gives you:

- the exact application usage worth reviewing;
- the exact reviewed migration-note span connected to that usage;
- a disposition of `review`, `no_direct_evidence`, or `unknown`;
- explicit coverage limits instead of silently treating missing evidence as safety; and
- JSON, Markdown, and a standalone offline HTML report for local or CI review.

## Run it

From the npm project you want to review, on Node 24 or newer:

```sh
npx --yes --package=github:GaneshVG18/upgrade-radar#v0.1.5 upgrade-radar review
```

That is the normal path. `review` uses the current repository and `HEAD`, infers the comparison base from a local `main`/`master` merge-base (falling back to `HEAD~1`), uses the bundled reviewed migration notes, and runs the deterministic no-key baseline. It writes `upgrade-radar-report/{report.html,report.md,report.json}`. No TypeSafe account or API key is required.

Example terminal summary:

```text
Upgrade Radar: 1 upgrade(s), 1 review, 0 no-direct-evidence, 0 unknown.
Report: /path/to/project/upgrade-radar-report/report.html
```

The npm package is prepared but not published yet. Until registry publication is complete, the release-tagged GitHub command above is the supported install path. For CI, pin the composite Action to the release tag shown below.

If there are no direct dependency version changes in the inferred comparison, the command succeeds with an empty report. If an upgrade is detected but reviewed notes or source coverage are insufficient, the report is incomplete and exits `2`. For packages without applicable reviewed notes, Upgrade Radar still lists resolved usage sites as manual review starting points; those rows are `unknown`, never findings of breakage.

To try the authored demo instead of analyzing a repository:

```sh
git clone https://github.com/GaneshVG18/upgrade-radar.git
cd upgrade-radar
nvm use
npm ci
npm run demo
open artifacts/demo/report.html
```

The demo shows the concrete Express 4 → 5 query-parser change, an explicit parser-configuration control, and a Zod 3 → 4 optional-default output change. The repository is pinned to Node 24.11.1.

## Analyze an explicit upgrade

```sh
node dist/cli.js analyze \
  --repo ./examples/express-app \
  --package express --from 4.21.2 --to 5.1.0 \
  --notes ./examples/notes/express-5.md \
  --provider baseline \
  --out artifacts/express
```

Inspect the exact redacted provider payload before a live request:

```sh
node dist/cli.js analyze \
  --repo ./examples/express-app \
  --package express --from 4.21.2 --to 5.1.0 \
  --notes ./examples/notes/express-5.md \
  --provider jev --dry-run
```

`--dry-run` does not require a TypeSafe API key and never sends a provider request. Live mode requires `TYPESAFE_API_KEY` in the environment. Missing credentials fail with provider exit code `69`; Upgrade Radar never silently falls back to fixture or baseline decisions.

## Diff two Git revisions

`review` accepts explicit refs and custom notes when inference is not what you want:

```sh
upgrade-radar review --base <base-sha> --head <head-sha>
```

The lower-level `diff` command keeps every input explicit. It reads `package.json` and package-lock v2/v3 directly from supplied Git objects, inspects source at `head`, and does not check out or alter the working tree:

```sh
node dist/cli.js diff \
  --repo /path/to/project --base <base-sha> --head <head-sha> \
  --notes-dir /path/to/reviewed-notes \
  --provider baseline --out artifacts/review
```

## Output contract

Every run writes `report.json`, `report.md`, and standalone `report.html`. JSON uses `upgrade-radar-report/v1`. Rows are `review`, `no_direct_evidence`, or `unknown`. `no_direct_evidence` only means the evaluated note/site pair lacks direct evidence; it is never a statement that an upgrade is safe to merge.

Exit codes are stable: `0` completed advisory report, `2` incomplete report, `64` invalid input, and `69` provider failure. Findings alone do not fail a run. Detected dependency upgrades with missing applicable notes remain visible as explicit unknown coverage gaps rather than being silently dropped.

## Supported scope

First-class v0.1 coverage is JavaScript/TypeScript, npm root projects, direct dependencies, package-lock v2/v3, and these exact reviewed transitions: Express **4.21.2 → 5.1.0**, Zod **3.25.76 → 4.1.5**, Glob **8.1.0 → 10.4.5**, and Commander **11.1.0 → 12.1.0**. Other packages can receive generic resolved-usage starting points without inheriting those coverage claims. In deterministic baseline mode, generic-adapter rows stay `unknown`; with user-supplied reviewed notes, live Jev mode may judge the bounded note/usage pairs.

Unsupported or bounded areas stay visible as limitations/unknowns: workspaces, non-npm package managers, transitive-only upgrades, arbitrary runtime-computed package references, unresolved wrappers, full call-graph/dataflow reasoning, incomplete notes, source/candidate caps, and unsupported lockfiles. Dynamic imports and resolvable computed package references are surfaced as explicit unknowns rather than treated as evidence of safety.

## Why the split between code and Jev?

Code owns package identity, versions, source/note spans, hashes, redaction, caps, and citations. The optional Jev adapter receives one compact note/usage pair and answers closed relevance questions. Host code validates the response and maps ambiguity or failures to `unknown`. Jev never generates filenames, line numbers, release facts, citations, patches, or commands.

## GitHub Action

```yaml
- uses: actions/checkout@v4
  with:
    fetch-depth: 0
- uses: GaneshVG18/upgrade-radar@v0.1.5
```

The composite Action needs only read access to the checkout. With full Git history available, it infers refs the same way as the CLI. `base`, `head`, `notes-dir`, and `provider` are optional overrides. Bundled notes and the no-key baseline are the defaults. It writes the report to the job summary and uploads an artifact. Do not expose provider keys to untrusted fork PR jobs. See [privacy](docs/privacy.md) for an opt-in trusted live-mode example.

## Evidence and evaluation

`npm run test:compat` executes 60 authored cases across ten documented change families for Express, Zod, Glob, and Commander. Every case has an isolated fixture directory with source, reviewed note, case metadata, exact package versions, upstream provenance URL, and SHA-256 entries in `fixtures/manifest.json`. Positive and negative labels come from pinned old/new package behavior; unknown cases state the missing evidence. Robustness variants are marked and are not treated as independent samples. Live Jev evaluation output is intentionally private and is not published as a benchmark.

More detail: [architecture](docs/architecture.md), [adding reviewed notes](docs/adding-notes.md), [limitations](docs/limitations.md), [evaluation](docs/evaluation.md), [privacy](docs/privacy.md), and [comparison](docs/comparison.md).

## Trust model

Upgrade Radar is intentionally advisory. Deterministic host code owns package identity, versions, source/note spans, hashes, caps, redaction, and report citations. Optional Jev only judges one bounded note/usage pair at a time. Ambiguous, incomplete, contradictory, unsupported, or provider-failed cases become visible unknowns rather than automatic approvals.

It does **not** execute the repository being analyzed, install its dependencies, fetch arbitrary migration URLs, comment on pull requests, or merge code. See [SECURITY.md](SECURITY.md) and [docs/limitations.md](docs/limitations.md) for the exact boundary.

## Adding a behavior family

Add a short paraphrased reviewed note plus provenance entry, an adapter rule when deterministic syntax is available, executable old/new assertions with controls, unknown cases for unresolved evidence, and unit/integration coverage. Run `npm run notes:manifest`, `npm run corpus:generate` when corpus definitions change, then `npm run check`.

MIT licensed. Upgrade Radar is an advisory compatibility-review tool; it does not replace normal tests or authorize automatic merge decisions.
