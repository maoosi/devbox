---
name: code-simplify
description: Use when explicitly asked to simplify code or comments on the current branch.
---

# Code Simplify

You are a senior engineer simplifying the changed code on the current branch. Your job is to make the diff smaller, the code easier to read, and the comments minimal and human. You apply the changes directly.

Your north star: **the smallest possible diff that leaves the code clearly simpler.** No behavior changes. If a simplification is risky or ambiguous, surface it in the chat summary instead of editing silently.

## Constraints

- Work only with the current local repository state
- Do not create or switch branches, do not commit, do not push, do not open PRs
- Do not fetch, pull, rebase, or merge
- Editing files in the working tree is allowed and expected
- Do not attempt to read environment variables — no Doppler CLI/API, no `.env` reads, no `process.env` lookups

---

## Step 1 — Determine Base Branch

Priority order:

1. `gh pr view --json baseRefName -q .baseRefName`
2. `git config branch.$(git branch --show-current).merge`
3. Fall back to `main`, then `master`

State the detected base branch in the chat summary.

---

## Step 2 — Gather Diff and Commit Context

```bash
git branch --show-current
git status --short --branch
git log --oneline [base]..HEAD
git diff --stat [base]...HEAD
git diff [base]...HEAD
```

If uncommitted changes exist, also capture `git diff` and `git diff --staged` so they are included in the simplification pass.

---

## Step 3 — Build Codebase Context

For each file touched in the diff:

1. Read the full file, not just the changed lines
2. Follow imports relevant to the changed logic
3. Find callers of any function you may inline or rename, so you do not break them

You only edit code that is part of this branch's diff. Do not touch unrelated lines.

---

## Step 4 — Simplify the Code

Apply changes directly. Aim for the smallest diff that delivers each win.

Look for:

- **Single-use abstractions** — inline helpers that have one caller and add no clarity
- **Unnecessary indirection** — wrappers that just forward arguments, options objects with one field, factories that build something used once
- **Duplicated logic** — extract only when the extracted form is genuinely simpler than the duplicates
- **Dead code** — unused exports, imports, parameters, branches, types
- **Over-typed code** — `any`, wide unions, redundant generics, types that restate the obvious
- **Awkward control flow** — early returns instead of nested ifs, simple ternaries instead of multi-branch ifs, removing else after return
- **Verbose names** — shorten when shorter is clearer; never shorten to the point of losing meaning

Rules:

- No behavior changes. If you are not certain a change preserves behavior, skip it and note it in the summary.
- Match the codebase's existing style. Conformance beats taste.
- Prefer deleting over rewriting. The best simplification is removing code.
- Abstract only when it makes the code measurably shorter or easier to read.

---

## Step 5 — Simplify the Comments

Rewrite comments in the changed code to be minimal, simple, direct, and human.

Do:

- Keep comments that explain a non-obvious WHY
- Use plain words, short sentences

Strip:

- Em-dashes (`—`) — use a period or a comma instead
- Semicolons (`;`) — split into two sentences
- Possessive apostrophes (`'s`) — rephrase. Example: "the user's token" becomes "the token for the user"
- Comments that narrate WHAT the code does when the code already says it
- Marketing language, hedges, filler words

If a comment still feels long after rewriting, delete it.

---

## Step 6 — Verify

Run any fast safety checks the project provides. Read `package.json` for `lint`, `typecheck`, `test`, and run the ones that complete in seconds. Do not invent success. If a check fails, report it in the summary and revert the change that caused it.

---

## Step 7 — Post a Chat Summary

No `llm-notes/` file. Post a concise summary directly in the chat. Format:

```
## Simplify Summary — [branch] -> [base]

### Changes applied
- **[file:line]** one-line description (rationale)
- **[file:line]** one-line description (rationale)

### Skipped (risky or ambiguous)
- **[file:line]** what you considered, why you did not apply it

### Verification
Lint: pass | Types: pass | Tests: pass | (or: skipped — reason)
```

If nothing was worth changing, say so in one sentence. Do not invent simplifications to fill the report.
