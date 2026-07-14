---
name: code-checklist
description: "Use when explicitly asked to produce a manual-verification checklist for the current branch."
---

# Code Checklist

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

Run these in order:

```bash
git branch --show-current
git rev-parse --short HEAD
git log --oneline [base]..HEAD
git diff --stat [base]...HEAD
git diff [base]...HEAD
```

If the branch name or PR body references a ticket, read it. Acceptance criteria from the ticket are the strongest source of "what to verify."

---

## Step 3 — Identify Behavioural Changes

For each file in the diff, classify the change:

- **New flow** — a path a user can take that did not exist before
- **Changed flow** — a path that worked before but works differently now
- **Removed flow** — a path that worked before and no longer exists
- **Internal** — refactor, type narrowing, rename, dead code, comments, formatting. No observable behaviour change at any callsite.

Read the full file when needed. Trace the call chain enough to be sure: a "refactor" that subtly changes ordering, null handling, or types at a callsite is a changed flow, not internal. A dependency bump that ships new behaviour to users is a changed flow, not internal.

Note that "user" is broader than a person clicking a UI. An internal API endpoint hit by another service, a webhook handler, a cron job, a CLI command — all of these have "users" (other systems or operators) whose flow can break. Classify accordingly.

---

## Step 4 — Decide What Belongs on the Checklist

For each change, ask two questions in order:

1. **Will this change be exercised by a user-visible flow already on the checklist?** If yes, drop it — the user-visible test implicitly covers it. This is how most internal refactors get filtered out.
2. **If it won't be covered by anything else, does it still need a human to confirm it works?** Some internal changes do — an internal API endpoint with no UI but called by jobs, a webhook handler, a CLI command, a script. Include those with a concrete invocation (e.g. `curl -X POST ...`) and a clear expected result.

The default: most internal changes get dropped because user flows cover them. But it's a judgement call — when an internal change has no user-visible proxy, it belongs on the checklist on its own terms.

Keep:

- The happy path of any new or changed user-facing flow
- The most common entry point a user takes to reach the changed code
- Any change that affects a default or unchecked behaviour
- Internal changes with no user-visible proxy (internal APIs, jobs, CLI, scripts)

Drop:

- Edge cases the automated test suite already covers
- Rare error states that fire only under malformed input
- Admin-only debug paths unless the diff is specifically about them
- Internal changes whose effect is already verified by a user-visible item on the checklist

The goal is a checklist a human can complete in a few minutes, not an exhaustive QA plan.

If every change is internal and every internal change is either trivially safe (rename, formatting, comments) or covered by a user-flow test on the list, produce an empty checklist with a one-line justification.

---

## Step 4b — Merge with the Author's Test Plan (if one exists)

If the PR body contains a test plan section (look in `gh pr view --body`), do not skip your own derivation in favour of it. The author's plan reflects what they thought to test, which often misses things a fresh reader would catch. Likewise, the author may have context (a flag to flip, a fixture to seed) that's hard to derive from the diff.

Workflow:

1. Do your own derivation first (Steps 3-4 above).
2. Read the author's plan and compare.
3. Merge into a single list: include items from both, deduplicate near-identical ones, normalise everything to the format in Step 5. When the author's wording is clearer, use it. When yours catches something they missed, keep yours.

If there is no PR or no test plan in the body, skip this step.

---

## Step 5 — Write the Checklist

Save to:

```bash
.agent-notes/testing/<sanitised-branch>_<YYYY-MM-DD-HHMM>.md
```

Sanitise the branch name first: replace `/` with `-` so it stays a single path segment. E.g. `feat/audio-fix` becomes `feat-audio-fix`.

Create `.agent-notes/testing/` if it does not exist.

Format:

```markdown
# Manual Tests — [branch] -> [base]

**Date**: YYYY-MM-DD HH:MM
**Commit**: [short hash]

**Summary**: One sentence on what this PR changes from the user's perspective.

## Checklist

- [ ] **<short label>:** <description of what to do>. Expected: <what they should see>.
- [ ] **<short label>:** <description>. Expected: <expected>.

## Notes

- Anything the tester should set up first (logged-in user, seed data, feature flag).
- Anything that is intentionally out of scope for manual testing because the suite covers it.
```

The short label is a 2-4 word handle for the test — easy to reference in a standup or a PR comment ("did Load saved rate pass?"). The description is the imperative the tester performs. The expected is what they should see if the change works.

Default to a single list. Only split the checklist into multiple `##` sections if the PR genuinely spans several unrelated areas (e.g. an infra change bundled with a feature, or a sweep across many subsystems). For most PRs — even ones with 10+ items — a single list reads better than artificial grouping.

**Language and tone.** Write each bullet like a working developer briefing a teammate, not like a QA document. Direct, natural, slightly clipped.

Keep:

- Plain words. Short sentences. Concrete actions.
- Imperatives for the description ("Click Save", "Hit the endpoint with…"), specifics for the expected ("rate persists after reload", "returns 200 with the new id").

Strip:

- Em-dashes (`—`). Use a comma or a period.
- Semicolons (`;`). Split into two sentences.
- Possessive apostrophes (`'s`). Rephrase. "The user's session" becomes "the session for the user". Models over-use possessives in a way that makes prose feel polished and stiff. Forcing the rephrase produces blunter, more natural text.
- Marketing or QA-formal language, hedges, filler ("simply", "just", "comprehensively", "ensure", "verify that", "leverage").
- Restating what the short label already says inside the description.

Real testers write `Click "Save", confirm the rate persists after reload` rather than `The user should click the Save button in order to verify that the rate value persists upon reload of the page`. Both are accurate. Only one sounds like a person.

If a bullet still feels long or formal after rewriting, rewrite it again or split it in two. Cut filler, not signal — these bullets are the deliverable.

If the diff is purely internal, the checklist section is empty and the Notes section explains why in one line.

---

## Step 6 — Post the Checklist to Chat

After saving the file, post the same checklist directly in the chat for fast scanning. Do not repeat the file header or footer. Format:

```markdown
## Manual Tests — [branch]

- [ ] **<short label>:** <description>. Expected: <expected>.
- [ ] **<short label>:** <description>. Expected: <expected>.

Saved to: .agent-notes/testing/<filename>.md
```

If the checklist is empty, post a single short paragraph explaining the diff is internal and no manual verification is needed.
