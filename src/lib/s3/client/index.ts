import { S3Client } from "@aws-sdk/client-s3";

import { env } from "@/env";

export const s3 = new S3Client({
  endpoint: env.S3_PRIVATE_BUCKET_BASE_URL,
  region: env.S3_PRIVATE_REGION,
  credentials: {
    accessKeyId: env.S3_PRIVATE_ACCESS_KEY,
    secretAccessKey: env.S3_PRIVATE_SECRET_ACCESS_KEY,
  },
});
