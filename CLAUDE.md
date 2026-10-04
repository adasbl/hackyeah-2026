# Git Commit Guidelines

All commits in this repository must contain **only a single line (the subject)** in **Conventional Commits** format. Do not add a body or footers.

## Format

```text
<type>(scope): <concise description of the change>
```

# Package Manager

This repository uses **npm** exclusively. Do not use pnpm or Yarn.

- Install and update dependencies with `npm install`; use `npm ci` for reproducible installations (e.g., in CI).
- Run scripts with `npm run <name>`, e.g., `npm run dev`, `npm run build`, `npm run lint`, and `npm run typecheck`.
- The only lockfile is `package-lock.json`. Commit it together with dependency changes in `package.json`; do not create `pnpm-lock.yaml` or `yarn.lock`.
