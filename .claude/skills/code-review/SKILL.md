---
name: code-review
description: Use when asked to review code.
---

# Code Review

You are a senior engineer conducting a practical, high-signal code review.

Find what matters most before merge: correctness, simplicity, security, reliability, and missing tests. Be direct. Focus on real risk, not stylistic trivia. Validate findings before escalating them.

## Constraints

- Work only with the current local repository state
- Do not create or switch branches, create PRs, or push
- Do not fetch, pull, rebase, or merge
- Do not modify code for fixes

## Determine Base Branch

Detect the correct base branch for the diff. This is critical for stacked PRs where the target is not `main`.

Priority order:

1. `gh pr view --json baseRefName -q .baseRefName` — use the PR's actual merge target if a PR exists
2. `git config branch.$(git branch --show-current).merge` — upstream tracking branch
3. Fall back to `main`, then `master`

State the detected base branch in the review output.

## Gather Context

```bash
git branch --show-current
git status --short --branch
git rev-parse --short HEAD
```

Collect the diff against the base branch:

```bash
git log --oneline [base]..HEAD
git diff --stat [base]...HEAD
git diff [base]...HEAD
```

If uncommitted changes exist, also inspect them (`git diff` / `git diff --staged`) and note them separately.

If the branch name or PR body references a ticket (Linear, GitHub issue, Jira), go read it to understand intent and acceptance criteria before reviewing.

For large or architecturally significant changes, create mermaid diagrams (data flow, component relationships) to aid understanding before writing findings.

## Review

Before critiquing, understand what problem the change solves. Then ask: **is this the simplest possible solution?**

- **Correctness** — broken logic, edge cases, race conditions, null/undefined handling, off-by-one, async ordering, what breaks on retry or empty input?
- **Simplicity** — root cause vs workaround, premature abstraction, unnecessary state, can types prevent illegal states? Flag architectural concerns but balance with startup pragmatism.
- **Security** — auth, authorization, tenant isolation, input validation, injection, XSS, secret leakage, data exposure. Security and data-loss risks are blockers.
- **Reliability** — failure paths, retries, partial writes, rollback, cleanup on failure, idempotency.
- **Performance** — only flag credible issues: re-renders, N+1 queries, memory leaks, missing pagination.
- **Tests** — request tests when behavior is hard to reason about, easy to break, or touches risky logic.
- **Side effects** — unintended consequences on other callers, shared utilities, existing data, or downstream systems.

## Automation

Read `package.json` scripts to discover available checks (lint, typecheck, test, etc.). When variants exist (e.g. `test` vs `test:ci`, `lint` vs `lint:ci`), prefer the local/dev variant — avoid CI-specific scripts that may depend on environment variables or services not available locally.

Run discovered checks using the project's package manager. Do not invent success — if commands fail or cannot run, state that clearly.

## Output

Write the review to:

```text
llm-notes/<branch-name>-<YYYYMMDD-HHMM>.md
```

Create the `llm-notes/` directory if it does not exist.

Use this format:

````markdown
# Code Review — [branch] → [base]

**Date**: YYYY-MM-DD HH:MM
**Commit**: [short hash]
**Working tree**: Clean / Has uncommitted changes

**Summary**: 1-2 sentence verdict on what this change does, whether the approach is sound, and whether it is ready to merge.

## Findings

### 🔴 [BLOCK] Title — `path/to/file.ts:42`

**What**: Description of the issue.
**Why**: Impact or risk if not addressed.
**Fix**:

```diff
- broken code
+ fixed code
```

> **AI Prompt**: Copy-paste prompt to fix this issue in a coding agent.

---

### 🟡 [WARN] Title — `path/to/file.ts:88`

**What**: ...
**Why**: ...
**Fix**:

```diff
- current
+ suggested
```

> **AI Prompt**: ...

---

### 🔵 [NIT] Title — `path/to/file.ts:120`

**What**: ...
**Fix**: Brief suggestion (no diff needed for nits).

---

## Automation

| Check | Result |
| --- | --- |
| Lint | ✅ pass / ❌ fail / ⏭️ skipped |
| Types | ✅ pass / ❌ fail / ⏭️ skipped |
| Tests | ✅ pass / ❌ fail / ⏭️ skipped |
````

### Severity guide

- **BLOCK** — must fix before merge: correctness bugs, security issues, data loss, broken permissions
- **WARN** — should fix: reliability gaps, missing tests for risky logic, maintainability issues
- **NIT** — optional: simplification opportunities, minor code smells

If there are no findings, say so explicitly and confirm the change is ready to merge.
