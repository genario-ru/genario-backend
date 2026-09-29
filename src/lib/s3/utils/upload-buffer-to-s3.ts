import { PutObjectCommand } from "@aws-sdk/client-s3";

import { env } from "@/env";

import { s3 } from "../client";
import { createS3ObjectKey } from "./create-s3-object-key";

type UploadBufferToS3Params = {
  key: string;
  mimeType: string;
  buffer: Buffer;
};

export async function uploadBufferToS3({
  key,
  mimeType,
  buffer,
}: UploadBufferToS3Params): Promise<void> {
  const command = new PutObjectCommand({
    Bucket: env.S3_PRIVATE_BUCKET_NAME,
    Key: createS3ObjectKey({ key }),
    Body: buffer,
    ContentType: mimeType,
  });

  await s3.send(command);
}
