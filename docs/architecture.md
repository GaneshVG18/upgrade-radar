# Architecture

Upgrade Radar is deliberately split into deterministic evidence collection and an optional bounded semantic judgment.

1. Dependency facts validate exact semantic versions and package-lock v2/v3 direct-dependency resolution. Diff mode reads manifests and lockfiles from the requested Git objects.
2. Source inventory reads tracked JavaScript/TypeScript files from the working tree or a Git object. It rejects symlink source paths, caps file count/size, and excludes generated, vendor, build, and likely credential files.
3. Package-aware adapters use the TypeScript parser to identify imports, aliases, namespace imports, literal CommonJS requires, and one bounded local re-export hop. Express and Zod have documented behavior-family rules.
4. Notes parsing assigns stable hashed evidence spans to reviewed paragraphs and verifies the document against `notes-manifest.json`.
5. Candidate generation joins a supplied note family to resolved usage of the exact package. Candidate caps become explicit incompleteness.
6. The deterministic baseline applies visible rules such as an explicit Express `query parser = extended` control. The optional Jev provider sends one redacted note/usage pair and four narrow typed questions.
7. Host policy validates probabilities and maps missing facts, contradictory answers, malformed responses, and provider failures to `unknown`.
8. Report rendering validates evidence IDs/hashes and escapes all repository/note text before producing versioned JSON, Markdown, and standalone HTML.

Upgrade Radar does not build a full call graph, execute the analyzed project, install its dependencies, fetch release notes by URL, or let a model create citations.
