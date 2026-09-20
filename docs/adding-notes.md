# Adding reviewed migration notes

Upgrade Radar never fetches migration guides at runtime. A reviewed note is local evidence supplied by a human, with provenance recorded alongside it.

## Scaffold a note

```sh
upgrade-radar notes scaffold \
  --package react --from 18.2.0 --to 19.0.0 \
  --source https://react.dev/blog/2024/04/25/react-19-upgrade-guide \
  --out examples/notes/react-19.md
```

The command validates the version transition and provenance URL, writes front matter plus `Family:`/`TODO` placeholders, and makes **no network request**. It refuses to overwrite an existing file.

Review the upstream migration guide yourself, replace the TODO with a short paraphrase of one behavior, and use a stable family name. Do not paste an unreviewed changelog wholesale and do not claim behavior that the cited source does not support.

## Register provenance

For notes added under `examples/notes/`, run:

```sh
npm run notes:manifest
```

That rebuilds `examples/notes/notes-manifest.json` from the local note files and records package, exact `from`/`to`, source URL, retrieval date, and SHA-256. Re-run it after any note edit so a stale hash cannot look verified.

For a repository-specific notes directory, keep the same front matter and provide a matching `notes-manifest.json`, then pass that directory with `--notes-dir`.

## What generic coverage means

When a package has no applicable reviewed note, `review` can still enumerate resolved package usage as `unknown` manual-review starting points. Those rows are labeled `generic-adapter` and are not compatibility findings.

When reviewed notes are supplied for a package without a first-class adapter, deterministic baseline mode still keeps generic-adapter relevance `unknown`. Live Jev mode may judge only the bounded note/usage pairs it receives; host code still owns package/version identity, paths, spans, hashes, citations, caps, and report construction.

Adding a package to **first-class** coverage is a separate bar: add executable old/new behavior assertions, at least one negative control, deterministic adapter logic for the syntactic signal, unknown cases for unresolved evidence, and tests before any row may inherit a first-class coverage claim.
