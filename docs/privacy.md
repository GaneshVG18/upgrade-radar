# Privacy and live mode

Normal analysis consumes local inputs only. Upgrade Radar does not fetch arbitrary URLs and does not execute the repository being analyzed.

`--provider baseline` stays local. `--provider jev` sends a compact redacted state containing the reviewed note paragraph, exact package/version transition, selected source excerpt, resolved symbol, directly visible configuration, and missing-fact markers. Credentials are read from `TYPESAFE_API_KEY`; they are never CLI arguments, report fields, fixtures, browser assets, or cache keys.

Redaction targets common API keys, bearer tokens, passwords, and private keys, but it is not a perfect secret detector. `--dry-run` prints the exact redacted payloads that would be sent so maintainers can inspect them before a live request.

Private evaluation output belongs in `.private-evals/`, which is ignored by Git. Do not attach it to releases, CI artifacts, screenshots, issues, or launch posts.

For a trusted manual GitHub workflow, keep live mode opt-in and avoid fork pull requests:

```yaml
on: workflow_dispatch
jobs:
  radar:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: GaneshVG18/upgrade-radar@v0.1.2
        env:
          TYPESAFE_API_KEY: ${{ secrets.TYPESAFE_API_KEY }}
        with:
          base: ${{ github.event.repository.default_branch }}
          head: ${{ github.sha }}
          notes-dir: reviewed-notes
          provider: jev
```

Do not use `pull_request_target` with an untrusted checkout and a provider secret.
