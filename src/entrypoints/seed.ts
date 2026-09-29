import { sql } from "drizzle-orm";

import { seedDefaultData } from "@/db/seed";
import { createStandaloneClient } from "@/db/utils/standalone-client";

/**
 * Заливает дефолтные (reference) данные из `data/*.json` в БД во время деплоя.
 *
 * Запускается one-shot сервисом `seed` в docker-compose.yml после `migrate` и
 * до API и воркеров: только этот сервис в сети деплоя достаёт до базы, и
 * приложению нужны эти данные с первого запроса. Локально сид не запускается.
 *
 * JSON-файлы вшиваются в `dist/seed.js` при сборке, поэтому образу не нужны
 * дополнительные файлы.
 */

/** Возвращает host/db из POSTGRES_URL без утечки пароля — для диагностики. */
function describeDbTarget(): string {
  const url = process.env.POSTGRES_URL;
  if (!url) return "POSTGRES_URL не задан";
  try {
    const parsed = new URL(url);
    return `${parsed.host}${parsed.pathname}`;
  } catch {
    return "POSTGRES_URL задан, но не парсится как URL";
  }
}

console.log(`🎯 Цель (host/db): ${describeDbTarget()}`);

const { db, pool } = createStandaloneClient();

try {
  await db.execute(sql`select 1`);
  console.log("✅ Подключение к базе установлено.");

  console.log("🌱 Заливаю дефолтные данные...");
  await seedDefaultData(db);
  console.log("✅ Дефолтные данные успешно записаны.");
} catch (error) {
  console.error("❌ Не удалось записать дефолтные данные.");
  if (error instanceof Error) {
    console.error(`Причина: ${error.message}`);
    console.error(error.stack);
  } else {
    console.error(error);
  }
  await pool.end();
  process.exit(1);
}

await pool.end();
process.exit(0);
