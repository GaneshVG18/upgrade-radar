# Architecture

Upgrade Radar is deliberately split into deterministic evidence collection and an optional bounded semantic judgment.

1. Dependency facts validate exact semantic versions and package-lock v2/v3 direct-dependency resolution. Diff mode reads manifests and lockfiles from the requested Git objects.
2. Source inventory reads tracked JavaScript/TypeScript files from the working tree or a Git object. It rejects symlink source paths, caps file count/size, excludes generated, vendor, build, and likely credential files, and builds commit-pinned source links when a clean revision and supported origin remote are available.
3. Package-aware adapters use the TypeScript parser to identify imports, aliases, namespace imports, literal CommonJS requires, and one bounded local re-export hop. Express, Zod, Glob, and Commander have documented behavior-family rules for exact reviewed transitions.
4. Notes parsing assigns stable hashed evidence spans to reviewed paragraphs and verifies the document against `notes-manifest.json`.
5. Candidate generation joins a supplied note family to resolved usage of the exact package. Candidate caps become explicit incompleteness.
6. The deterministic baseline applies visible rules such as an unconditional top-level Express `query parser = extended` control. Conditional, wrapped, imported, or otherwise unresolved configuration remains unknown. The optional Jev provider sends one redacted note/usage pair and four narrow typed questions. Calls are serial (concurrency 1), excerpts are bounded, the 200-candidate cap also bounds provider requests, each attempt has an 8-second timeout, and the SDK is configured for one retry on transient status classes.
7. Before a live request, host policy checks provider payload completeness. Truncated note/source excerpts and adapter missing facts return `unknown` without contacting Jev. Policy v3 validates probabilities, requires a majority-confidence Choice before accepting its branch, and maps contradictory answers, malformed responses, and provider failures to `unknown`. Model-reported preservation alone never proves `no_direct_evidence`; that disposition requires a deterministic visible preservation fact or a consistent negative pair judgment.
8. Report rendering validates evidence IDs/hashes and escapes all repository/note text before producing versioned JSON, Markdown, and standalone HTML.

Private evaluation keeps retrieval misses separate from model judgments and records detected unresolved-wrapper references as explicit unsupported coverage. Upgrade Radar does not build a full call graph, execute the analyzed project, install its dependencies, fetch release notes by URL, or let a model create citations.
