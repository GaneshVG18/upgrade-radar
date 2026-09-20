# Limitations

The v0.1 preview is intentionally narrow.

- First-class behavior coverage is Express 4.21.2 → 5.1.0 and Zod 3.25.76 → 4.1.5. Generic package usage does not inherit those claims.
- Only npm root projects and package-lock v2/v3 direct dependencies are supported for deterministic upgrade facts.
- Workspaces, Yarn/pnpm/Bun lockfiles, transitive-only upgrades, computed/dynamic imports, unresolved wrappers, and arbitrary metaprogramming are outside the supported surface.
- Local re-exports are bounded; this is not full module/dataflow resolution.
- Express request/configuration analysis only uses directly visible source facts. Hidden configuration becomes unknown rather than an inferred default.
- Source files over the configured size bound and inventories beyond the cap are skipped/truncated and make the report incomplete.
- Supplied notes can themselves be incomplete. Upgrade Radar does not invent missing release facts.
- A supplied exact transition is not assumed to prove that every intermediate release note is represented; this remains a visible coverage limitation.
- Secret redaction is heuristic. A live provider request sends selected source excerpts off-machine; inspect `--dry-run` first.
- A model probability or confidence is not empirical accuracy. `no_direct_evidence` is pair-local and is not a compatibility guarantee.
- The static HTML report uses a small inline filtering script and no external scripts or provider credentials.

The project remains a preview while semantic routing is experimental. Private live evaluation artifacts and conclusions are not published as service benchmarks; the deterministic baseline remains independently available.
