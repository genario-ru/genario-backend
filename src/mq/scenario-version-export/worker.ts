import { Worker } from "bullmq";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { attachment, exportDocument } from "@/db/schema";
import { env } from "@/env";
import { redis } from "@/lib/redis";
import { createS3Key } from "@/lib/s3/utils/create-s3-key";
import { uploadBufferToS3 } from "@/lib/s3/utils/upload-buffer-to-s3";
import { SUPPORTED_EXPORT_FORMATS } from "@/shared/constants/common/supported-export-format";
import { getSafeJobLogContext } from "@/shared/utils/mq/get-safe-job-log-context";
import { isFinalJobFailure } from "@/shared/utils/mq/is-final-job-failure";

import {
  SCENARIO_VERSION_EXPORT_QUEUE_NAME,
  type ScenarioVersionExportJobData,
} from "./queue";
import type { ScenarioVersionExportData } from "./types";
import { renderScenarioVersionExport } from "./utils";

export const scenarioVersionExportWorker =
  new Worker<ScenarioVersionExportJobData>(
    SCENARIO_VERSION_EXPORT_QUEUE_NAME,
    async (job) => {
      const { exportDocumentId, scenarioVersionId } = job.data;

      console.log("Worker экспорта версии сценария запущен", {
        exportDocumentId,
        scenarioVersionId,
        jobId: job.id,
      });

      const foundScenarioVersionToExportDocument =
        await db.query.scenarioVersionToExportDocument.findFirst({
          where: (link, { eq, and }) =>
            and(
              eq(link.scenarioVersionId, scenarioVersionId),
              eq(link.exportDocumentId, exportDocumentId),
            ),
          with: {
            exportDocument: {
              with: {
                format: true,
              },
            },
          },
        });

      if (!foundScenarioVersionToExportDocument) {
        throw new Error(
          `Экспортный документ с id ${exportDocumentId} не найден`,
        );
      }

      const { exportDocument: foundExportDocument } =
        foundScenarioVersionToExportDocument;

      if (!SUPPORTED_EXPORT_FORMATS.includes(foundExportDocument.format.slug)) {
        throw new Error(
          `Неподдерживаемый формат документа: ${foundExportDocument.format.slug}`,
        );
      }

      await db
        .update(exportDocument)
        .set({
          status: "generation",
          statusDetails: null,
        })
        .where(eq(exportDocument.id, exportDocumentId));

      const foundScenarioVersion = await db.query.scenarioVersion.findFirst({
        where: (scenarioVersion, { eq }) =>
          eq(scenarioVersion.id, scenarioVersionId),
        with: {
          scenario: {
            with: {
              profile: true,
              videoType: true,
              videoDuration: true,
              scenarioToPlatform: {
                with: {
                  platform: true,
                },
              },
              scenarioToTone: {
                with: {
                  tone: true,
                },
              },
            },
          },
          chapters: {
            orderBy: (scenarioChapter, { asc }) => [
              asc(scenarioChapter.startTime),
            ],
            with: {
              scenes: {
                orderBy: (scenarioScene, { asc }) => [
                  asc(scenarioScene.startTime),
                ],
                with: {
                  components: {
                    orderBy: (scenarioSceneComponent, { asc }) => [
                      asc(scenarioSceneComponent.createdAt),
                    ],
                    with: {
                      type: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!foundScenarioVersion) {
        throw new Error(
          "Не удалось загрузить данные версии сценария для экспорта",
        );
      }

      if (foundScenarioVersion.scenario.userId !== foundExportDocument.userId) {
        throw new Error(
          "Версия сценария не принадлежит владельцу экспортного документа",
        );
      }

      const {
        scenario: foundScenario,
        chapters,
        ...scenarioVersionData
      } = foundScenarioVersion;

      const { scenarioToPlatform, scenarioToTone, ...scenarioData } =
        foundScenario;

      const scenarioVersionExportData: ScenarioVersionExportData = {
        ...scenarioVersionData,
        scenario: {
          ...scenarioData,
          platforms: scenarioToPlatform.map((item) => item.platform),
          tones: scenarioToTone.map((item) => item.tone),
        },
        chapters,
      };

      const renderedExportFile = await renderScenarioVersionExport({
        format: foundExportDocument.format.slug,
        data: scenarioVersionExportData,
      });

      const s3Key = createS3Key({
        userId: foundExportDocument.userId,
        folderName: "scenario-version-exports",
        fileName: renderedExportFile.fileName,
      });

      await uploadBufferToS3({
        key: s3Key,
        mimeType: renderedExportFile.mimeType,
        buffer: renderedExportFile.buffer,
      });

      const [createdAttachment] = await db
        .insert(attachment)
        .values({
          userId: foundExportDocument.userId,
          fileName: renderedExportFile.fileName,
          key: s3Key,
          bucketName: env.S3_PRIVATE_BUCKET_NAME,
          mimeType: renderedExportFile.mimeType,
        })
        .returning();

      await db
        .update(exportDocument)
        .set({
          attachmentId: createdAttachment.id,
          status: "ready",
          statusDetails: null,
        })
        .where(eq(exportDocument.id, exportDocumentId));

      console.log("Экспорт версии сценария успешно сгенерирован", {
        exportDocumentId,
        attachmentId: createdAttachment.id,
      });
    },
    {
      concurrency: 5,
      connection: redis,
    },
  );

scenarioVersionExportWorker.on("error", (error) => {
  console.error("Worker экспорта версии сценария упал с ошибкой", error);
});

scenarioVersionExportWorker.on("failed", async (job, error) => {
  console.error(
    "Worker экспорта версии сценария упал с ошибкой",
    getSafeJobLogContext(job),
    error,
  );

  const isFinalFailure = await isFinalJobFailure(job);

  if (!job || !isFinalFailure) {
    return;
  }

  const statusDetails =
    error instanceof Error ? error.message : "Неизвестная ошибка экспорта";

  try {
    await db
      .update(exportDocument)
      .set({
        status: "failed",
        statusDetails,
      })
      .where(eq(exportDocument.id, job.data.exportDocumentId));
  } catch (updateError) {
    console.error(
      "Не удалось обновить статус экспорта версии сценария",
      updateError,
    );
  }
});

scenarioVersionExportWorker.on("completed", (job) => {
  console.log("Worker экспорта версии сценария отработал успешно", job.id);
});
