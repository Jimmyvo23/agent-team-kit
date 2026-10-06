# agent-team-kit

A reusable package that installs a five-role Claude Code team plus a local office dashboard into a project.

Status: repo skeleton only (T-001). See `docs/superpowers/specs/` for the design.

## Repo decisions

- **Public repo.** GitHub Free only enforces branch protection on public repos, so this repo is public. Commit nothing personal or secret.
- **Branch protection on `main`.** Changes need a pull request and a passing `ci` check. Force pushes and deletions are blocked. Required approvals are 0 because this is a single-account repo and an author cannot approve their own pull request. Reviewer verdicts are pull request comments.

## Development

```
npm ci
npm run lint
npm test
npm run test:e2e -- --pass-with-no-tests
```

Requires Node 20 or newer.
