## Role And Workflow

- Work as a Solution Architect / developer assistant for this standalone repository.
- Communicate, reason, and plan in Ukrainian. Run terminal commands in English.
- Before starting changes, read the latest block in `ChangeLog.md` for current context.
- Every code, config, script, or documentation change must add a new `ChangeLog.md` entry.
- Use `## [YYYY-MM-DD HH:MM] ...` headings in `ChangeLog.md`, with short bullets for touched files and behavior.
- After each completed bug fix, refactor, feature, or documentation cycle, create a separate git commit with a short imperative subject.
- Do not depend on sibling repositories or any previous application stack; this repository must
  remain usable as an independent Codex workspace.

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

## Security And Configuration

- Never commit credentials, local `.env` files, device tokens, cookies, certs, cache, logs, or
  generated runtime snapshots.

## CI/CD

Always USE docker for development and testing. 

Always provide deployment instructions for any code that is meant to run in production. If the change is purely local, state that explicitly.

### Project Docker Conventions

- Use `docker/docker-compose.dev.yml` for development and tests; it runs FastAPI and
  Vite as separate hot-reload services.
- Use `docker/docker-compose.yml` with a local `.env` for production; it builds and
  serves the frontend and backend as one container with persistent SQLite in `data/`.
- Keep production Uvicorn at one worker because APScheduler runs in the application
  process. Follow `docs/deploy.md` for Synology deployment, updates, and backups.

### Notification Architecture

- Add delivery channels through the `NotificationSender` protocol and assemble them
  in `backend/app/services/notify.py`; Web Push uses the database session for stored
  subscriptions.
- Extend the existing daily notification pipeline for calendar-based reminders
  instead of registering additional APScheduler jobs. Keep production at one Uvicorn
  worker so the in-process scheduler does not duplicate delivery.

### Backup And Restore Invariants

- In-app restore is compatible only with a backup whose Alembic revision exactly
  matches the live database revision; use a manual archive of all `data/` for DR or
  rollback across application/schema updates.
- Every model or Alembic schema change must review and update restore business keys,
  copied fields, `ENTITY_NAMES`, intentional exclusions, and round-trip tests. New
  persistent data must never be silently omitted from backup/restore coverage.
- Apartment and service `restore_key` values are stable import identities. Preserve
  them in migrations, snapshots, and restore copies so supported duplicate display
  names/addresses remain recoverable and repeated imports stay idempotent.
- Keep SQLite snapshot creation, restore import, and attachment filesystem mutations
  under the shared data-store lock so database rows and files stay consistent. Stage
  attachment bytes before the live SQLite write transaction to keep writer blocking
  bounded.

### Statistics And Aggregations

- Aggregation/report endpoints (e.g. `/api/stats/*`) run on read-only sessions and
  must not mutate state. For currency conversion use the read-only
  `nbu.get_stored_rate` (latest stored `ExchangeRate` ≤ date), never `nbu.get_rate`,
  which fetches and writes. Amounts with no available stored rate are reported in a
  separate `unconverted` bucket instead of being silently coerced to zero, and any
  derived total that excludes them (net, margin) must be flagged incomplete in the UI.

### Invoice Adjustment Invariants

- Invoice adjustments are one-off `InvoiceLine` records, not reusable services. Keep
  `service_id` null, `service_kind` equal to `adjustment`, and `tariff_value` equal to
  zero; include their signed amount only in `adjustments_total` and `grand_total`.
- A negative adjustment may own one linked `Expense` through `invoice_line_id`.
  Create, update, or remove that expense only through draft invoice updates, keep it
  read-only in the expense UI, and preserve invoice-line CASCADE semantics.
- Exclude linked expenses of draft invoices from P&L. Include them only after the
  invoice is issued or paid so compensation reduces net income exactly once.

### Frontend Styling Conventions

- Treat `frontend/src/theme.css` as the source of truth for light and dark design
  tokens. Components should consume those CSS variables instead of duplicating
  palette colors, card shadows, or chart colors.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
