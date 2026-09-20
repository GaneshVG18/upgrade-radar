# Upgrade Radar — launch campaign

**Baseline date:** 2026-09-21
**Repo:** https://github.com/GaneshVG18/upgrade-radar
**npm:** https://www.npmjs.com/package/upgrade-radar
**Existing launch thread:** https://x.com/PacketPilgrim/status/2101755057821868229
**Hosted report:** https://ganeshvg18.github.io/upgrade-radar/demo/report.html

**Verified state at time of writing:** repo `main` at `a117ca4`, tagged `v0.1.7`. npm `latest` is **`0.1.6`** — `v0.1.7` was tagged but never published. The briefing said 0.1.6; that is still correct for the registry.

**Objective.** Relevant users, useful feedback, repeat usage, and stars offered voluntarily after the tool has shown something. No virality is promised and no star count is treated as a threshold for anything.

---

## 1. Funnel audit

Path under examination: *sees the post → visits repo or npm → runs something → successfully reviews a supported upgrade.*

### Observed failures (reproduced, with root cause)

**O1 — `npx upgrade-radar demo` was broken for every npm user.** The command the README and `--help` both present as the no-network, no-key entry point failed on the published package:

```text
$ npx upgrade-radar@0.1.6 demo --out ./demo-out
upgrade-radar: ENOENT: no such file or directory, open
  '.../node_modules/upgrade-radar/examples/express-app/src/app.ts'
exit=64
```

Root cause: `package.json` `files` shipped `examples/notes` but not `examples/express-app` or `examples/zod-app`, which `src/demo.ts` reads. It worked from a git clone and failed from the registry, so the repo's own test suite never saw it. **Fixed on this branch**, with a regression guard in `scripts/package-smoke.mjs` that was confirmed to fail when the `files` field is reverted.

**O2 — the npm page serves the old positioning.** `latest` is `0.1.6`, whose bundled README still opens with "connects reviewed dependency migration notes to the unchanged application code" and whose description is "…for TypeScript with optional bounded Jev". The problem-first rewrite and the new description are on `main` but not on the registry. npm README/description/keywords are immutable per version, so this only resolves on the next publish.

**O3 — the two most likely first-run mistakes produce unhelpful errors.** Running `review` outside a Git repository returns `Unable to resolve review head: HEAD` (exit 64). It does not say that a Git repository is required, nor point to `demo`. This is the most probable first action of a visitor who pastes the command into whatever directory they happen to be in.

**O4 — `--help` does not state scope or runtime.** It lists commands and exit codes but never mentions Node 24+, nor which four transitions have reviewed coverage. A user who checks `--help` before running cannot learn whether their upgrade is supported.

**O5 — every share of the repo link renders a generic card.** `usesCustomOpenGraphImage` is `false`. A 1280×640 card has been produced at `/Users/ganeshvaradi/upgrade-radar-social-preview.png` but uploading it requires the GitHub web UI and has not been done.

### Hypotheses (not yet observed)

**H1 — the coverage cliff is the real retention problem.** Reviewed coverage is four transitions. A visitor who runs `review` on their own repository most likely has none of them pending, so their first real run returns `unknown` rows or an empty queue. The generic-adapter rows are honest and labelled, but "here is where you use react, I have no notes for it" may not feel like value. *Untested — this is the single most important thing the seven-day experiment should measure.*

**H2 — distribution, not messaging, is the binding constraint.** The launch account has 0 followers, so the thread cannot travel on its own. *Partly evidenced (the follower count is a fact); the conversion consequence is an assumption.*

### The five largest obstacles, ranked

| # | Obstacle | Status |
|---|---|---|
| 1 | The risk-free entry point (`demo`) crashed on the published package | Observed · fixed on this branch, needs a release |
| 2 | Registry page serves stale positioning and description | Observed · needs a publish |
| 3 | Coverage cliff on the first real run against the user's own repo | Hypothesis · to be measured |
| 4 | First-run errors do not explain the requirement or offer `demo` | Observed · partially addressed (README); CLI text unchanged |
| 5 | Generic social card on every shared link | Observed · asset ready, upload outstanding |

Deliberately **not** changed: the analysis architecture, the report design, the trust model, the CI, and the existing launch thread. All are working.

---

## 2. Hero demonstration

See `docs/launch/demo-script.md` for the timed storyboard and capture steps, and `scripts/evidence-query-parser.mjs` for the reproducible measurement.

Summary of what is now demonstrable end to end, all of it reproduced against the **published** package:

1. **The behavior change is measured, not quoted.** Both pinned Express versions are booted in-process and sent one identical request. `req.query.filters` goes from `{"color":"red","size":"L"}` to `undefined`.
2. **The control holds.** `app.set("query parser", "extended")` restores the v4 result exactly.
3. **The tool connects it.** `npx upgrade-radar@0.1.6 review` against a two-commit repo bumping express 4.21.2 → 5.1.0 reports `1 upgrade(s), 1 review`, pointing at `src/app.ts:8` and citing `express-5.md:13`.
4. **The control propagates.** With the parser configured, the same line is reported as `no_direct_evidence`, reason `Visible query parser configuration preserves extended parsing`.

This is an **authored example**, not a customer incident, and the fixture corpus is not a measure of Jev accuracy. Both distinctions are stated wherever the example is used.

---

## 3. Seven-day distribution experiment

Sequence: **concrete demonstration → technical explanation → response to real feedback → documented improvement.** One venue per day at most. No cross-posting the same text.

| Day | Action | Venue |
|---|---|---|
| 1 | Publish the release that fixes `demo`; upload the social card; post X draft **A** | X |
| 2 | Reply to the existing launch thread with the `demo` entry point | X |
| 3 | Show HN submission | Hacker News |
| 4 | Answer everything from days 1–3. No new promotion. | — |
| 5 | Technical community post centred on the measurement | r/node or dev.to |
| 6 | Post the four-post evidence thread | X |
| 7 | Ship one documented improvement from real feedback and say what changed | repo + X |

Day 4 is deliberately empty of promotion. If days 1–3 produce feedback, answering it well is worth more than a fourth post.

### Venues

Rules change; **re-read each linked rules page immediately before posting.** Listed fit is my assessment, not the moderators'.

**1. Hacker News — Show HN**
`https://news.ycombinator.com/showhn.html`
Fit: high. Something people can run, narrow scope, stated limits — the register HN rewards. Rules: must be something people can try; no asking for votes; respond to comments. Contribution: the Show HN text in `posts.md`.

**2. r/node**
`https://www.reddit.com/r/node/` — rules in the sidebar
Fit: high. Express upgrades are core to this audience. Rules: self-promotion is tolerated when the post carries substance on its own; several Node subreddits require account history. Contribution: the technical community post in `posts.md`, which stands alone as a finding about `req.query` even if nobody installs anything.

**3. dev.to**
`https://dev.to/` — `https://dev.to/code-of-conduct`
Fit: medium-high. No gatekeeping, indexes well, tolerant of tool posts with real content. Contribution: the long-form version of the query-parser measurement, with the tool as the closing section rather than the premise.

**4. Express GitHub Discussions**
`https://github.com/expressjs/express/discussions`
Fit: medium. Directly the affected community. **Discussions only — never open or comment on unrelated issues.** Contribution: the measurement posted as a Q&A/show-and-tell entry, tool mentioned once at the end. If the category rules read as unwelcoming to tools, skip it.

**5. Lobsters**
`https://lobste.rs/` — `https://lobste.rs/about`
Fit: medium, **gated**: invite-only, and self-authored submissions must carry the `authored by me` tag. Only viable if an account already exists. Do not seek an invite for the purpose of promotion. Skip if not already a member.

**Explicitly excluded:** r/programming and r/javascript (self-promotion rules make a launch post a poor fit for a new account); any Discord where tool posting is not an established category; unrelated GitHub issues on other projects.

---

## 4. Decision rules

Stated in advance so the reading is not retrofitted.

**If exposure is low** (fewer than ~300 impressions on the X post, no HN front page): the constraint is distribution, not the product. Do not rewrite copy. Move effort to venues with existing audiences — dev.to and r/node — and stop posting to X beyond the planned sequence.

**If visits do not convert** (repo traffic arrives, clone/npm numbers stay flat): the constraint is the landing page. The first screen already carries the Express example; the next lever is a 20-second demo clip above the fold, then the `demo` command earlier in the README.

**If users hit unsupported coverage** (feedback is "ran it, my package isn't covered"): **H1 is confirmed and it becomes the top priority.** Stop distribution work. Add the most-requested transition end to end — reviewed note, adapter rule, executable old/new assertions with a negative control — and reply to each reporter when it ships. Coverage is the product at that point, not the messaging.

**If a resolution bug is reported** (a usage it should have connected and didn't, or a row the code was safe from): treat it as the highest-value outcome of the whole campaign. Fix, add a fixture case, credit the reporter.

---

## 5. Learning targets

Targets are for learning, not promises, and none of them is a forecast.

- **10 independently confirmed trials** — someone other than the author running `demo` or `review` and saying so.
- **3 substantive feedback reports** — specific enough to act on; a bug, a wrong row, or a missing transition.
- **Evidence of repeat use** — any single person running it on a second upgrade, or adding the Action to a repository.

Measurement, counting caveats, and the dated baseline are in `docs/launch/measurement.md`.
