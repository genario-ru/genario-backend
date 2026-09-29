import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { env } from "@/env";

import { s3 } from "../client";
import { createS3ObjectKey } from "./create-s3-object-key";

type UploadBase64ToS3Params = {
  key: string;
  mimeType: string;
  base64: string;
};

export async function uploadBase64ToS3({
  key,
  mimeType,
  base64,
}: UploadBase64ToS3Params): Promise<string> {
  const buffer = Buffer.from(base64, "base64");

  const command = new PutObjectCommand({
    Bucket: env.S3_PRIVATE_BUCKET_NAME,
    Key: createS3ObjectKey({ key }),
    Body: buffer,
    ContentType: mimeType,
  });

  await s3.send(command);

  const url = await getSignedUrl(s3, command, {
    expiresIn: 60 * 15,
  });

  return url;
}
