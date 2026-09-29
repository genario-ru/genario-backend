# AGENTS.md - Genario Backend

This is the canonical working guide for coding agents in `genario-backend`.
Tool-specific files may add workflow detail, but they must not contradict this
file.

## Agent Instruction Design

- Keep this file focused, concrete, and verifiable. Put global project rules
  here, path-scoped details in `.cursor/rules/**`, and repeatable procedures in
  `.agents/skills/**`.
- Do not duplicate long procedures across tools. If a tool-specific file needs
  the same rule, point it back to this file or keep only the tool-specific
  delta.
- Prefer rules that can be checked against files, commands, or code patterns.
  Remove outdated or conflicting instructions in the same change that discovers
  them.

## Project Snapshot

- TypeScript ESM backend.
- HTTP framework: Hono, served from `src/entrypoints/server.ts`.
- Worker runtime: BullMQ, started from `src/entrypoints/workers.ts`.
- Auth: Better Auth integration in root `auth.ts` plus API routes under
  `src/routes/api/v1/auth/**`.
- Database: Drizzle ORM with PostgreSQL schema in `src/db/**` and migrations in
  `src/db/migrations/**`.
- Validation/OpenAPI: Zod 4, `hono-openapi`, response schemas, and OpenAPI
  metadata.
- External API clients: Kubb-generated code for YooKassa and SocialKit in
  `src/codegen/api/**`.
- AI prompts: Markdown templates, typed props, and builders under
  `src/ai/prompts/**`.
- Tests: Vitest unit/integration scripts are defined in `package.json`.

## Source Of Truth

Read these before making non-trivial changes:

- `package.json` for exact scripts and dependency versions.
- `env.ts`, `.env.example`, `docker-compose.yml`, and sometimes `Dockerfile`
  for environment propagation.
- `drizzle.config.ts` and `src/db/**` for database changes.
- `kubb.config.ts` and `scripts/download-*-openapi.ts` for external API codegen.
- `src/entrypoints/server.ts` for route and Bull Board registration.
- `src/entrypoints/workers.ts` for worker registration and shutdown.
- `.cursor/rules/**`, `.agents/skills/**`, and `.claude/**` for scoped agent
  workflows.

If documentation disagrees with code/config, trust code/config first, then
update the documentation in the same change.

## Collaboration Rules

- Communicate with the repository owner in Russian unless the owner explicitly
  asks for another language.
- Be direct and factual. Do not present guesses as decisions.
- If requirements, architecture, file placement, or implementation choices are
  unclear, ask the owner before coding.
- If a task requires a custom construction that has no clear local precedent,
  ask the owner first and, when possible, present concrete implementation
  options.
- Before adding a new pattern, prove there is no suitable existing pattern by
  inspecting nearby code.

## Code Style

- Before writing new code, inspect nearby files in the same domain and follow
  their naming, structure, and parameter style. Do not invent filenames or
  layouts from scratch.
- Utility and helper functions accept parameters as a single object
  (`{ field }`), not as positional arguments. Zero-argument helpers are the
  only common exception.
- In `src/lib/**/utils/**` and `src/domains/**/utils/**`, keep one exported
  function per file.
- In `src/domains/<domain>/services/**`, export the primary service entrypoint
  only. Do not colocate helper utilities or multiple named types in the same
  service file.
- Put reusable domain helper utilities in `src/domains/<domain>/utils/**`.
- Put domain-specific named types in `src/domains/<domain>/types/**` when a
  module needs more than one type or when types are shared across services and
  utilities.
- In `src/mq/<name>/`, use only the established filenames: `queue.ts`,
  `worker.ts`, and optionally `utils.ts` or `types.ts`. Do not add custom names
  like `file-name-utils.ts` or extra subfolders.
- Prefer `const` and early returns over `let` with later reassignment.
- Do not use inline ternaries for conditional async logic or object fields;
  extract a named function or use an explicit `if` with a variable.

## Source Layout

| Path              | Purpose                                                       |
| ----------------- | ------------------------------------------------------------- |
| `src/entrypoints` | Process entrypoints: HTTP server, workers, migrations, seed   |
| `src/routes`      | Hono route modules and route indexes                          |
| `src/domains`     | Domain schemas, services, constants, and utilities            |
| `src/db`          | Drizzle client, schema, relations, migrations, DB utilities   |
| `src/mq`          | BullMQ queues, workers, job types, worker utilities           |
| `src/ai`          | AI providers, prompt templates, prompt builders, prompt types |
| `src/lib`         | External integrations and infrastructure adapters             |
| `src/middleware`  | Hono middleware                                               |
| `src/shared`      | Cross-domain constants, schemas, types, and utilities         |
| `src/codegen`     | Generated external API clients, read-only                     |
| `src/globals`     | Global `.d.ts` declarations                                   |
| `tests`           | Vitest unit and integration tests                             |

## Local Reference Map

Use these files as implementation references before creating new patterns.
Some older files contain mojibake in Russian strings/comments; use them for
structure only and do not copy broken text.

| Pattern                       | References                                                                                                                                                                                                                                   |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public JSON route             | `src/routes/api/v1/product-features/root/get/route.ts`, `src/domains/product-features/schemas/handlers/get-product-features/response.ts`                                                                                                     |
| Public write + transaction    | `src/routes/api/v1/applications/root/post/route.ts`, `src/domains/applications/schemas/handlers/create-application/body.ts`, `src/domains/applications/schemas/handlers/create-application/response.ts`                                      |
| Protected route + enqueue     | `src/routes/api/v1/scenarios/root/post/route.ts`, `src/domains/scenarios/schemas/handlers/create-scenario/body.ts`, `src/domains/scenarios/schemas/handlers/create-scenario/response.ts`, `src/mq/scenario-chapters-generation/queue.ts`     |
| Custom external-error mapping | `src/routes/api/v1/attachments/attachment/download/get/route.ts`                                                                                                                                                                             |
| Route registration            | `src/entrypoints/server.ts`, nearby `src/routes/api/v1/<domain>/index.ts` files                                                                                                                                                              |
| Primary DB table              | `src/db/schemas/primary/scenario.ts`, `src/db/schemas/billing/subscription.ts`                                                                                                                                                               |
| Linking DB table              | `src/db/schemas/linking/application-to-product-feature.ts`, `src/db/schemas/linking/scenario-to-platform.ts`                                                                                                                                 |
| DB exports                    | `src/db/schema.ts`                                                                                                                                                                                                                           |
| Default data seed config      | `src/db/seed/config.ts`, matching `data/*.json` files                                                                                                                                                                                        |
| Queue + worker                | `src/mq/scenario-metadata-generation/queue.ts`, `src/mq/scenario-metadata-generation/worker.ts`, `src/mq/subscriptions-charge/queue.ts`, `src/mq/subscriptions-charge/worker.ts`                                                             |
| Worker/server registration    | `src/entrypoints/workers.ts`, `src/entrypoints/server.ts`                                                                                                                                                                                    |
| Env propagation               | `env.ts`, `.env.example`, `docker-compose.yml`                                                                                                                                                                                               |
| AI prompt triplet             | `src/ai/prompts/templates/generate-scenario-metadata.md`, `src/ai/prompts/types/generate-scenario-metadata.ts`, `src/ai/prompts/builders/generate-scenario-metadata.ts`, plus `generate-ideas-list.*` for optional context/list construction |
| OpenAPI/Kubb codegen          | `kubb.config.ts`, `src/scripts/download-yookassa-openapi.ts`, `src/lib/yookassa/client/index.ts`, `src/lib/socialkit/client/index.ts`                                                                                                        |

## Placement Rules

Use this before creating files:

1. HTTP endpoint or route index? Use `src/routes/**`.
2. Request/response/entity schema for product API? Use
   `src/domains/<domain>/schemas/**`.
3. Domain business service, domain-specific utility, or domain type? Use
   `src/domains/<domain>` (`services/**`, `utils/**`, `types/**`).
4. Table schema, relation, migration, or DB-only helper? Use `src/db/**`.
5. Queue, worker, job payload, or job-specific utility? Use `src/mq/**`.
6. External service adapter, client wrapper, S3/PDF/DOCX/email/provider code? Use
   `src/lib/**`.
7. Cross-domain primitive, generic API utility, or shared error/response schema?
   Use `src/shared/**`.
8. AI prompt template, builder, type, provider, or interpolation helper? Use
   `src/ai/**`.

Before creating new files in route/domain/db/mq/lib/ai areas, inspect at least 3
similar local implementations and follow their structure.

## Route Pattern

Routes usually have:

- colocated route module under `src/routes/api/v1/<domain>/.../<method>/route.ts`;
- matching schemas under
  `src/domains/<domain>/schemas/handlers/<handler-name>/`;
- export from a nearby `index.ts`;
- registration in `src/entrypoints/server.ts`.

Use:

- `createHonoApp().basePath(...)`;
- `validator("param" | "query" | "json", schema)` for inputs;
- `openAPIResponseMiddleware(...)` with `createOpenAPIResponse(...)`;
- `throwAPIError(...)` for domain/API errors;
- `responseSchema.parse(...)` before `c.json(...)`.
- the global `app.onError(errorHandler)` path for ordinary thrown errors.

Do not wrap route handlers or services in `try/catch` by default. Use
`try/catch` only when the handler must translate an external/library failure
into a project error, run cleanup, add required context, or implement custom
error behavior that the global handler cannot provide.

Typical protected route middleware order:

```text
sessionMiddleware -> rateLimitMiddleware -> subscriptionMiddleware -> openAPIResponseMiddleware -> validator
```

Public routes may omit auth/subscription middleware when existing local routes
do the same.

## Database And Migrations

- Schema source lives in `src/db/schemas/**`, re-exported through
  `src/db/schema.ts`. It is the single source of truth.
- When schema files change, run `pnpm db:generate` and commit the generated
  SQL migration, snapshot, and journal under `src/db/migrations/**` together
  with the schema change.
- Do not manually rewrite or delete old migrations if it breaks migration
  history order.
- Do not run `pnpm db:migrate`, `pnpm db:seed`, or `pnpm db:studio` unless the
  owner explicitly asks for that exact command in the current task.
- Migration **application** happens at deploy (`pnpm db:migrate` via
  `dist/migrate.js`); agents must not apply migrations to a database.
- Seed **application** happens at deploy too (`pnpm db:seed` via
  `dist/seed.js`); agents must not seed a database.
- When adding/changing tables, add required indexes, foreign keys, and Drizzle
  `relations(...)` immediately. Do not leave relation/index work as a follow-up.
- Use native Drizzle ORM syntax for references, indexes, unique indexes, and
  relations; follow nearby schema files for naming and cascade behavior.
- If tables are exposed through API responses, update domain entity schemas in
  `src/domains/<domain>/schemas/entities/**`.

### Production migrations

- The runtime image has no `drizzle-kit` (`pnpm prune --production` removes it),
  so migrations run programmatically via `dist/migrate.js`
  (`src/entrypoints/migrate.ts`, drizzle's `migrate()`), exposed as
  `pnpm db:migrate` and executed at the deploy stage.
- SQL files are copied into the image at `src/db/migrations` (see `Dockerfile`).
  If you change the migrations output path, update the Dockerfile `COPY` and the
  `migrationsFolder` in `src/entrypoints/migrate.ts`.
- A one-shot `migrate` service in `docker-compose.yml` runs migrations on deploy;
  the `seed` service depends on its successful completion.

### Default data (seed)

- Reference/default data lives in `data/*.json` and is loaded by the seed runner
  in `src/db/seed/**` (config + runner), invoked through `src/entrypoints/seed.ts`
  (`pnpm db:seed` → `dist/seed.js`). The JSON is bundled into `dist/seed.js`, so
  the runtime image needs no data files.
- It runs only at deploy: a one-shot `seed` service in `docker-compose.yml`
  runs after `migrate`, and `server`/`workers` depend on its successful
  completion. There is no local seed script: the local database is filled by the
  same deploy flow or not at all.
- Seeding is idempotent: upsert by primary key `id` with `onConflictDoUpdate`
  (repo is the source of truth).
- When adding a new default-data table, add a `data/<table>.json` file and a new
  entry in `src/db/seed/config.ts` (respect FK order: referenced tables first).

## BullMQ Workers

Each queue/workflow should keep the local paired structure used in `src/mq/**`:

- `queue.ts` for `Queue`, queue name, payload type, enqueue function;
- `worker.ts` for `Worker` processing;
- optional `types.ts` and `utils.ts` when local precedent supports it.

After adding a queue/worker:

- import and register the worker in `src/entrypoints/workers.ts`;
- close the worker in `shutdown()`;
- register the queue in Bull Board in `src/entrypoints/server.ts`;
- use shared Redis from `@/lib/redis`;
- keep queue name, job name, payload type, and worker data consistent.
- prefer BullMQ/Sentry worker error handlers and worker events over broad
  `try/catch` wrappers. Use local `try/catch` only for cleanup or custom
  failure-state updates.

## External API Codegen

Generated folders:

```text
src/codegen/api/yookassa/**
src/codegen/api/socialkit/**
```

Do not edit generated code manually. Update source specs/config/scripts, then
run generators.

Use:

```bash
pnpm api:download:yookassa
pnpm api:download:socialkit
pnpm api:generate
```

## Environment Variables

When adding or changing an env variable, check all relevant points:

- `env.ts` validation schema;
- `.env.example` documentation;
- `docker-compose.yml` for both `server` and `workers` services;
- `Dockerfile` only when the variable is a build arg or build-time env, for
  example `GLITCHTIP_RELEASE`.

Do not add runtime env usage without validation in `env.ts`.

## AI Prompt Work

Prompt workflows usually have three files:

- `src/ai/prompts/templates/<name>.md`;
- `src/ai/prompts/types/<name>.ts`;
- `src/ai/prompts/builders/<name>.ts`.

Use `interpolate(...)` with explicit variables and `buildContextLines(...)` for
optional context blocks. Keep template placeholders synchronized with builder
variables. If editing Russian examples or messages, preserve correct UTF-8 text
and do not introduce mojibake.

## Zod Imports

Use `@/lib/zod` for project schemas. `env.ts` is the known exception because it
uses `@t3-oss/env-core` directly with `zod`.

## Commands

```bash
pnpm dev
pnpm dev:workers
pnpm validate:env
pnpm build
pnpm start
pnpm start:workers
pnpm test
pnpm test:unit
pnpm test:integration
pnpm lint:fix
pnpm lint:typescript
pnpm api:download:yookassa
pnpm api:generate
```

Database commands:

```bash
pnpm db:generate # generate SQL migration from schema changes (commit output)
pnpm db:migrate # deploy-stage only — do not run from agent workflow
pnpm db:seed # deploy-stage only (seed service) — do not run from agent workflow
pnpm db:studio # local inspection — owner-only unless explicitly asked
```

## Validation Matrix

Choose checks by changed area:

- TypeScript/backend code: `pnpm lint:fix`, `pnpm lint:typescript`.
- Env config: `pnpm validate:env` when a representative `.env` is available.
- Build/runtime entrypoints: `pnpm build`.
- Route/API contract: `pnpm lint:typescript`, targeted tests if available, and
  inspect OpenAPI metadata.
- DB schema: `pnpm lint:typescript` when TypeScript schema files changed; run
  `pnpm db:generate` when schema files changed and commit migration artifacts.
  Do not run `pnpm db:migrate`.
- External API codegen: relevant `api:download:*`, `pnpm api:generate`,
  TypeScript check.
- Tests changed or behavior covered by tests: `pnpm test:unit` or targeted
  Vitest command; `pnpm test` when broader validation is needed.

If a check cannot be run because it requires real services, credentials, or a
dangerous database target, state that explicitly.

## Pull Requests

- Agents may create a feature branch and open a pull request for owner review.
- Use branch names like `agent/TASK-XXX-short-slug` when working from orchestrator
  tasks.
- Never force-push to `main` or `stage`.
- Include migration SQL in the same PR as schema changes when applicable.
- Owner merges after review; do not merge your own PR unless explicitly asked.

## Completion Checklist

Before finishing, report:

- files changed;
- local reference files inspected;
- route/worker/env/db/codegen registration points updated;
- DB migrations generated (`pnpm db:generate`) and included in the change, if any;
- validation commands run and their result;
- validation skipped, if any, with the reason.
