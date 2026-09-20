# Contributing

Use Node 24.11.1 (`.nvmrc`) and run `npm ci --ignore-scripts && npm run check` before opening a change.

New library behavior support should include a reviewed note with provenance, a deterministic source adapter or an explicitly generic path, executable old/new compatibility evidence, positive and negative controls, and an intentionally incomplete case where appropriate. Keep upstream text paraphrased and link to the original source instead of copying migration guides.

Do not commit API keys, private evaluation output, downloaded third-party repositories, or service benchmark results. Live Jev experiments belong under ignored `.private-evals/`.
