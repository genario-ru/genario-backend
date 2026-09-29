import { Worker } from "bullmq";
import { eq } from "drizzle-orm";

import { generateScenarioScenePreviewPrompt } from "@/ai/prompts/builders/generate-scenario-scene-preview";
import { vsellm } from "@/ai/providers/open-ai/vsellm";
import { db } from "@/db";
import { attachment, generationLog, scenarioScenePreview } from "@/db/schema";
import { creditsPricing } from "@/domains/credits/constants/credits-pricing";
import { chargeCredits } from "@/domains/credits/services/charge-credits";
import { getCreditsBalance } from "@/domains/credits/services/get-credits-balance";
import { env } from "@/env";
import { compressBase64Image } from "@/lib/image/utils/compress-base64-image";
import { optimizeBase64Image } from "@/lib/image/utils/optimize-base64-image";
import { redis } from "@/lib/redis";
import { createS3Key } from "@/lib/s3/utils/create-s3-key";
import { uploadBufferToS3 } from "@/lib/s3/utils/upload-buffer-to-s3";
import { getSafeJobLogContext } from "@/shared/utils/mq/get-safe-job-log-context";
import { isFinalJobFailure } from "@/shared/utils/mq/is-final-job-failure";

import {
  SCENARIO_SCENE_PREVIEW_GENERATION_QUEUE_NAME,
  type ScenarioScenePreviewGenerationJobData,
} from "./queue";
import { resolveImageSize } from "./utils";

export const scenarioScenePreviewsGenerationWorker =
  new Worker<ScenarioScenePreviewGenerationJobData>(
    SCENARIO_SCENE_PREVIEW_GENERATION_QUEUE_NAME,
    async (job) => {
      const { scenarioScenePreviewId } = job.data;

      console.log("Worker генерации превью сцены сценария запущен", {
        scenarioScenePreviewId,
        jobId: job.id,
      });

      const foundPreview = await db.query.scenarioScenePreview.findFirst({
        where: (preview, { eq }) => eq(preview.id, scenarioScenePreviewId),
        with: {
          scenarioScene: {
            with: {
              components: {
                with: {
                  type: true,
                },
              },
              scenarioChapter: {
                with: {
                  scenarioVersion: true,
                },
              },
            },
          },
        },
      });

      if (!foundPreview) {
        throw new Error(
          `Превью сцены сценария с id ${scenarioScenePreviewId} не найдено`,
        );
      }

      const scene = foundPreview.scenarioScene;
      const scenarioId = scene.scenarioChapter.scenarioVersion.scenarioId;

      const scenario = await db.query.scenario.findFirst({
        where: (scenario, { eq }) => eq(scenario.id, scenarioId),
        with: {
          videoType: true,
          scenarioToTone: {
            with: {
              tone: true,
            },
          },
        },
      });

      if (!scenario) {
        throw new Error(`Сценарий с id ${scenarioId} не найден`);
      }

      const creditsBalance = await getCreditsBalance({
        userId: scenario.userId,
      });

      if (creditsBalance < creditsPricing["scenario-scene-preview"]) {
        throw new Error("Недостаточно кредитов для выполнения операции");
      }

      await db
        .update(scenarioScenePreview)
        .set({ status: "generation" })
        .where(eq(scenarioScenePreview.id, scenarioScenePreviewId));

      const prompt = generateScenarioScenePreviewPrompt({
        scenarioName: scenario.name,
        scenarioDescription: scenario.description,
        scenarioTargetAudience: scenario.targetAudience,
        videoTypeSlug: scenario.videoType?.slug ?? null,
        toneNames: scenario.scenarioToTone.map(({ tone }) => tone.name),
        chapterName: scene.scenarioChapter.name,
        chapterDescription: scene.scenarioChapter.description,
        sceneName: scene.name,
        sceneComponents: scene.components.map((component) => ({
          slug: component.type.slug,
          name: component.type.name,
          content: component.content,
        })),
      });

      const { data, usage } = await vsellm.images.generate({
        model: env.VSELLM_IMAGE_MODEL,
        prompt,
        quality: "medium",
        output_format: "jpeg",
        size: resolveImageSize(scenario.videoType?.slug),
      });

      const image = data?.[0]?.b64_json;

      if (!image) {
        throw new Error("Не удалось сгенерировать превью сцены сценария");
      }

      const s3KeyOriginal = createS3Key({
        userId: scenario.userId,
        folderName: "scenario-scene-previews",
        fileName: `${scenarioScenePreviewId}.webp`,
      });

      const s3KeyCompressed = createS3Key({
        userId: scenario.userId,
        folderName: "scenario-scene-previews",
        fileName: `${scenarioScenePreviewId}-compressed.webp`,
      });

      const [
        { buffer: originalBuffer, mimeType: originalMimeType },
        { buffer: compressedBuffer, mimeType: compressedMimeType },
      ] = await Promise.all([
        optimizeBase64Image(image),
        compressBase64Image(image),
      ]);

      await Promise.all([
        uploadBufferToS3({
          key: s3KeyOriginal,
          mimeType: originalMimeType,
          buffer: originalBuffer,
        }),
        uploadBufferToS3({
          key: s3KeyCompressed,
          mimeType: compressedMimeType,
          buffer: compressedBuffer,
        }),
      ]);

      const { createdAttachment, createdCompressedAttachment } =
        await db.transaction(async (tx) => {
          const [[createdAttachment], [createdCompressedAttachment]] =
            await Promise.all([
              tx
                .insert(attachment)
                .values({
                  userId: scenario.userId,
                  fileName: `${scenarioScenePreviewId}.webp`,
                  key: s3KeyOriginal,
                  bucketName: env.S3_PRIVATE_BUCKET_NAME,
                  mimeType: originalMimeType,
                })
                .returning(),
              tx
                .insert(attachment)
                .values({
                  userId: scenario.userId,
                  fileName: `${scenarioScenePreviewId}-compressed.webp`,
                  key: s3KeyCompressed,
                  bucketName: env.S3_PRIVATE_BUCKET_NAME,
                  mimeType: compressedMimeType,
                })
                .returning(),
            ]);

          await Promise.all([
            tx
              .update(scenarioScenePreview)
              .set({
                attachmentId: createdAttachment.id,
                compressedAttachmentId: createdCompressedAttachment.id,
                status: "ready",
              })
              .where(eq(scenarioScenePreview.id, scenarioScenePreviewId)),
            tx.insert(generationLog).values({
              entity: "scenario-scene-preview" as const,
              entityId: scenarioScenePreviewId,
              model: env.VSELLM_IMAGE_MODEL,
              tokens: usage?.total_tokens ?? 0,
            }),
            chargeCredits({
              userId: scenario.userId,
              entity: "scenario-scene-preview",
              entityId: scenarioScenePreviewId,
              totalTokens: usage?.total_tokens ?? 0,
              tx,
            }),
          ]);

          return {
            createdAttachment,
            createdCompressedAttachment,
          };
        });

      console.log("Превью сцены сценария успешно сгенерировано:", {
        scenarioScenePreviewId,
        attachmentId: createdAttachment.id,
        compressedAttachmentId: createdCompressedAttachment.id,
      });
    },
    {
      concurrency: 5,
      connection: redis,
    },
  );

scenarioScenePreviewsGenerationWorker.on("error", (error) => {
  console.error("Worker генерации превью сцены сценария упал с ошибкой", error);
});

scenarioScenePreviewsGenerationWorker.on("failed", async (job, error) => {
  console.error(
    "Worker генерации превью сцены сценария упал с ошибкой",
    getSafeJobLogContext(job),
    error,
  );

  const isFinalFailure = await isFinalJobFailure(job);

  if (!job || !isFinalFailure) {
    return;
  }

  try {
    await db
      .update(scenarioScenePreview)
      .set({ status: "failed" })
      .where(eq(scenarioScenePreview.id, job.data.scenarioScenePreviewId));
  } catch (updateError) {
    console.error(
      "Не удалось обновить статус превью сцены сценария",
      updateError,
    );
  }
});

scenarioScenePreviewsGenerationWorker.on("completed", (job) => {
  console.log(
    "Worker генерации превью сцены сценария отработал успешно",
    job.id,
  );
});
