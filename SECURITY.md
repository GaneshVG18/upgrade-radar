# Security

Upgrade Radar performs static analysis of an existing checkout. It does not install or execute the repository being analyzed, fetch arbitrary URLs, modify target source, create issues, comment on pull requests, or merge code.

Report security issues privately through GitHub's private vulnerability reporting feature when available. Do not include real credentials in a report. The tool redacts common secret shapes before live provider requests, but redaction is heuristic; review `--dry-run` output before sending sensitive source excerpts to a provider.

The development dependency graph intentionally includes exact historical Express, Zod, Glob, and Commander versions used as executable compatibility fixtures. Those old fixture packages may carry advisories by design; they are not runtime dependencies of Upgrade Radar. Use `npm audit --omit=dev` to audit the shipped dependency surface, and do not upgrade an old fixture merely to silence an advisory without replacing its old/new behavior proof.
