# Contributing

<!-- TOC -->

- [Contributing](#contributing)
  - [Submitting a Change](#submitting-a-change)
    - [Commit Message Convention](#commit-message-convention)
    - [Common Commit Types](#common-commit-types)
    - [Rebase Interactive](#rebase-interactive)
    - [Breaking Changes](#breaking-changes)
      - [How to approach breaking changes](#how-to-approach-breaking-changes)
      - [Marking changes as breaking](#marking-changes-as-breaking)
      - [Removing deprecated functionality](#removing-deprecated-functionality)
    - [Reverting Commits](#reverting-commits)
    - [Highlight your code snippets in your messages](#highlight-your-code-snippets-in-your-messages)
  - [Release Process](#release-process)
  <!-- TOC -->

---

## Submitting a Change

- Install [pnpm](https://pnpm.io/installation) 12 and run `pnpm install`.
- `git checkout -b my-branch-name`. Short, accurate and lowercase branch names are recommended.
- Commit your changes. Check our [Commit Message Convention](#commit-message-convention).
- Add a changeset with `pnpm changeset`. See [Release Process](#release-process).
- Clean your commit history(if required). We recommend using [rebase interactive](#rebase-interactive).
- PR is approved by at least one of the [Codeowners](https://github.com/lokalise/npm-package-template/blob/main/CODEOWNERS).
- Rebase with `main` and **Merge** your changes.

### Commit Message Convention

This project follows the [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) approach. PR titles are checked against it. Versions and release notes come from [changesets](#release-process), not from commit messages.

### Common Commit Types

- feat → Addition or removal of features. Eg: `feat: add table on landing page`, `feat: remove table from landing page`.
- fix → Bug fixing, followed by the bug. Eg: `fix: illustration overflows in mobile view`.
- refactor → Code refactors. E.g. `refactor: change to use shared merge refs hook in Menu`.
- chore → Code that package won't output. E.g. `chore: add revert documentation to contributing docs`.

### Rebase Interactive

Because clean, linear and meaningful commit history is important, **Git interactive rebase** allows you to change individual commits, squash commits together, drop commits or change the order of the commits.

Here's a nice tutorial from [jetbrains](https://www.jetbrains.com/idea/guide/tutorials/git-interactive-rebase/) to learn how to rebase interactive from the UI or the CLI. [Configure your local git editor](https://git-scm.com/book/en/v2/Customizing-Git-Git-Configuration) `core.editor`. As an example you might not want to use VI or emacs editors for interactive rebase. You might want to use something simpler as vscode **(our recommendation)** or phpstorm for the process.

### Breaking Changes

A breaking change is any change in library that _could_ break existing consumer's code. Or, in other words, these are changes that _might_ require consumer to update their code before they can use the latest version.

Having breaking changes forces consumers to either stick with older version of the library or make changes when they might not have time for it.

Examples of breaking changes include changing prop type or name, removing exported type or function, bumping major peer dependency version, etc.

#### How to approach breaking changes

In case you're removing or renaming something, see if you can instead mark that piece of code as deprecated (using [`@deprecated`](https://jsdoc.app/tags-deprecated.html) tag). This will inform consumers of library that the particular piece of code should not be used. When applicable, provide an alternative.

#### Marking changes as breaking

If changes are breaking, pick `major` in the changeset and say in its summary what consumers need to change.

#### Removing deprecated functionality

If we followed suggestion from the [previous section](#how-to-approach-breaking-changes), we're likely to end up with a bunch of deprecated functionality that we don't want to maintain forever. Every once in a while we'll do a breaking change release where the only changes will be removal of deprecated features. 

This should mean that, if consumers migrated deprecated features in timely manner, the breaking change should actually be painless.

### I accidently merged commits from Main

There's a couple of options that could be considered:

- By using [rebase interactive](#rebase-interactive). Check the total amount of commits _(X)_ you have in your branch, run `git rebase -i HEAD~X` and drop the commits brought from main.
- By opening a new Feature Branch, [cherry-pick](https://git-scm.com/docs/git-cherry-pick) your commits from your old branch and push.

### Reverting Commits

If the commit reverts a previous commit, it should begin with `revert:` , followed by the header of the reverted commit. In the body it should say: `This reverts commit <hash>.` followed by a reason for the revert, where the hash is the SHA of the commit being reverted:

```shell
revert: feat: add type to foo var

This reverts commit a7721472aad3bab9deff29e184df9a05b274e2dc. Reason to revert.
```

Keep in mind that the standard commit message from `git revert` is slightly different, so make sure to use the `--edit` option when running `git revert` to adjust the commit message.

A revert that changes the published package needs a changeset like any other change.

### Highlight your code snippets in your messages

Wrap your message in double quotes and escape the back ticks.

```shell
git commit -m "feat: add \`boolean\` prop \`open\` to \`<dialog>\`"
```

---

## Release Process

Releases are managed with [changesets](https://github.com/changesets/changesets).

- Every PR needs a changeset. Run `pnpm changeset`, pick the bump (`patch`, `minor` or `major`) and write a one-line summary for consumers. It lands in `CHANGELOG.md`.
- A change that must not release (tooling, tests, docs) takes an empty changeset: `pnpm changeset --empty`.
- The `changeset-check` job fails a PR without a changeset. PRs labelled `skip-release` skip it; Dependabot applies that label.
- After merge to `main`, the release workflow opens a "Release Packages" PR that bumps the version and updates `CHANGELOG.md`, merges it and publishes the package to npm.
