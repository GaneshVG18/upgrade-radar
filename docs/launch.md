# Launch draft

> Do not post automatically. Recheck the public branch/tag, repository URL, and README command immediately before posting.

## Primary post

Dependency upgrades can change two lockfile lines and still alter assumptions deep in app code.

I built Upgrade Radar to connect reviewed npm migration notes to the exact JS/TS usage worth inspecting — with line-linked evidence, explicit unknowns, and a no-key local baseline.

Open-source preview: https://github.com/GaneshVG18/upgrade-radar

## Detailed thread

### 1/7

Dependency upgrades are easy to review mechanically and hard to review behaviorally.

The package version changed. The migration guide lists ten things. But which changes actually touch this repository?

That is the problem Upgrade Radar targets.

https://github.com/GaneshVG18/upgrade-radar

### 2/7

It starts with deterministic facts: exact package/version transitions, resolved JS/TS imports and requires, application source spans, reviewed migration-note spans, hashes, and bounded coverage.

Then it builds a small review queue instead of dumping a changelog on you.

### 3/7

Each row is evidence-linked: app code, migration-note evidence, why the row exists, and a disposition of `review`, `no_direct_evidence`, or `unknown`.

Coverage limits stay visible. `no_direct_evidence` only means the bounded analyzer did not find direct evidence for that specific note/usage pair. It is never treated as "safe to merge."

### 4/7

The default path needs no AI key:

```sh
npx --yes --package=github:GaneshVG18/upgrade-radar#v0.1.6 upgrade-radar review
```

It infers the Git comparison, detects supported direct npm upgrades, uses bundled reviewed notes, and writes JSON + Markdown + standalone offline HTML.

### 5/7

Preview first-class coverage is intentionally narrow and transition-specific: Express `4.21.2 -> 5.1.0`, Zod `3.25.76 -> 4.1.5`, Glob `8.1.0 -> 10.4.5`, and Commander `11.1.0 -> 12.1.0`.

The repo ships 60 authored compatibility cases across ten behavior families, including positive cases, negative controls, unknowns, and robustness variants. That corpus proves the pinned old/new package behavior used by those families; it is not a model benchmark.

### 6/7

Jev is optional and boxed in.

Host code owns package identity, source/note lines, hashes, redaction, and citations. Jev only receives one compact redacted note/usage pair and answers bounded relevance questions. Malformed, contradictory, incomplete, or failed judgments become `unknown`.

### 7/7

The design rule is simple: missing evidence must look missing.

Upgrade Radar does not execute the target repo, install its dependencies, fetch arbitrary migration URLs, or auto-approve upgrades. It is a review instrument, not a merge oracle.

https://github.com/GaneshVG18/upgrade-radar

## 20–30 second demo storyboard

1. Show an Express `4.21.2 -> 5.1.0` dependency PR and ask: "Two dependency lines changed. Which application behavior is actually exposed?"
2. Run zero-config `upgrade-radar review` and open the standalone report.
3. Expand the query-parser row and show the reviewed migration note beside the exact nested `req.query` handler.
4. Show the explicit extended-parser negative control and a visible coverage limitation so the report demonstrates both evidence and restraint.
5. End on the core trust model: deterministic evidence/citations, optional bounded Jev, and visible unknowns.

## Claims to avoid

- Do not call the preview production-ready.
- Do not describe `no_direct_evidence` as safe, compatible, or approved.
- Do not publish private Jev evaluation metrics, raw outputs, timings, or costs.
- Do not imply broad package-manager, workspace, transitive-dependency, or arbitrary-package behavior coverage.
- Do not advertise a release tag until it exists and points at the verified commit.

Do not post this file automatically.
