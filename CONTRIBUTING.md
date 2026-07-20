# Contributing to BettaPay Backend

## Continuous Integration (CI)

The repository uses GitHub Actions to automatically validate every pull request and push to the default branch. The CI workflow is defined in `.github/workflows/ci.yml` and consists of the following jobs (executed in parallel where possible):

- **lint** – runs `pnpm lint` and fails on any linting errors.
- **type-check** – runs `pnpm type-check` to ensure the whole workspace type‑checks.
- **test** – builds the project with `pnpm build` then runs `pnpm test`. Test results are uploaded as artifacts.
- **audit** – runs `pnpm audit` and fails on high or critical vulnerabilities.
- **pr-title** – validates the pull‑request title against the Conventional Commits format (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`, `ci:`).

All jobs share a cached `pnpm` store to speed up subsequent runs.

## Required Status Checks
When a PR is opened, GitHub will require the following checks to pass before the PR can be merged (configure this in **Branch protection rules** for `main` or your default branch):

- `lint`
- `type-check`
- `test`
- `audit`
- `pr-title`

## Running Checks Locally
```bash
# Install pnpm globally if you do not have it
npm i -g pnpm

# Install dependencies (uses the lockfile)
pnpm install --frozen-lockfile

# Lint
pnpm lint

# Type‑check
pnpm type-check

# Build
pnpm build

# Tests
pnpm test

# Dependency audit (fails on high/critical)
pnpm audit
```

## Troubleshooting Common CI Failures
- **Cache misses** – Ensure you are using the same Node version (`20`) locally as the CI workflow.
- **Lint errors** – Run `pnpm lint` locally and fix any reported issues before pushing.
- **Type errors** – Run `pnpm type-check` locally; often caused by missing imports or mismatched types.
- **Audit failures** – Update or replace vulnerable dependencies, or add a `pnpm audit --prod` exclusion if the vulnerability is only in a dev‑only package.
- **PR title validation** – Make sure your PR title starts with one of the allowed types followed by a colon, e.g., `feat: add admin API key authentication`.

## Branch Protection Guidance
Create a protection rule for the default branch (`main` or `master`) with the required status checks listed above and enable **Require linear history** and **Require pull request reviews before merging**. This repository currently contains a placeholder file `auto-merge.yml` that automatically merges approved PRs; the CI checks listed here should be added to the required checks for the auto‑merge bot to work safely.
