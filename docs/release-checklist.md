# Release checklist

- [ ] Node version matches `.nvmrc` and CI.
- [ ] `npm ci --ignore-scripts` succeeds from a clean checkout.
- [ ] `npm run notes:manifest` produces no unintended diff.
- [ ] `npm run corpus:generate` produces no unintended diff.
- [ ] `npm run check` succeeds.
- [ ] Example baseline reports complete with verified note provenance.
- [ ] Fresh-clone demo produces semantically identical JSON aside from timestamp.
- [ ] `git status`, staged diff, and tracked-file inventory reviewed.
- [ ] Secret scan passes with no committed credential/private-evaluation material.
- [ ] `.private-evals/`, private research, `.env`, caches, and local credentials are untracked.
- [ ] Remote CI succeeds at the intended release commit.
- [ ] README links and demo screenshot resolve from GitHub.
- [ ] Release tag targets the verified commit.
- [ ] Use a prerelease while the private live semantic evaluation gate is incomplete.
