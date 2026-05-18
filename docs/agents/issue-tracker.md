# Issue tracker: GitHub

Issues and PRDs for this repo live as GitHub issues. This is a private repo, so use the authenticated `gh` CLI from inside the local clone for all issue operations. Do not fetch GitHub issue pages over plain HTTP.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --comments`, filtering comments by `jq` and also fetching labels.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --comment "..."`

Infer the repo from `git remote -v`; `gh` does this automatically when run inside a clone.

## When a skill says "publish to the issue tracker"

Create a GitHub issue in `KacperKozak/vesc-app-poc`.

## PRD issues

When publishing a PRD, create a GitHub issue whose title starts with `[PRD] `.

Example:

```text
[PRD] Ride recording export
```

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`. Do not use unauthenticated HTTP requests or browser scraping for GitHub issue content.

## When implementing an issue

1. Fetch the issue with `gh issue view <number> --comments`.
2. Use local files in the checked-out repo for code and docs.
3. Use `gh issue comment <number> --body "..."` for implementation notes when needed.
4. Never rely on public GitHub HTTP URLs for issue or repository contents; this repo is private.
