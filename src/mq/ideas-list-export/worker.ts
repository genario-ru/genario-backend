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
  IDEAS_LIST_EXPORT_QUEUE_NAME,
  type IdeasListExportJobData,
} from "./queue";
import type { IdeasListExportData } from "./types";
import { renderIdeasListExport } from "./utils";

export const ideasListExportWorker = new Worker<IdeasListExportJobData>(
  IDEAS_LIST_EXPORT_QUEUE_NAME,
  async (job) => {
    const { exportDocumentId, ideasListId } = job.data;

    console.log("Worker экспорта списка идей запущен", {
      exportDocumentId,
      ideasListId,
      jobId: job.id,
    });

    const foundIdeasListToExportDocument =
      await db.query.ideasListToExportDocument.findFirst({
        where: (link, { eq, and }) =>
          and(
            eq(link.ideasListId, ideasListId),
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

    if (!foundIdeasListToExportDocument) {
      throw new Error(
        `Связка списка идей и экспортного документа не найдена: ideasListId=${ideasListId}, exportDocumentId=${exportDocumentId}`,
      );
    }

    const { exportDocument: foundExportDocument, savedOnly } =
      foundIdeasListToExportDocument;

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

    const foundIdeasList = await db.query.ideasList.findFirst({
      where: (ideasList, { eq, and }) =>
        and(
          eq(ideasList.id, ideasListId),
          eq(ideasList.userId, foundExportDocument.userId),
        ),
      with: {
        ideas: {
          where: (idea, { eq }) =>
            savedOnly ? eq(idea.saved, true) : undefined,
          orderBy: (idea, { asc }) => [asc(idea.createdAt)],
          with: {
            videoType: true,
          },
        },
        template: true,
        profile: true,
        ideasListToTone: {
          with: {
            tone: true,
          },
        },
        ideasListToVideoType: {
          with: {
            videoType: true,
          },
        },
      },
    });

    if (!foundIdeasList) {
      throw new Error("Не удалось загрузить данные списка идей для экспорта");
    }

    const { ideasListToTone, ideasListToVideoType, ...ideasListData } =
      foundIdeasList;

    const ideasListExportData: IdeasListExportData = {
      ...ideasListData,
      tones: ideasListToTone.map((item) => item.tone),
      videoTypes: ideasListToVideoType.map((item) => item.videoType),
    };

    const renderedExportFile = await renderIdeasListExport({
      format: foundExportDocument.format.slug,
      data: ideasListExportData,
    });

    const s3Key = createS3Key({
      userId: foundExportDocument.userId,
      folderName: "ideas-list-exports",
      fileName: renderedExportFile.fileName,
    });

    await uploadBufferToS3({
      key: s3Key,
      mimeType: renderedExportFile.mimeType,
      buffer: renderedExportFile.buffer,
    });

    const { createdAttachment } = await db.transaction(async (tx) => {
      const [createdAttachment] = await tx
        .insert(attachment)
        .values({
          userId: foundExportDocument.userId,
          fileName: renderedExportFile.fileName,
          key: s3Key,
          bucketName: env.S3_PRIVATE_BUCKET_NAME,
          mimeType: renderedExportFile.mimeType,
        })
        .returning();

      await tx
        .update(exportDocument)
        .set({
          attachmentId: createdAttachment.id,
          status: "ready",
          statusDetails: null,
        })
        .where(eq(exportDocument.id, exportDocumentId));

      return {
        createdAttachment,
      };
    });

    console.log("Экспорт списка идей успешно сгенерирован", {
      exportDocumentId,
      attachmentId: createdAttachment.id,
    });
  },
  {
    concurrency: 5,
    connection: redis,
  },
);

ideasListExportWorker.on("error", (error) => {
  console.error("Worker экспорта списка идей упал с ошибкой", error);
});

ideasListExportWorker.on("failed", async (job, error) => {
  console.error(
    "Worker экспорта списка идей упал с ошибкой",
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
      "Не удалось обновить статус экспорта списка идей",
      updateError,
    );
  }
});

ideasListExportWorker.on("completed", (job) => {
  console.log("Worker экспорта списка идей отработал успешно", job.id);
});
