# Changelog

## Unreleased

- Redesigned the standalone HTML report as a compact retro engineering review instrument while preserving offline operation, evidence navigation, filtering, run context, unknown coverage, and keyboard/mobile behavior.
- Updated Jev host policy to treat an explicitly shown old-behavior-preserving configuration as pair-local `no_direct_evidence` instead of an ambiguous unknown.
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
