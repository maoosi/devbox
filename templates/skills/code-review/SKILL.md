---
name: code-review
description: Use when explicitly asked to review code.
---
 
# Code Review
 
You are a senior engineer conducting a thorough, high-signal code review for a TypeScript/JavaScript codebase.
 
Your north star: **find real problems, not imagined ones.** Before raising any concern, chase the call chain as far as needed to confirm the issue is not already handled by a wrapper, caller, middleware, or type constraint. A false positive wastes more time than a missed nit.
 
## Constraints
 
- Work only with the current local repository state
- Do not create or switch branches, create PRs, or push
- Do not fetch, pull, rebase, or merge
- Do not modify code
- Do not attempt to read environment variables — no Doppler CLI/API, no `.env` reads, no `process.env` lookups. If a value is not injected into the agent's environment, treat it as unavailable and move on
---
 
## Step 1 — Determine Base Branch
 
Priority order:
 
1. `gh pr view --json baseRefName -q .baseRefName` — use the PR's actual merge target if a PR exists
2. `git config branch.$(git branch --show-current).merge` — upstream tracking branch
3. Fall back to `main`, then `master`
State the detected base branch in the review output.
 
---
 
## Step 2 — Gather Diff and Commit Context
 
```bash
git branch --show-current
git status --short --branch
git rev-parse --short HEAD
git log --oneline [base]..HEAD
git diff --stat [base]...HEAD
git diff [base]...HEAD
```
 
If uncommitted changes exist, also capture `git diff` and `git diff --staged` and note them separately.
 
If the branch name or PR body references a ticket (Linear, GitHub issue, Jira), read it to understand intent and acceptance criteria before reviewing.
 
---
 
## Step 3 — Build Codebase Context
 
This is the most important step for avoiding false positives. Do not skip it.
 
For each file touched in the diff:
 
1. **Read the full file**, not just the changed lines
2. **Follow all imports** relevant to changed logic — read those files too
3. **Find all callers** of any function that was added or modified — read them
4. **Chase the call chain as far as needed** until you can definitively answer: is the concern already handled upstream or downstream?
Specifically look for:
- Validation, sanitisation, or auth checks in middleware, wrappers, or callers that would make a finding invalid
- Existing error handling or retry logic that covers a reliability concern you were about to raise
- Project-wide conventions (naming, patterns, abstractions) that explain code that looks odd in isolation
- Shared utilities that already solve a problem you were about to flag as missing
Only raise a finding once you have confirmed the issue is **not** already handled elsewhere in the chain.
 
For architecturally significant changes, produce a Mermaid diagram (data flow or component relationships) before writing findings.
 
---
 
## Step 4 — Run Automation
 
Read `package.json` scripts to discover available checks. Prefer local/dev variants over CI-specific ones (e.g. `test` over `test:ci`, `lint` over `lint:ci`). Run all that are safe to run locally. Do not invent success — if a command fails or cannot run, state that clearly.
 
---
 
## Step 5 — Review
 
Before critiquing, understand what problem the change solves. Then ask: **is this the simplest correct solution?**
 
Review dimensions:
 
- **Correctness** — broken logic, edge cases, race conditions, null/undefined handling, off-by-one, async ordering, retry/empty input behaviour
- **Cross-file and systemic side effects** — does this change affect other callers, shared utilities, existing data shapes, or downstream systems in ways the author may not have considered? This is the highest-value dimension for complex changes.
- **Security** — auth, authorisation, tenant isolation, input validation, injection, XSS, secret leakage, data exposure. Security and data-loss risks are blockers.
- **Reliability** — failure paths, partial writes, rollback, cleanup on failure, idempotency
- **Simplicity** — root cause vs workaround, premature abstraction, unnecessary state. Look for duplicated logic that should be extracted into a reusable function, and for simpler alternatives to the chosen approach.
- **Types** — are types as tight as they can be? Flag `any`, loose unions, or wide types where a narrower one fits. Flag duplicated type definitions that should be a single shared type. Can types prevent illegal states from being representable in the first place?
- **Code quality** — actively look for opportunities to improve the changed code: overkill abstractions that could be inlined, unnecessary helper functions, logic that is technically correct but hard to follow and could be rewritten more cleanly. **Naming** is part of this — function and variable names should be simple, clean, and human, communicating intent without jargon or abbreviation. Flag names that are vague, misleading, or require the reader to look elsewhere to understand. The bar is not "this is wrong" but "this could be meaningfully clearer or simpler." Only flag where the improvement is concrete and obvious, not a matter of taste.
- **Performance** — only flag credible issues: re-renders, N+1 queries, memory leaks, missing pagination
- **Tests** — request tests when behaviour is hard to reason about, easy to break, or touches risky logic
### Severity guide
 
- **BLOCK** — must fix before merge: correctness bugs, security issues, data loss, broken permissions
- **WARN** — should fix: reliability gaps, systemic side effects, missing tests for risky logic, maintainability debt
- **IMPROVE** — not a bug, but a meaningful simplification or clarity win: overkill abstraction, unnecessary function, poor naming, inelegant logic that has a cleaner form. Include a concrete before/after. Skip if the improvement is marginal or subjective.
- **NIT** — optional: minor code smells, trivial naming preferences
If there are no findings, say so explicitly and confirm the change looks good to merge.
 
---
 
## Step 6 — Write the Full Review File
 
Save to:
 
```
llm-notes/<branch-name>_code-review_<YYYYMMDD-HHMM>.md
```
 
Create the `llm-notes/` directory if it does not exist.
 
Every finding's **AI Prompt** must start with: `Verify this is not a false positive — if valid, fix it:` followed by the specific instruction.
 
Use this format:
 
~~~markdown
# Code Review — [branch] -> [base]
 
**Date**: YYYY-MM-DD HH:MM
**Commit**: [short hash]
**Working tree**: Clean / Has uncommitted changes
 
**Summary**: 1-2 sentence verdict. What does this change do, is the approach sound, and is it ready to merge?
 
## Findings
 
### BLOCK: Title — path/to/file.ts:42
 
**What**: What the issue is.
**Why**: Impact or risk if not fixed.
**Context checked**: What you read to confirm this is a real issue (files, callers, middleware inspected).
**Fix**:
 
- broken code
+ fixed code
 
> **AI Prompt**: Verify this is not a false positive — if valid, fix it: [specific instruction]
 
---
 
### WARN: Title — path/to/file.ts:88
 
**What**: ...
**Why**: ...
**Context checked**: ...
**Fix**: ...
 
> **AI Prompt**: Verify this is not a false positive — if valid, fix it: [specific instruction]
 
---
 
### NIT: Title — path/to/file.ts:120
 
**What**: ...
**Fix**: Brief suggestion (no diff needed).
 
---
 
### IMPROVE: Title — path/to/file.ts:55
 
**What**: Why this could be cleaner or simpler.
**Before/After**:
 
- current code
+ cleaner version
 
> **AI Prompt**: Verify this is not a false positive — if valid, fix it: [specific instruction]
 
---
 
## Automation
 
| Check | Result |
| --- | --- |
| Lint | pass / fail / skipped |
| Types | pass / fail / skipped |
| Tests | pass / fail / skipped |
 
## Changelog Notes
 
Plain-language bullet points summarising what this PR does and why. Write as if briefing a colleague in Slack. Skip trivial changes. Ready to copy-paste.
~~~
 
---
 
## Step 7 — Post a Chat Summary
 
After saving the file, post a concise summary directly in the chat. Do not repeat the full review. Use this format:
 
```
## Review Summary — [branch]
 
**Verdict**: Ready to merge / Needs fixes / Blocked
 
### Blockers
- **[Title]** file.ts:42 — what to fix and why, in one sentence.
 
### Warnings
- **[Title]** file.ts:88 — what to fix and why, in one sentence.
 
### Improvements
- **[Title]** file.ts:55 — what could be cleaner and how, in one sentence.
 
### NITs
- Brief list, one line each.
 
### Automation
Lint: pass | Types: pass | Tests: fail (reason)
 
Full review saved to: llm-notes/<filename>.md
```
 
If there are no blockers or warnings, the summary can be a single short paragraph confirming the change looks good.
