# Changelog

## Unreleased

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
- Enforced the documented Node 24 runtime during npm installs with `engine-strict`.

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
