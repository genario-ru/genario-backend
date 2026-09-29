import { randomUUID } from "node:crypto";

import { db } from "@/db";
import { attachment } from "@/db/schema";
import type { Attachment } from "@/domains/attachments/schemas/entities/attachment";
import { env } from "@/env";
import { createUploadedAttachmentS3Key } from "@/lib/attachments/utils/create-uploaded-attachment-s3-key";
import { deleteS3Object } from "@/lib/s3/utils/delete-s3-object";
import { uploadBufferToS3 } from "@/lib/s3/utils/upload-buffer-to-s3";
import { APIErrorCode } from "@/shared/schemas/errors/api-error";
import { throwAPIError } from "@/shared/utils/server/throw-api-error";

const DEFAULT_ATTACHMENT_MIME_TYPE = "application/octet-stream";

type CreateAttachmentFromFileParams = {
  userId: string;
  file: File;
  buffer?: Buffer;
  mimeType?: string;
  fileName?: string;
};

export async function createAttachmentFromFile({
  userId,
  file,
  buffer: providedBuffer,
  mimeType: providedMimeType,
  fileName: providedFileName,
}: CreateAttachmentFromFileParams): Promise<Attachment> {
  const mimeType =
    providedMimeType ?? file.type ?? DEFAULT_ATTACHMENT_MIME_TYPE;

  const fileName = providedFileName ?? file.name;
  const attachmentId = randomUUID();

  const attachmentKey = createUploadedAttachmentS3Key({
    userId,
    attachmentId,
    fileName,
  });

  try {
    const buffer = providedBuffer ?? Buffer.from(await file.arrayBuffer());

    await uploadBufferToS3({
      key: attachmentKey,
      mimeType,
      buffer,
    });
  } catch (error) {
    console.error("Не удалось загрузить attachment в S3", {
      userId,
      fileName,
      error,
    });

    throw throwAPIError({
      code: APIErrorCode.UploadFailed,
      message: "Не удалось загрузить файл в хранилище",
    });
  }

  try {
    const [createdAttachment] = await db
      .insert(attachment)
      .values({
        id: attachmentId,
        userId,
        fileName,
        key: attachmentKey,
        bucketName: env.S3_PRIVATE_BUCKET_NAME,
        mimeType,
      })
      .returning();

    return createdAttachment;
  } catch (error) {
    try {
      await deleteS3Object({
        bucketName: env.S3_PRIVATE_BUCKET_NAME,
        key: attachmentKey,
      });
    } catch (cleanupError) {
      console.error("Не удалось удалить attachment из S3 после ошибки БД", {
        userId,
        attachmentId,
        attachmentKey,
        cleanupError,
      });
    }

    throw error;
  }
}
