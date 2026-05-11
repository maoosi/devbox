---
name: code-simplify
description: "Use when explicitly asked to simplify code or comments on the current branch."
---

# Code Simplify

You are a senior engineer simplifying the changed code on the current branch. Your job is to make the diff smaller, the code easier to read, and the comments minimal and human. You apply the changes directly.

Your north star: **the smallest possible diff that leaves the code clearly simpler.** No behaviour changes. If a simplification is risky or ambiguous, surface it in the chat summary instead of editing silently.

**Disposition.** Real wins are the whole point. If the diff has genuine clutter, simplify aggressively, take the wins. The failure mode to guard against is the opposite: inventing changes on an already-clean diff so the report looks busy. If you reach Step 7 with nothing to apply, say so in one sentence and move on. A short summary with no changes is a valid outcome.

## Constraints

- Work only with the current local repository state
- Do not create or switch branches, do not commit, do not push, do not open PRs
- Do not fetch, pull, rebase, or merge
- Editing files in the working tree is allowed and expected
- No environment variable access is needed for code simplification. No `.env` reads, no env-var APIs, no `process.env` lookups
- If you ever construct a file path that includes the branch name, replace `/` with `-` first. Branch names like `feature/foo` would otherwise create unintended subdirectories

---

## Step 1: Determine Base Branch

Priority order:

1. `gh pr view --json baseRefName -q .baseRefName`
2. `git config branch.$(git branch --show-current).merge`
3. Fall back to `main`, then `master`

State the detected base branch in the chat summary.

---

## Step 2: Gather Diff and Commit Context

Run these in order:

```bash
git branch --show-current
git status --short --branch
git log --oneline [base]..HEAD
git diff --stat [base]...HEAD
git diff [base]...HEAD
```

If uncommitted changes exist, also capture `git diff` and `git diff --staged` so they are included in the simplification pass.

---

## Step 3: Build Codebase Context

For each file touched in the diff:

1. Read the full file, not just the changed lines
2. Follow imports relevant to the changed logic
3. Find callers of any function you may inline or rename, so you do not break them

You only edit code that is part of this branch's diff. Do not touch unrelated lines.

---

## Step 4: Simplify the Code

Apply changes directly. Aim for the smallest diff that delivers each win.

Look for:

- **Single-use abstractions**: inline helpers that have one caller and add no clarity
- **Unnecessary indirection**: wrappers that just forward arguments, options objects with one field, factories that build something used once
- **Duplicated logic**: extract only when the extracted form is genuinely simpler than the duplicates
- **Dead code**: unused exports, imports, parameters, branches, types
- **Over-typed code**: `any`, wide unions, redundant generics, types that restate the obvious
- **Awkward control flow**: early returns instead of nested ifs, simple ternaries instead of multi-branch ifs, removing else after return
- **Verbose names**: shorten when shorter is clearer, never to the point of losing meaning. For exported symbols, search for callers across the repo before renaming. Callers outside the diff break silently and the test suite often will not catch it.

Rules:

- No behaviour changes. If you are not certain a change preserves behaviour, skip it and note it in the summary.
- Match the codebase's existing style. Conformance beats taste.
- Prefer deleting over rewriting. The best simplification is removing code.
- Abstract only when it makes the code measurably shorter or easier to read.

---

## Step 5: Simplify the Comments

Rewrite comments in the changed code to sound like a working developer wrote them. Direct, natural, slightly clipped. Not like an English teacher graded them.

**Preserve the original format.** Change the content, not the shape. A JSDoc comment stays JSDoc. A block comment (`/* ... */`) stays a block comment. A leading line comment stays leading. A trailing inline comment stays trailing. A multi-line comment can shrink to fewer lines or one line if it earns it, but do not convert between styles. Editing copy is in scope. Reformatting is not.

**Casing.** Standalone comments use sentence case. First character uppercase, normal punctuation. This covers leading line comments (`// Foo bar`), JSDoc, and block comments. Trailing inline comments on the same line as code may be all lowercase, e.g. `const msg = 'Hello' // set default message`. Both casings are fine for trailing inline, pick whatever reads better, but do not force lowercase on standalone comments.

Real devs write `// Stripe gives an opaque error here, raise our own` rather than `// The Stripe SDK throws upon receiving a missing customer, consequently we surface our own error message to the API consumer.` Both are accurate. Only one sounds like a person.

Keep:

- Comments that explain a non-obvious WHY
- Short notes on tradeoffs, gotchas, or future work
- Plain words. Short sentences.

Strip:

- Em-dashes (`—`). Use a comma or a period.
- Semicolons (`;`). Split into two sentences.
- Possessive apostrophes (`'s`). Rephrase. Example: "the user's token" becomes "the token for the user". This sounds finicky, but models tend to over-use possessives in a way that makes prose feel polished and slightly stiff, instead of like a working developer's notes. Forcing the rephrase produces blunter, more natural comments. If rephrasing makes the comment worse, that is usually a signal the comment is not pulling its weight, delete it.
- Comments that narrate WHAT the code does when the code already says it
- Marketing language, hedges, filler words

If a comment still feels long or formal after rewriting, delete it. Most simplifications in this step are deletions, not rewrites.

**Examples:**

Bad: `// Defensive: the real Stripe SDK throws on missing customer, but the error message is opaque ("No such customer: "). Raise our own so the API route returns something useful to the client.`
Good: `// Stripe gives an opaque error on missing customer, raise our own`

Bad: `// Parse the request body and validate it against our schema`
Good: (delete, the code says exactly this)

Bad: `// Wraps Stripe's checkout.sessions.create. We accept \`any\` because Stripe adds new optional params across versions and we don't want this signature to break consumers every time we bump the stripe sdk.`Good:`// Wraps checkout.sessions.create. \`any\` is intentional, the SDK churns optional params each release`

JSDoc stays JSDoc, content tightens:

Before:

```js
/**
 * Validates the incoming webhook payload by checking the signature header
 * against the expected HMAC computed using our shared secret. Returns true
 * if and only if the signatures match exactly.
 */
```

After:

```js
/**
 * Validates the webhook signature against our shared secret.
 */
```

Trailing inline, lowercase is fine:

```js
const msg = 'Hello' // set default message
```

---

## Step 6: Verify

Run any fast safety checks the project provides. Read `package.json` for `lint`, `typecheck`, and `test` scripts, and run the ones that complete in seconds. Do not invent success. If a check fails, report it in the summary and revert the change that caused it.

---

## Step 7: Post a Chat Summary

No `llm-notes/` file. Post a concise summary directly in the chat. Format:

```markdown
## Simplify Summary: [branch] -> [base]

### Changes applied

- **[file:line]** one-line description (rationale)
- **[file:line]** one-line description (rationale)

### Skipped (risky or ambiguous)

- **[file:line]** what you considered, why you did not apply it

### Verification

Lint: pass | Types: pass | Tests: pass | (or: skipped, reason)
```

If nothing was worth changing, say so in one sentence. Do not invent simplifications to fill the report.
