# Measurement

## Dated baseline — 2026-09-21

Collected before any campaign activity beyond the existing launch thread.

| Metric | Value | Source |
|---|---|---|
| GitHub stars | 0 | `gh repo view --json stargazerCount` |
| Forks | 0 | same |
| Watchers | 0 | same |
| Repo views, trailing 14d | 0 | `gh api repos/GaneshVG18/upgrade-radar/traffic/views` |
| Unique visitors, trailing 14d | 0 | same |
| npm downloads | none yet (endpoint returns 404) | `https://api.npmjs.org/downloads/point/last-week/upgrade-radar` |
| Published versions | 0.1.5, 0.1.6 (both 2026-09-20) | `npm view upgrade-radar time` |
| npm `latest` | 0.1.6 | `npm view upgrade-radar version` |
| Repo `main` | `a117ca4`, tagged `v0.1.7` (unpublished) | `git rev-parse` |
| X launch thread | posted 2026-09-21 00:57 IST | https://x.com/PacketPilgrim/status/2101755057821868229 |
| X account followers | 0 | profile |

The npm downloads endpoints return **404** rather than zero: the registry serves no download document at all until a package has recorded downloads, and this one was first published 2026-09-20. A 404 here means "no data yet", not a broken URL. Treat the first successful reading as the true start, not as growth.

`https://www.npmjs.com/package/upgrade-radar` returns 403 to command-line clients regardless of user agent; that is npm's anti-bot layer, not a problem with the package. Verify the page in a browser.

---

## What to track daily

```sh
# stars, forks, watchers
gh repo view GaneshVG18/upgrade-radar --json stargazerCount,forkCount,watchers

# traffic and referrers (requires push access; 14-day rolling window only)
gh api repos/GaneshVG18/upgrade-radar/traffic/views
gh api repos/GaneshVG18/upgrade-radar/traffic/clones
gh api repos/GaneshVG18/upgrade-radar/traffic/popular/referrers
gh api repos/GaneshVG18/upgrade-radar/traffic/popular/paths

# npm downloads
curl -s https://api.npmjs.org/downloads/point/last-day/upgrade-radar
curl -s https://api.npmjs.org/downloads/range/last-week/upgrade-radar
```

GitHub's traffic API keeps only a **14-day rolling window**, so these must be captured daily or the history is lost. Record them in a local file that is not committed.

---

## What these numbers do not mean

Stated plainly, because the temptation to over-read them during a launch is the whole problem.

- **npm downloads are not users.** A single CI job re-running installs many times. `npx` re-resolves on cache miss. Mirrors, proxies and registry scrapers all register as downloads. A download count is an upper bound on interest and no kind of bound on usage.
- **Stars are not adoption.** A star is a bookmark. Someone who stars and never runs it is indistinguishable in this data from someone who runs it weekly. Stars are worth tracking as an attention signal and nothing more.
- **Repo views are not visitors.** The uniques figure is approximate and window-limited, and a refresh from the author's own machine counts.
- **The only high-confidence signals are human ones**: someone saying they ran it, posting output, filing an issue, or asking a question that could only come from having used it. Those are the numbers in the learning targets, and they are counted by hand.
- **Clone counts include CI.** Every Actions run on the repository clones it.

---

## Learning targets

Not forecasts. These are the thresholds at which the seven-day experiment has taught something.

| Target | Definition | How counted |
|---|---|---|
| 10 independently confirmed trials | Someone other than the author states they ran `demo` or `review` | Manual; replies, issues, comments |
| 3 substantive feedback reports | Specific and actionable: a bug, an incorrect row, a missing transition | Manual; issues and replies |
| Evidence of repeat use | One person running it on a second upgrade, or adding the Action to a repo | Manual; self-reported or visible in a public repo |

A single high-quality bug report — "it flagged this line and my code was actually fine" — is worth more than all the stars the week could produce, because it is the only signal that tells us whether the resolution logic holds outside authored fixtures.

---

## Daily log template

Keep locally. Do not commit traffic data or anything containing private analytics or credentials.

```text
DATE  stars  views/uniq  clones  npm-dl  referrers(top3)  trials  feedback  notes
```

---

## Reading the results

The decision rules are in `campaign.md` §4 and are deliberately written in advance. In summary:

- **Low exposure** → distribution problem. Change venue, not copy.
- **Traffic without conversion** → landing problem. Demo clip above the fold.
- **"My package isn't covered"** → H1 confirmed. Stop promoting, start adding transitions. This is the most likely outcome and the most useful one.
- **A resolution bug** → best possible result. Fix, add a fixture, credit the reporter.

## Evidence for a future Codex for Open Source application

Kept deliberately separate from public product messaging, and built on demonstrated utility plus sustained maintenance rather than popularity.

Worth retaining as it accumulates:

- the dated baseline above, and the daily log;
- confirmed third-party trials and the feedback they produced;
- issues filed by other people, and the commits that closed them;
- the release history and CI record — every release in this repo has been gated on `npm run check` across Node 24 and 25;
- coverage growth: reviewed transitions added, each with executable old/new assertions and a negative control;
- corrections made against the project's own standard, such as the `0.1.6` release that existed solely to fix install instructions the `0.1.5` tarball stated wrongly, and the `demo` packaging bug found by testing the published artifact rather than the working tree.

No star count is treated as a threshold, because none is published as one.
