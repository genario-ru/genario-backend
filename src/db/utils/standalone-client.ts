import { createDBClient } from "./create-db-client";

/**
 * Создаёт автономный (standalone) клиент базы данных для миграций и сида в проде.
 *
 * В отличие от `src/db/index.ts`, этот клиент НЕ импортирует `@/env`, поэтому
 * ему достаточно одной переменной окружения `POSTGRES_URL` — не нужно поднимать
 * весь набор env, требуемый приложением. Это позволяет запускать его в урезанном
 * one-shot контейнере (см. сервисы `migrate` и `seed` в docker-compose.yml).
 */
export function createStandaloneClient() {
  const connectionString = process.env.POSTGRES_URL;

  if (!connectionString) {
    throw new Error(
      "POSTGRES_URL is not set. It is required to run database tooling.",
    );
  }

  return createDBClient({ connectionString });
}
