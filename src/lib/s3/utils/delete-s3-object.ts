import { DeleteObjectCommand } from "@aws-sdk/client-s3";

import { s3 } from "../client";
import { createS3ObjectKey } from "./create-s3-object-key";

type DeleteS3ObjectParams = {
  bucketName: string;
  key: string;
};

export async function deleteS3Object({
  bucketName,
  key,
}: DeleteS3ObjectParams): Promise<void> {
  await s3.send(
    new DeleteObjectCommand({
      Bucket: bucketName,
      Key: createS3ObjectKey({ key }),
    }),
  );
}
