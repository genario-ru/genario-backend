import { GetObjectCommand } from "@aws-sdk/client-s3";
import { validator } from "hono-openapi";

import { db } from "@/db";
import { getAttachmentDownloadParamsSchema } from "@/domains/attachments/schemas/handlers/get-attachment-download/params";
import { s3 } from "@/lib/s3/client";
import { createS3ObjectKey } from "@/lib/s3/utils/create-s3-object-key";
import { openAPIResponseMiddleware } from "@/middleware/openapi-response-middleware";
import { rateLimitMiddleware } from "@/middleware/rate-limit-middleware";
import { sessionMiddleware } from "@/middleware/session-middleware";
import { HTTPStatusCode } from "@/shared/constants/common/http-status-code";
import { OpenAPITags } from "@/shared/constants/openapi/tags";
import { APIErrorCode } from "@/shared/schemas/errors/api-error";
import { createHonoApp } from "@/shared/utils/server/create-hono-app";
import { throwAPIError } from "@/shared/utils/server/throw-api-error";

import {
  createContentDisposition,
  getAttachmentDownloadFileName,
  hasTransformToByteArray,
} from "./utils";

export const getAttachmentDownloadRoute = createHonoApp().basePath(
  "/attachments/:attachmentId/download",
);

// GET /api/v1/attachments/{attachmentId}/download
getAttachmentDownloadRoute.get(
  "/",
  rateLimitMiddleware({
    keyPrefix: "get-attachment-download",
    windowMs: 1000,
    limit: 2,
  }),
  sessionMiddleware,
  openAPIResponseMiddleware({
    tags: [OpenAPITags.Attachments],
    responses: {
      [HTTPStatusCode.Ok]: {
        description: "Attachment downloaded successfully",
        content: {
          "application/octet-stream": {
            schema: {
              type: "string",
              format: "binary",
            },
          },
        },
      },
    },
  }),
  validator("param", getAttachmentDownloadParamsSchema),
  async (c) => {
    const { attachmentId } = c.req.valid("param");
    const user = c.get("user");

    const foundAttachment = await db.query.attachment.findFirst({
      where: (attachment, { eq, and }) =>
        and(eq(attachment.id, attachmentId), eq(attachment.userId, user.id)),
    });

    if (!foundAttachment) {
      throw throwAPIError({
        code: APIErrorCode.NotFound,
        message: "Файл не найден или у вас нет доступа к нему",
      });
    }

    try {
      const s3Object = await s3.send(
        new GetObjectCommand({
          Bucket: foundAttachment.bucketName,
          Key: createS3ObjectKey({ key: foundAttachment.key }),
        }),
      );

      if (!s3Object.Body) {
        throw throwAPIError({
          code: APIErrorCode.InternalServerError,
          message: "Не удалось получить файл из хранилища",
        });
      }

      const fileName = getAttachmentDownloadFileName(
        foundAttachment.id,
        foundAttachment.fileName,
      );

      const headers = new Headers({
        "Content-Disposition": createContentDisposition(fileName),
        "Content-Type": foundAttachment.mimeType,
      });

      if (s3Object.ContentLength !== undefined) {
        headers.set("Content-Length", String(s3Object.ContentLength));
      }

      if (!hasTransformToByteArray(s3Object.Body)) {
        throw throwAPIError({
          code: APIErrorCode.InternalServerError,
          message: "Неподдерживаемый формат ответа хранилища",
        });
      }

      const fileContent = new Uint8Array(
        await s3Object.Body.transformToByteArray(),
      );

      return new Response(fileContent, {
        status: HTTPStatusCode.Ok,
        headers,
      });
    } catch (error) {
      if (
        error instanceof Error &&
        (error.name === "NoSuchKey" || error.name === "NotFound")
      ) {
        throw throwAPIError({
          code: APIErrorCode.NotFound,
          message: "Файл не найден в хранилище",
        });
      }

      throw error;
    }
  },
);
