import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { env } from "@/env";

import { s3 } from "../client";
import { createS3ObjectKey } from "./create-s3-object-key";

export async function getSignedS3Url(key: string): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: env.S3_PRIVATE_BUCKET_NAME,
    Key: createS3ObjectKey({ key }),
  });

  return getSignedUrl(s3, command, {
    expiresIn: 60 * 15,
  });
}
