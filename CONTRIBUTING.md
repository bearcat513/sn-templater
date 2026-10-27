# Contributing

## Setup

Install with Bun, and run the scripts with Bun too. Node 22.18 or later must also be on the path: the ServiceNow SDK and the starter generator run on it.

```bash
bun install
bun run check     # what CI runs: format check, lint, typecheck, tests
bun run build     # starters, fonts, then now-sdk build
```

## Commit messages

Commits follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<area>): <what changed, in the imperative>

<why, when it is not obvious>
```

- **type:** `feat` (something people can use), `fix`, `perf`, `refactor` (no change in behaviour), `test`, `docs`, `build` (dependencies, scripts, CI), `chore`.
- **area:** the part of the app, as the folders name it: `engine`, `designer`, `builder`, `export`, `present`, `server`, `fluent`, `fonts`, `starters`.
- A change that breaks a body written by an earlier version, the script include's API, or an installed record says so with `!` after the type and a `BREAKING CHANGE:` line in the body.

```
feat(engine): conditions on whole sections

The cover, letterhead and watermark can now be shown only when a value holds.
```

## Versions and releases

The version in `package.json` is the app's version. It goes up on every deploy to a shared instance, following [semantic versioning](https://semver.org/):

- **patch** for fixes
- **minor** for new features
- **major** for a breaking change, as above

Use `npm version <patch|minor|major>` (it works under Bun too). That runs `scripts/sync-version.mjs`, which updates the module path the `Templater` script include loads its code from; the path carries the version. Then tag and push:

```bash
npm version minor -m "chore(release): %s"
git push --follow-tags
```

Each release gets a section in [CHANGELOG.md](CHANGELOG.md), written from the commit messages since the last tag.

## Template bodies

A change to what a template or presentation body can hold:

1. Update `src/server/shared/schema.ts` (the vocabulary the client and the instance both check against) and `src/client/engine/validate.ts` (the reader).
2. If an older body has to be read differently, bump `BODY_VERSION` and add a step to `migrate` in `src/server/shared/schema.ts`.
3. Add tests to `src/client/engine/__tests__/validate.test.ts` and `schema.test.ts`.
