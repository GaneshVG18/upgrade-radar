# Launch posts — ready to use

Every character count below was measured with X's own weighting (URLs count as 23 regardless of length). Nothing here has been posted.

Rules applied to all copy: one primary action per post, no fake urgency, no unsupported benchmarks, no claim of comprehensive compatibility verification, and no request for a star until the tool has demonstrated something.

---

## 1. Three standalone X posts

### A — Concrete failure (275/280)

```text
Express 4 → 5 changes the default query parser.

?filters[color]=red used to give you req.query.filters = {color:"red"}

In Express 5 it gives you undefined.

Server boots. Tests pass. Search quietly returns everything.

npx upgrade-radar review finds the line that reads it.
```

### B — Maintainer workflow (273/280)

```text
Dependabot opens express 4.21.2 → 5.1.0. The diff is two lines. The migration guide is not about your code.

Upgrade Radar maps reviewed migration notes onto where your app actually touches them, and gives you the file and line.

Local, no API key:
npx upgrade-radar review
```

### C — Evidence demonstration (275/280)

```text
I didn't want to take the Express migration guide on trust, so the repo boots 4.21.2 and 5.1.0 in-process and sends both the same request.

req.query.filters
  v4: {"color":"red"}
  v5: undefined

Then it points at the line in your app that reads it.

https://github.com/GaneshVG18/upgrade-radar
```

### Recommended: **A**

**Hypothesis.** The audience is not currently looking for a dependency-review tool, so a post describing the tool competes for attention it does not have. A post describing a *failure they can recognise* borrows attention from something they already worry about: an upgrade that does not crash. A crashes nothing, passes tests, and returns wrong data — which is the specific fear that makes people sit on major-version PRs.

A also front-loads the concrete artifact (`req.query.filters = undefined`) rather than the product name, so a reader who scrolls past still leaves with a fact they can verify. The command appears once, at the end, as the only action.

**What would falsify it:** if A gets impressions but no repo visits, the failure is recognisable but the jump to "and there is a tool for it" is too large — in which case B, which names the workflow moment (the Dependabot PR), is the better opener.

---

## 2. Follow-up reply to the existing launch (248/280)

Reply to https://x.com/PacketPilgrim/status/2101755057821868229

```text
One thing I should have led with: you can see the whole output before pointing this at anything you care about.

npx upgrade-radar demo

Writes a full authored report locally. No network, no key, no repo of your own needed.

https://github.com/GaneshVG18/upgrade-radar
```

This adds the missing low-commitment entry point rather than restating the announcement.

---

## 3. Four-post technical thread

Adds evidence rather than repeating the launch. Post as its own thread, not as a reply to the original.

**1/**
```text
The Express 5 migration guide says the default query parser changed.

I wanted to know what that actually does to an app, so the repo boots both pinned versions in-process and sends one identical request to each.
```

**2/**
```text
Request: /products?filters[color]=red&filters[size]=L

express@4.21.2  req.query.filters = {"color":"red","size":"L"}
express@5.1.0   req.query.filters = undefined

Not a crash. Not an error. The nested keys just stop being parsed, and the value is gone.
```

**3/**
```text
That's the shape of upgrade risk that actually hurts: the server boots, the test suite passes, and an endpoint quietly returns unfiltered results.

The failures that crash at startup are the easy ones. You find those immediately.
```

**4/**
```text
So Upgrade Radar resolves which line of your app reads req.query, and links it to the reviewed note span that explains why.

If your app sets the parser explicitly, that same line is reported as no_direct_evidence instead — with the reason.

https://github.com/GaneshVG18/upgrade-radar
```

---

## 4. Show HN

**Title** (76 chars, within HN's 80-char limit):

```text
Show HN: Upgrade Radar – which lines of your code does a dependency bump touch
```

**Submission text:**

```text
A dependency PR is two lines of diff and an unknown amount of risk. The migration guide tells you what changed in the package; it does not tell you what changed for you.

Upgrade Radar takes a dependency version change between two Git revisions, resolves where your source actually uses the affected package behavior, and links each result to the exact span of a reviewed migration note.

The example I keep coming back to is the Express 4 -> 5 default query parser. The repo boots both pinned versions in-process and sends one identical request:

  /products?filters[color]=red&filters[size]=L

  express@4.21.2  req.query.filters = {"color":"red","size":"L"}
  express@5.1.0   req.query.filters = undefined

Nothing crashes. The server boots, tests pass, and a search endpoint silently stops filtering. Upgrade Radar points at the line that reads req.query and cites the note span that explains it. If the app selects the parser explicitly, that same line comes back as no_direct_evidence with the reason, rather than as a finding.

Scope is deliberately narrow and I would rather be up front about it than have you find out: first-class reviewed transitions are Express 4.21.2 -> 5.1.0, Zod 3.25.76 -> 4.1.5, Glob 8.1.0 -> 10.4.5 and Commander 11.1.0 -> 12.1.0. For any other package it resolves where you use it and reports those rows as unknown, explicitly labelled as manual starting points rather than findings. An empty review queue means it found no evidence inside its supported surface. It is not a statement that an upgrade is safe to merge.

The deterministic baseline needs no account and no API key, and it never executes or installs the repository being analyzed. There is an optional adapter that asks a hosted model one bounded relevance question about a single note/usage pair; it cannot produce filenames, line numbers or citations, and a failure or an ambiguous answer becomes unknown.

Try it without pointing it at anything you care about:

  npx upgrade-radar demo

Repo: https://github.com/GaneshVG18/upgrade-radar

I am most interested in where the resolution is wrong — a usage it should have connected and didn't, or a row it raised that your code is actually safe from.
```

**Posting notes:** Show HN requires something people can try. Post Tue–Thu, roughly 8–10am US Eastern. Read https://news.ycombinator.com/showhn.html before submitting. Do not ask anyone to upvote.

---

## 5. Technical community post

Centred on the reproducible example rather than the announcement. Suitable for r/node, dev.to, or a Node-adjacent Discord where tooling is on topic.

**Title:** What the Express 5 query-parser change actually does to `req.query`

```text
Express 5 switched the default query parser from "extended" to "simple". The migration guide states it; I wanted to see it, so I pinned both versions side by side and sent one identical request.

  /products?filters[color]=red&filters[size]=L

  express@4.21.2  req.query = {"filters":{"color":"red","size":"L"}}
                  req.query.filters = {"color":"red","size":"L"}

  express@5.1.0   req.query = {"filters[color]":"red","filters[size]":"L"}
                  req.query.filters = undefined

The keys survive; the nesting does not. Anything doing `const filters = req.query.filters` gets `undefined` and, if it treats that as "no filters", silently returns everything.

Setting `app.set("query parser", "extended")` restores the v4 result exactly, which makes it a one-line fix once you know which handlers are affected.

Finding which handlers are affected is the part that does not scale by reading. I wrote a tool for that half of it: it resolves where your source reads `req.query` and links each site to the reviewed note span. If the parser is configured explicitly it reports that same line as no_direct_evidence with the reason, so the control case does not become noise.

Reproduce the comparison yourself (it boots both pinned versions, no network):
  npm run evidence:query-parser

Tool, if useful: https://github.com/GaneshVG18/upgrade-radar
Coverage is four reviewed transitions today; everything else is reported as explicitly unknown.
```

---

## 6. Replies to likely questions

**On coverage** — *"Does this only work for four packages?"*

```text
First-class reviewed coverage is four transitions: Express 4.21.2->5.1.0, Zod 3.25.76->4.1.5, Glob 8.1.0->10.4.5, Commander 11.1.0->12.1.0. For anything else it resolves where you use the package and reports those rows as unknown, labelled as manual starting points, not findings. It never reports an uncovered upgrade as clean. Adding a transition is a reviewed note plus an adapter rule plus executable old/new assertions with a negative control — docs/adding-notes.md walks through it.
```

**On false positives** — *"How do I know it isn't just grepping for req.query?"*

```text
Reasonably: it resolves bindings through imports rather than matching text, and it carries a negative control. If your app sets the query parser explicitly, the same line comes back as no_direct_evidence with the reason, not as a finding. That said, a "review" row is a prompt to look, not a claim that something is broken — the disposition names are deliberate. If you hit a row your code is actually safe from, that's the most useful bug report I can get.
```

**On privacy** — *"What leaves my machine?"*

```text
In the default baseline mode, nothing. No network calls, no telemetry, no account. It also never executes the analyzed repository or installs its dependencies, and it will not fetch migration URLs at runtime. If you opt into the hosted adapter with an API key, it sends one redacted note/usage pair per question and `--dry-run` prints the exact payload first so you can read it before anything is sent.
```

**On Jev** — *"So it's an LLM wrapper?"*

```text
The default path has no model in it at all. When you do opt in, the model answers one closed relevance question about a single note/usage pair it was handed. It cannot generate filenames, line numbers, release facts, citations or patches — those come from deterministic code that owns the spans and hashes. A failed, ambiguous or low-confidence answer becomes unknown rather than a finding. If that sounds like a small role for a model, that's the intent.
```

**On existing tools** — *"Doesn't Dependabot/Renovate already do this?"*

```text
They do a different half. Dependabot and Renovate find the upgrade and open the PR; they don't tell you which of your own lines the upgrade touches. This runs on that PR and answers that second question for the transitions it has reviewed evidence for. It's complementary — it takes the PR they opened as input and doesn't open or merge anything itself.
```
