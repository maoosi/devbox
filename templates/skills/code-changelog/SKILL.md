---
name: code-changelog
description: "Use when explicitly asked to draft a changelog of what the current branch ships."
---

# Code Changelog

You are a senior engineer drafting a plain-language changelog for the changes on the current branch. The deliverable is a short markdown summary of what this PR ships and why, briefing-a-colleague-on-Slack tone, ready to copy-paste into a PR description, release note, or standup update.

Your north star: **what would a teammate need to know about this PR in 30 seconds?** The _why_ matters more than the _what_ — diffs already say what. Read the PR body and any linked ticket; they carry the motivation. Skip trivial churn.

## Constraints

- Work only with the current local repository state
- Do not create or switch branches, do not commit, do not push, do not open PRs
- Do not fetch, pull, rebase, or merge
- Do not modify code
- Do not invent changes the diff does not actually contain
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

If the branch name or PR body references a ticket (Linear, GitHub issue, Jira), read it. The ticket is the strongest source of _why_ and the framing the author already has in their head.

---

## Step 3 — Classify the Diff

For each file in the diff, decide whether the change deserves a bullet:

- **User-visible** — anything that changes what a user (human or another system) sees or experiences. Bullet it.
- **Behavioural** — anything that changes a default, a flow, or a contract, even if the surface looks the same. Bullet it.
- **Operationally relevant** — dependency bumps with real impact, infra/migration steps, feature flags, config defaults, anything an on-call person should know. Bullet it.
- **Internal** — pure refactors, rename, type narrowing, comment edits, formatting, dead-code removal. Skip unless several internal changes together tell a single narrative worth one bullet (e.g. "tightened types across the billing module").

Group related small changes under a single bullet when they share a narrative. A changelog is not a commit log.

---

## Step 4 — Merge with the PR Description / Author Intent

If a PR exists, the author has already framed the work. Use it.

1. Draft your own bullets from the diff first.
2. Read `gh pr view --body` and any linked ticket.
3. Merge into a single list. Prefer the author's framing for _why_ (they know the motivation). Prefer your own derivation for _what_ (you have read the diff). Deduplicate near-identical ones. When the author's wording is clearer, use it. When you caught something they missed, keep yours.

If there is no PR or no body, skip this step.

---

## Step 5 — Write the Changelog File

Save to:

```bash
.agent-notes/changelogs/<sanitised-branch>_<YYYY-MM-DD-HHMM>.md
```

Sanitise the branch name first: replace `/` with `-` so it stays a single path segment. E.g. `feat/audio-fix` becomes `feat-audio-fix`.

Create `.agent-notes/changelogs/` if it does not exist.

Format:

```markdown
# Changelog — [branch] -> [base]

**Date**: YYYY-MM-DD HH:MM
**Commit**: [short hash]

## Summary

One sentence on what this PR ships and why. The headline a teammate would read.

## Changes

- **<area>:** what changed and why, one line. Skip trivial.
- **<area>:** ...

## Notes

- Anything unusual a reader should know: breaking change, migration step, feature flag to flip, follow-up work, rollout caveat.
```

The area prefix is a 1-3 word handle for where the change lives (e.g. **Auth**, **Billing UI**, **Worker queue**). It is not a path. Use what reads naturally in a Slack message.

**Language and tone.** Write each bullet like a teammate dropping the update in Slack, not like a release-note announcement. Direct, natural, slightly clipped.

Keep:

- Plain words. Short sentences.
- Lead with the _why_ when it is non-obvious. Lead with the _what_ when the _why_ speaks for itself.

Strip:

- Em-dashes (`—`). Use a comma or a period.
- Semicolons (`;`). Split into two sentences.
- Possessive apostrophes (`'s`). Rephrase. "The user's session" becomes "the session for the user". Models over-use possessives in a way that makes prose feel polished and stiff. Forcing the rephrase produces blunter, more natural text.
- Marketing language, hedges, filler ("simply", "just", "comprehensive", "robust", "ensure", "leverage", "enable").
- Restating what the area prefix already says.

Real devs write `Stripe webhook now retries on 5xx instead of dropping the event` rather than `We have enhanced the Stripe webhook handler to comprehensively support automatic retries upon receiving server-side errors so that events are not lost`. Both are accurate. Only one sounds like a person.

If a bullet still feels long or formal after rewriting, rewrite it again or split it in two. Cut filler, not signal — these bullets are the deliverable.

If every change is internal and there is nothing user-visible, behavioural, or operationally relevant to say, the Changes section is empty and the Notes section explains why in one line.

---

## Step 6 — Post the Changelog to Chat

After saving the file, post the same bullets directly in the chat so they are ready to copy-paste. Do not repeat the file header. Format:

```markdown
## Changelog — [branch]

**Summary**: One sentence on what this PR ships and why.

- **<area>:** what changed and why, one line.
- **<area>:** ...

**Notes**: anything unusual the reader should know.

Saved to: .agent-notes/changelogs/<filename>.md
```

If there is nothing user-visible to say, post a single short paragraph explaining the diff is internal and no changelog is needed.
