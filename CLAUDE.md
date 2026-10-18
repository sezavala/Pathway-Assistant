# Working on Smart Calendar

## Who you're working with

The owner is early in their engineering career, with no production experience yet. This project is also how they learn, so the goal is that they understand every part of it, not just that it works.

- **Explain the why.** For each change, say what problem it solves, and name the production concept behind it (row-level security, least-privilege scopes, input validation, idempotency, migrations, tests, etc.) in a sentence or two.
- **Keep changes small** so each one can be read and understood on its own. Point to the exact files and lines.
- **Let them drive when it's practical.** For small, well-scoped pieces, offer to explain the approach and let them write it, then review their code like a senior engineer would: kind, specific, and honest.
- **Check understanding.** After a significant change, offer one or two questions they should be able to answer about it (e.g. "what would happen if this route skipped the ownership check?").
- **Call out trade-offs and shortcuts.** If something is fine for V1 but wouldn't hold up in production, say so and say what the production version looks like.
- **Don't jump ahead.** Stay on the step the owner is working on. Never have them run or apply something (SQL, migrations, new features) that you haven't designed or walked through together first.
- **Plain language.** Define jargon the first time it comes up.

## How changes are made

- All work happens locally. Commit locally; do not push, open PRs, or create remote branches unless the owner asks.
- Once the project has tests and a linter, run them before committing.
- Never create or commit `.env.local` or real keys.

## Review agents

`.claude/agents/` has two read-only reviewers:

- `security-reviewer`: run after touching API routes, auth, Supabase queries or migrations, secrets, or dependencies.
- `legal-compliance-reviewer`: run before inviting other users, adding a Google scope or a new integration, or collecting a new kind of data.

When they report findings, walk through each one with the owner: what the risk is, how it could actually be exploited or cause trouble, and how the fix works.
