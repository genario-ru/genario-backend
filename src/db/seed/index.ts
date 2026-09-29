import { getTableColumns, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { camelCase } from "es-toolkit";

import type * as schema from "@/db/schema";

import { seedEntries } from "./config";
import { resolvePublicS3Urls } from "./resolve-public-s3-urls";

/**
 * JSON-файлы хранят ключи в snake_case (`logo_url`), а `.values()` ожидает
 * TS-имена свойств (camelCase, `logoUrl`). Объекты плоские, поэтому достаточно
 * перевести ключи верхнего уровня.
 */
function toCamelCaseRow(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [camelCase(key), value]),
  );
}

/**
 * Идемпотентно заливает дефолтные данные: upsert по первичному ключу `id`.
 *
 * Семантика — repo как источник истины (`onConflictDoUpdate`): при каждом
 * запуске строки в БД приводятся к содержимому JSON. Обновляются только те
 * колонки, что реально присутствуют в JSON (кроме `id` и `created_at`), чтобы не
 * затирать существующие значения дефолтами.
 *
 * Стабильные `id` из JSON сохраняют целостность внешних ключей при повторных
 * запусках. Всё выполняется в одной транзакции.
 */
export async function seedDefaultData(
  db: NodePgDatabase<typeof schema>,
): Promise<void> {
  await db.transaction(async (tx) => {
    for (const entry of seedEntries) {
      if (entry.rows.length === 0) {
        console.log(`⏭️  ${entry.name}: данных нет, пропускаю.`);
        continue;
      }

      const columns = getTableColumns(entry.table);
      const rows = entry.rows.map((row) =>
        resolvePublicS3Urls(toCamelCaseRow(row)),
      );

      // Колонки, реально присутствующие в JSON (кроме ключа и created_at),
      // обновляем значением из вставляемой строки (excluded.*).
      const updatableKeys = new Set<string>();
      for (const row of rows) {
        for (const key of Object.keys(row)) {
          if (key === "id" || key === "createdAt") continue;
          if (key in columns) updatableKeys.add(key);
        }
      }

      const updateSet = Object.fromEntries(
        [...updatableKeys].map((key) => [
          key,
          sql`excluded.${sql.identifier(columns[key].name)}`,
        ]),
      );

      const insert = tx.insert(entry.table).values(rows as never);

      // Если обновлять нечего (в JSON только ключ) — пропускаем существующие,
      // иначе SET был бы пустым и SQL стал бы невалидным.
      if (Object.keys(updateSet).length === 0) {
        await insert.onConflictDoNothing({ target: columns.id });
      } else {
        await insert.onConflictDoUpdate({ target: columns.id, set: updateSet });
      }

      console.log(`✅ ${entry.name}: ${rows.length} записей.`);
    }
  });
}
