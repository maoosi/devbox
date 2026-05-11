---
name: code-manual-tests
description: Use when explicitly asked to produce a manual-test checklist for the current branch.
---

# Code Manual Tests

You are a senior engineer producing a focused manual-test checklist for the changes on the current branch. The deliverable is a short markdown checklist of the **core use cases** a human should exercise in the running app to verify the change works.

Your north star: **what would a human user actually do that this PR could break?** Not edge cases the test suite already covers. Not internal refactors with no user-visible effect. Just the core paths.

## Constraints

- Work only with the current local repository state
- Do not create or switch branches, do not commit, do not push, do not open PRs
- Do not fetch, pull, rebase, or merge
- Do not modify code
- Do not invent flows that the diff does not actually touch
- Do not attempt to read environment variables — no Doppler CLI/API, no `.env` reads, no `process.env` lookups

---

## Step 1 — Determine Base Branch

Priority order:

1. `gh pr view --json baseRefName -q .baseRefName`
2. `git config branch.$(git branch --show-current).merge`
3. Fall back to `main`, then `master`

State the detected base branch in the output file.

---

## Step 2 — Gather Diff and Commit Context

```bash
git branch --show-current
git rev-parse --short HEAD
git log --oneline [base]..HEAD
git diff --stat [base]...HEAD
git diff [base]...HEAD
```

If the branch name or PR body references a ticket, read it. Acceptance criteria from the ticket are the strongest source of "what to verify."

---

## Step 3 — Identify User-Visible Behavioral Changes

For each file in the diff, classify the change:

- **New flow** — a path a user can take that did not exist before
- **Changed flow** — a path that worked before but works differently now
- **Removed flow** — a path that worked before and no longer exists
- **Internal only** — refactor, types, dependency bump, dead code, comments, formatting. Not user-visible.

Read the full file when needed to confirm the classification. If a function was added but has no caller chain reaching the UI, CLI, API, or job runner, treat it as internal until proven otherwise.

If every change is internal, skip to Step 6 and produce an empty checklist with a one-line justification.

---

## Step 4 — Filter to Core Use Cases

For each user-visible change, ask: would a typical user actually exercise this path on the day the PR ships?

Keep:

- The happy path of any new or changed feature
- The most common entry point a user takes to reach the changed code
- Any change that affects a default or unchecked behavior

Drop:

- Edge cases the automated test suite already covers
- Rare error states that fire only under malformed input
- Admin-only debug paths unless the diff is specifically about them

The goal is a checklist a human can complete in a few minutes, not an exhaustive QA plan.

---

## Step 5 — Write the Checklist

Save to:

```
llm-notes/<branch-name>_code-manual-tests_<YYYYMMDD-HHMM>.md
```

Create the `llm-notes/` directory if it does not exist.

Format:

~~~markdown
# Manual Tests — [branch] -> [base]

**Date**: YYYY-MM-DD HH:MM
**Commit**: [short hash]

**Summary**: One sentence on what this PR changes from the user's perspective.

## Checklist

- [ ] [Short imperative sentence the user can perform.] Expected: [what they should see.]
- [ ] [...]

## Notes

- Anything the tester should set up first (logged-in user, seed data, feature flag).
- Anything that is intentionally out of scope for manual testing because the suite covers it.
~~~

If there are more than ~5 items, group by feature area with `## ` headings inside the Checklist section.

If the diff is purely internal, the checklist section is empty and the Notes section explains why in one line.

---

## Step 6 — Post the Checklist to Chat

After saving the file, post the same checklist directly in the chat for fast scanning. Do not repeat the file header or footer. Format:

```
## Manual Tests — [branch]

[ ] First item. Expected: ...
[ ] Second item. Expected: ...

Saved to: llm-notes/<filename>.md
```

If the checklist is empty, post a single short paragraph explaining the diff is internal and no manual verification is needed.
