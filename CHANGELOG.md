# Changelog

## 0.1.8

- Fixed `demo` for every registry consumer. `files` shipped `examples/notes` but not the example application sources that `src/demo.ts` reads, so `npx upgrade-radar demo` — the documented no-key entry point — failed with `ENOENT` when installed from npm while working from a git clone. Adds the two example source directories and a packaging-smoke guard that runs `demo` from a packed production install.
- Added `scripts/evidence-query-parser.mjs` (`npm run evidence:query-parser`), which boots `express@4.21.2` and `express@5.1.0` on loopback, sends one identical nested query string to each, and asserts the exact results: v4 parses `filters` into `{color:"red",size:"L"}`, v5 leaves it `undefined` with the bracketed keys literal, and `app.set("query parser","extended")` restores the v4 object. Runs in CI on Node 24 and 25.
- Corrected the README, which described the change as parsing "into a different shape". Measured, `req.query.filters` becomes `undefined`.
- Clarified that `npx` downloads the package like any install, and that it is the installed baseline that runs locally without provider calls.
- Added `docs/launch/` with the funnel audit, launch copy, hero demonstration storyboard and measurement baseline, plus `scripts/x-weighted-length.mjs` for twitter-text v3 weighted counts.

## 0.1.7 — tagged, not published

Tagged at `a117ca4` but never published to the registry; these changes reach npm in 0.1.8.

- Rewrote the README opening around a concrete Express 4.21.2 → 5.1.0 upgrade — the two-line diff, the four reviewed behavior families the example app touches with file and line, and the one row that fails silently rather than crashing — instead of opening on the analysis architecture. States explicitly that the bundled Express notes cover four behavior families rather than the whole migration guide, so the example cannot be read as a clean bill of health for everything else.
- Replaced the package description, which led with an integration name rather than the problem, and expanded keywords from five terms to fifteen.
- Package code is unchanged from `0.1.6`.

## 0.1.6

- Corrected the install instructions carried inside the published npm package. The `0.1.5` tarball's README predated registry publication and still told readers the package was unpublished and to install from the Git tag. Package code is unchanged from `0.1.5`.

## 0.1.5

- Added first-class reviewed transitions for Glob **8.1.0 → 10.4.5** and Commander **11.1.0 → 12.1.0**, bringing the authored corpus to 60 compatibility cases and 50 executable assertions across 10 behavior families.
- Added generic resolved-usage starting points for packages without reviewed notes. Source analysis now runs even when no applicable note exists, and each row is reported as `unknown` under `generic-adapter` coverage with its resolved symbol and binding path, explicitly as a manual review starting point rather than a detected compatibility problem.
- Fixed a silent miss where a direct dependency bumped in `package.json` but left unchanged in the lockfile was reported as "no direct dependency version changes" with a success exit. The manifest/lockfile disagreement is now an explicit unknown and the report is incomplete.
- Relaxed the supported runtime to Node 24 or newer and added a Node 25 CI job so the supported range is tested rather than assumed.
- Clarified on completion that exit `2` reports incomplete evidence coverage rather than a failed command.
- Published the package to the npm registry so `npx upgrade-radar review` is the supported install path, and added verified launch media plus a GitHub Pages copy of the illustrative demo report.
- Added a distribution smoke test that packs the project, installs only production dependencies in a clean runner, and executes zero-config review against a separate multi-commit consumer repository.
- Added npm/GitHub package metadata and ignored the default local report directory in this repository.
- Added a zero-config `review` command that defaults to the current repository, infers the comparison refs, uses bundled reviewed Express/Zod notes, runs the no-key baseline, and writes a ready-to-open report.
- Made the composite GitHub Action zero-config after a full-history checkout; base/head, notes directory, and provider are now optional overrides.
- Made Git-installed/npx usage self-building via `prepare`, included runtime notes in the package, and fixed `typescript` from a dev-only dependency to a required runtime dependency after a clean consumer install exposed the packaging bug.
- Redesigned the standalone HTML report as a compact retro engineering review instrument while preserving offline operation, evidence navigation, filtering, run context, unknown coverage, and keyboard/mobile behavior.
- Hardened direct-dependency evidence so missing/unsupported lockfiles, workspaces, range mismatches, unresolved diff versions, and dependency downgrades cannot look complete.
- Tightened Express analysis for same-file named handlers, destructured `req.query`, named-vs-unnamed wildcards, non-literal routes, final visible parser configuration, and unresolved local wrappers. Conditional parser settings now remain unknown.
- Tightened Zod analysis so Infinity/default-short-circuit findings depend on visible parse inputs; hidden or cross-file use remains explicit unknown coverage.
- Updated Jev host policy to v3: deterministic visible preservation can bypass Jev, incomplete/truncated provider input abstains before a request, low-confidence or contradictory responses remain unknown, and model-reported preservation alone cannot suppress review.
- Private evaluation now records unresolved-wrapper coverage alongside retrieval misses so authored unknown cases cannot silently vanish from end-to-end accounting.
- Made Jev dry-run credential-free because it only renders the redacted payload and sends no provider request.
- Restricted diff-mode note discovery to regular files inside the supplied notes directory; manifest path escapes and note symlinks are ignored.
- Enabled `engine-strict` for npm installs in this repository so the documented runtime floor is enforced.

## 0.1.4 — preview

- Kept direct dependency upgrades visible as incomplete unknown coverage when applicable reviewed notes are missing.
- Made malformed notes manifests fall back to note discovery while retaining unverified provenance and incomplete status.
- Surfaced target-package dynamic imports and resolvable computed requires as explicit unknowns.
- Hardened revision-pinned source links for GitHub/GitLab and removed noisy missing-origin Git errors.
- Added CLI help and expanded real local Express/Zod product auditing.

## 0.1.3 — preview

- Added an end-to-end CI smoke of the composite GitHub Action using a synthetic local Git fixture, including report verification and artifact upload.
- Added an optional `repo` Action input for analyzing another already-checked-out local repository while preserving the workflow workspace as the default.

## 0.1.2 — preview

- Corrected public GitHub Action examples to reference the current prerelease tag consistently.

## 0.1.1 — preview

- Stable clone-independent note evidence IDs and commit-pinned source links for clean repositories with supported origin remotes.
- 48 isolated compatibility fixture directories plus a SHA-256 provenance manifest.
- Expanded engineering coverage for provider failures, partial batches, source bounds/symlinks, CLI exit codes, Git-object diff behavior, fixture integrity, and generic package-level candidates.
- Private family-split evaluation runner using the same adapter-derived candidate inventory for baseline and Jev; live results remain ignored and unpublished.

## 0.1.0 — preview

- TypeScript library and CLI with `demo`, `analyze`, and Git-object `diff` flows.
- Express 4.21.2 → 5.1.0 and Zod 3.25.76 → 4.1.5 first-class adapters and authored compatibility fixtures.
- Deterministic baseline plus optional TypeSafe Jev provider adapter.
- Versioned JSON, Markdown, and standalone HTML reports with evidence spans and explicit unknowns.
- Composite GitHub Action and secret-free CI.
