# Hero demonstration — 28-second script

**Status: NOT RECORDED.** This is a timed storyboard plus exact capture steps. Every line of output below was produced by running the commands in this document; nothing is mocked. The clip itself still needs a screen capture, which needs a human at a terminal.

Existing assets that already cover part of this: `docs/demo/terminal.gif` (18s, silent) and `upgrade-radar-detailed-explainer.mp4` (2:18, narrated). Neither shows the old-vs-new runtime behavior, which is the part that makes the case.

---

## What the clip has to prove

That a dependency upgrade can change application behavior **without crashing**, and that the tool points at the line responsible. The Express 4 → 5 default query parser is the strongest available candidate because the failure is silent.

---

## Timed storyboard

### 0:00–0:04 — the diff, and what it actually does

Left: the entire PR. Right: the measured consequence.

```diff
-  "express": "4.21.2"
+  "express": "5.1.0"
```

Caption: **Two lines. Here is what they do to `req.query`.**

Cut to the measured output (real, from `npm run evidence:query-parser`):

```text
/products?filters[color]=red&filters[size]=L

express@4.21.2   req.query.filters = {"color":"red","size":"L"}
express@5.1.0    req.query.filters = undefined
```

Caption: **No error. The value is just gone.**

### 0:04–0:10 — run the real command

```text
$ npx upgrade-radar review
Upgrade Radar: 1 upgrade(s), 1 review, 0 no-direct-evidence, 0 unknown.
Report: upgrade-radar-report/report.html
```

Caption: **One command. No API key.**

### 0:10–0:22 — the report, the line, the evidence

Open `report.html`. Scroll to the single row and expand **Inspect evidence** so the note and the code sit side by side.

On screen (real report content):

```text
Needs review — Query parser default
  APPLICATION   src/app.ts:8
  RELEASE NOTE  express-5.md:13-13

  src/app.ts:8    const filters = req.query.filters;

  express-5.md:13 Express 5 uses the simple query parser by default.
                  Applications that rely on nested query-string objects
                  should review `req.query` consumers or explicitly
                  select the parser behavior they require.
```

Caption: **Your line, and the reviewed note that explains it.**

Then the control — same upgrade, app sets the parser explicitly:

```text
No direct evidence — Query parser default
  APPLICATION   src/app.ts:9
  Reason        Visible query parser configuration preserves extended parsing
```

Caption: **Configure the parser and it stops asking.**

### 0:22–0:28 — requirements, scope, one action

Three lines, held still, no animation:

```text
Node 24 or newer
Reviewed coverage: Express, Zod, Glob, Commander
Everything else is reported as explicitly unknown

npx upgrade-radar demo
```

Caption: **Try it without pointing it at your own repo.**

End card: `npx upgrade-radar review` over `github.com/GaneshVG18/upgrade-radar` (the existing end card asset already matches).

---

## Exact capture steps

Everything below has been executed; the outputs quoted above are its real results.

**1. Reproduce the behavior comparison**

```sh
cd /Users/ganeshvaradi/upgrade-radar
npm run evidence:query-parser
```

**2. Build the example repository**

```sh
mkdir -p /tmp/shop-api/src && cd /tmp/shop-api && git init -b main
git config user.email demo@example.com
git config user.name "Upgrade Radar demo"
cat > package.json <<'JSON'
{ "name": "shop-api", "version": "2.4.0", "type": "module",
  "dependencies": { "express": "4.21.2" } }
JSON
cat > package-lock.json <<'JSON'
{"name":"shop-api","lockfileVersion":3,"requires":true,"packages":{
 "":{"name":"shop-api","dependencies":{"express":"4.21.2"}},
 "node_modules/express":{"version":"4.21.2"}}}
JSON
cat > src/app.ts <<'TS'
import express from "express";

const app = express();

// Storefront search. Filters arrive nested:
//   /products?filters[color]=red&filters[size]=L
app.get("/products", (req, res) => {
  const filters = req.query.filters;
  res.json({ results: search(filters) });
});

declare function search(filters: unknown): unknown[];

export default app;
TS
git add -A && git commit -qm "shop-api 2.4.0 on express 4.21.2"
```

**3. Apply the upgrade and record the run**

Start the screen capture here.

Update both files through JSON rather than text substitution. The lockfile has
three version fields that must move together, and a whitespace-sensitive `sed`
silently misses them — which produces a manifest/lockfile disagreement and
`0 review, 1 unknown, exit 2` instead of the finding this clip is about.

```sh
node -e '
const fs = require("fs");
const manifest = JSON.parse(fs.readFileSync("package.json", "utf8"));
manifest.dependencies.express = "5.1.0";
fs.writeFileSync("package.json", JSON.stringify(manifest, null, 2) + "\n");

const lock = JSON.parse(fs.readFileSync("package-lock.json", "utf8"));
lock.packages[""].dependencies.express = "5.1.0";
lock.packages["node_modules/express"].version = "5.1.0";
fs.writeFileSync("package-lock.json", JSON.stringify(lock, null, 2) + "\n");
'
git commit -qam "chore(deps): bump express from 4.21.2 to 5.1.0"

npx --yes upgrade-radar review
open upgrade-radar-report/report.html
```

Expected: `1 upgrade(s), 1 review, 0 no-direct-evidence, 0 unknown`, exit `0`.

**4. Record the control**

```sh
node -e '
const fs = require("fs");
const file = "src/app.ts";
fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace(
  "const app = express();",
  "const app = express();\napp.set(\"query parser\", \"extended\");"
));
'
git commit -qam "fix: pin the extended query parser explicitly"
npx --yes upgrade-radar review --base HEAD~2 --head HEAD
```

Expected: `1 upgrade(s), 0 review, 1 no-direct-evidence, 0 unknown`.

**5. Capture settings**

1280×720, 25fps or higher. Terminal at ≥16pt — the report's own line numbers must be legible at phone width. Keep captions in the lower third clear of the report's filter bar. No audio track required; the clip has to work muted, which is how X autoplays it.

---

## Honesty constraints for this clip

- The example repository is **authored**, not a real customer incident, and any caption must not imply otherwise.
- The `0 unknown` result is specific to this fixture. Do not present it as typical.
- Do not show the fixture corpus as a measure of Jev accuracy; the baseline path in this clip uses no model at all.
- Do not imply the four reviewed transitions constitute comprehensive Express 5 compatibility verification. The scope card at 0:22 exists precisely to prevent that reading.
