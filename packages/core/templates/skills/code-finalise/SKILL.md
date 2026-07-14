---
name: code-finalise
description: "Use when explicitly asked to finalise code on the current branch, wrap a branch up before review, or run the full simplify-review-resolve-manual-test chain. Triggers on phrases like 'finalise this branch', 'get this PR ready', 'polish this work before review'."
---

# Code Finalise

You are a senior engineer running the end-to-end pre-merge finalisation pass on the current branch. This is an orchestrator: it drives the simplify / review / checklist / changelog skills in sequence and handles the transitions between them. The chained skills know their own jobs, do not re-implement their work here.

Your north star: **ship a clean branch with no busywork.** Validate findings before applying them. Push back when a suggestion is wrong or overkill. Only loop the human in for NITs.

## Constraints

- Use the chained skills by name: `code-simplify`, `code-review`, `code-checklist`, `code-changelog`. Read each SKILL.md before invoking it.
- Do not run the chained skills in a different order. Do not skip steps unless the explicit condition in Step 4 says to.

---

## Step 1: Run code-simplify

Invoke the `code-simplify` skill. Capture its chat summary for the wrap-up, then move on.

---

## Step 2: Run code-review

Invoke the `code-review` skill on the simplified code. It writes a review file at `.agent-notes/reviews/<branch>_<YYYY-MM-DD-HHMM>.md` and posts a chat summary. Note the file path.

If the review reports no findings and the verdict is "Ready to merge", skip Step 3 and Step 4. Jump to Step 5.

---

## Step 3: Validate and resolve each finding

Read the review file. Process findings in order: BLOCK, WARN, IMPROVE, NIT.

### For BLOCK, WARN, and IMPROVE

For each finding:

1. Re-verify against the actual code. Re-read the cited file plus any callers, middleware, or shared utilities the reviewer claimed to check. Do not take the reviewer's "Context checked" line at face value.
2. Ask two questions: is the issue real, and is the proposed fix proportionate?
3. If both yes, apply the fix. If either no, leave the code alone and note a one-liner reason for the wrap-up.

Push-back lines must be concrete. "Already handled by the `requireAuth` middleware in callers" or "Function has one caller that null-checks the arg" are good. "Not needed" or "looks fine" is a signal to look again.

### For NITs

Prompt the human on each NIT individually, one at a time. For each, show `file:line`, the suggested change, and a one-line take on whether you would apply it. Wait for their answer before moving to the next NIT. Apply only what they approve.

Do not batch NITs. The per-finding context makes the decision easier.

---

## Step 4: Re-run code-simplify if anything changed

Only run this step if code was modified in Step 3. If every finding was pushed back and no NIT was approved, skip to Step 5.

Otherwise, invoke `code-simplify` again. The second pass catches clutter introduced by the fixes, e.g. defensive checks that duplicate ones upstream, helpers used only once, stale comments.

---

## Step 5: Run code-checklist

Invoke the `code-checklist` skill. It writes a manual-verification checklist and posts it to chat.

---

## Step 6: Run code-changelog

Invoke the `code-changelog` skill. It writes a plain-language changelog and posts it to chat. This is the final artefact.

The changelog runs after the checklist on purpose: a checklist finding may prompt the human to halt before any release narrative gets drafted.

---

## Step 7: Post the wrap-up summary

After everything, post one concise summary in chat. Do not repeat the per-skill summaries, the reader can open the chained skills' output files for detail.

Format:

```markdown
## Finalise Summary: [branch] -> [base]

### Pipeline

- Simplify pass 1: <N changes | nothing to simplify>
- Review: <findings: B/W/I/NIT counts | clean>
- Resolutions: fixed N, pushed back N, deferred N
- Simplify pass 2: <N changes | skipped>
- Checklist: <K items | empty>
- Changelog: <K bullets | empty>

### Push-backs (if any)

- <severity> <title>: <one-liner reason>

### Verdict

<Ready to merge | Needs human follow-up | Blocked on <reason>>
```

Omit the Push-backs section if there are none.
