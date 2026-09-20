# Launch draft

## 20–30 second demo storyboard

1. Show a dependency PR: Express 4.21.2 → 5.1.0. Ask: “The dependency PR changed two lines. Which application behavior changed?”
2. Open Upgrade Radar's illustrative report and click the query-parser row.
3. Show the reviewed Express note beside the exact handler line reading nested `req.query` data.
4. Run `npm run test:compat` and show the authored old/new output difference plus the explicit `query parser = extended` negative control.
5. End on the architecture point: code resolves packages/citations; optional Jev judges one bounded relevance pair. Unknowns remain visible.

## Single post

The dependency PR changed two lines. Which app behavior changed? Upgrade Radar links npm migration notes to exact JS/TS usage worth reviewing, with Express/Zod fixtures and explicit unknowns. Jev judges relevance; code owns citations. https://github.com/GaneshVG18/upgrade-radar

## Optional thread

1. Upgrade Radar starts with deterministic facts: exact package/version, resolved imports, code spans, reviewed note spans, and hashes.
2. The no-key baseline works locally. Live Jev is opt-in and only sees a compact redacted note/usage pair; malformed or ambiguous answers become `unknown`.
3. The public repo ships 48 authored compatibility cases across eight Express/Zod behavior families. The demo is explicitly illustrative; private live model evaluation is not launch copy.

Do not post this file automatically.
