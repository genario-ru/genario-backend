---
name: drizzle-migration-workflow
description: Use for Drizzle schema changes in src/db/schemas, including table/index/relation updates, migration generation, and dependent API/domain schema updates.
---

# Drizzle Migration Workflow

Use when changing tables, columns, indexes, enums, relations, or migration behavior.

1. Inspect at least 3 relevant schemas/relations in `src/db/schemas/**`.
2. Change schema files in `src/db/schemas/**`; update `src/db/schema.ts` exports if required.
3. Add required indexes, foreign keys, and native Drizzle `relations(...)` immediately.
4. Update domain entity/handler schemas under `src/domains/**` when API responses expose changed DB fields.
5. Run `pnpm lint:typescript` and relevant tests when TypeScript behavior changed.
6. Run `pnpm db:generate` and commit generated files under `src/db/migrations/**`
   (SQL, snapshot, journal) in the same change as the schema edit.

Do not run `pnpm db:migrate`, `pnpm db:seed`, or `pnpm db:studio` unless the owner
explicitly asks for that exact command in the current task. Do not manually rewrite
or delete old migrations if it breaks migration history order.

## Production migrations

- The runtime image has no `drizzle-kit`, so migrations run programmatically via `src/entrypoints/migrate.ts` (`dist/migrate.js`, drizzle's `migrate()`), exposed as `pnpm db:migrate` and executed at the deploy stage.
- SQL files are copied into the image at `src/db/migrations` (`Dockerfile`); a one-shot `migrate` service in `docker-compose.yml` runs them on deploy before `server`/`workers`.
- Agents generate migration SQL; deploy applies it. Do not apply migrations locally from an agent workflow.

## Default data (seed)

- Reference data lives in `data/*.json`; the seed runner is in `src/db/seed/**` and is invoked via `src/entrypoints/seed.ts` (`pnpm db:seed` → `dist/seed.js`, the JSON is bundled into it). It runs only at deploy, in the one-shot `seed` service of `docker-compose.yml` after `migrate`; there is no local seed script.
- Idempotent upsert by primary key `id` (`onConflictDoUpdate`, repo is source of truth).
- New default-data table: add `data/<table>.json` and an entry in `src/db/seed/config.ts` (referenced tables before dependents for FK order).

## Reference Examples

- Primary table with relations and indexes: `src/db/schemas/primary/scenario.ts`.
- Billing table with enum and partial unique index: `src/db/schemas/billing/subscription.ts`.
- Linking table with composite uniqueness: `src/db/schemas/linking/application-to-product-feature.ts`.
- Many-to-many linking table: `src/db/schemas/linking/scenario-to-platform.ts`.
- Schema barrel exports: `src/db/schema.ts`.
- Seed/default data wiring: `src/db/seed/config.ts` and matching `data/*.json` files.
